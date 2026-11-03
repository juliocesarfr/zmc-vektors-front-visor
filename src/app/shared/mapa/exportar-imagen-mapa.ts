import type OlMap from "ol/Map";
import type { Extent } from "ol/extent";
import Circle from "ol/geom/Circle";
import Polygon, { fromCircle } from "ol/geom/Polygon";
import { getCenter, getHeight, getWidth } from "ol/extent";
import { getPointResolution } from "ol/proj";

export interface ImagenAreaMapa {
  /** JPEG en base64 (`data:image/jpeg;base64,...`). */
  datos: string;
  anchoPx: number;
  altoPx: number;
  /** Metros del terreno que caben en un píxel de la imagen, para calcular la escala del plano. */
  metrosPorPixel: number;
  /** Lo que cubre la imagen, en la proyección del mapa: el recuadro del dibujo, agrandado por un lado si la proporción lo pide. */
  extension: Extent;
  /** La misma imagen sin pasar a texto, para usarla en otro lienzo (la vista 3D). */
  lienzo: HTMLCanvasElement;
}

export interface OpcionesCaptura {
  /** Tapa el mapa mientras salta de encuadre; `null` si quien llama ya muestra su propio aviso. */
  textoAviso?: string | null;
  /** Píxeles del lado mayor de la imagen. */
  ladoMayorPx?: number;
}

// Lado mayor de la imagen: el doble de lo que se ve en un monitor común, para que los rótulos se lean impresos.
const LADO_MAYOR_POR_DEFECTO_PX = 2200;
// Si alguna tesela no responde, `rendercomplete` no llegaría nunca: se usa lo que ya se dibujó.
const MS_ESPERA_MAXIMA = 20000;
const INTENTOS_ENCUADRE = 3;
const TOLERANCIA_CENTRO_PX = 2;
const CALIDAD_JPEG = 0.9;

/**
 * Dibuja el área a buena resolución y la devuelve como imagen. Sale lo seleccionado tal cual, sin marcas:
 * los dibujos de las herramientas (el rectángulo, su relleno) se apagan mientras se toma.
 * Cambia un momento el tamaño y el encuadre del mapa (como el ejemplo de impresión de OpenLayers)
 * y los deja como estaban al terminar.
 * Lanza `SecurityError` si alguna capa no permite leer sus píxeles (le falta `crossOrigin`).
 */
export async function capturarAreaMapa(
  map: OlMap,
  area: Polygon | Circle,
  proporcionAnchoAlto: number,
  opciones: OpcionesCaptura = {},
): Promise<ImagenAreaMapa> {
  const {
    textoAviso = "Generando PDF…",
    ladoMayorPx = LADO_MAYOR_POR_DEFECTO_PX,
  } = opciones;
  const capasDibujo = map.getAllLayers().filter((capa) => capa.get("isDrawLayer") && capa.getVisible());
  const contorno = area instanceof Circle ? fromCircle(area, 96) : area;
  const extension = ajustarProporcion(contorno.getExtent(), proporcionAnchoAlto);

  const tamanoImagen: [number, number] =
    proporcionAnchoAlto >= 1
      ? [ladoMayorPx, Math.round(ladoMayorPx / proporcionAnchoAlto)]
      : [Math.round(ladoMayorPx * proporcionAnchoAlto), ladoMayorPx];

  const vista = map.getView();
  const tamanoOriginal = map.getSize();
  const centroOriginal = vista.getCenter();
  const resolucionOriginal = vista.getResolution();
  const rotacionOriginal = vista.getRotation();
  const quitarAviso = textoAviso === null ? () => undefined : mostrarAvisoMapa(map, textoAviso);

  try {
    capasDibujo.forEach((capa) => capa.setVisible(false));
    map.setSize(tamanoImagen);
    vista.setRotation(0);
    vista.setCenter(getCenter(extension));
    // `setResolution` y no `fit`: `fit` respeta los saltos de zoom y la imagen no calzaría con la hoja.
    vista.setResolution(getWidth(extension) / tamanoImagen[0]);

    await esperarEncuadre(map, getCenter(extension), tamanoImagen);

    const lienzo = componerCapas(map, tamanoImagen);

    const resolucion = vista.getResolution()!;
    return {
      // En PNG un plano pesaba unos 11 MB dentro del PDF; en JPEG no llega a 1 MB y se ve igual.
      datos: lienzo.toDataURL("image/jpeg", CALIDAD_JPEG),
      anchoPx: lienzo.width,
      altoPx: lienzo.height,
      metrosPorPixel: getPointResolution(vista.getProjection(), resolucion, getCenter(extension), "m"),
      extension,
      lienzo,
    };
  } finally {
    capasDibujo.forEach((capa) => capa.setVisible(true));
    map.setSize(tamanoOriginal);
    vista.setRotation(rotacionOriginal);
    vista.setCenter(centroOriginal);
    vista.setResolution(resolucionOriginal);
    // Sin esto el mapa queda con el encuadre de la imagen hasta el siguiente cuadro: un clic en ese momento
    // (por ejemplo, para dibujar otra área) se ubicaba con ese encuadre y el área salía diez veces más chica.
    map.renderSync();
    quitarAviso();
  }
}

/** Proporción ancho/alto del dibujo, acotada para que un dibujo muy angosto no dé una imagen de una tira. */
export function proporcionDelArea(area: Polygon | Circle): number {
  const extension = area.getExtent();
  return Math.min(2.5, Math.max(0.4, getWidth(extension) / (getHeight(extension) || 1)));
}

/** Agranda la extensión por el lado que haga falta para que tenga la proporción de la hoja. */
function ajustarProporcion(extension: number[], proporcionAnchoAlto: number): number[] {
  const [centroX, centroY] = getCenter(extension);
  let ancho = getWidth(extension);
  let alto = getHeight(extension);
  if (ancho / alto > proporcionAnchoAlto) alto = ancho / proporcionAnchoAlto;
  else ancho = alto * proporcionAnchoAlto;
  return [centroX - ancho / 2, centroY - alto / 2, centroX + ancho / 2, centroY + alto / 2];
}

/**
 * Espera a que el mapa termine de dibujar el encuadre pedido. En una prueba la imagen salió de otra zona:
 * `rendercomplete` puede llegar de un cuadro anterior. Por eso, al terminar, se dibuja una vez más con el
 * encuadre actual y se comprueba que el centro pedido caiga en el centro del lienzo; si no, se espera otro cuadro.
 */
async function esperarEncuadre(map: OlMap, centro: number[], [ancho, alto]: [number, number]): Promise<void> {
  for (let intento = 0; intento < INTENTOS_ENCUADRE; intento++) {
    await esperarDibujoCompleto(map);
    map.renderSync();
    const pixel = map.getPixelFromCoordinate(centro);
    if (pixel && Math.abs(pixel[0] - ancho / 2) <= TOLERANCIA_CENTRO_PX && Math.abs(pixel[1] - alto / 2) <= TOLERANCIA_CENTRO_PX) {
      return;
    }
  }
  throw new Error("El mapa no llegó a encuadrar el área para la imagen.");
}

function esperarDibujoCompleto(map: OlMap): Promise<void> {
  return new Promise((resolver) => {
    const temporizador = window.setTimeout(() => {
      map.un("rendercomplete", alTerminar);
      resolver();
    }, MS_ESPERA_MAXIMA);
    const alTerminar = () => {
      window.clearTimeout(temporizador);
      resolver();
    };
    map.once("rendercomplete", alTerminar);
    map.render();
  });
}

/** Junta en un lienzo los lienzos de cada capa, con su opacidad y su posición (ejemplo "export-map" de OpenLayers). */
function componerCapas(map: OlMap, [ancho, alto]: [number, number]): HTMLCanvasElement {
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const contexto = lienzo.getContext("2d")!;
  contexto.fillStyle = "#ffffff";
  contexto.fillRect(0, 0, ancho, alto);

  const lienzosCapas = map
    .getViewport()!
    .querySelectorAll<HTMLCanvasElement>(".ol-layer canvas, canvas.ol-layer");
  lienzosCapas.forEach((lienzoCapa) => {
    if (lienzoCapa.width === 0) return;
    const contenedor = lienzoCapa.parentNode as HTMLElement;
    const opacidad = contenedor.style.opacity || lienzoCapa.style.opacity;
    contexto.globalAlpha = opacidad === "" ? 1 : Number(opacidad);

    const transformacion = lienzoCapa.style.transform.match(/^matrix\(([^(]*)\)$/);
    const matriz = transformacion
      ? transformacion[1].split(",").map(Number)
      : [
          parseFloat(lienzoCapa.style.width) / lienzoCapa.width,
          0,
          0,
          parseFloat(lienzoCapa.style.height) / lienzoCapa.height,
          0,
          0,
        ];
    contexto.setTransform(matriz[0], matriz[1], matriz[2], matriz[3], matriz[4], matriz[5]);

    const colorFondo = contenedor.style.backgroundColor;
    if (colorFondo) {
      contexto.fillStyle = colorFondo;
      contexto.fillRect(0, 0, lienzoCapa.width, lienzoCapa.height);
    }
    contexto.drawImage(lienzoCapa, 0, 0);
  });
  contexto.globalAlpha = 1;
  contexto.setTransform(1, 0, 0, 1, 0, 0);
  return lienzo;
}

/**
 * Tapa el mapa con un aviso de espera; devuelve con qué quitarlo.
 * Al armar la imagen el mapa salta a otro encuadre: el aviso evita que parezca una falla.
 */
export function mostrarAvisoMapa(map: OlMap, texto: string): () => void {
  const aviso = document.createElement("div");
  aviso.className = "geo-aviso-mapa";
  const icono = document.createElement("i");
  icono.className = "pi pi-spin pi-spinner";
  const mensaje = document.createElement("span");
  mensaje.textContent = texto;
  aviso.append(icono, mensaje);
  map.getViewport()!.appendChild(aviso);
  return () => aviso.remove();
}
