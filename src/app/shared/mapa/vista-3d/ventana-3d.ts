import type OlMap from "ol/Map";

import { marcaDeTiempoArchivo } from "../../utils/fechas.utils";
import {
  ALTURA_OJOS_M,
  CamaraPeaton,
  COLOR_CIELO_ARRIBA,
  COLOR_CIELO_HORIZONTE,
  DibujoTerreno,
} from "./dibujo-terreno";
import type { Terreno } from "./terreno";

const GRADOS = Math.PI / 180;
// Paso de caminata rápida: a 1,4 m/s (paso normal) cruzar una manzana tomaría demasiado.
const VELOCIDAD_M_POR_S = 6;
const MULTIPLICADOR_CORRER = 4;
const GIRO_POR_S = 90 * GRADOS;
const GIRO_POR_PIXEL = 0.25 * GRADOS;
const CABECEO_MAXIMO = 60 * GRADOS;
const CABECEO_INICIAL = -8 * GRADOS;
// Al empezar, la persona está cerca del borde sur mirando al norte: tiene el área por delante.
const PROPORCION_INICIO_DESDE_SUR = 0.06;
const MARGEN_BORDE_M = 1;
const METROS_POR_PASO_RUEDA = 0.05;
const EXAGERACION_MAXIMA = 5;
const ALTURA_VISTA_MAXIMA_M = 120;
// Desde arriba se recorre más terreno por segundo: la velocidad crece con la altura de la vista.
const VELOCIDAD_POR_METRO_DE_ALTURA = 0.5;
const LADO_MINIMAPA_PX = 150;

const TECLAS_ADELANTE = ["w", "arrowup"];
const TECLAS_ATRAS = ["s", "arrowdown"];
const TECLAS_IZQUIERDA = ["a"];
const TECLAS_DERECHA = ["d"];
const TECLAS_GIRO_IZQUIERDA = ["arrowleft", "q"];
const TECLAS_GIRO_DERECHA = ["arrowright", "e"];
const TECLAS_DE_MOVIMIENTO = new Set([
  ...TECLAS_ADELANTE,
  ...TECLAS_ATRAS,
  ...TECLAS_IZQUIERDA,
  ...TECLAS_DERECHA,
  ...TECLAS_GIRO_IZQUIERDA,
  ...TECLAS_GIRO_DERECHA,
]);

/**
 * Ventana sobre el mapa para recorrer el área a pie, en 3D, sobre el relieve de las curvas de nivel:
 * se camina hacia donde se mira con W A S D o las flechas, y se mira alrededor arrastrando el mouse.
 * Va dentro del contenedor de overlays que detiene los eventos, para que arrastrar no mueva el mapa de abajo.
 */
export class Ventana3d {
  private readonly elemento = document.createElement("div");
  private readonly lienzo = document.createElement("canvas");
  private readonly minimapa = document.createElement("canvas");
  private readonly textoCota = document.createElement("span");
  private readonly dibujo: DibujoTerreno;
  private readonly observadorTamano: ResizeObserver;
  private readonly camara: CamaraPeaton;
  private readonly teclasPulsadas = new Set<string>();
  private corriendo = false;
  private cuadroPendiente = 0;
  private ultimoInstante = 0;
  private arrastre?: { x: number; y: number };

  /**
   * @param textura imagen del mapa que cubre exactamente la extensión del terreno.
   * @param alCerrar se llama una vez, al cerrar con la X o con Esc.
   */
  constructor(
    map: OlMap,
    private readonly terreno: Terreno,
    private readonly textura: HTMLCanvasElement,
    private readonly alCerrar?: () => void,
  ) {
    this.camara = this.camaraInicial(1);
    this.armarElemento();
    this.dibujo = new DibujoTerreno(this.lienzo, terreno, textura);
    map.getOverlayContainerStopEvent()!.appendChild(this.elemento);

    this.observadorTamano = new ResizeObserver(() => this.ajustarTamano());
    this.observadorTamano.observe(this.lienzo.parentElement!);
    document.addEventListener("keydown", this.alPulsarTecla);
    document.addEventListener("keyup", this.alSoltarTecla);
    window.addEventListener("blur", this.alPerderFoco);
  }

  cerrar(): void {
    if (!this.elemento.isConnected) return;
    window.cancelAnimationFrame(this.cuadroPendiente);
    this.observadorTamano.disconnect();
    document.removeEventListener("keydown", this.alPulsarTecla);
    document.removeEventListener("keyup", this.alSoltarTecla);
    window.removeEventListener("blur", this.alPerderFoco);
    this.elemento.remove();
    this.dibujo.destruir();
    this.alCerrar?.();
  }

  private camaraInicial(exageracion: number, alturaOjos = ALTURA_OJOS_M): CamaraPeaton {
    return {
      x: this.terreno.anchoMetros / 2,
      y: this.terreno.altoMetros * PROPORCION_INICIO_DESDE_SUR,
      rumbo: 0,
      cabeceo: CABECEO_INICIAL,
      exageracion,
      alturaOjos,
    };
  }

  private armarElemento(): void {
    this.elemento.className = "geo-ventana-3d";
    this.elemento.tabIndex = -1;
    const { minima, maxima } = this.terreno;

    const cabecera = crear("div", "geo-v3d-cabecera");
    const titulo = crear("div", "geo-v3d-titulo");
    titulo.append(crearIcono("fa-solid fa-person-walking"), crear("span", "", "Recorrido 3D del área"));
    const detalle = crear(
      "span",
      "geo-v3d-detalle",
      `Cotas de ${formatearCota(minima)} a ${formatearCota(maxima)} m · desnivel ${formatearCota(maxima - minima)} m`,
    );
    const cerrar = crearBoton("pi pi-times", "Cerrar el recorrido 3D (Esc)", () => this.cerrar());
    cerrar.classList.add("geo-v3d-cerrar");
    cabecera.append(titulo, detalle, cerrar);

    const cuerpo = crear("div", "geo-v3d-cuerpo");
    this.lienzo.className = "geo-v3d-lienzo";
    this.minimapa.className = "geo-v3d-minimapa";
    this.minimapa.title = "Dónde está y hacia dónde mira";
    const proporcion = this.terreno.anchoMetros / this.terreno.altoMetros;
    this.minimapa.width = proporcion >= 1 ? LADO_MINIMAPA_PX : Math.round(LADO_MINIMAPA_PX * proporcion);
    this.minimapa.height = proporcion >= 1 ? Math.round(LADO_MINIMAPA_PX / proporcion) : LADO_MINIMAPA_PX;
    this.textoCota.className = "geo-v3d-cota";
    const ayuda = crear(
      "div",
      "geo-v3d-ayuda",
      "W A S D o flechas para caminar · Q E para girar · arrastre para mirar · Mayús para correr",
    );
    cuerpo.append(this.lienzo, this.minimapa, this.textoCota, ayuda);

    const controles = crear("div", "geo-v3d-controles");
    const relieve = this.crearDeslizador({
      etiqueta: "Relieve",
      titulo: "Exagera la altura del terreno para que se note la pendiente",
      minimo: 1,
      maximo: EXAGERACION_MAXIMA,
      paso: 0.5,
      valor: 1,
      formato: (valor) => `×${valor}`,
      alCambiar: (valor) => (this.camara.exageracion = valor),
    });
    // El deslizador va de 0 a 100 y la altura crece en escala logarítmica: así hay detalle entre 2 y 10 m.
    const alturaDesdePosicion = (posicion: number) =>
      ALTURA_OJOS_M * (ALTURA_VISTA_MAXIMA_M / ALTURA_OJOS_M) ** (posicion / 100);
    const altura = this.crearDeslizador({
      etiqueta: "Altura de la vista",
      titulo: "A pie (1,7 m) o desde más arriba para ver la pendiente",
      minimo: 0,
      maximo: 100,
      paso: 1,
      valor: 0,
      formato: (posicion) => `${formatearCota(alturaDesdePosicion(posicion))} m`,
      alCambiar: (posicion) => (this.camara.alturaOjos = alturaDesdePosicion(posicion)),
    });

    const volver = crearBoton("pi pi-refresh", "Volver al punto de partida", () => {
      Object.assign(this.camara, this.camaraInicial(this.camara.exageracion, this.camara.alturaOjos));
      this.pedirDibujo();
    }, "Punto de partida");
    const descargar = crearBoton("pi pi-image", "Descargar como imagen lo que se ve", () => this.descargarImagen(), "Imagen");
    controles.append(relieve, altura, volver, descargar);

    this.elemento.append(cabecera, cuerpo, controles);

    this.lienzo.addEventListener("pointerdown", this.alEmpezarArrastre);
    this.lienzo.addEventListener("pointermove", this.alArrastrar);
    this.lienzo.addEventListener("pointerup", this.alSoltar);
    this.lienzo.addEventListener("pointercancel", this.alSoltar);
    this.lienzo.addEventListener("wheel", this.alGirarRueda, { passive: false });
    this.minimapa.addEventListener("pointerdown", this.alPulsarMinimapa);
    // El menú de los dibujos escucha el clic derecho en todo el mapa: dentro de la ventana no debe abrirse.
    this.elemento.addEventListener("contextmenu", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
    });
    // El mapa de abajo mostraría sus pistas ("Clic derecho: ver clientes…") al pasar el mouse por la ventana.
    this.elemento.addEventListener("pointermove", (evento) => evento.stopPropagation());
  }

  private crearDeslizador(opciones: {
    etiqueta: string;
    titulo: string;
    minimo: number;
    maximo: number;
    paso: number;
    valor: number;
    formato: (valor: number) => string;
    alCambiar: (valor: number) => void;
  }): HTMLLabelElement {
    const contenedor = crear("label", "geo-v3d-deslizador");
    contenedor.title = opciones.titulo;
    const valor = crear("strong", "", opciones.formato(opciones.valor));
    const deslizador = document.createElement("input");
    deslizador.type = "range";
    deslizador.min = String(opciones.minimo);
    deslizador.max = String(opciones.maximo);
    deslizador.step = String(opciones.paso);
    deslizador.value = String(opciones.valor);
    deslizador.addEventListener("input", () => {
      const numero = Number(deslizador.value);
      opciones.alCambiar(numero);
      valor.textContent = opciones.formato(numero);
      this.pedirDibujo();
    });
    // Con el foco en el deslizador, las flechas lo moverían en vez de caminar.
    deslizador.addEventListener("change", () => this.elemento.focus());
    contenedor.append(crear("span", "", opciones.etiqueta), deslizador, valor);
    return contenedor;
  }

  private ajustarTamano(): void {
    const contenedor = this.lienzo.parentElement!;
    const densidad = window.devicePixelRatio || 1;
    this.lienzo.width = Math.max(1, Math.round(contenedor.clientWidth * densidad));
    this.lienzo.height = Math.max(1, Math.round(contenedor.clientHeight * densidad));
    this.pedirDibujo();
  }

  private pedirDibujo(): void {
    if (this.corriendo) return;
    window.cancelAnimationFrame(this.cuadroPendiente);
    this.cuadroPendiente = window.requestAnimationFrame(() => this.dibujarTodo());
  }

  private dibujarTodo(): void {
    this.dibujo.dibujar(this.camara);
    this.dibujarMinimapa();
    const cota = this.terreno.minima + this.dibujo.alturaSuelo(this.camara.x, this.camara.y, 1);
    this.textoCota.textContent = `Cota ${formatearCota(cota)} m · rumbo ${rumboTexto(this.camara.rumbo)}`;
  }

  /** Mientras haya una tecla de movimiento pulsada, avanza cada cuadro según el tiempo que pasó. */
  private empezarMovimiento(): void {
    if (this.corriendo) return;
    this.corriendo = true;
    window.cancelAnimationFrame(this.cuadroPendiente);
    this.ultimoInstante = performance.now();
    const avanzar = (instante: number) => {
      if (!this.hayTeclaDeMovimiento()) {
        this.corriendo = false;
        return;
      }
      const segundos = Math.min(0.1, (instante - this.ultimoInstante) / 1000);
      this.ultimoInstante = instante;
      this.mover(segundos);
      this.dibujarTodo();
      this.cuadroPendiente = window.requestAnimationFrame(avanzar);
    };
    this.cuadroPendiente = window.requestAnimationFrame(avanzar);
  }

  private mover(segundos: number): void {
    const pulsada = (teclas: string[]) => teclas.some((tecla) => this.teclasPulsadas.has(tecla));
    const giro = (pulsada(TECLAS_GIRO_DERECHA) ? 1 : 0) - (pulsada(TECLAS_GIRO_IZQUIERDA) ? 1 : 0);
    this.camara.rumbo = normalizarAngulo(this.camara.rumbo + giro * GIRO_POR_S * segundos);

    const avance = (pulsada(TECLAS_ADELANTE) ? 1 : 0) - (pulsada(TECLAS_ATRAS) ? 1 : 0);
    const lateral = (pulsada(TECLAS_DERECHA) ? 1 : 0) - (pulsada(TECLAS_IZQUIERDA) ? 1 : 0);
    const velocidad =
      Math.max(VELOCIDAD_M_POR_S, this.camara.alturaOjos * VELOCIDAD_POR_METRO_DE_ALTURA) *
      (this.teclasPulsadas.has("shift") ? MULTIPLICADOR_CORRER : 1);
    this.desplazar(avance * velocidad * segundos, lateral * velocidad * segundos);
  }

  /** Camina en el plano hacia donde mira (sin subir ni bajar la vista) y no deja salir del área. */
  private desplazar(adelante: number, aLaDerecha: number): void {
    const { rumbo } = this.camara;
    this.camara.x += Math.sin(rumbo) * adelante + Math.cos(rumbo) * aLaDerecha;
    this.camara.y += Math.cos(rumbo) * adelante - Math.sin(rumbo) * aLaDerecha;
    this.camara.x = Math.min(this.terreno.anchoMetros - MARGEN_BORDE_M, Math.max(MARGEN_BORDE_M, this.camara.x));
    this.camara.y = Math.min(this.terreno.altoMetros - MARGEN_BORDE_M, Math.max(MARGEN_BORDE_M, this.camara.y));
  }

  private hayTeclaDeMovimiento(): boolean {
    return [...this.teclasPulsadas].some((tecla) => TECLAS_DE_MOVIMIENTO.has(tecla));
  }

  private dibujarMinimapa(): void {
    const contexto = this.minimapa.getContext("2d")!;
    const { width: ancho, height: alto } = this.minimapa;
    contexto.drawImage(this.textura, 0, 0, ancho, alto);
    const x = (this.camara.x / this.terreno.anchoMetros) * ancho;
    const y = (1 - this.camara.y / this.terreno.altoMetros) * alto;
    const { rumbo } = this.camara;
    const alcance = 26;
    const apertura = 37 * GRADOS;

    contexto.beginPath();
    contexto.moveTo(x, y);
    contexto.lineTo(x + Math.sin(rumbo - apertura) * alcance, y - Math.cos(rumbo - apertura) * alcance);
    contexto.lineTo(x + Math.sin(rumbo + apertura) * alcance, y - Math.cos(rumbo + apertura) * alcance);
    contexto.closePath();
    contexto.fillStyle = "rgba(0, 229, 255, 0.35)";
    contexto.fill();

    contexto.beginPath();
    contexto.arc(x, y, 4.5, 0, Math.PI * 2);
    contexto.fillStyle = "#ef4444";
    contexto.fill();
    contexto.lineWidth = 1.5;
    contexto.strokeStyle = "#ffffff";
    contexto.stroke();
  }

  private readonly alPulsarTecla = (evento: KeyboardEvent): void => {
    if (evento.key === "Escape") {
      this.cerrar();
      return;
    }
    const destino = evento.target as HTMLElement | null;
    // Si está escribiendo en otro campo de la pantalla, las teclas son para ese campo.
    if (destino && !this.elemento.contains(destino) && /^(INPUT|TEXTAREA|SELECT)$/.test(destino.tagName)) return;
    const tecla = evento.key.toLowerCase();
    if (tecla === "shift") this.teclasPulsadas.add(tecla);
    if (!TECLAS_DE_MOVIMIENTO.has(tecla)) return;
    evento.preventDefault();
    this.teclasPulsadas.add(tecla);
    this.empezarMovimiento();
  };

  private readonly alSoltarTecla = (evento: KeyboardEvent): void => {
    this.teclasPulsadas.delete(evento.key.toLowerCase());
  };

  // Si la ventana pierde el foco con una tecla pulsada, su `keyup` no llega y la persona seguiría caminando.
  private readonly alPerderFoco = (): void => {
    this.teclasPulsadas.clear();
  };

  private readonly alEmpezarArrastre = (evento: PointerEvent): void => {
    this.elemento.focus();
    this.lienzo.setPointerCapture(evento.pointerId);
    this.arrastre = { x: evento.clientX, y: evento.clientY };
    this.lienzo.classList.add("arrastrando");
  };

  private readonly alArrastrar = (evento: PointerEvent): void => {
    if (!this.arrastre) return;
    this.camara.rumbo = normalizarAngulo(this.camara.rumbo - (evento.clientX - this.arrastre.x) * GIRO_POR_PIXEL);
    this.camara.cabeceo = Math.min(
      CABECEO_MAXIMO,
      Math.max(-CABECEO_MAXIMO, this.camara.cabeceo + (evento.clientY - this.arrastre.y) * GIRO_POR_PIXEL),
    );
    this.arrastre = { x: evento.clientX, y: evento.clientY };
    this.pedirDibujo();
  };

  private readonly alSoltar = (evento: PointerEvent): void => {
    if (!this.arrastre) return;
    this.arrastre = undefined;
    this.lienzo.releasePointerCapture(evento.pointerId);
    this.lienzo.classList.remove("arrastrando");
  };

  private readonly alGirarRueda = (evento: WheelEvent): void => {
    evento.preventDefault();
    this.desplazar(-evento.deltaY * METROS_POR_PASO_RUEDA, 0);
    this.pedirDibujo();
  };

  /** Clic en el minimapa: la persona aparece en ese punto, mirando hacia donde miraba. */
  private readonly alPulsarMinimapa = (evento: PointerEvent): void => {
    const recuadro = this.minimapa.getBoundingClientRect();
    this.camara.x = ((evento.clientX - recuadro.left) / recuadro.width) * this.terreno.anchoMetros;
    this.camara.y = (1 - (evento.clientY - recuadro.top) / recuadro.height) * this.terreno.altoMetros;
    this.desplazar(0, 0);
    this.elemento.focus();
    this.pedirDibujo();
  };

  /** El cielo es el fondo de la ventana, no está en el lienzo: se pinta debajo antes de guardar. */
  private descargarImagen(): void {
    const copia = document.createElement("canvas");
    copia.width = this.lienzo.width;
    copia.height = this.lienzo.height;
    const contexto = copia.getContext("2d")!;
    const cielo = contexto.createLinearGradient(0, 0, 0, copia.height);
    cielo.addColorStop(0, COLOR_CIELO_ARRIBA);
    cielo.addColorStop(1, COLOR_CIELO_HORIZONTE);
    contexto.fillStyle = cielo;
    contexto.fillRect(0, 0, copia.width, copia.height);
    contexto.drawImage(this.lienzo, 0, 0);
    copia.toBlob((imagen) => {
      if (!imagen) return;
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(imagen);
      enlace.download = `recorrido_3d_${marcaDeTiempoArchivo()}.png`;
      enlace.click();
      // Revocarla en el acto puede cortar la descarga en algunos navegadores.
      window.setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
    }, "image/png");
  }
}

function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase: string, texto?: string): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function crearIcono(clase: string): HTMLElement {
  return crear("i", clase);
}

function crearBoton(icono: string, titulo: string, alPulsar: () => void, texto?: string): HTMLButtonElement {
  const boton = crear("button", "geo-v3d-boton");
  boton.type = "button";
  boton.title = titulo;
  boton.append(crearIcono(icono));
  if (texto) boton.append(crear("span", "", texto));
  boton.addEventListener("click", alPulsar);
  return boton;
}

function normalizarAngulo(angulo: number): number {
  const vuelta = Math.PI * 2;
  return ((angulo % vuelta) + vuelta) % vuelta;
}

const PUNTOS_CARDINALES = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

function rumboTexto(rumbo: number): string {
  return PUNTOS_CARDINALES[Math.round(rumbo / (Math.PI / 4)) % 8];
}

function formatearCota(metros: number): string {
  return metros.toLocaleString("es-PE", { maximumFractionDigits: 1 });
}
