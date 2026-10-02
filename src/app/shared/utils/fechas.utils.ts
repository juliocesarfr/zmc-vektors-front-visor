import { formatDate } from "@angular/common";

/**
 * Rango para buscar las fotos de un cliente: del día 1 del mes anterior al
 * último día del mes actual, en el formato `yyyy-MM-dd` que espera el backend.
 */
export function rangoFotosRecientes(hoy = new Date()): { fecha_inicial: string; fecha_final: string } {
  const formato = (fecha: Date) => formatDate(fecha, "yyyy-MM-dd", "en-US");
  return {
    fecha_inicial: formato(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
    fecha_final: formato(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
  };
}

/**
 * Fecha del backend a `dd/MM/yyyy`. El backend manda textos como
 * "2026-06-18 08:47:00.0" (no ISO): se toman los primeros 10 caracteres sin
 * pasar por `new Date`, que según el navegador lo lee mal o le resta un día.
 * Devuelve "-" si no hay fecha.
 */
export function formatoFechaCorta(valor: unknown): string {
  const texto = valor ? String(valor).trim() : "";
  if (!texto) return "-";

  const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (partes) return `${partes[3]}/${partes[2]}/${partes[1]}`;

  const fecha = new Date(texto);
  if (isNaN(fecha.getTime())) return "-";
  return formatDate(fecha, "dd/MM/yyyy", "en-US");
}
