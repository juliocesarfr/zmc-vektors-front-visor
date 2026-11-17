import { VariacionPromedio } from "@host/_models/vektors/VariacionPromedio";
import { GrupoLeyenda } from "../../../shared/components/leyenda-grupos/leyenda-grupos.component";

// Reglas de la variación del consumo respecto al promedio. Son funciones puras: no dependen del mapa ni del componente.

export const GRUPO_SUBIO: GrupoLeyenda = { clave: "subio", etiqueta: "Subió", detalle: "Consumo mayor que el promedio", color: "#16a34a" };
export const GRUPO_IGUAL: GrupoLeyenda = { clave: "igual", etiqueta: "Igual", detalle: "Consumo igual al promedio", color: "#eab308" };
export const GRUPO_BAJO: GrupoLeyenda = { clave: "bajo", etiqueta: "Bajó", detalle: "Consumo menor que el promedio", color: "#dc2626" };
export const GRUPO_SIN_PROMEDIO: GrupoLeyenda = {
  clave: "sinPromedio",
  etiqueta: "Sin promedio",
  detalle: "El promedio es 0: no hay contra qué comparar",
  color: "#94a3b8",
  rayado: true,
};
export const GRUPOS_VARIACION = [GRUPO_SUBIO, GRUPO_IGUAL, GRUPO_BAJO, GRUPO_SIN_PROMEDIO];

export interface ResultadoVariacion {
  grupo: GrupoLeyenda;
  /** consumo - promedio, en m³; null si el promedio es 0. */
  diferencia: number | null;
  /** La variación en % que calcula el procedimiento (la misma de la columna Variación de digitación). */
  porcentaje: number | null;
}

/** Con promedio 0 no se compara: el procedimiento devuelve 0 % y aquí va a su propio grupo. */
export function clasificarVariacion(registro: VariacionPromedio): ResultadoVariacion {
  const promedio = Number(registro.promedio ?? 0);
  if (promedio === 0) return { grupo: GRUPO_SIN_PROMEDIO, diferencia: null, porcentaje: null };

  const diferencia = Number(registro.consumo ?? 0) - promedio;
  const grupo = diferencia === 0
    ? GRUPO_IGUAL
    : diferencia > 0 ? GRUPO_SUBIO : GRUPO_BAJO;
  return { grupo, diferencia, porcentaje: Number(registro.variacion ?? 0) };
}

export function textoVariacion(resultado: ResultadoVariacion): string {
  if (resultado.diferencia == null) return "";
  const signo = resultado.diferencia > 0 ? "+" : "";
  const porcentaje = resultado.porcentaje == null ? "" : ` (${signo}${resultado.porcentaje.toFixed(2)} %)`;
  return `${signo}${resultado.diferencia} m³${porcentaje}`;
}
