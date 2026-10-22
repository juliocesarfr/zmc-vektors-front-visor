import type { Coordinate } from "ol/coordinate";

export type TipoGeometriaShape = "punto" | "linea";

export interface ColumnaShape {
  /** Nombre en el .dbf: hasta 10 caracteres, sin tildes ni espacios. */
  nombre: string;
  campo: string;
}

export interface ElementoShape {
  /** Un punto lleva una coordenada; una línea, dos o más. Siempre en lon/lat WGS84. */
  coordenadas: Coordinate[];
  atributos: Record<string, unknown>;
}

export interface CapaShape {
  nombre: string;
  tipo: TipoGeometriaShape;
  columnas: ColumnaShape[];
  elementos: ElementoShape[];
}

/** Los cinco archivos de un shapefile, por extensión. */
export type ArchivosShape = Record<"shp" | "shx" | "dbf" | "prj" | "cpg", Uint8Array | string>;

const CODIGO_ARCHIVO_SHAPE = 9994;
const VERSION_SHAPE = 1000;
const LARGO_CABECERA = 100;
const LARGO_CABECERA_REGISTRO = 8;
const TIPO_SHAPE: Record<TipoGeometriaShape, number> = { punto: 1, linea: 3 };

const LARGO_MAXIMO_TEXTO_DBF = 254;
const LARGO_DESCRIPTOR_DBF = 32;
const LARGO_NOMBRE_DBF = 11;

const PRJ_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

export function crearShapefile(capa: CapaShape): ArchivosShape {
  const elementos = capa.elementos.filter((elemento) =>
    capa.tipo === "punto" ? elemento.coordenadas.length === 1 : elemento.coordenadas.length > 1,
  );
  const contenidos = elementos.map((elemento) => contenidoGeometria(capa.tipo, elemento.coordenadas));
  const extension = extensionDe(elementos.flatMap((elemento) => elemento.coordenadas));
  const tipoShape = TIPO_SHAPE[capa.tipo];

  const largoShp =
    LARGO_CABECERA + contenidos.reduce((total, contenido) => total + LARGO_CABECERA_REGISTRO + contenido.byteLength, 0);
  const largoShx = LARGO_CABECERA + contenidos.length * LARGO_CABECERA_REGISTRO;

  const shp = new Uint8Array(largoShp);
  const shx = new Uint8Array(largoShx);
  escribirCabecera(new DataView(shp.buffer), largoShp, tipoShape, extension);
  escribirCabecera(new DataView(shx.buffer), largoShx, tipoShape, extension);

  const vistaShp = new DataView(shp.buffer);
  const vistaShx = new DataView(shx.buffer);
  let posicion = LARGO_CABECERA;
  contenidos.forEach((contenido, indice) => {
    // Los tamaños y desplazamientos del formato van en palabras de 16 bits y en big endian.
    vistaShx.setInt32(LARGO_CABECERA + indice * LARGO_CABECERA_REGISTRO, posicion / 2);
    vistaShx.setInt32(LARGO_CABECERA + indice * LARGO_CABECERA_REGISTRO + 4, contenido.byteLength / 2);
    vistaShp.setInt32(posicion, indice + 1);
    vistaShp.setInt32(posicion + 4, contenido.byteLength / 2);
    shp.set(contenido, posicion + LARGO_CABECERA_REGISTRO);
    posicion += LARGO_CABECERA_REGISTRO + contenido.byteLength;
  });

  return {
    shp,
    shx,
    dbf: crearDbf(capa.columnas, elementos),
    prj: PRJ_WGS84,
    cpg: "UTF-8",
  };
}

function contenidoGeometria(tipo: TipoGeometriaShape, coordenadas: Coordinate[]): Uint8Array {
  if (tipo === "punto") {
    const contenido = new Uint8Array(20);
    const vista = new DataView(contenido.buffer);
    vista.setInt32(0, TIPO_SHAPE.punto, true);
    vista.setFloat64(4, coordenadas[0][0], true);
    vista.setFloat64(12, coordenadas[0][1], true);
    return contenido;
  }

  const contenido = new Uint8Array(48 + coordenadas.length * 16);
  const vista = new DataView(contenido.buffer);
  const [minimoX, minimoY, maximoX, maximoY] = extensionDe(coordenadas);
  vista.setInt32(0, TIPO_SHAPE.linea, true);
  vista.setFloat64(4, minimoX, true);
  vista.setFloat64(12, minimoY, true);
  vista.setFloat64(20, maximoX, true);
  vista.setFloat64(28, maximoY, true);
  vista.setInt32(36, 1, true);
  vista.setInt32(40, coordenadas.length, true);
  vista.setInt32(44, 0, true);
  coordenadas.forEach(([x, y], indice) => {
    vista.setFloat64(48 + indice * 16, x, true);
    vista.setFloat64(56 + indice * 16, y, true);
  });
  return contenido;
}

function escribirCabecera(
  vista: DataView,
  largoBytes: number,
  tipoShape: number,
  [minimoX, minimoY, maximoX, maximoY]: number[],
): void {
  vista.setInt32(0, CODIGO_ARCHIVO_SHAPE);
  vista.setInt32(24, largoBytes / 2);
  vista.setInt32(28, VERSION_SHAPE, true);
  vista.setInt32(32, tipoShape, true);
  vista.setFloat64(36, minimoX, true);
  vista.setFloat64(44, minimoY, true);
  vista.setFloat64(52, maximoX, true);
  vista.setFloat64(60, maximoY, true);
}

function extensionDe(coordenadas: Coordinate[]): number[] {
  if (coordenadas.length === 0) return [0, 0, 0, 0];
  const valoresX = coordenadas.map((coordenada) => coordenada[0]);
  const valoresY = coordenadas.map((coordenada) => coordenada[1]);
  return [Math.min(...valoresX), Math.min(...valoresY), Math.max(...valoresX), Math.max(...valoresY)];
}

// Todas las columnas van como texto: los SP devuelven números y códigos mezclados con ceros a la izquierda.
function crearDbf(columnas: ColumnaShape[], elementos: ElementoShape[]): Uint8Array {
  const codificador = new TextEncoder();
  const valores = elementos.map((elemento) =>
    columnas.map((columna) => codificador.encode(textoDe(elemento.atributos[columna.campo]))),
  );
  const largos = columnas.map((_, indiceColumna) =>
    Math.min(
      LARGO_MAXIMO_TEXTO_DBF,
      Math.max(1, ...valores.map((fila) => fila[indiceColumna].byteLength)),
    ),
  );

  const largoCabecera = LARGO_DESCRIPTOR_DBF + columnas.length * LARGO_DESCRIPTOR_DBF + 1;
  const largoRegistro = 1 + largos.reduce((total, largo) => total + largo, 0);
  const dbf = new Uint8Array(largoCabecera + elementos.length * largoRegistro + 1).fill(0x20, largoCabecera);
  const vista = new DataView(dbf.buffer);
  const hoy = new Date();

  dbf.fill(0, 0, largoCabecera);
  vista.setUint8(0, 0x03);
  vista.setUint8(1, hoy.getFullYear() - 1900);
  vista.setUint8(2, hoy.getMonth() + 1);
  vista.setUint8(3, hoy.getDate());
  vista.setUint32(4, elementos.length, true);
  vista.setUint16(8, largoCabecera, true);
  vista.setUint16(10, largoRegistro, true);

  columnas.forEach((columna, indice) => {
    const inicio = LARGO_DESCRIPTOR_DBF + indice * LARGO_DESCRIPTOR_DBF;
    dbf.set(codificador.encode(columna.nombre).slice(0, LARGO_NOMBRE_DBF - 1), inicio);
    vista.setUint8(inicio + 11, "C".charCodeAt(0));
    vista.setUint8(inicio + 16, largos[indice]);
  });
  vista.setUint8(largoCabecera - 1, 0x0d);

  valores.forEach((fila, indiceFila) => {
    let posicion = largoCabecera + indiceFila * largoRegistro + 1;
    fila.forEach((valor, indiceColumna) => {
      dbf.set(recortarUtf8(valor, largos[indiceColumna]), posicion);
      posicion += largos[indiceColumna];
    });
  });
  vista.setUint8(dbf.byteLength - 1, 0x1a);
  return dbf;
}

function textoDe(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

// Recorta sin partir una letra con tilde: sus bytes de continuación empiezan con 10xxxxxx.
function recortarUtf8(bytes: Uint8Array, largoMaximo: number): Uint8Array {
  if (bytes.byteLength <= largoMaximo) return bytes;
  let corte = largoMaximo;
  while (corte > 0 && (bytes[corte] & 0xc0) === 0x80) corte--;
  return bytes.slice(0, corte);
}
