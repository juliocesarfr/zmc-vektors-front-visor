import { transform } from "ol/proj";

import { WGS84 } from "../../core/gis/gis-proyeccion";

/**
 * Convierte las coordenadas de un registro a lon/lat. Si los valores no caben
 * en lon/lat (|x| > 180 o |y| > 90) se asume que vienen en la zona UTM de la EPS.
 * Devuelve `null` si faltan o valen 0.
 */
export function coordenadaLonLat(
  x: unknown,
  y: unknown,
  proyeccionUtm: string,
): [number, number] | null {
  const lon = Number(x);
  const lat = Number(y);
  if (!lon || !lat) return null;

  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
    return transform([lon, lat], proyeccionUtm, WGS84) as [number, number];
  }
  return [lon, lat];
}

/** Abre Google Street View en una pestaña nueva. */
export function abrirGoogleStreetView([lon, lat]: [number, number]): void {
  window.open(`https://www.google.com/maps?layer=c&cbll=${lat},${lon}`, "_blank");
}
