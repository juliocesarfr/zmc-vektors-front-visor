import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import TileWMS from "ol/source/TileWMS";
import XYZ from "ol/source/XYZ";

import type { CapaBaseUi } from "../components/capas-sidebar/capas-sidebar.component";

const URL_GOOGLE_SATELITAL = "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";

// GeoServer se queda a ratos sin conexiones a PostGIS ("Timeout waiting for idle object") y responde
// con error; OpenLayers no vuelve a pedir una tesela fallida, así que quedarían huecos en la capa.
const MS_ESPERA_REINTENTO = 4000;
const MAXIMO_REINTENTOS = 4;
// Pasado este tiempo sin errores, una falla nueva vuelve a tener todos sus reintentos.
const MS_OLVIDAR_REINTENTOS = 60000;

/** Botones de mapa base que muestra el panel de capas. */
export const CAPAS_BASE_UI: CapaBaseUi[] = [
  { id: "osm", label: "OSM", iconUrl: "assets/images/img-georeferencia/capa-osm-icon.gif" },
  { id: "satelital", label: "Satelital", iconUrl: "assets/images/img-georeferencia/satellital-icon.gif" },
];

export function crearCapaOsm(visible = true): TileLayer<OSM> {
  return new TileLayer({ source: new OSM(), visible });
}

export function crearCapaSatelital(visible = false): TileLayer<XYZ> {
  return new TileLayer({ source: new XYZ({ url: URL_GOOGLE_SATELITAL }), visible });
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
): TileLayer<TileWMS> {
  const fuente = new TileWMS({
    url: urlWms,
    // TILED permite que GeoWebCache sirva la tesela desde caché en vez de renderizarla de nuevo.
    params: { LAYERS: nombreCapa, TILED: true },
    serverType: "geoserver",
    // Permite leer el píxel (`getData`) para saber si el cursor está sobre algo; GeoServer responde con CORS abierto.
    crossOrigin: "anonymous",
    transition: 0,
  });
  reintentarTeselasFallidas(fuente);
  return new TileLayer({ visible, opacity: opacidad, source: fuente });
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
