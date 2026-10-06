import OlMap from "ol/Map";
import Overlay from "ol/Overlay";
import Feature from "ol/Feature";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import type { Coordinate } from "ol/coordinate";
import type { Pixel } from "ol/pixel";
import type MapBrowserEvent from "ol/MapBrowserEvent";
import type { Subscription } from "rxjs";

import { estaUsandoHerramientas } from "./herramientas-medicion";
import { PROPIEDAD_MENU_DIBUJO_ABIERTO } from "./menu-dibujos";
import type {
  CapaConsultable,
  ConsultaCapasGisService,
  ElementoGis,
} from "../../core/gis";

const MS_AVISO_SIN_INFORMACION = 1600;

// Alrededor del cursor, porque una válvula mide pocos píxeles.
const DESPLAZAMIENTOS_SONDEO: Pixel[] = [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]];

// El borde suavizado de los símbolos deja píxeles casi transparentes que no cuentan como "encima".
const ALFA_MINIMO = 40;

/** Las capas con esta marca solo señalan algo en el mapa: no responden al clic ni cambian el cursor. */
export const MARCA_CAPA_RESALTADO = "esResaltadoGis";

const COLOR_RESALTADO = "#0f766e";

const ESTILO_RESALTADO = [
  new Style({
    stroke: new Stroke({ color: "rgba(255, 255, 255, 0.9)", width: 9 }),
    image: new CircleStyle({
      radius: 15,
      stroke: new Stroke({ color: "rgba(255, 255, 255, 0.9)", width: 6 }),
    }),
  }),
  new Style({
    stroke: new Stroke({ color: COLOR_RESALTADO, width: 4 }),
    fill: new Fill({ color: "rgba(15, 118, 110, 0.15)" }),
    image: new CircleStyle({
      radius: 15,
      stroke: new Stroke({ color: COLOR_RESALTADO, width: 3 }),
      fill: new Fill({ color: "rgba(15, 118, 110, 0.15)" }),
    }),
  }),
];

export interface OpcionesInteraccionGis {
  /** Capas que se consultan al hacer clic. */
  capasConsultables: () => CapaConsultable[];
  /**
   * Capas donde el cursor se vuelve mano al pasar sobre lo dibujado. Solo puntos y líneas:
   * un polígono (lotes) cubre todo el mapa y la mano dejaría de significar algo.
   */
  capasConCursor: () => CapaConsultable[];
  etiquetaCapa: (rol: string) => string;
  alResponder: (elementos: ElementoGis[]) => void;
  /** Si bajo el cursor hay un dibujo con listado de clientes, se muestra la pista de su menú de clic derecho. */
  hayDibujoConListadoEn?: (pixel: Pixel) => boolean;
}

const PISTA_DIBUJO = "Clic derecho: ver clientes y descargar Excel";

/**
 * Lo que el usuario ve alrededor de una consulta GIS: la mano y el rótulo al pasar sobre un
 * elemento, el indicador "Consultando…" en el punto del clic y el resaltado del elemento elegido.
 */
export class InteraccionGis {
  private readonly capaResaltado = new VectorLayer({
    source: new VectorSource(),
    style: ESTILO_RESALTADO,
    zIndex: 1000,
  });
  private readonly indicador: Overlay;
  private readonly elementoIndicador: HTMLElement;
  private readonly rotulo: HTMLElement;
  private readonly claveMovimiento: EventsKey;
  private readonly claveMenuDibujo: EventsKey;

  private consultaEnCurso?: Subscription;
  private temporizadorAviso?: number;
  private estaConsultando = false;
  private cursorActual = "";
  private pixelPendiente: Pixel | null = null;

  constructor(
    private readonly map: OlMap,
    private readonly consulta: ConsultaCapasGisService,
    private readonly opciones: OpcionesInteraccionGis,
  ) {
    this.capaResaltado.set(MARCA_CAPA_RESALTADO, true);
    this.map.addLayer(this.capaResaltado);

    this.elementoIndicador = document.createElement("div");
    this.indicador = new Overlay({
      element: this.elementoIndicador,
      positioning: "center-center",
      stopEvent: false,
      className: "geo-consulta-overlay ol-overlay-container",
    });
    this.map.addOverlay(this.indicador);

    this.rotulo = document.createElement("div");
    this.rotulo.className = "geo-rotulo-cursor";
    this.map.getViewport().appendChild(this.rotulo);
    this.map.getViewport().addEventListener("mouseleave", this.alSalirDelMapa);

    this.claveMovimiento = this.map.on("pointermove", (evento) => this.alMoverCursor(evento));
    // La pista quedaría encima de la primera opción del menú de clic derecho.
    this.claveMenuDibujo = this.map.on("propertychange", (evento) => {
      if (evento.key !== PROPIEDAD_MENU_DIBUJO_ABIERTO) return;
      this.ocultarRotulo();
      this.ponerCursor("");
    });
  }

  consultar(coordenada: Coordinate): void {
    this.cancelar();
    this.estaConsultando = true;
    this.mostrarIndicador(coordenada, "consultando");
    this.ocultarRotulo();
    this.ponerCursor("progress");

    this.consultaEnCurso = this.consulta
      .consultarPunto(this.opciones.capasConsultables(), coordenada, this.map.getView())
      .subscribe((elementos) => {
        this.estaConsultando = false;
        this.ponerCursor("");
        if (elementos.length === 0) {
          this.mostrarAvisoSinInformacion(coordenada);
        } else {
          this.indicador.setPosition(undefined);
          this.resaltar(elementos[0]);
        }
        this.opciones.alResponder(elementos);
      });
  }

  resaltar(elemento: ElementoGis | undefined): void {
    const fuente = this.capaResaltado.getSource()!;
    fuente.clear();
    if (elemento?.geometria) {
      fuente.addFeature(new Feature(elemento.geometria.clone()));
    }
  }

  cancelar(): void {
    this.consultaEnCurso?.unsubscribe();
    this.consultaEnCurso = undefined;
    this.estaConsultando = false;
    clearTimeout(this.temporizadorAviso);
    this.indicador.setPosition(undefined);
    this.resaltar(undefined);
    this.ponerCursor("");
  }

  destruir(): void {
    this.cancelar();
    unByKey(this.claveMovimiento);
    unByKey(this.claveMenuDibujo);
    this.map.getViewport().removeEventListener("mouseleave", this.alSalirDelMapa);
    this.rotulo.remove();
    this.map.removeOverlay(this.indicador);
    this.map.removeLayer(this.capaResaltado);
  }

  private alMoverCursor(evento: MapBrowserEvent): void {
    if (evento.dragging) return;
    // Un cálculo por cuadro basta: pointermove llega muchas veces más rápido que lo que se pinta.
    const habiaPendiente = this.pixelPendiente !== null;
    this.pixelPendiente = evento.pixel;
    if (!habiaPendiente) {
      requestAnimationFrame(() => {
        const pixel = this.pixelPendiente;
        this.pixelPendiente = null;
        if (pixel) this.evaluarCursor(pixel);
      });
    }
  }

  private evaluarCursor(pixel: Pixel): void {
    if (this.estaConsultando || this.map.get(PROPIEDAD_MENU_DIBUJO_ABIERTO)) return;

    if (estaUsandoHerramientas(this.map)) {
      this.ocultarRotulo();
      this.ponerCursor("");
      return;
    }

    const hayPuntoPropio = this.map.hasFeatureAtPixel(pixel, {
      hitTolerance: 5,
      layerFilter: (capa) =>
        capa instanceof VectorLayer &&
        !capa.get(MARCA_CAPA_RESALTADO) &&
        !capa.get("isDrawLayer"),
    });
    if (hayPuntoPropio) {
      this.ocultarRotulo();
      this.ponerCursor("pointer");
      return;
    }

    const capaBajoCursor = this.opciones
      .capasConCursor()
      .find(({ capa }) => capa.getVisible() && this.hayDibujoEn(capa, pixel));

    if (capaBajoCursor) {
      this.mostrarRotulo(
        `${this.opciones.etiquetaCapa(capaBajoCursor.rol)} · clic para ver detalle`,
        pixel,
      );
      this.ponerCursor("pointer");
    } else if (this.opciones.hayDibujoConListadoEn?.(pixel)) {
      this.mostrarRotulo(PISTA_DIBUJO, pixel);
      this.ponerCursor("context-menu");
    } else {
      this.ocultarRotulo();
      this.ponerCursor("");
    }
  }

  // Lee el píxel de la imagen ya descargada: no hace ninguna petición a GeoServer.
  private hayDibujoEn(capa: CapaConsultable["capa"], pixel: Pixel): boolean {
    return DESPLAZAMIENTOS_SONDEO.some(([dx, dy]) => {
      const datos = capa.getData([pixel[0] + dx, pixel[1] + dy]);
      return !!datos && datos[3] >= ALFA_MINIMO;
    });
  }

  private mostrarIndicador(coordenada: Coordinate, estado: "consultando" | "vacio"): void {
    this.elementoIndicador.className = `geo-consulta geo-consulta--${estado}`;
    this.elementoIndicador.innerHTML =
      estado === "consultando"
        ? '<span class="geo-consulta__anillo"></span><span class="geo-consulta__texto">Consultando…</span>'
        : '<span class="geo-consulta__texto"><i class="pi pi-info-circle"></i> Sin información aquí</span>';
    this.indicador.setPosition(coordenada);
  }

  private mostrarAvisoSinInformacion(coordenada: Coordinate): void {
    this.mostrarIndicador(coordenada, "vacio");
    this.temporizadorAviso = window.setTimeout(
      () => this.indicador.setPosition(undefined),
      MS_AVISO_SIN_INFORMACION,
    );
  }

  private mostrarRotulo(texto: string, pixel: Pixel): void {
    this.rotulo.textContent = texto;
    this.rotulo.style.transform = `translate(${pixel[0] + 16}px, ${pixel[1] + 16}px)`;
    this.rotulo.classList.add("is-visible");
  }

  private ocultarRotulo(): void {
    this.rotulo.classList.remove("is-visible");
  }

  private readonly alSalirDelMapa = (): void => {
    this.pixelPendiente = null;
    this.ocultarRotulo();
    if (!this.estaConsultando) this.ponerCursor("");
  };

  private ponerCursor(cursor: string): void {
    if (cursor === this.cursorActual) return;
    this.cursorActual = cursor;
    this.map.getViewport().style.cursor = cursor;
  }
}
