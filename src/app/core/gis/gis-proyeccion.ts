/**
 * Proyección del mapa activa en tiempo de ejecución.
 *
 * Las utilidades geométricas (`shared/mapa/geo.utils`) son funciones puras y no tienen
 * acceso al inyector, pero la proyección depende de la EPS logueada.
 * `GisConfigService` publica aquí la proyección al resolver la configuración,
 * de modo que esas utilidades también sean dinámicas por `ccodeps`.
 */

/** Lon/lat GPS: formato en que el backend guarda las coordenadas y que pide Google Maps. */
export const WGS84 = "EPSG:4326";

/** Proyección usada mientras no se resuelve la configuración de la EPS. */
export const PROYECCION_MAPA_DEFECTO = WGS84;

/** UTM 18S: cubre la mayor parte del Perú; las EPS de otras zonas la sobrescriben. */
export const PROYECCION_UTM_DEFECTO = "EPSG:32718";

let proyeccionMapaActiva: string = PROYECCION_MAPA_DEFECTO;

export function setProyeccionMapa(proyeccion: string | undefined): void {
  proyeccionMapaActiva = proyeccion || PROYECCION_MAPA_DEFECTO;
}

export function getProyeccionMapa(): string {
  return proyeccionMapaActiva;
}
