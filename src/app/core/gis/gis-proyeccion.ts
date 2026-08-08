/**
 * Proyección del mapa activa en tiempo de ejecución.
 *
 * Las utilidades geométricas (`util/Geo.utils`) son funciones puras y no tienen
 * acceso al inyector, pero la proyección depende de la EPS logueada.
 * `GisConfigService` publica aquí la proyección al resolver la configuración,
 * de modo que esas utilidades también sean dinámicas por `ccodeps`.
 */

/** Proyección usada mientras no se resuelve la configuración de la EPS. */
export const PROYECCION_MAPA_DEFECTO = "EPSG:4326";

/** UTM 18S: cubre la mayor parte del Perú; las EPS de otras zonas la sobrescriben. */
export const PROYECCION_UTM_DEFECTO = "EPSG:32718";

let proyeccionMapaActiva: string = PROYECCION_MAPA_DEFECTO;

export function setProyeccionMapa(proyeccion: string | undefined): void {
  proyeccionMapaActiva = proyeccion || PROYECCION_MAPA_DEFECTO;
}

export function getProyeccionMapa(): string {
  return proyeccionMapaActiva;
}
