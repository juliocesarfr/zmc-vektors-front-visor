import OlMap from "ol/Map";
import Overlay from "ol/Overlay";
import type Feature from "ol/Feature";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import type { Coordinate } from "ol/coordinate";

import { PROPIEDAD_ROTULO_MEDIDA } from "./herramientas-medicion";

export interface AccionDibujo {
  etiqueta: string;
  /** Clases de PrimeIcons o Font Awesome, por ejemplo `pi pi-table`. */
  icono: string;
  ejecutar: () => void;
  deshabilitada?: boolean;
}

// Una línea mide pocos píxeles de ancho: sin margen el clic derecho casi nunca la alcanza.
const TOLERANCIA_PX = 6;

/** Propiedad del mapa que avisa (por `propertychange`) que el menú se abrió o se cerró, para ocultar las pistas del cursor. */
export const PROPIEDAD_MENU_DIBUJO_ABIERTO = "menuDibujoAbierto";

/**
 * Menú de clic derecho sobre los dibujos de las herramientas (polígono, círculo, línea).
 * Las acciones las da la pantalla; "Borrar este dibujo" lo agrega siempre el menú.
 */
export class MenuDibujos {
  private readonly elemento = document.createElement("div");
  private readonly overlay: Overlay;
  private readonly claveMovimiento: EventsKey;

  constructor(
    private readonly map: OlMap,
    private readonly accionesDe: (dibujo: Feature) => AccionDibujo[],
    private readonly alBorrarDibujo?: (dibujo: Feature) => void,
  ) {
    this.elemento.className = "geo-menu-dibujo";
    this.overlay = new Overlay({
      element: this.elemento,
      positioning: "top-left",
      offset: [4, 4],
      className: "geo-menu-dibujo-overlay ol-overlay-container",
    });
    this.map.addOverlay(this.overlay);

    this.map.getViewport().addEventListener("contextmenu", this.alClicDerecho);
    document.addEventListener("pointerdown", this.alPulsarFuera, true);
    document.addEventListener("keydown", this.alPulsarTecla);
    this.claveMovimiento = this.map.on("movestart", () => this.cerrar());
  }

  /** Dibujo bajo ese píxel: la pantalla lo usa para decidir si muestra la pista del clic derecho. */
  dibujoEn(pixel: number[]): Feature | undefined {
    return this.map.forEachFeatureAtPixel(pixel, (encontrado) => encontrado as Feature, {
      hitTolerance: TOLERANCIA_PX,
      layerFilter: (capa) => !!capa.get("isDrawLayer"),
    });
  }

  cerrar(): void {
    this.overlay.setPosition(undefined);
    this.map.set(PROPIEDAD_MENU_DIBUJO_ABIERTO, false);
  }

  destruir(): void {
    this.cerrar();
    unByKey(this.claveMovimiento);
    this.map.getViewport().removeEventListener("contextmenu", this.alClicDerecho);
    document.removeEventListener("pointerdown", this.alPulsarFuera, true);
    document.removeEventListener("keydown", this.alPulsarTecla);
    this.map.removeOverlay(this.overlay);
  }

  // Fuera de un dibujo se deja el menú normal del navegador.
  private readonly alClicDerecho = (evento: MouseEvent): void => {
    const pixel = this.map.getEventPixel(evento);
    let capaDelDibujo: VectorLayer<VectorSource> | undefined;
    const dibujo = this.map.forEachFeatureAtPixel(
      pixel,
      (encontrado, capa) => {
        capaDelDibujo = capa as VectorLayer<VectorSource>;
        return encontrado as Feature;
      },
      { hitTolerance: TOLERANCIA_PX, layerFilter: (capa) => !!capa.get("isDrawLayer") },
    );

    if (!dibujo || !capaDelDibujo) {
      this.cerrar();
      return;
    }
    evento.preventDefault();
    this.abrir(dibujo, capaDelDibujo, this.map.getCoordinateFromPixel(pixel));
  };

  private abrir(dibujo: Feature, capa: VectorLayer<VectorSource>, coordenada: Coordinate): void {
    const acciones: AccionDibujo[] = [
      ...this.accionesDe(dibujo),
      {
        etiqueta: "Borrar este dibujo",
        icono: "pi pi-trash",
        ejecutar: () => this.borrar(dibujo, capa),
      },
    ];

    this.elemento.replaceChildren(
      ...acciones.map((accion, indice) => this.crearBoton(accion, indice === acciones.length - 1)),
    );
    this.overlay.setPosition(coordenada);
    this.map.set(PROPIEDAD_MENU_DIBUJO_ABIERTO, true);
  }

  private crearBoton(accion: AccionDibujo, esBorrar: boolean): HTMLButtonElement {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = esBorrar ? "geo-menu-dibujo__opcion geo-menu-dibujo__opcion--borrar" : "geo-menu-dibujo__opcion";
    boton.disabled = !!accion.deshabilitada;

    const icono = document.createElement("i");
    icono.className = accion.icono;
    const texto = document.createElement("span");
    texto.textContent = accion.etiqueta;
    boton.append(icono, texto);

    boton.addEventListener("click", () => {
      this.cerrar();
      accion.ejecutar();
    });
    return boton;
  }

  private borrar(dibujo: Feature, capa: VectorLayer<VectorSource>): void {
    capa.getSource()?.removeFeature(dibujo);
    const rotulo = dibujo.get(PROPIEDAD_ROTULO_MEDIDA) as Overlay | undefined;
    if (rotulo) this.map.removeOverlay(rotulo);
    this.alBorrarDibujo?.(dibujo);
  }

  private readonly alPulsarFuera = (evento: PointerEvent): void => {
    if (!this.elemento.contains(evento.target as Node)) this.cerrar();
  };

  private readonly alPulsarTecla = (evento: KeyboardEvent): void => {
    if (evento.key === "Escape") this.cerrar();
  };
}
