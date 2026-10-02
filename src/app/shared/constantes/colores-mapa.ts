/** Color del punto según el estado de lectura que devuelve el SP. */
export const COLORES_LECTURA = {
  normal: "#22c55e", // estado 000
  atipico: "#ef4444", // estado 008
  sinRegistro: "#f97316", // estados 003 / 999
  observado: "#3b82f6", // cualquier otro
} as const;

export const COLORES_SEGUIMIENTO_LECTURA = {
  tomada: COLORES_LECTURA.normal, // lectura enviada (web = 1 y recibido = 1)
  sinToma: COLORES_LECTURA.atipico, // lectura pendiente
  puntoToma: "#2563eb", // punto GPS donde el inspector tomó la lectura
  lineaOk: "#64748b", // línea usuario → toma dentro del umbral
  lineaLejos: "#dc2626", // línea usuario → toma fuera del umbral
} as const;

export function colorPorEstadoLectura(estado: string | undefined): string {
  if (estado === "008") return COLORES_LECTURA.atipico;
  if (estado === "003" || estado === "999") return COLORES_LECTURA.sinRegistro;
  if (estado !== "000") return COLORES_LECTURA.observado;
  return COLORES_LECTURA.normal;
}

export const COLOR_FICHA_AGUA = "#00bfff"; // celeste
export const COLOR_FICHA_ALCANTARILLADO = "#8b4513"; // marrón
