/**
 * Cada EPS publica su propio juego de capas en GeoServer. Los nombres reales no
 * guardan ninguna relación entre EPS (ni prefijo, ni sufijo, ni convención), y
 * una EPS puede publicar capas que ninguna otra tiene. Por eso el catálogo es
 * abierto: el modelo describe la *forma* de la configuración, no la lista de
 * capas, que vive por completo en `CONFIG_EPS`.
 */

/**
 * Roles de capa que la mayoría de las EPS publica. No es una lista cerrada:
 * sirve para autocompletado y para que el código común (`lotes`, `calles`, …)
 * no dependa de literales sueltos.
 */
export type CapaGisConocida =
  | "lotes"
  | "lotesPorSector"
  | "sectoresComerciales"
  | "calles"
  | "usuarios"
  | "acometidaAgua"
  | "acometidaAlcantarillado"
  | "fichaAgua"
  | "fichaAlcantarillado";

/**
 * Identificador de rol de capa. `(string & {})` mantiene el autocompletado de
 * `CapaGisConocida` sin cerrar el tipo, de modo que una EPS pueda declarar
 * roles propios (`"redAgua"`, `"manzanas"`, …) sin tocar este archivo.
 */
export type CapaGisId = CapaGisConocida | (string & {});

/**
 * Mapa rol -> nombre real de la capa en el workspace de la EPS.
 *
 * Los roles conocidos están declarados para tener autocompletado; el índice
 * abre el resto. Una capa ausente significa "esta EPS no la publica", y el
 * código que la consuma debe degradar en lugar de asumir un nombre.
 */
export interface CapasGis {
  [rol: string]: string | undefined;

  lotes?: string;
  /** Plantilla con `{sector}`; se expande en `GisConfigService.lotesPorSector`. */
  lotesPorSector?: string;
  sectoresComerciales?: string;
  calles?: string;
  usuarios?: string;
  acometidaAgua?: string;
  acometidaAlcantarillado?: string;
  fichaAgua?: string;
  fichaAlcantarillado?: string;
}

export interface GisGeoserverConfig {
  baseUrl: string;
  workspace: string;
}

export interface GisVistaConfig {
  centro: [number, number];
  zoom: number;
}

export interface GisProyeccionesConfig {
  mapa: string;
  utm: string;
}

export interface GisEpsConfig {
  ccodeps: string;
  descripcion: string;
  geoserver: GisGeoserverConfig;
  capas: CapasGis;
  vista?: GisVistaConfig;
  proyecciones: GisProyeccionesConfig;
  /**
   * Rótulo de UI por rol de capa. Opcional: si falta, se deriva del propio rol
   * (`sectoresComerciales` -> "Sectores Comerciales").
   */
  etiquetas?: Record<string, string>;
}
