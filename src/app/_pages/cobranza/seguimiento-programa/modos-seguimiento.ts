export type EstadoCorte = "ejecutado" | "pagado" | "pendiente";

/**
 * Lo que cambia entre el seguimiento de cortes y el de reaperturas.
 * La pantalla es la misma; cada ruta le pasa su modo en `data: { modo }`.
 */
export interface ModoSeguimiento {
  /** Código de operación que esperan los SP: 001 = cortes, 002 = reaperturas. */
  tipoOperacion: string;
  /** Campo del registro con la fecha en que se ejecutó la operación. */
  campoFechaEjecucion: string;
  /** Cómo se llama el estado "ejecutado" en esta operación. */
  etiquetaEjecutado: string;
  titulo: string;
  colores: Record<EstadoCorte, string>;
  /** En reapertura lo ejecutado es lo deseable: los colores van al revés que en corte. */
  esReapertura: boolean;
}

export const MODO_CORTE: ModoSeguimiento = {
  tipoOperacion: "001",
  campoFechaEjecucion: "fcorte",
  etiquetaEjecutado: "CORTADO",
  titulo: "Seguimiento de Cortes con Programa",
  colores: { ejecutado: "#ef4444", pendiente: "#22c55e", pagado: "#3b82f6" },
  esReapertura: false,
};

export const MODO_REAPERTURA: ModoSeguimiento = {
  tipoOperacion: "002",
  campoFechaEjecucion: "freapertura",
  etiquetaEjecutado: "REAPERTURADO",
  titulo: "Seguimiento de Reaperturas con Programa",
  colores: { ejecutado: "#22c55e", pendiente: "#ef4444", pagado: "#3b82f6" },
  esReapertura: true,
};
