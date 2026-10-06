import type OlMap from "ol/Map";
import Polygon from "ol/geom/Polygon";
import Circle from "ol/geom/Circle";
import type Geometry from "ol/geom/Geometry";
import type { Coordinate } from "ol/coordinate";
import type { Extent } from "ol/extent";
import type { Subscription } from "rxjs";
import type { ExcelService } from "@host/_servicios/reportes/excel.service";

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
import { registrosDentroDeArea } from "./geo.utils";
import {
  ColumnaListado,
  FilaListado,
  descargarListadoExcel,
} from "../utils/listado-excel";

/** Dibujos que encierran un área y por eso tienen listado de clientes; la regla solo mide. */
type AreaDibujada = Polygon | Circle;

function esAreaDibujada(dibujo: Geometry | undefined): dibujo is AreaDibujada {
  return dibujo instanceof Polygon || dibujo instanceof Circle;
}

const TITULO_LISTADO = "Clientes en el área seleccionada";

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
  /** Sin listado la pantalla no tiene herramientas de dibujo. */
  listado?: ListadoMapaGis;
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
  readonly tituloListado = TITULO_LISTADO;

  private readonly interaccion: InteraccionGis;
  private readonly predio: PredioBuscado;
  private readonly menuDibujos?: MenuDibujos;
  private busquedaPredio?: Subscription;
  /** Dibujo cuyo listado está en la tabla, para descartarlo si se borra ese dibujo. */
  private dibujoListado?: Geometry;

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
      alResponder: (elementos) => (this.elementosGis = elementos),
      hayDibujoConListadoEn: (pixel) =>
        esAreaDibujada(this.menuDibujos?.dibujoEn(pixel)?.getGeometry()),
    });
    this.predio = new PredioBuscado(map);
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

  /** Pinta el lote del cliente buscado y lo encuadra de cerca, en la parte del mapa que queda libre. */
  marcarPredio(codcliente: string): void {
    this.quitarPredio();
    this.busquedaPredio = this.opciones.consulta
      .buscarPredioDeCliente(codcliente, this.opciones.gis.proyeccionMapa)
      .subscribe((geometria) => {
        if (!geometria) return;
        this.predio.mostrar(geometria, codcliente);
        this.predio.encuadrar();
      });
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

  destruir(): void {
    this.quitarPredio();
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

  // La regla solo mide: su menú queda con "Borrar este dibujo", que agrega el propio menú.
  private accionesDeDibujo(dibujo: Geometry | undefined): AccionDibujo[] {
    if (!esAreaDibujada(dibujo)) return [];
    if (!this.hayRegistros()) {
      return [
        {
          etiqueta: "Cargue los datos para ver los clientes",
          icono: "pi pi-info-circle",
          ejecutar: () => this.avisarSinRegistros(),
        },
      ];
    }
    const total = this.clientesEnArea(dibujo).length;
    return [
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
    ];
  }
}
