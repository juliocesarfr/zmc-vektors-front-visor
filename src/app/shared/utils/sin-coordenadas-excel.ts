import type { ExcelService } from "@host/_servicios/reportes/excel.service";

import { ConfigOrigenCoordenada } from "../constantes/coordenadas";
import { extraerCoordenada } from "../mapa/geo.utils";
import { ColumnaListado, FilaListado, descargarListadoExcel } from "./listado-excel";

// Lo primero que se necesita para ubicar al cliente en el comercial.
const COLUMNAS_IDENTIFICACION: ColumnaListado[] = [
  { campo: "codcliente", titulo: "Cód. cliente", anchoExcel: 12 },
  { campo: "codsuc", titulo: "Sucursal", anchoExcel: 12 },
];

export interface ReporteSinCoordenadas {
  titulo: string;
  subcabecera: string[];
  nombreArchivo: string;
  /** Columnas del listado de la pantalla; código de cliente y sucursal van siempre al inicio. */
  columnas: ColumnaListado[];
  registros: Record<string, unknown>[];
  origen: ConfigOrigenCoordenada;
  aFila?: (registro: Record<string, unknown>) => FilaListado;
}

/** Registros que no se pueden pintar en el mapa con ese origen de coordenadas. */
export function registrosSinCoordenadas(
  registros: Record<string, unknown>[],
  origen: ConfigOrigenCoordenada,
): Record<string, unknown>[] {
  return registros.filter((registro) => extraerCoordenada(registro, origen) === null);
}

/** Descarga el Excel de los registros sin coordenadas; devuelve cuántos salieron. */
export async function descargarExcelSinCoordenadas(
  excelService: ExcelService,
  reporte: ReporteSinCoordenadas,
): Promise<number> {
  const sinCoordenadas = registrosSinCoordenadas(reporte.registros, reporte.origen);
  if (sinCoordenadas.length === 0) return 0;

  const camposIdentificacion = new Set(COLUMNAS_IDENTIFICACION.map((columna) => columna.campo));
  await descargarListadoExcel(excelService, {
    titulo: reporte.titulo,
    subcabecera: reporte.subcabecera,
    nombreArchivo: reporte.nombreArchivo,
    columnas: [
      ...COLUMNAS_IDENTIFICACION,
      ...reporte.columnas.filter((columna) => !camposIdentificacion.has(columna.campo)),
    ],
    filas: sinCoordenadas.map((registro) => reporte.aFila?.(registro) ?? { ...registro }),
  });
  return sinCoordenadas.length;
}
