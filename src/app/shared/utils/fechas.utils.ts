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
