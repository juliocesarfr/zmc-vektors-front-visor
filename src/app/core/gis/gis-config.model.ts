// Los nombres de capa no siguen ninguna convención entre EPS: el catálogo vive en CONFIG_EPS.

export type CapaGisConocida =
  | "lotes"
  | "lotesPorSector"
  | "sectoresComerciales"
  | "calles"
  | "usuarios"
  | "acometidaAgua"
  | "acometidaAlcantarillado"
  | "fichaAgua"
  | "fichaAlcantarillado"
  | "tuberias"
  | "fuentes"
  | "valvulas"
  | "curvasNivel";

// `(string & {})` mantiene el autocompletado sin cerrar el tipo a los roles conocidos.
export type CapaGisId = CapaGisConocida | (string & {});

// Rol -> nombre real de la capa. Ausente = la EPS no la publica.
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

export interface CapasTecnicasGis {
  [rol: string]: string | undefined;

  tuberias?: string;
  fuentes?: string;
  valvulas?: string;
  curvasNivel?: string;
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
  capasTecnicas?: CapasTecnicasGis;
  vista?: GisVistaConfig;
  proyecciones: GisProyeccionesConfig;
  etiquetas?: Record<string, string>;
}
