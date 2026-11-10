import type OlMap from "ol/Map";
import Polygon from "ol/geom/Polygon";
import Circle from "ol/geom/Circle";
import { fromCircle } from "ol/geom/Polygon";
import { getArea } from "ol/sphere";
import type Geometry from "ol/geom/Geometry";
import type { Coordinate } from "ol/coordinate";
import { getHeight, getWidth, type Extent } from "ol/extent";
import { firstValueFrom, of, type Subscription } from "rxjs";
import { getCenter } from "ol/extent";
import { getPointResolution } from "ol/proj";
import { switchMap } from "rxjs/operators";
import type { ExcelService } from "@host/_servicios/reportes/excel.service";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";

import type {
  CapaConsultable,
  ConsultaCapasGisService,
  ElementoGis,
  GisConfigService,
} from "../../core/gis";
import type { ConfigOrigenCoordenada } from "../constantes/coordenadas";
import { agregarHerramientasMapa } from "./herramientas-medicion";
import { InteraccionGis } from "./interaccion-gis";
import { AccionDibujo, MenuDibujos } from "./menu-dibujos";
import { PredioBuscado } from "./predio-buscado";
import { CalleBuscada } from "./calle-buscada";
import { registrosDentroDeArea } from "./geo.utils";
import { capturarAreaMapa, mostrarAvisoMapa, proporcionDelArea } from "./exportar-imagen-mapa";
import { construirTerreno } from "./vista-3d/terreno";
import { Ventana3d } from "./vista-3d/ventana-3d";
import { descargarExcelSinCoordenadas } from "../utils/sin-coordenadas-excel";
import {
  ColumnaListado,
  FilaListado,
  descargarListadoExcel,
} from "../utils/listado-excel";
import { descargarReporteArea } from "../utils/pdf/reporte-area-pdf";

/** Dibujos que encierran un área y por eso tienen listado de clientes; la regla solo mide. */
type AreaDibujada = Polygon | Circle;

function esAreaDibujada(dibujo: Geometry | undefined): dibujo is AreaDibujada {
  return dibujo instanceof Polygon || dibujo instanceof Circle;
}

const TITULO_LISTADO = "Clientes en el área seleccionada";
// Dos clics casi en el mismo punto dan un área sin tamaño: no hay nada que imprimir.
const LADO_MINIMO_AREA_PX = 5;
// Al caminar el suelo se ve de cerca: la imagen va al doble que la del PDF. 4096 lo aceptan todas las tarjetas de video.
const LADO_MAYOR_IMAGEN_3D_PX = 4096;

// Deben coincidir con el alto de `.tabla-seleccion` (38 %, mínimo 220 px).
const PROPORCION_ALTO_TABLA = 0.38;
const ALTO_MINIMO_TABLA_PX = 220;
// La izquierda deja libre el panel de capas y la derecha el popup del cliente.
const MARGENES_LATERALES_PX = [380, 420];
const ANCHO_MINIMO_MARGEN_LATERAL_PX = 1100;
// Cerca para reconocer la manzana, sin llegar al zoom en que el mapa base se ve borroso.
const ZOOM_MAXIMO_ENCUADRE = 19;

export interface ListadoMapaGis {
  columnas: ColumnaListado[];
  /** Encabeza el Excel, por ejemplo "CONTROL DE DIGITACIÓN". */
  tituloReporte: string;
  nombreArchivo: string;
  origen: ConfigOrigenCoordenada;
  /** Registros cargados en la pantalla; el listado se arma con los que caen en el área. */
  registros: () => Record<string, unknown>[];
  aFila?: (registro: Record<string, unknown>) => FilaListado;
  subcabecera: () => string[];
  excelService: ExcelService;
}

export interface OpcionesControladorMapaGis {
  consulta: ConsultaCapasGisService;
  gis: GisConfigService;
  /** Capas comerciales WMS de la pantalla (lotes, calles…) que se consultan al hacer clic. */
  capasComerciales: () => CapaConsultable[];
  /** Capas técnicas del panel de capas: además de consultarse, cambian el cursor al pasar encima. */
  capasTecnicas: () => CapaConsultable[];
  avisar: (detalle: string) => void;
  /** Notificación opcional cuando una consulta GIS responde con elementos en un punto */
  alConsultarElemento?: (elementos: ElementoGis[], coordenada?: Coordinate) => void;
  /** Sin listado la pantalla no tiene herramientas de dibujo. */
  listado?: ListadoMapaGis;
  /** Acciones adicionales en el menú contextual del dibujo (clic derecho sobre polígono o círculo). */
  accionesExtraDibujo?: (dibujo: Geometry) => AccionDibujo[];
}

/**
 * Todo lo que el mapa de una pantalla hace con el GIS: consultar lo que hay bajo el clic,
 * marcar el predio del cliente buscado y listar en tabla o Excel los clientes de un área
 * dibujada. Las pantallas solo conectan su clic, su buscador y sus registros.
 */
export class ControladorMapaGis {
  /** Respuesta de la consulta GIS; el popup se muestra mientras tenga elementos. */
  elementosGis: ElementoGis[] = [];
  /** `null` = no hay área listada y la tabla está cerrada. */
  filasListado: FilaListado[] | null = null;
  subcabeceraListado: string[] = [];
  estaGenerandoPdf = false;
  estaPreparando3d = false;
  readonly tituloListado = TITULO_LISTADO;

  private readonly interaccion: InteraccionGis;
  private readonly predio: PredioBuscado;
  private readonly calle: CalleBuscada;
  private busquedaCalle?: Subscription;
  private readonly menuDibujos?: MenuDibujos;
  private busquedaPredio?: Subscription;
  /** Dibujo cuyo listado está en la tabla, para descartarlo si se borra ese dibujo. */
  private dibujoListado?: Geometry;
  private ventana3d?: Ventana3d;

  constructor(
    private readonly map: OlMap,
    private readonly opciones: OpcionesControladorMapaGis,
  ) {
    const { consulta, gis, listado } = opciones;

    if (listado) {
      agregarHerramientasMapa(
        map,
        (dibujo) => {
          if (esAreaDibujada(dibujo)) this.mostrarListadoDe(dibujo);
        },
        undefined,
        () => this.descartarListado(),
        (area) => {
          if (esAreaDibujada(area)) this.descargarPdfDe(area);
        },
        this.puedeVer3d
          ? (area) => {
              if (esAreaDibujada(area)) this.verEn3d(area);
            }
          : undefined,
      );
      this.menuDibujos = new MenuDibujos(
        map,
        (dibujo) => this.accionesDeDibujo(dibujo.getGeometry()),
        (dibujo) => {
          if (dibujo.getGeometry() === this.dibujoListado) this.descartarListado();
        },
      );
    }

    this.interaccion = new InteraccionGis(map, consulta, {
      capasConsultables: () => [...opciones.capasTecnicas(), ...opciones.capasComerciales()],
      capasConCursor: opciones.capasTecnicas,
      etiquetaCapa: (rol) => gis.etiquetaCapa(rol),
      alResponder: (elementos) => {
        this.elementosGis = elementos;
        opciones.alConsultarElemento?.(elementos);
      },
      hayDibujoConListadoEn: (pixel) =>
        esAreaDibujada(this.menuDibujos?.dibujoEn(pixel)?.getGeometry()),
    });
    this.predio = new PredioBuscado(map);
    this.calle = new CalleBuscada(map);
  }

  get capaPredio(): VectorLayer<VectorSource> {
    return this.predio.capaVector;
  }

  get columnasListado(): ColumnaListado[] {
    return this.opciones.listado?.columnas ?? [];
  }

  get tituloExcelListado(): string {
    return `${this.opciones.listado?.tituloReporte ?? ""} - ${TITULO_LISTADO.toUpperCase()}`;
  }

  get nombreArchivoListado(): string {
    return this.opciones.listado?.nombreArchivo ?? "clientes_area_";
  }

  // ---------- Consulta GIS ----------

  /** Clic en el mapa donde no hay un punto de la pantalla: se pregunta a GeoServer. */
  consultarPunto(coordenada: Coordinate): void {
    this.elementosGis = [];
    this.interaccion.consultar(coordenada);
  }

  cerrarPopupGis(): void {
    this.elementosGis = [];
    this.interaccion.cancelar();
  }

  resaltarElementoGis(elemento: ElementoGis): void {
    this.interaccion.resaltar(elemento);
  }

  // ---------- Predio del cliente buscado ----------

  /**
   * Pinta el lote del cliente buscado y lo encuadra de cerca, en la parte del mapa que queda libre.
   * Si la EPS no guarda el código de cliente en sus lotes, se usa el lote donde cae `puntoCliente`.
   */
  marcarPredio(codcliente: string, puntoCliente?: Coordinate, sinMedidor = false): void {
    this.quitarPredio();
    const { consulta, gis } = this.opciones;
    this.busquedaPredio = consulta
      .buscarPredioDeCliente(codcliente, gis.proyeccionMapa)
      .pipe(
        switchMap((geometria) =>
          geometria || !puntoCliente
            ? of(geometria)
            : consulta.buscarPredioEnPunto(puntoCliente, gis.proyeccionMapa),
        ),
      )
      .subscribe((geometria) => {
        if (!geometria) return;
        this.predio.mostrar(geometria, codcliente, sinMedidor);
        this.predio.encuadrar();
      });
  }

  actualizarPredioSinMedidor(sinMedidor: boolean): void {
    this.predio.actualizarSinMedidor(sinMedidor);
  }

  /**
   * Pinta la calle buscada y la encuadra de cerca, en la parte del mapa que queda libre.
   * `alNoEncontrar` corre si la EPS no la publica o GeoServer no la tiene, para que la pantalla encuadre otra cosa.
   */
  marcarCalle(nombre: string, alNoEncontrar?: () => void): void {
    this.quitarCalle();
    this.busquedaCalle = this.opciones.consulta
      .buscarCalle(nombre, this.opciones.gis.proyeccionMapa)
      .subscribe((tramos) => {
        this.calle.mostrar(tramos);
        const extension = this.calle.extension();
        if (extension) this.encuadrarEnZonaLibre(extension);
        else alNoEncontrar?.();
      });
  }

  quitarCalle(): void {
    this.busquedaCalle?.unsubscribe();
    this.calle.limpiar();
  }

  quitarPredio(): void {
    this.busquedaPredio?.unsubscribe();
    this.predio.limpiar();
  }

  // ---------- Listado del área dibujada ----------

  descartarListado(): void {
    this.filasListado = null;
    this.dibujoListado = undefined;
  }

  /**
   * Encuadra en la parte del mapa que no tapan el panel de capas, el popup del cliente
   * ni la tabla, para que el área dibujada o el cliente elegido queden a la vista.
   */
  encuadrarEnZonaLibre(extension: Extent): void {
    const [anchoMapa, altoMapa] = this.map.getSize() ?? [0, 0];
    const altoTabla = this.filasListado
      ? Math.max(ALTO_MINIMO_TABLA_PX, altoMapa * PROPORCION_ALTO_TABLA) + 80
      : 80;
    // En pantallas angostas la tabla y el popup ocupan todo el ancho: solo se reserva el alto.
    const [izquierda, derecha] =
      anchoMapa >= ANCHO_MINIMO_MARGEN_LATERAL_PX ? MARGENES_LATERALES_PX : [20, 20];
    this.map.getView().fit(extension, {
      duration: 600,
      maxZoom: ZOOM_MAXIMO_ENCUADRE,
      padding: [80, derecha, altoTabla, izquierda],
    });
  }

  /** La vista 3D arma el relieve con las curvas de nivel: solo la tienen las EPS que las publican. */
  get puedeVer3d(): boolean {
    return this.opciones.gis.tieneCapa("curvasNivel");
  }

  /** Vista 3D del área cuyo listado está en la tabla. */
  verListadoEn3d(): Promise<void> {
    if (!this.dibujoListado || !esAreaDibujada(this.dibujoListado)) return Promise.resolve();
    return this.verEn3d(this.dibujoListado);
  }

  destruir(): void {
    this.ventana3d?.cerrar();
    this.quitarPredio();
    this.quitarCalle();
    this.calle.destruir();
    this.interaccion.destruir();
    this.menuDibujos?.destruir();
    this.predio.destruir();
  }

  private hayRegistros(): boolean {
    return (this.opciones.listado?.registros().length ?? 0) > 0;
  }

  private clientesEnArea(area: AreaDibujada): FilaListado[] {
    const listado = this.opciones.listado;
    if (!listado) return [];
    const dentro = registrosDentroDeArea(listado.registros(), area, listado.origen);
    return listado.aFila ? dentro.map(listado.aFila) : dentro;
  }

  private avisarSinRegistros(): void {
    this.opciones.avisar(
      "Primero cargue los datos con «Filtrar datos» para listar los clientes del dibujo.",
    );
  }

  private mostrarListadoDe(area: AreaDibujada): void {
    if (!this.hayRegistros()) {
      this.avisarSinRegistros();
      return;
    }
    this.dibujoListado = area;
    this.subcabeceraListado = this.opciones.listado!.subcabecera();
    this.filasListado = this.clientesEnArea(area);
    this.encuadrarEnZonaLibre(area.getExtent());
  }

  /** Excel de los registros cargados que no se pintan por no tener coordenadas; devuelve cuántos salieron. */
  descargarSinCoordenadas(): Promise<number> {
    const listado = this.opciones.listado;
    if (!listado) return Promise.resolve(0);
    return descargarExcelSinCoordenadas(listado.excelService, {
      titulo: `${listado.tituloReporte} - SIN COORDENADAS`,
      subcabecera: listado.subcabecera(),
      nombreArchivo: `${listado.nombreArchivo.replace(/area_$/, "")}sin_coordenadas_`,
      columnas: listado.columnas,
      registros: listado.registros(),
      origen: listado.origen,
      aFila: listado.aFila,
    });
  }

  private async descargarExcelDe(area: AreaDibujada): Promise<void> {
    const listado = this.opciones.listado!;
    const filas = this.clientesEnArea(area);
    if (filas.length === 0) return;
    await descargarListadoExcel(listado.excelService, {
      titulo: this.tituloExcelListado,
      subcabecera: listado.subcabecera(),
      nombreArchivo: listado.nombreArchivo,
      columnas: listado.columnas,
      filas,
    });
  }

  /** PDF del área cuyo listado está en la tabla, con las filas que deja ver el filtro de la tabla. */
  descargarPdfListado(filas: FilaListado[]): Promise<void> {
    if (!this.dibujoListado || !esAreaDibujada(this.dibujoListado)) return Promise.resolve();
    return this.descargarPdfDe(this.dibujoListado, filas);
  }

  /** Plano del área y listado de sus clientes; sin datos cargados sale solo el plano. */
  private async descargarPdfDe(area: AreaDibujada, filas?: FilaListado[]): Promise<void> {
    const listado = this.opciones.listado;
    if (!listado || this.estaGenerandoPdf) return;
    if (!this.tieneTamano(area)) return;

    this.estaGenerandoPdf = true;
    try {
      const imagen = await capturarAreaMapa(this.map, area, proporcionDelArea(area));
      const proyeccion = this.map.getView().getProjection();
      const contorno = area instanceof Circle ? fromCircle(area, 96) : area;
      await descargarReporteArea({
        titulo: this.tituloExcelListado,
        subcabecera: listado.subcabecera(),
        nombreArchivo: listado.nombreArchivo,
        columnas: listado.columnas,
        filas: filas ?? (this.hayRegistros() ? this.clientesEnArea(area) : null),
        imagen,
        areaMetrosCuadrados: getArea(contorno, { projection: proyeccion }),
        logo: logoValido(listado.excelService.imagePath),
        usuario: sessionStorage.getItem("codusu") ?? undefined,
      });
    } catch (error) {
      console.error("[GIS] No se pudo generar el PDF del área.", error);
      this.opciones.avisar(
        error instanceof DOMException && error.name === "SecurityError"
          ? "Una de las capas visibles no permite exportar su imagen. Apáguela o cambie el mapa base e intente de nuevo."
          : "No se pudo generar el PDF del área. Intente de nuevo.",
      );
    } finally {
      this.estaGenerandoPdf = false;
    }
  }

  /**
   * Relieve del área con la imagen del mapa encima. La imagen se toma primero porque de ella sale
   * la extensión exacta del terreno; las curvas se piden para esa misma extensión.
   */
  private async verEn3d(area: AreaDibujada): Promise<void> {
    if (this.estaPreparando3d || !this.puedeVer3d) return;
    if (!this.tieneTamano(area)) return;

    this.estaPreparando3d = true;
    const quitarAviso = mostrarAvisoMapa(this.map, "Preparando la vista 3D…");
    try {
      const proyeccion = this.opciones.gis.proyeccionMapa;
      const imagen = await capturarAreaMapa(this.map, area, proporcionDelArea(area), {
        textoAviso: null,
        ladoMayorPx: LADO_MAYOR_IMAGEN_3D_PX,
      });
      const curvas = await firstValueFrom(this.opciones.consulta.buscarCurvasDeNivel(imagen.extension, proyeccion));
      const metrosPorUnidad = getPointResolution(proyeccion, 1, getCenter(imagen.extension), "m");
      const terreno = construirTerreno(curvas, imagen.extension, metrosPorUnidad);
      if (!terreno) {
        this.opciones.avisar("En esta área no hay curvas de nivel suficientes para armar el relieve.");
        return;
      }
      this.ventana3d?.cerrar();
      this.ventana3d = new Ventana3d(this.map, terreno, imagen.lienzo, () => (this.ventana3d = undefined));
    } catch (error) {
      console.error("[GIS] No se pudo preparar la vista 3D.", error);
      this.opciones.avisar("No se pudo preparar la vista 3D del área. Intente de nuevo.");
    } finally {
      quitarAviso();
      this.estaPreparando3d = false;
    }
  }

  /** El área se ve de al menos unos píxeles por lado; si no, avisa y devuelve `false`. */
  private tieneTamano(area: AreaDibujada): boolean {
    const extension = area.getExtent();
    const resolucion = this.map.getView().getResolution() ?? 1;
    if (Math.min(getWidth(extension), getHeight(extension)) / resolucion >= LADO_MINIMO_AREA_PX) return true;
    this.opciones.avisar("El área es muy pequeña: dibuje un rectángulo más grande.");
    return false;
  }

  // La regla solo mide: su menú queda con "Borrar este dibujo", que agrega el propio menú.
  private accionesDeDibujo(dibujo: Geometry | undefined): AccionDibujo[] {
    if (!esAreaDibujada(dibujo)) return [];

    const extras = this.opciones.accionesExtraDibujo ? this.opciones.accionesExtraDibujo(dibujo) : [];
    const accionPdf = (total?: number): AccionDibujo => ({
      etiqueta: this.estaGenerandoPdf
        ? "Generando PDF..."
        : total === undefined
          ? "Descargar PDF (solo plano)"
          : `Descargar PDF (${total})`,
      icono: "pi pi-file-pdf",
      ejecutar: () => this.descargarPdfDe(dibujo),
      deshabilitada: this.estaGenerandoPdf,
    });
    const acciones3d: AccionDibujo[] = this.puedeVer3d
      ? [
          {
            etiqueta: this.estaPreparando3d ? "Preparando 3D..." : "Ver en 3D",
            icono: "fa-solid fa-mountain-sun",
            ejecutar: () => this.verEn3d(dibujo),
            deshabilitada: this.estaPreparando3d,
          },
        ]
      : [];

    if (!this.hayRegistros()) {
      return [
        ...extras,
        {
          etiqueta: "Cargue los datos para ver los clientes",
          icono: "pi pi-info-circle",
          ejecutar: () => this.avisarSinRegistros(),
        },
        accionPdf(),
        ...acciones3d,
      ];
    }
    const total = this.clientesEnArea(dibujo).length;
    return [
      ...extras,
      {
        etiqueta: `Ver clientes (${total})`,
        icono: "pi pi-table",
        ejecutar: () => this.mostrarListadoDe(dibujo),
      },
      {
        etiqueta: `Descargar Excel (${total})`,
        icono: "pi pi-file-excel",
        ejecutar: () => this.descargarExcelDe(dibujo),
        deshabilitada: total === 0,
      },
      accionPdf(total),
      ...acciones3d,
    ];
  }
}

// Si la empresa no tiene logo de reportes el servicio deja "data:image/png;base64,undefined".
function logoValido(logo: string | undefined): string | undefined {
  return logo && /^data:image\/\w+;base64,(?!undefined$|null$).+/.test(logo) ? logo : undefined;
}
