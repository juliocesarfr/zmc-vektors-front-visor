export type ColorPdf = [number, number, number];

/**
 * Diseño de los reportes PDF en un solo lugar: medidas en milímetros (A4), letras en puntos y colores RGB.
 * Cambiar un valor aquí cambia todos los reportes.
 */
export const ESTILO_PDF = {
  margen: 10,
  /** Desde el borde de arriba hasta donde empieza el contenido de la primera hoja. */
  altoCabecera: 32,
  /** Franja de abajo reservada para "Página X de N". */
  altoPie: 14,
  anchoTextoCabecera: 170,
  logo: { ancho: 34, alto: 14 },
  letra: { titulo: 12, subtitulo: 10, texto: 8.5, tabla: 7.5, detalle: 7.5 },
  celda: { relleno: 1.3, altoLinea: 3.3, lineasMaximas: 3, anchoColumnaNumero: 10 },
  colores: {
    principal: [30, 58, 95] as ColorPdf,
    texto: [30, 41, 59] as ColorPdf,
    textoSuave: [100, 116, 139] as ColorPdf,
    filaAlterna: [241, 245, 249] as ColorPdf,
    borde: [203, 213, 225] as ColorPdf,
    blanco: [255, 255, 255] as ColorPdf,
  },
} as const;
