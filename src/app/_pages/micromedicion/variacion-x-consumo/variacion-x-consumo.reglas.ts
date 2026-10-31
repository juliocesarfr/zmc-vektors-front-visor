import { VariacionConsumo } from "@host/_models/vektors/VariacionConsumo";
import { GrupoLeyenda } from "../../../shared/components/leyenda-grupos/leyenda-grupos.component";

// Reglas de la variación de consumo entre dos meses. Son funciones puras: no dependen del mapa ni del componente.

export const GRUPO_SUBIO: GrupoLeyenda = { clave: "subio", etiqueta: "Subió", detalle: "Consumo mayor que en el mes 1", color: "#16a34a" };
export const GRUPO_IGUAL: GrupoLeyenda = { clave: "igual", etiqueta: "Igual", detalle: "Mismo consumo en los dos meses", color: "#eab308" };
export const GRUPO_BAJO: GrupoLeyenda = { clave: "bajo", etiqueta: "Bajó", detalle: "Consumo menor que en el mes 1", color: "#dc2626" };
export const GRUPO_SIN_COMPARAR: GrupoLeyenda = {
  clave: "sinComparar",
  etiqueta: "Sin comparar",
  detalle: "Tiene lectura en uno solo de los dos meses",
  color: "#94a3b8",
  rayado: true,
};
export const GRUPOS_VARIACION = [GRUPO_SUBIO, GRUPO_IGUAL, GRUPO_BAJO, GRUPO_SIN_COMPARAR];

export interface ResultadoVariacion {
  grupo: GrupoLeyenda;
  /** consumo2 - consumo1, en m³; null si no se puede comparar. */
  diferencia: number | null;
  /** Diferencia sobre el consumo del mes 1, en %; null si no se compara o el mes 1 consumió 0. */
  porcentaje: number | null;
}

/**
 * Igual solo cuando el consumo es exactamente el mismo.
 * Sin comparar cuando el cliente no tiene lectura en alguno de los dos meses.
 */
export function clasificarVariacion(registro: VariacionConsumo): ResultadoVariacion {
  const tieneAmbos = Number(registro.tieneperiodo1) === 1 && Number(registro.tieneperiodo2) === 1
    && registro.consumo1 != null && registro.consumo2 != null;
  if (!tieneAmbos) return { grupo: GRUPO_SIN_COMPARAR, diferencia: null, porcentaje: null };

  const consumo1 = Number(registro.consumo1);
  const diferencia = Number(registro.consumo2) - consumo1;
  const porcentaje = consumo1 !== 0 ? (diferencia / consumo1) * 100 : null;
  const grupo = diferencia === 0
    ? GRUPO_IGUAL
    : diferencia > 0 ? GRUPO_SUBIO : GRUPO_BAJO;
  return { grupo, diferencia, porcentaje };
}

export function textoVariacion(resultado: ResultadoVariacion): string {
  if (resultado.diferencia == null) return "-";
  const signo = resultado.diferencia > 0 ? "+" : "";
  const porcentaje = resultado.porcentaje == null ? "" : ` (${signo}${Math.round(resultado.porcentaje)} %)`;
  return `${signo}${resultado.diferencia} m³${porcentaje}`;
}
