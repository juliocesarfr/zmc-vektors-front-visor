import type Geometry from "ol/geom/Geometry";
import LineString from "ol/geom/LineString";
import MultiLineString from "ol/geom/MultiLineString";
import type { Coordinate } from "ol/coordinate";
import { getHeight, getWidth, type Extent } from "ol/extent";

import type { CurvaNivel } from "../../../core/gis";

/** Malla de alturas del área: `alturas[fila * columnas + columna]`, la fila 0 es el borde norte. */
export interface Terreno {
  columnas: number;
  filas: number;
  alturas: Float32Array;
  minima: number;
  maxima: number;
  anchoMetros: number;
  altoMetros: number;
}

const COLUMNAS_POR_DEFECTO = 160;
const FILAS_MINIMAS = 8;
// Entre dos curvas se interpola con las cotas distintas más cercanas: con 4 la ladera sale pareja.
const COTAS_POR_PUNTO = 4;
// Las curvas son escalones de 1 o 2 m: dos pasadas de suavizado quitan el aspecto de terrazas.
const PASADAS_SUAVIZADO = 2;
// Hasta qué parte del área se busca una curva para un punto que no tiene ninguna cerca.
const PROPORCION_BUSQUEDA_MAXIMA = 0.35;

interface Muestras {
  x: number[];
  y: number[];
  cota: number[];
}

/**
 * Arma la malla de alturas a partir de las curvas de nivel que caen en la extensión.
 * Cada punto toma, por cada cota cercana, el punto más próximo de esa curva y las promedia por distancia:
 * así queda entre las dos curvas que lo rodean y no pegado a la más densa.
 * Devuelve `null` si en el área no hay al menos dos cotas distintas (no hay relieve que mostrar).
 * @param metrosPorUnidad metros que mide una unidad de la proyección del mapa en el centro del área.
 */
export function construirTerreno(
  curvas: CurvaNivel[],
  extension: Extent,
  metrosPorUnidad: number,
  columnas = COLUMNAS_POR_DEFECTO,
): Terreno | null {
  const ancho = getWidth(extension);
  const alto = getHeight(extension);
  const filas = Math.max(FILAS_MINIMAS, Math.round((columnas * alto) / ancho));
  const pasoX = ancho / (columnas - 1);
  const pasoY = alto / (filas - 1);
  const separacionMuestras = Math.min(pasoX, pasoY) / 2;

  const muestras = muestrearCurvas(curvas, extension, separacionMuestras, Math.max(pasoX, pasoY) * 3);
  if (new Set(muestras.cota).size < 2) return null;

  const indice = new IndiceEspacial(muestras, Math.max(pasoX, pasoY) * 2);
  const radioMaximo = Math.max(ancho, alto) * PROPORCION_BUSQUEDA_MAXIMA;
  const alturas = new Float32Array(columnas * filas);
  for (let fila = 0; fila < filas; fila++) {
    for (let columna = 0; columna < columnas; columna++) {
      const x = extension[0] + columna * pasoX;
      const y = extension[3] - fila * pasoY;
      alturas[fila * columnas + columna] = indice.interpolar(x, y, radioMaximo);
    }
  }

  rellenarHuecos(alturas);
  for (let pasada = 0; pasada < PASADAS_SUAVIZADO; pasada++) suavizar(alturas, columnas, filas);

  let minima = Infinity;
  let maxima = -Infinity;
  for (const altura of alturas) {
    minima = Math.min(minima, altura);
    maxima = Math.max(maxima, altura);
  }

  return {
    columnas,
    filas,
    alturas,
    minima,
    maxima,
    anchoMetros: ancho * metrosPorUnidad,
    altoMetros: alto * metrosPorUnidad,
  };
}

/** Puntos de las curvas cada `separacion` unidades, solo los que caen en la extensión más un margen. */
function muestrearCurvas(curvas: CurvaNivel[], extension: Extent, separacion: number, margen: number): Muestras {
  const muestras: Muestras = { x: [], y: [], cota: [] };
  const dentro = (x: number, y: number) =>
    x >= extension[0] - margen && x <= extension[2] + margen && y >= extension[1] - margen && y <= extension[3] + margen;

  for (const curva of curvas) {
    for (const tramo of tramosDe(curva.geometria)) {
      let anterior: Coordinate | undefined;
      for (const punto of tramo) {
        if (!anterior) {
          if (dentro(punto[0], punto[1])) agregar(muestras, punto[0], punto[1], curva.elevacion);
          anterior = punto;
          continue;
        }
        const distancia = Math.hypot(punto[0] - anterior[0], punto[1] - anterior[1]);
        if (distancia < separacion) continue;
        // Un tramo largo y recto trae solo sus extremos: se rellena para que no queden huecos sin cota.
        const partes = Math.ceil(distancia / separacion);
        for (let parte = 1; parte <= partes; parte++) {
          const x = anterior[0] + ((punto[0] - anterior[0]) * parte) / partes;
          const y = anterior[1] + ((punto[1] - anterior[1]) * parte) / partes;
          if (dentro(x, y)) agregar(muestras, x, y, curva.elevacion);
        }
        anterior = punto;
      }
    }
  }
  return muestras;
}

function tramosDe(geometria: Geometry): Coordinate[][] {
  if (geometria instanceof MultiLineString) return geometria.getCoordinates();
  if (geometria instanceof LineString) return [geometria.getCoordinates()];
  return [];
}

function agregar(muestras: Muestras, x: number, y: number, cota: number): void {
  muestras.x.push(x);
  muestras.y.push(y);
  muestras.cota.push(cota);
}

/** Reparte las muestras en cuadros para buscar las cercanas a un punto sin recorrerlas todas. */
class IndiceEspacial {
  private readonly cuadros = new Map<string, number[]>();

  constructor(
    private readonly muestras: Muestras,
    private readonly ladoCuadro: number,
  ) {
    muestras.x.forEach((x, posicion) => {
      const clave = this.clave(Math.floor(x / ladoCuadro), Math.floor(muestras.y[posicion] / ladoCuadro));
      const cuadro = this.cuadros.get(clave);
      if (cuadro) cuadro.push(posicion);
      else this.cuadros.set(clave, [posicion]);
    });
  }

  /** Cota del punto, o `NaN` si no hay ninguna curva dentro de `radioMaximo`. */
  interpolar(x: number, y: number, radioMaximo: number): number {
    const columnaCentro = Math.floor(x / this.ladoCuadro);
    const filaCentro = Math.floor(y / this.ladoCuadro);
    const anillosMaximos = Math.ceil(radioMaximo / this.ladoCuadro);
    const distanciaPorCota = new Map<number, number>();
    let anilloConDosCotas = -1;

    for (let anillo = 0; anillo <= anillosMaximos; anillo++) {
      this.recorrerAnillo(columnaCentro, filaCentro, anillo, (posicion) => {
        const cota = this.muestras.cota[posicion];
        const distancia = (this.muestras.x[posicion] - x) ** 2 + (this.muestras.y[posicion] - y) ** 2;
        const anterior = distanciaPorCota.get(cota);
        if (anterior === undefined || distancia < anterior) distanciaPorCota.set(cota, distancia);
      });
      if (anilloConDosCotas < 0 && distanciaPorCota.size >= 2) anilloConDosCotas = anillo;
      // Un anillo más después de hallar dos cotas: alguna del anillo siguiente puede estar más cerca en diagonal.
      if (anilloConDosCotas >= 0 && anillo > anilloConDosCotas) break;
    }
    if (distanciaPorCota.size === 0) return NaN;

    const cercanas = [...distanciaPorCota].sort((primera, segunda) => primera[1] - segunda[1]).slice(0, COTAS_POR_PUNTO);
    let sumaPesos = 0;
    let sumaCotas = 0;
    for (const [cota, distancia] of cercanas) {
      if (distancia === 0) return cota;
      const peso = 1 / distancia;
      sumaPesos += peso;
      sumaCotas += cota * peso;
    }
    return sumaCotas / sumaPesos;
  }

  private recorrerAnillo(columnaCentro: number, filaCentro: number, anillo: number, alVisitar: (posicion: number) => void): void {
    for (let fila = filaCentro - anillo; fila <= filaCentro + anillo; fila++) {
      for (let columna = columnaCentro - anillo; columna <= columnaCentro + anillo; columna++) {
        const esBorde = Math.abs(fila - filaCentro) === anillo || Math.abs(columna - columnaCentro) === anillo;
        if (!esBorde) continue;
        this.cuadros.get(this.clave(columna, fila))?.forEach(alVisitar);
      }
    }
  }

  private clave(columna: number, fila: number): string {
    return `${columna}:${fila}`;
  }
}

/** Los puntos lejos de toda curva toman el promedio del área, para que no queden pozos ni picos. */
function rellenarHuecos(alturas: Float32Array): void {
  let suma = 0;
  let cantidad = 0;
  for (const altura of alturas) {
    if (Number.isNaN(altura)) continue;
    suma += altura;
    cantidad++;
  }
  const promedio = cantidad ? suma / cantidad : 0;
  alturas.forEach((altura, posicion) => {
    if (Number.isNaN(altura)) alturas[posicion] = promedio;
  });
}

function suavizar(alturas: Float32Array, columnas: number, filas: number): void {
  const original = alturas.slice();
  for (let fila = 0; fila < filas; fila++) {
    for (let columna = 0; columna < columnas; columna++) {
      let suma = 0;
      let cantidad = 0;
      for (let filaVecina = Math.max(0, fila - 1); filaVecina <= Math.min(filas - 1, fila + 1); filaVecina++) {
        for (let columnaVecina = Math.max(0, columna - 1); columnaVecina <= Math.min(columnas - 1, columna + 1); columnaVecina++) {
          suma += original[filaVecina * columnas + columnaVecina];
          cantidad++;
        }
      }
      alturas[fila * columnas + columna] = suma / cantidad;
    }
  }
}
