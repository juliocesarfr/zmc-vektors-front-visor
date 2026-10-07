import { WGS84 } from "../../core/gis/gis-proyeccion";

/** Si la acometida está a más de esto de su ficha, el dato es erróneo y no se dibuja la línea. */
export const DISTANCIA_MAX_ACOMETIDA_M = 50;

/** De dónde se toma la coordenada de un registro: del usuario, del predio, de la ficha o de la acometida. */
export type OrigenCoordenada =
  | "usuario"
  | "predio"
  | "agua"
  | "desague"
  | "acometidaAgua"
  | "acometidaDesague";

/** Campos de lon/lat de un registro y la proyección en que los guarda el backend (no la del mapa). */
export interface ConfigOrigenCoordenada {
  lonField: string;
  latField: string;
  proyeccion: string;
}

export const ORIGENES_COORDENADA: Record<OrigenCoordenada, ConfigOrigenCoordenada> = {
  usuario: { lonField: "lon", latField: "lat", proyeccion: WGS84 },
  predio: { lonField: "lonpredio", latField: "latpredio", proyeccion: WGS84 },
  agua: { lonField: "lonagua", latField: "latagua", proyeccion: WGS84 },
  desague: { lonField: "londesague", latField: "latdesague", proyeccion: WGS84 },
  acometidaAgua: {
    lonField: "lonacometidaagua",
    latField: "latacometidaagua",
    proyeccion: WGS84,
  },
  acometidaDesague: {
    lonField: "lonacometidadesague",
    latField: "latacometidadesague",
    proyeccion: WGS84,
  },
};
