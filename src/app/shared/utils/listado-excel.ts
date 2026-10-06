import type { ExcelService } from "@host/_servicios/reportes/excel.service";

export interface ColumnaListado {
  campo: string;
  titulo: string;
  /** Ancho de la columna en el Excel, en caracteres. */
  anchoExcel: number;
}

export type FilaListado = Record<string, unknown>;

export interface ListadoExcel {
  titulo: string;
  subcabecera: string[];
  nombreArchivo: string;
  columnas: ColumnaListado[];
  filas: FilaListado[];
}

/** Descarga un listado con el formato de reportes del sistema (logo, fecha, usuario y cabecera). */
export function descargarListadoExcel(
  excelService: ExcelService,
  listado: ListadoExcel,
): Promise<void> {
  const { titulo, subcabecera, nombreArchivo, columnas, filas } = listado;
  // El servicio vacía los nulos y recorta la cabecera sobre los arreglos que recibe: van copias.
  return excelService.downloadExcel(
    filas.map((fila) => ({ ...fila })),
    ["", ...columnas.map((columna) => columna.titulo)],
    ["", ...columnas.map((columna) => columna.campo)],
    titulo,
    columnas.map((columna) => columna.anchoExcel),
    [...subcabecera, `# Registros: ${filas.length}`],
    nombreArchivo,
    [],
  );
}

/** Dirección legible del cliente a partir de los campos que devuelven los SP del padrón. */
export function direccionDe(registro: Record<string, unknown>): string {
  return [registro["descripcioncorta"], registro["descripcioncalle"], registro["nrocalle"]]
    .filter((parte) => parte !== null && parte !== undefined && String(parte).trim() !== "")
    .join(" ");
}
