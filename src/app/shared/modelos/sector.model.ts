export interface Sector {
  codemp: string | null;
  codsuc: string | null;
  codsector: string;
  descripcion: string;
  estareg: string | null;
}

/** Opción "TODOS" del combo de sectores; `%` es el comodín que espera el SP. */
export const SECTOR_TODOS: Sector = {
  codemp: null,
  codsuc: null,
  codsector: "%",
  descripcion: "TODOS",
  estareg: null,
};
