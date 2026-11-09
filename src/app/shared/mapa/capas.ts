import type ImageTile from "ol/ImageTile";
import type Tile from "ol/Tile";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import TileWMS from "ol/source/TileWMS";
import XYZ from "ol/source/XYZ";
import type { Extent } from "ol/extent";
import { get as getProjection } from "ol/proj";
import { createXYZ } from "ol/tilegrid";

import { getProyeccionMapa } from "../../core/gis/gis-proyeccion";

import type { CapaBaseUi } from "../components/capas-sidebar/capas-sidebar.component";

const URL_GOOGLE_SATELITAL = "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";

// GeoServer se queda a ratos sin conexiones a PostGIS ("Timeout waiting for idle object") y responde
// con error; OpenLayers no vuelve a pedir una tesela fallida, así que quedarían huecos en la capa.
const MS_ESPERA_REINTENTO = 4000;
const MAXIMO_REINTENTOS = 4;
// Pasado este tiempo sin errores, una falla nueva vuelve a tener todos sus reintentos.
const MS_OLVIDAR_REINTENTOS = 60000;

// Desde este tono (en los tres canales) un píxel pegado a la zona vacía se toma como parte del borde blanco.
const TONO_BORDE_BLANCO = 235;

/** Botones de mapa base que muestra el panel de capas. */
export const CAPAS_BASE_UI: CapaBaseUi[] = [
  { id: "osm", label: "OSM", iconUrl: "assets/images/img-georeferencia/capa-osm-icon.gif" },
  { id: "satelital", label: "Satelital", iconUrl: "assets/images/img-georeferencia/satellital-icon.gif" },
  // Ninguna pantalla crea una capa con este id: elegirlo apaga OSM y satelital.
  { id: "ninguno", label: "Sin fondo", iconUrl: "" },
];

export function crearCapaOsm(visible = true): TileLayer<OSM> {
  return new TileLayer({ source: new OSM(), visible });
}

export function crearCapaSatelital(visible = false): TileLayer<XYZ> {
  // Sin `crossOrigin` el lienzo queda bloqueado y el mapa no se puede pasar a PDF.
  return new TileLayer({ source: new XYZ({ url: URL_GOOGLE_SATELITAL, crossOrigin: "anonymous" }), visible });
}

/**
 * Capa publicada en GeoServer (lotes, calles, sectores…).
 * @param urlWms     `GisConfigService.urlWms()` de la EPS logueada.
 * @param nombreCapa nombre con workspace, p. ej. `GisConfigService.capa("lotes")`.
 */
export function crearCapaWms(
  urlWms: string,
  nombreCapa: string,
  visible: boolean,
  opacidad = 1,
  /** SLD_BODY con un estilo propio (`GisConfigService.sldCapa`); sin él se usa el de GeoServer. */
  sld?: string,
): TileLayer<TileWMS> {
  const fuente = new TileWMS({
    url: urlWms,
    // TILED permite que GeoWebCache sirva la tesela desde caché en vez de renderizarla de nuevo.
    params: { LAYERS: nombreCapa, TILED: true, ...(sld ? { SLD_BODY: sld } : {}) },
    serverType: "geoserver",
    // Permite leer el píxel (`getData`) para saber si el cursor está sobre algo; GeoServer responde con CORS abierto.
    crossOrigin: "anonymous",
    transition: 0,
    // GeoServer rotula cada tesela por su cuenta: con las de 256 px el nombre de un sector grande salía en cuadrícula.
    ...(sld ? { tileGrid: createXYZ({ extent: getProjection(getProyeccionMapa())!.getExtent(), tileSize: 1024 }) } : {}),
  });
  reintentarTeselasFallidas(fuente);
  return new TileLayer({ visible, opacity: opacidad, source: fuente });
}

/**
 * Fotos de un vuelo de dron publicadas en GeoServer.
 * @param extension zona que cubre el vuelo, en la proyección del mapa: no se piden teselas fuera de ella.
 */
export function crearCapaOrtofoto(urlWms: string, nombreCapa: string, extension: Extent): TileLayer<TileWMS> {
  const capa = crearCapaWms(urlWms, nombreCapa, true);
  capa.setExtent(extension);
  capa.getSource()!.setTileLoadFunction(cargarSinBordeBlanco);
  return capa;
}

// La ortofoto trae alrededor una franja casi blanca (no es transparente por la compresión de la imagen):
// sobre el satelital se veía como un borde blanco irregular.
function cargarSinBordeBlanco(tesela: Tile, url: string): void {
  const imagen = (tesela as ImageTile).getImage() as HTMLImageElement;
  const original = new Image();
  original.crossOrigin = "anonymous";
  original.onerror = () => (imagen.src = url);
  original.onload = () => {
    const lienzo = document.createElement("canvas");
    lienzo.width = original.naturalWidth;
    lienzo.height = original.naturalHeight;
    const contexto = lienzo.getContext("2d", { willReadFrequently: true })!;
    contexto.drawImage(original, 0, 0);
    const pixeles = contexto.getImageData(0, 0, lienzo.width, lienzo.height);
    if (quitarBordeBlanco(pixeles)) {
      contexto.putImageData(pixeles, 0, 0);
      imagen.src = lienzo.toDataURL();
    } else {
      imagen.src = url;
    }
  };
  original.src = url;
}

/**
 * Vuelve transparentes los píxeles casi blancos unidos a la zona vacía; los techos blancos de dentro
 * de la foto no se tocan porque no llegan hasta ella. Devuelve si cambió algo.
 */
function quitarBordeBlanco({ data: datos, width: ancho, height: alto }: ImageData): boolean {
  const pendientes: number[] = [];
  for (let indice = 0; indice < ancho * alto; indice++) {
    if (datos[indice * 4 + 3] === 0) pendientes.push(indice);
  }
  if (pendientes.length === 0 || pendientes.length === ancho * alto) return false;

  const esBordeBlanco = (indice: number): boolean => {
    const base = indice * 4;
    return (
      datos[base + 3] > 0 &&
      datos[base] >= TONO_BORDE_BLANCO &&
      datos[base + 1] >= TONO_BORDE_BLANCO &&
      datos[base + 2] >= TONO_BORDE_BLANCO
    );
  };

  let cambio = false;
  while (pendientes.length > 0) {
    const indice = pendientes.pop()!;
    const columna = indice % ancho;
    const vecinos = [
      columna > 0 ? indice - 1 : -1,
      columna < ancho - 1 ? indice + 1 : -1,
      indice - ancho,
      indice + ancho,
    ];
    for (const vecino of vecinos) {
      if (vecino < 0 || vecino >= ancho * alto || !esBordeBlanco(vecino)) continue;
      datos[vecino * 4 + 3] = 0;
      pendientes.push(vecino);
      cambio = true;
    }
  }
  return cambio;
}

/**
 * Vuelve a pedir la capa cuando fallan teselas, con espera creciente y un tope de intentos.
 * Se cambia un parámetro que GeoServer ignora: así OpenLayers pide de nuevo todas las teselas
 * sin borrar las que ya se ven, en vez de `refresh()`, que dejaría la capa en blanco un momento.
 */
function reintentarTeselasFallidas(fuente: TileWMS): void {
  let reintentos = 0;
  let ultimaFalla = 0;
  let temporizador: number | undefined;

  fuente.on("tileloaderror", () => {
    const ahora = Date.now();
    if (ahora - ultimaFalla > MS_OLVIDAR_REINTENTOS) reintentos = 0;
    ultimaFalla = ahora;
    if (temporizador !== undefined || reintentos >= MAXIMO_REINTENTOS) return;

    reintentos++;
    temporizador = window.setTimeout(() => {
      temporizador = undefined;
      fuente.updateParams({ REINTENTO: reintentos });
    }, MS_ESPERA_REINTENTO * reintentos);
  });
}
