import type { ImagenAreaMapa } from "../../mapa/exportar-imagen-mapa";
import type { ColumnaListado, FilaListado } from "../listado-excel";
import { ESTILO_PDF } from "./estilo-pdf";
import { dibujarBarraEscala, dibujarNorte, textoArea, textoEscala } from "./plano-pdf";
import { ReportePdf } from "./reporte-pdf";

export interface ReporteAreaPdf {
  titulo: string;
  subcabecera: string[];
  nombreArchivo: string;
  columnas: ColumnaListado[];
  /** `null` = la pantalla aún no cargó datos: sale solo el plano. */
  filas: FilaListado[] | null;
  imagen: ImagenAreaMapa;
  areaMetrosCuadrados: number;
  logo?: string;
  usuario?: string;
}

// Bajo el plano va una línea de resumen.
const ESPACIO_RESUMEN_MM = 10;
const ANCHO_PLANO_MM = 297 - ESTILO_PDF.margen * 2;
const ALTO_PLANO_MM = 210 - ESTILO_PDF.altoCabecera - ESTILO_PDF.altoPie - ESPACIO_RESUMEN_MM;

/** Plano del área dibujada en la primera hoja y, en las siguientes, los clientes que caen dentro. */
export async function descargarReporteArea(datos: ReporteAreaPdf): Promise<void> {
  const reporte = await ReportePdf.crear("landscape");
  reporte.cabecera({ titulo: datos.titulo, subcabecera: datos.subcabecera, logo: datos.logo, usuario: datos.usuario });

  // El plano toma la forma de lo seleccionado: tan grande como quepa en la hoja, sin deformarse.
  const { anchoPx, altoPx } = datos.imagen;
  const escalaPlano = Math.min(ANCHO_PLANO_MM / anchoPx, ALTO_PLANO_MM / altoPx);
  const plano = reporte.imagen(datos.imagen.datos, altoPx * escalaPlano, anchoPx * escalaPlano);
  reporte.posicionY += ALTO_PLANO_MM - plano.alto;
  const metrosPorMilimetro = (datos.imagen.metrosPorPixel * datos.imagen.anchoPx) / plano.ancho;
  dibujarNorte(reporte, plano);
  dibujarBarraEscala(reporte, plano, metrosPorMilimetro);

  const clientes =
    datos.filas === null
      ? "Clientes en el área: no se cargaron datos"
      : `Clientes en el área: ${datos.filas.length}`;
  reporte.texto(
    [`Área seleccionada: ${textoArea(datos.areaMetrosCuadrados)}`, clientes, textoEscala(metrosPorMilimetro)].join(
      "      ·      ",
    ),
  );

  const filas = datos.filas ?? [];
  if (filas.length > 0) {
    reporte.nuevaHoja();
    reporte.tabla(datos.columnas, filas, {
      tituloHoja: datos.titulo,
      detalleHoja: `Clientes en el área seleccionada: ${filas.length}`,
      numerarFilas: true,
    });
  }

  reporte.guardar(datos.nombreArchivo);
}
