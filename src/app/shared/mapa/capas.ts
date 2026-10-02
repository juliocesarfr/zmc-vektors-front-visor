import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import TileWMS from "ol/source/TileWMS";
import XYZ from "ol/source/XYZ";

import type { CapaBaseUi } from "../components/capas-sidebar/capas-sidebar.component";

const URL_GOOGLE_SATELITAL = "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";

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
  return new TileLayer({
    visible,
    opacity: opacidad,
    source: new TileWMS({
      url: urlWms,
      params: { LAYERS: nombreCapa, TILED: false },
      serverType: "geoserver",
      transition: 0,
    }),
  });
}
