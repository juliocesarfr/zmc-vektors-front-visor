import { PROYECCION_MAPA_DEFECTO } from "../core/gis/gis-proyeccion";

/**
 * @deprecated La proyección del mapa depende de la EPS. Use
 * `GisConfigService.proyeccionMapa` en componentes y `getProyeccionMapa()` en
 * funciones puras; esta constante queda solo como valor por defecto.
 */
export const PROYECCION_MAPA = PROYECCION_MAPA_DEFECTO;

export const DISTANCIA_MAX_ACOMETIDA_M = 50;

export const LARGO_MIN_LINEA_PX = 25;

// ============================================================
// ORÍGENES DE COORDENADAS
// ============================================================

export type OrigenCoordenada =
  | "usuario"
  | "predio"
  | "agua"
  | "desague"
  | "acomagua"
  | "acomdesague";

export interface ConfigOrigenCoordenada {
  lonField: string;
  latField: string;
  proyeccion: string;
}

/**
 * `proyeccion` es la proyección en la que el backend guarda esos campos (WGS84
 * en todas las EPS), no la del mapa: `extraerCoordenada` reproyecta de aquí a
 * la proyección de la EPS logueada cuando difieren.
 */
export const ORIGENES_COORDENADA: Record<
  OrigenCoordenada,
  ConfigOrigenCoordenada
> = {
  usuario: { lonField: "lon", latField: "lat", proyeccion: "EPSG:4326" },
  predio: {
    lonField: "lonpredio",
    latField: "latpredio",
    proyeccion: "EPSG:4326",
  },
  agua: { lonField: "lonagua", latField: "latagua", proyeccion: "EPSG:4326" },
  desague: {
    lonField: "londesague",
    latField: "latdesague",
    proyeccion: "EPSG:4326",
  },
  acomagua: {
    lonField: "lonacometidaagua",
    latField: "latacometidaagua",
    proyeccion: "EPSG:4326",
  },
  acomdesague: {
    lonField: "lonacometidadesague",
    latField: "latacometidadesague",
    proyeccion: "EPSG:4326",
  },
};

// ============================================================
// COLORES POR ESTADO DE LECTURA
// ============================================================

export const COLORES_LECTURA = {
  normal: "#22c55e", // estado 000
  atipico: "#ef4444", // estado 008
  sinRegistro: "#f97316", // estados 003 / 999
  observado: "#3b82f6", // cualquier otro
} as const;
export const COLORES_SEGUIMIENTO_LECTURA = {
  tomada: COLORES_LECTURA.normal, // #22c55e  lectura enviada (web=1, recibido=1)
  sinToma: COLORES_LECTURA.atipico, // #ef4444  lectura pendiente
  puntoToma: "#2563eb", // punto GPS de la toma del inspector
  lineaOk: "#64748b", // línea usuario→toma dentro del umbral
  lineaLejos: "#dc2626", // línea usuario→toma fuera del umbral
} as const;
export function colorPorEstadoLectura(estado: string | undefined): string {
  if (estado === "008") return COLORES_LECTURA.atipico;
  if (estado === "003" || estado === "999") return COLORES_LECTURA.sinRegistro;
  if (estado !== "000") return COLORES_LECTURA.observado;
  return COLORES_LECTURA.normal;
}

export const COLOR_FICHA_AGUA = "#00bfff"; // celeste
export const COLOR_FICHA_ALC = "#8b4513"; // marrón

export const LISTA_MESES = [
  { mes: "ENERO", numero: "01" },
  { mes: "FEBRERO", numero: "02" },
  { mes: "MARZO", numero: "03" },
  { mes: "ABRIL", numero: "04" },
  { mes: "MAYO", numero: "05" },
  { mes: "JUNIO", numero: "06" },
  { mes: "JULIO", numero: "07" },
  { mes: "AGOSTO", numero: "08" },
  { mes: "SETIEMBRE", numero: "09" },
  { mes: "OCTUBRE", numero: "10" },
  { mes: "NOVIEMBRE", numero: "11" },
  { mes: "DICIEMBRE", numero: "12" },
];

export const TIPOS_PROMEDIO = [
  { descripcion: "MEDIDO", codigo: "0" },
  { descripcion: "ASIGNADO", codigo: "1" },
  { descripcion: "PROMEDIADO", codigo: "2" },
];

export const TIPOS_RECEPCION_IMG = [
  "000",
  "050",
  "046",
  "045",
  "044",
  "043",
  "042",
  "041",
  "040",
  "039",
  "038",
  "037",
  "004",
  "003",
].map((tipo) => ({ tipo }));

export const TIPOS_RECEPCION_IMGCORE = ["054", "055"].map((tipo) => ({ tipo }));

export type TipoPopup = "lectura" | "agua" | "alcantarillado";

export interface RegistroLectura {
  codcliente?: string;
  codsuc?: string;
  codsector?: string;
  estadolectura?: string;
  [key: string]: unknown;
}

export interface Sector {
  codemp: string | null;
  codsuc: string | null;
  codsector: string;
  descripcion: string;
  estareg: string | null;
}

export const SECTOR_TODOS: Sector = {
  codemp: null,
  codsuc: null,
  codsector: "%",
  descripcion: "TODOS",
  estareg: null,
};
