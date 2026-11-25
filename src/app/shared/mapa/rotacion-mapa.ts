import type OlMap from "ol/Map";
import { Control, Rotate } from "ol/control";
import DragPan from "ol/interaction/DragPan";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";

/** Propiedad del mapa que indica que el modo de rotación con clic izquierdo está activo. */
export const MARCA_MODO_ROTAR = "modoRotarMapa";

const UMBRAL_ARRASTRE_PX = 4;
const RADIO_MINIMO_GIRO_PX = 24;
const RADIANES_POR_PIXEL_CENTRO = 0.008;
const DURACION_RESTABLECER_MS = 250;
const UMBRAL_ROTADO_RAD = 0.01;

interface ArrastreRotacion {
  pointerId: number;
  inicioX: number;
  inicioY: number;
  ultimoX: number;
  ultimoY: number;
  arrastrando: boolean;
  esClicDerecho: boolean;
}

/**
 * Permite rotar el mapa arrastrando el cursor:
 * - Clic derecho + arrastrar en cualquier momento (un clic derecho sin arrastrar sigue abriendo el menú contextual).
 * - Botón de brújula en la columna derecha para activar/desactivar el modo rotación con clic izquierdo (útil en trackpad).
 * - Cuando el mapa está rotado, muestra una pastilla con el ángulo para restablecer el norte con un clic.
 */
export class RotacionMapa {
  private readonly control: Control;
  private readonly contenedor = document.createElement("div");
  private readonly botonRotar = document.createElement("button");
  private readonly aguja = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private readonly botonNorte = document.createElement("button");
  private readonly textoAngulo = document.createElement("span");

  private readonly claveRotacion: EventsKey;
  private readonly claveInteracciones: EventsKey;
  private readonly viewport: HTMLElement;

  private modoRotar = false;
  private arrastre: ArrastreRotacion | null = null;
  private suprimirSiguienteContextMenu = false;
  private temporizadorContextMenu?: number;
  private temporizadorMarcaRotar?: number;
  private interaccionesPanDesactivadas: DragPan[] = [];

  constructor(
    private readonly map: OlMap,
    conHerramientasDibujo = true,
  ) {
    this.quitarControlRotatePorDefecto();
    this.viewport = this.map.getViewport()!;

    this.contenedor.className = conHerramientasDibujo
      ? "ol-unselectable ol-control ol-rotacion-mapa"
      : "ol-unselectable ol-control ol-rotacion-mapa ol-rotacion-mapa--sin-herramientas";

    this.botonRotar.type = "button";
    this.botonRotar.className = "btn-rotar-mapa";
    this.botonRotar.title = "Rotar mapa (clic para arrastrar con clic izquierdo, o use clic derecho + arrastrar)";
    this.armarAguja();
    this.botonRotar.appendChild(this.aguja);
    this.botonRotar.addEventListener("click", this.alAlternarModo);

    this.botonNorte.type = "button";
    this.botonNorte.className = "btn-restablecer-norte";
    this.botonNorte.title = "Restablecer norte (0°)";
    const etiquetaNorte = document.createElement("strong");
    etiquetaNorte.textContent = "N";
    this.textoAngulo.className = "angulo-rotacion";
    this.botonNorte.append(etiquetaNorte, this.textoAngulo);
    this.botonNorte.addEventListener("click", this.alRestablecerNorte);

    this.contenedor.append(this.botonNorte, this.botonRotar);

    this.control = new Control({ element: this.contenedor });
    this.map.addControl(this.control);

    this.viewport.addEventListener("pointerdown", this.alPresionar, true);
    this.viewport.addEventListener("contextmenu", this.alMenuContextual, true);
    window.addEventListener("pointermove", this.alMover);
    window.addEventListener("pointerup", this.alSoltar);
    window.addEventListener("pointercancel", this.alSoltar);
    document.addEventListener("keydown", this.alPulsarTecla);

    this.claveRotacion = this.map.getView().on("change:rotation", () => this.actualizarIndicador());
    // Si el usuario activa una herramienta de dibujo mientras está en modo rotar, salimos del modo rotar.
    this.claveInteracciones = this.map.getInteractions().on("add", (evento) => {
      if (this.modoRotar && evento.element.get("isDrawInteraction")) {
        this.establecerModoRotar(false);
      }
    });

    this.actualizarIndicador();
  }

  destruir(): void {
    this.establecerModoRotar(false);
    this.terminarArrastre();
    if (this.temporizadorContextMenu !== undefined) {
      window.clearTimeout(this.temporizadorContextMenu);
      this.temporizadorContextMenu = undefined;
    }
    if (this.temporizadorMarcaRotar !== undefined) {
      window.clearTimeout(this.temporizadorMarcaRotar);
      this.temporizadorMarcaRotar = undefined;
    }
    unByKey(this.claveRotacion);
    unByKey(this.claveInteracciones);
    this.viewport.removeEventListener("pointerdown", this.alPresionar, true);
    this.viewport.removeEventListener("contextmenu", this.alMenuContextual, true);
    window.removeEventListener("pointermove", this.alMover);
    window.removeEventListener("pointerup", this.alSoltar);
    window.removeEventListener("pointercancel", this.alSoltar);
    document.removeEventListener("keydown", this.alPulsarTecla);
    this.botonRotar.removeEventListener("click", this.alAlternarModo);
    this.botonNorte.removeEventListener("click", this.alRestablecerNorte);
    this.map.removeControl(this.control);
  }

  private quitarControlRotatePorDefecto(): void {
    this.map
      .getControls()
      .getArray()
      .slice()
      .forEach((control) => {
        if (control instanceof Rotate) this.map.removeControl(control);
      });
  }

  private armarAguja(): void {
    this.aguja.setAttribute("viewBox", "0 0 24 24");
    this.aguja.setAttribute("width", "18");
    this.aguja.setAttribute("height", "18");
    this.aguja.setAttribute("aria-hidden", "true");
    this.aguja.classList.add("aguja-brujula");

    const norte = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    norte.setAttribute("points", "12,2 16,12 12,10 8,12");
    norte.setAttribute("fill", "#f87171");

    const sur = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    sur.setAttribute("points", "12,22 16,12 12,14 8,12");
    sur.setAttribute("fill", "#cbd5e1");

    const centro = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    centro.setAttribute("cx", "12");
    centro.setAttribute("cy", "12");
    centro.setAttribute("r", "1.6");
    centro.setAttribute("fill", "#0f172a");

    this.aguja.append(norte, sur, centro);
  }

  private readonly alAlternarModo = (): void => {
    this.establecerModoRotar(!this.modoRotar);
  };

  private readonly alRestablecerNorte = (): void => {
    this.map.getView().animate({ rotation: 0, duration: DURACION_RESTABLECER_MS });
  };

  private readonly alPulsarTecla = (evento: KeyboardEvent): void => {
    if (evento.key === "Escape" && this.modoRotar) {
      this.establecerModoRotar(false);
    }
  };

  private establecerModoRotar(activo: boolean, diferirMarca = false): void {
    if (this.modoRotar === activo) return;
    this.modoRotar = activo;
    if (this.temporizadorMarcaRotar !== undefined) {
      window.clearTimeout(this.temporizadorMarcaRotar);
      this.temporizadorMarcaRotar = undefined;
    }
    this.botonRotar.classList.toggle("activo", activo);
    this.viewport.classList.toggle("geo-modo-rotar", activo);

    if (activo) {
      this.map.set(MARCA_MODO_ROTAR, true);
      this.interaccionesPanDesactivadas = [];
      this.map.getInteractions().forEach((interaccion) => {
        if (interaccion instanceof DragPan && interaccion.getActive()) {
          interaccion.setActive(false);
          this.interaccionesPanDesactivadas.push(interaccion);
        }
      });
    } else {
      for (const interaccion of this.interaccionesPanDesactivadas) {
        interaccion.setActive(true);
      }
      this.interaccionesPanDesactivadas = [];
      this.terminarArrastre();
      if (diferirMarca) {
        this.temporizadorMarcaRotar = window.setTimeout(() => {
          this.map.set(MARCA_MODO_ROTAR, false);
          this.temporizadorMarcaRotar = undefined;
        }, 300);
      } else {
        this.map.set(MARCA_MODO_ROTAR, false);
      }
    }
  }

  private readonly alPresionar = (evento: PointerEvent): void => {
    const destino = evento.target as HTMLElement | null;
    if (destino?.closest(".ol-overlaycontainer-stopevent, .ol-control")) return;

    const esClicDerecho = evento.button === 2;
    const esClicIzquierdoEnModo = this.modoRotar && evento.button === 0;
    if (!esClicDerecho && !esClicIzquierdoEnModo) return;

    this.arrastre = {
      pointerId: evento.pointerId,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      ultimoX: evento.clientX,
      ultimoY: evento.clientY,
      arrastrando: false,
      esClicDerecho,
    };
  };

  private readonly alMover = (evento: PointerEvent): void => {
    const actual = this.arrastre;
    if (!actual || evento.pointerId !== actual.pointerId) return;

    if (!actual.arrastrando) {
      if (Math.hypot(evento.clientX - actual.inicioX, evento.clientY - actual.inicioY) < UMBRAL_ARRASTRE_PX) {
        return;
      }
      actual.arrastrando = true;
      this.viewport.classList.add("geo-rotando-mapa");
      this.map.getView().cancelAnimations();
    }

    const rect = this.viewport.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const distActual = Math.hypot(evento.clientX - cx, evento.clientY - cy);
    const distAnterior = Math.hypot(actual.ultimoX - cx, actual.ultimoY - cy);

    let delta: number;
    if (distActual >= RADIO_MINIMO_GIRO_PX && distAnterior >= RADIO_MINIMO_GIRO_PX) {
      const anguloAnterior = Math.atan2(actual.ultimoY - cy, actual.ultimoX - cx);
      const anguloActual = Math.atan2(evento.clientY - cy, evento.clientX - cx);
      delta = normalizarDelta(anguloActual - anguloAnterior);
    } else {
      delta = (evento.clientX - actual.ultimoX) * RADIANES_POR_PIXEL_CENTRO;
    }

    actual.ultimoX = evento.clientX;
    actual.ultimoY = evento.clientY;

    const vista = this.map.getView();
    vista.setRotation(vista.getRotation() + delta);
  };

  private readonly alSoltar = (evento: PointerEvent): void => {
    const actual = this.arrastre;
    if (!actual || evento.pointerId !== actual.pointerId) return;

    if (actual.arrastrando && actual.esClicDerecho) {
      this.suprimirSiguienteContextMenu = true;
      if (this.temporizadorContextMenu !== undefined) {
        window.clearTimeout(this.temporizadorContextMenu);
      }
      this.temporizadorContextMenu = window.setTimeout(() => {
        this.suprimirSiguienteContextMenu = false;
        this.temporizadorContextMenu = undefined;
      }, 250);
    }

    const soltarModo = this.modoRotar && !actual.esClicDerecho;
    const fueArrastre = actual.arrastrando;
    this.terminarArrastre();
    if (soltarModo) {
      this.establecerModoRotar(false, !fueArrastre);
    }
  };

  private readonly alMenuContextual = (evento: MouseEvent): void => {
    if (!this.suprimirSiguienteContextMenu) return;
    this.suprimirSiguienteContextMenu = false;
    if (this.temporizadorContextMenu !== undefined) {
      window.clearTimeout(this.temporizadorContextMenu);
      this.temporizadorContextMenu = undefined;
    }
    evento.preventDefault();
    evento.stopPropagation();
  };

  private terminarArrastre(): void {
    this.arrastre = null;
    this.viewport.classList.remove("geo-rotando-mapa");
  }

  private actualizarIndicador(): void {
    const rotacion = this.map.getView().getRotation() || 0;
    const anguloNormalizado = normalizarDelta(rotacion);
    const estaRotado = Math.abs(anguloNormalizado) > UMBRAL_ROTADO_RAD;

    this.aguja.style.transform = `rotate(${rotacion}rad)`;
    this.botonNorte.classList.toggle("visible", estaRotado);

    if (estaRotado) {
      const grados = Math.round(((rotacion * 180) / Math.PI) % 360);
      const gradosPositivos = ((grados % 360) + 360) % 360;
      this.textoAngulo.textContent = `${gradosPositivos}°`;
    }
  }
}

function normalizarDelta(radianes: number): number {
  let delta = radianes;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}
