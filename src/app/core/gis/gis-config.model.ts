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
  | "centroideFicha"
  | "rutaLectura"
  | "rutaDistribucion"
  | "areaLectura"
  | "areaDistribucion"
  | "manzanas"
  | "urbanizaciones"
  | "tuberiasAgua"
  | "tuberiasAlcantarillado"
  | "fuentes"
  | "valvulas"
  | "curvasNivel"
  | "nodosAlcantarillado"
  | "sectoresOperacionales"
  | "presiones";

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
  /** Punto de la ficha catastral publicado en GeoServer (no el de las lecturas del backend). */
  centroideFicha?: string;
  rutaLectura?: string;
  rutaDistribucion?: string;
  areaLectura?: string;
  areaDistribucion?: string;
  manzanas?: string;
  urbanizaciones?: string;
}

export interface CapasTecnicasGis {
  [rol: string]: string | undefined;

  tuberiasAgua?: string;
  tuberiasAlcantarillado?: string;
  fuentes?: string;
  valvulas?: string;
  curvasNivel?: string;
  nodosAlcantarillado?: string;
  sectoresOperacionales?: string;
  presiones?: string;
}

/**
 * Estilo propio para una capa cuyo estilo de GeoServer no sirve (polígono gris opaco, cuadros rojos).
 * Se manda en cada petición como SLD_BODY: no hace falta tocar GeoServer.
 */
export interface EstiloCapaGis {
  forma: "punto" | "area";
  color: string;
  /** Atributo que se rotula sobre el elemento. */
  campoEtiqueta?: string;
  /** Solo se dibuja a partir de esta escala (1:n); evita miles de puntos amontonados al alejarse. */
  escalaMaxima?: number;
}

/** Fotos de un vuelo de dron publicadas en GeoServer; se eligen como un fondo más del mapa. */
export interface OrtofotoGis {
  id: string;
  etiqueta: string;
  capa: string;
  /** Zona que cubre, en WGS84 [oeste, sur, este, norte]: el mapa va ahí al elegirla. */
  extension: [number, number, number, number];
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
  /** Rol -> estilo propio; sin entrada se usa el estilo publicado en GeoServer. */
  estilosCapas?: Record<string, EstiloCapaGis>;
  ortofotos?: OrtofotoGis[];
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
