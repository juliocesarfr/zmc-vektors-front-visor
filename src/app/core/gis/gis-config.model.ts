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
  | "rutaLectura"
  | "tuberiasAgua"
  | "tuberiasAlcantarillado"
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
  rutaLectura?: string;
}

export interface CapasTecnicasGis {
  [rol: string]: string | undefined;

  tuberiasAgua?: string;
  tuberiasAlcantarillado?: string;
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
  /** Rol -> qué se muestra al hacer clic sobre un elemento de esa capa. */
  consultaCapas?: Record<string, ConsultaCapaGis>;
}

export interface ConsultaCapaGis {
  /** Columna que identifica al elemento; da el título del popup y de sus pestañas. */
  campoTitulo?: string;
  /** Columna de GeoServer -> rótulo, en el orden en que se muestran. Sin ella se muestran todas. */
  atributos?: Record<string, string>;
  /** Columna con el código de cliente; permite ubicar el predio de un usuario buscado. */
  campoCliente?: string;
}
