import { WGS84 } from "../../../core/gis/gis-proyeccion";
import { ConfigOrigenCoordenada } from "../../../shared/constantes/coordenadas";
import { distanciaHaversineMetros } from "../../../shared/mapa/geo.utils";
import { DetalleTomaLecturaInspector } from "@host/_models/vektors/DetalleTomaLecturaInspector";

// Reglas de negocio del seguimiento de lectura por inspector. Son funciones puras:
// las usan tanto la carga inicial como las lecturas que llegan en tiempo real.

/** Dónde vienen las coordenadas GPS de la toma que hizo el inspector. */
export const ORIGEN_TOMA_INSPECTOR: ConfigOrigenCoordenada = {
  lonField: "longitud",
  latField: "latitud",
  proyeccion: WGS84,
};

/** Metros predio → toma desde los que la lectura cuenta como "tomada lejos". TODO: confirmar con el área comercial. */
export const DISTANCIA_SOSPECHOSA_M = 30;

/** Más allá de esto la coordenada es un GPS erróneo: no se dibuja y cuenta como sospechosa. TODO: confirmar con campo. */
export const DISTANCIA_MAX_TOMA_VALIDA_M = 1000;

/** Si tantas tomas caen en el mismo punto, el GPS no se movió: se marcan como sospechosas. */
export const MINIMO_TOMAS_REPETIDAS = 3;

/** Igual que el SP de resumen: TOMADA = web 1 y recibido 1; la coordenada no define el estado. */
export function esLecturaTomada(registro: DetalleTomaLecturaInspector): boolean {
  return Number(registro.web) === 1 && Number(registro.recibido) === 1;
}

/** Metros entre el predio y el punto de la toma; `null` si falta alguna de las dos coordenadas. */
export function distanciaTomaM(
  coordUsuario: number[] | null,
  coordToma: number[] | null,
): number | null {
  if (!coordUsuario || !coordToma) return null;
  return distanciaHaversineMetros(coordUsuario[0], coordUsuario[1], coordToma[0], coordToma[1]);
}

/**
 * - `sospechosa`: el GPS es poco confiable (muy lejos o repetido); no se dibuja la toma.
 * - `lejos`: la toma es válida pero se hizo lejos del predio; la línea se pinta en rojo.
 */
export function clasificarToma(
  distanciaM: number | null,
  repetida = false,
): { sospechosa: boolean; lejos: boolean } {
  const sospechosa = repetida || (distanciaM !== null && distanciaM > DISTANCIA_MAX_TOMA_VALIDA_M);
  const lejos = !sospechosa && distanciaM !== null && distanciaM > DISTANCIA_SOSPECHOSA_M;
  return { sospechosa, lejos };
}

/** Clave para agrupar tomas que caen en el mismo punto (~1 m de precisión). */
export function clavePunto(coordenada: number[]): string {
  return `${coordenada[0].toFixed(5)},${coordenada[1].toFixed(5)}`;
}

/** Los SP a veces devuelven un objeto suelto en vez de una lista. */
export function comoLista<T>(datos: T | T[] | null | undefined): T[] {
  if (!datos) return [];
  return Array.isArray(datos) ? datos : [datos];
}
