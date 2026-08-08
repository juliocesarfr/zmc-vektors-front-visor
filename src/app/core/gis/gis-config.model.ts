
export type CapaGisId =
  | "lotes"
  | "lotesPorSector"
  | "sectoresComerciales"
  | "calles"
  | "usuarios"
  | "acometidaAgua"
  | "acometidaAlcantarillado"
  | "fichaAgua"
  | "fichaAlcantarillado";

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
  capas: Partial<Record<CapaGisId, string>>;
  vista?: GisVistaConfig;
  proyecciones: GisProyeccionesConfig;
}
