import type { NgZone } from "@angular/core";
import OlMap from "ol/Map";
import Overlay from "ol/Overlay";
import type { Coordinate } from "ol/coordinate";

/** Milisegundos que el marcador de "lectura recién tomada" queda visible. */
const DESTELLO_MS_VISIBLE = 3200;

/** Duración del fundido de salida; debe coincidir con la animación del SCSS. */
const DESTELLO_MS_SALIDA = 420;

/**
 * Tope de destellos a la vez. Una sincronización masiva de la APK puede traer
 * decenas de lecturas de golpe y taparían el mapa.
 */
const DESTELLO_MAX_SIMULTANEOS = 12;

/**
 * Milisegundos que el rótulo superior ("X tomó lectura de Y") queda en
 * pantalla. Se reinicia con cada lectura nueva.
 */
export const ROTULO_ENVIVO_MS = 4000;

export interface OpcionesDestello {
  /** Color permanente que queda en el punto; el destello lo anticipa. */
  color: string;
  /** Código del inspector, en el badge superior. */
  inspector?: string;
  /** Segunda línea del badge (nombre del inspector o el codcliente). */
  detalle?: string;
  /** Milisegundos visible antes de desvanecerse. */
  duracionMs?: number;
}

interface DestelloActivo {
  overlay: Overlay;
  timeoutSalida: number;
  timeoutQuitar: number;
}

/** Marcador animado que aparece unos segundos sobre el punto donde se acaba de tomar una lectura. */
export class DestelloLecturas {
  private activos = new Map<string, DestelloActivo>();

  constructor(
    private readonly map: OlMap,
    private readonly zone?: NgZone,
  ) {}

  private programar(fn: () => void, ms: number): number {
    return this.zone
      ? this.zone.runOutsideAngular(() => window.setTimeout(fn, ms))
      : window.setTimeout(fn, ms);
  }

  mostrar(
    clave: string,
    coordenada: Coordinate,
    opciones: OpcionesDestello,
  ): void {
    if (!this.map) return;

    this.quitar(clave);
    this.limitarSimultaneos();

    const elemento = this.construirElemento(opciones);
    const overlay = new Overlay({
      element: elemento,
      position: coordenada,
      positioning: "center-center",
      stopEvent: false,
      insertFirst: false,
      className: "geo-destello-overlay ol-overlay-container",
    });

    this.map.addOverlay(overlay);

    const visible = opciones.duracionMs ?? DESTELLO_MS_VISIBLE;

    const timeoutSalida = this.programar(() => {
      elemento.classList.add("is-saliendo");
    }, visible);

    const timeoutQuitar = this.programar(() => {
      this.quitar(clave);
    }, visible + DESTELLO_MS_SALIDA);

    this.activos.set(clave, { overlay, timeoutSalida, timeoutQuitar });
  }

  /** Quita un destello concreto y cancela sus temporizadores. */
  quitar(clave: string): void {
    const activo = this.activos.get(clave);
    if (!activo) return;

    clearTimeout(activo.timeoutSalida);
    clearTimeout(activo.timeoutQuitar);
    this.map?.removeOverlay(activo.overlay);
    this.activos.delete(clave);
  }

  /** Quita todos. Llamar al limpiar el mapa y en `ngOnDestroy`. */
  limpiar(): void {
    for (const clave of Array.from(this.activos.keys())) {
      this.quitar(clave);
    }
  }

  /**
   * Con una sincronización masiva de la APK pueden llegar decenas de lecturas
   * de golpe; se conservan solo las más recientes para no tapar el mapa.
   */
  private limitarSimultaneos(): void {
    while (this.activos.size >= DESTELLO_MAX_SIMULTANEOS) {
      const masAntigua = this.activos.keys().next().value;
      if (masAntigua === undefined) break;
      this.quitar(masAntigua);
    }
  }

  private construirElemento(opciones: OpcionesDestello): HTMLElement {
    const raiz = document.createElement("div");
    raiz.className = "geo-destello";
    raiz.style.setProperty("--geo-destello-color", opciones.color);

    if (opciones.inspector || opciones.detalle) {
      const badge = document.createElement("div");
      badge.className = "geo-destello__badge";

      const icono = document.createElement("i");
      icono.className = "fa-solid fa-helmet-safety";
      badge.appendChild(icono);

      const texto = document.createElement("span");
      texto.className = "geo-destello__texto";
      texto.textContent = opciones.inspector || opciones.detalle || "";
      badge.appendChild(texto);

      if (opciones.inspector && opciones.detalle) {
        badge.title = `${opciones.inspector} · ${opciones.detalle}`;
      }

      raiz.appendChild(badge);
    }

    const marca = document.createElement("div");
    marca.className = "geo-destello__marca";

    const onda1 = document.createElement("span");
    onda1.className = "geo-destello__onda";
    const onda2 = document.createElement("span");
    onda2.className = "geo-destello__onda geo-destello__onda--tardia";

    const punto = document.createElement("i");
    punto.className = "fa-solid fa-location-crosshairs geo-destello__icono";

    marca.appendChild(onda1);
    marca.appendChild(onda2);
    marca.appendChild(punto);
    raiz.appendChild(marca);

    return raiz;
  }
}
