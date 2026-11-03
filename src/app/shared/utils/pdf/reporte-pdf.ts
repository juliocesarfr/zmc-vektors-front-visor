import type { jsPDF } from "jspdf";

import { fechaHoraActual, formatoFechaCorta, marcaDeTiempoArchivo } from "../fechas.utils";
import type { ColumnaListado, FilaListado } from "../listado-excel";
import { ESTILO_PDF, type ColorPdf } from "./estilo-pdf";

export interface CabeceraPdf {
  titulo: string;
  subcabecera?: string[];
  /** Logo de reportes de la empresa en base64; si no llega o está dañado, la cabecera sale sin logo. */
  logo?: string;
  usuario?: string;
}

export interface OpcionesTablaPdf {
  /** Se repite arriba de cada hoja que ocupa la tabla. */
  tituloHoja?: string;
  /** Texto a la derecha del título de cada hoja, por ejemplo "Registros: 120". */
  detalleHoja?: string;
  /** Agrega la columna "N°" con el número de fila. */
  numerarFilas?: boolean;
}

const PATRON_FECHA_BACKEND = /^\d{4}-\d{2}-\d{2}/;

/**
 * Hoja de reporte A4 con el formato de Sysco: cabecera con logo, fecha y usuario, imágenes y tablas
 * que pasan solas a la hoja siguiente, y "Página X de N" al guardar.
 * Va llenando de arriba abajo: cada pieza se dibuja donde terminó la anterior (`posicionY`).
 * Para dibujos propios (norte, barra de escala…) está `documento`, el jsPDF de debajo.
 */
export class ReportePdf {
  /** Dónde empieza la siguiente pieza, en milímetros desde arriba. */
  posicionY: number = ESTILO_PDF.margen;

  private constructor(readonly documento: jsPDF) {}

  /** jsPDF se carga recién aquí, al generar el primer reporte, para no pesar en la carga de la pantalla. */
  static async crear(orientacion: "landscape" | "portrait" = "landscape"): Promise<ReportePdf> {
    const { jsPDF } = await import("jspdf");
    return new ReportePdf(new jsPDF({ orientation: orientacion, unit: "mm", format: "a4" }));
  }

  get anchoHoja(): number {
    return this.documento.internal.pageSize.getWidth();
  }

  get altoHoja(): number {
    return this.documento.internal.pageSize.getHeight();
  }

  get anchoUtil(): number {
    return this.anchoHoja - ESTILO_PDF.margen * 2;
  }

  /** Lo que queda libre en la hoja actual sobre el pie de página. */
  get altoDisponible(): number {
    return this.altoHoja - ESTILO_PDF.altoPie - this.posicionY;
  }

  /** Alto que deja libre la cabecera en una hoja vacía: sirve para pedir una imagen que la llene. */
  altoUtilBajoCabecera(espacioInferior = 0): number {
    return this.altoHoja - ESTILO_PDF.altoPie - ESTILO_PDF.altoCabecera - espacioInferior;
  }

  cabecera({ titulo, subcabecera = [], logo, usuario }: CabeceraPdf): void {
    const { margen, colores, letra, altoCabecera } = ESTILO_PDF;
    const centro = this.anchoHoja / 2;
    const derecha = this.anchoHoja - margen;

    if (logo) this.dibujarLogo(logo);

    this.fuente("bold", letra.titulo, colores.principal);
    this.documento.text(titulo, centro, margen + 3, { align: "center", maxWidth: ESTILO_PDF.anchoTextoCabecera });

    this.fuente("normal", letra.detalle, colores.textoSuave);
    const lineasSubcabecera = this.documento
      .splitTextToSize(subcabecera.filter(Boolean).join("   ·   "), ESTILO_PDF.anchoTextoCabecera)
      .slice(0, 3);
    this.documento.text(lineasSubcabecera, centro, margen + 9, { align: "center" });

    this.documento.text(`Fecha: ${fechaHoraActual()}`, derecha, margen + 1, { align: "right" });
    if (usuario) this.documento.text(`Usuario: ${usuario}`, derecha, margen + 5, { align: "right" });

    this.documento.setDrawColor(...colores.principal);
    this.documento.setLineWidth(0.4);
    this.documento.line(margen, altoCabecera - 3, derecha, altoCabecera - 3);
    this.posicionY = altoCabecera;
  }

  /** Imagen con marco, centrada en el ancho útil. Devuelve dónde quedó, para dibujar encima de ella. */
  imagen(datos: string, alto: number, ancho = this.anchoUtil): { x: number; y: number; ancho: number; alto: number } {
    const recuadro = { x: ESTILO_PDF.margen + (this.anchoUtil - ancho) / 2, y: this.posicionY, ancho, alto };
    const formato = datos.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    this.documento.addImage(datos, formato, recuadro.x, recuadro.y, recuadro.ancho, recuadro.alto);
    this.documento.setDrawColor(...ESTILO_PDF.colores.principal);
    this.documento.setLineWidth(0.3);
    this.documento.rect(recuadro.x, recuadro.y, recuadro.ancho, recuadro.alto);
    this.posicionY += alto;
    return recuadro;
  }

  /** Una línea de texto a todo el ancho, por ejemplo un resumen bajo la imagen. */
  texto(contenido: string, separacionArriba = 6): void {
    this.fuente("normal", ESTILO_PDF.letra.texto, ESTILO_PDF.colores.texto);
    this.posicionY += separacionArriba;
    this.documento.text(contenido, ESTILO_PDF.margen, this.posicionY);
  }

  nuevaHoja(): void {
    this.documento.addPage();
    this.posicionY = ESTILO_PDF.margen;
  }

  /**
   * Tabla con las mismas columnas del Excel: el ancho de cada una sale de `anchoExcel`, en proporción.
   * Si no cabe, sigue en hojas nuevas con su cabecera repetida.
   */
  tabla(columnas: ColumnaListado[], filas: FilaListado[], opciones: OpcionesTablaPdf = {}): void {
    const { margen, celda } = ESTILO_PDF;
    const anchoNumero = opciones.numerarFilas ? celda.anchoColumnaNumero : 0;
    const anchoTotalExcel = columnas.reduce((suma, columna) => suma + columna.anchoExcel, 0) || 1;
    const anchosColumnas = [
      ...(opciones.numerarFilas ? [anchoNumero] : []),
      ...columnas.map((columna) => ((this.anchoUtil - anchoNumero) * columna.anchoExcel) / anchoTotalExcel),
    ];
    const titulosColumnas = [
      ...(opciones.numerarFilas ? ["N°"] : []),
      ...columnas.map((columna) => columna.titulo),
    ];

    this.encabezadoTabla(titulosColumnas, anchosColumnas, opciones);

    filas.forEach((fila, indice) => {
      const textos = [
        ...(opciones.numerarFilas ? [String(indice + 1)] : []),
        ...columnas.map((columna) => this.textoCelda(fila[columna.campo])),
      ];
      const lineasPorCelda = textos.map((texto, posicion) => this.lineasCelda(texto, anchosColumnas[posicion]));
      const altoFila = this.altoFila(lineasPorCelda);

      if (altoFila > this.altoDisponible) {
        this.nuevaHoja();
        this.encabezadoTabla(titulosColumnas, anchosColumnas, opciones);
      }

      if (indice % 2 === 1) {
        this.documento.setFillColor(...ESTILO_PDF.colores.filaAlterna);
        this.documento.rect(margen, this.posicionY, this.anchoUtil, altoFila, "F");
      }
      this.fuente("normal", ESTILO_PDF.letra.tabla, ESTILO_PDF.colores.texto);
      this.escribirFila(lineasPorCelda, anchosColumnas);

      this.documento.setDrawColor(...ESTILO_PDF.colores.borde);
      this.documento.setLineWidth(0.1);
      this.documento.line(margen, this.posicionY + altoFila, margen + this.anchoUtil, this.posicionY + altoFila);
      this.posicionY += altoFila;
    });
  }

  /** Numera las hojas y descarga el archivo con fecha y hora en el nombre. */
  guardar(nombreArchivo: string): void {
    const totalHojas = this.documento.getNumberOfPages();
    this.fuente("normal", ESTILO_PDF.letra.detalle, ESTILO_PDF.colores.textoSuave);
    for (let hoja = 1; hoja <= totalHojas; hoja++) {
      this.documento.setPage(hoja);
      this.documento.text(`Página ${hoja} de ${totalHojas}`, this.anchoHoja - ESTILO_PDF.margen, this.altoHoja - 6, {
        align: "right",
      });
    }
    this.documento.save(`${nombreArchivo}${marcaDeTiempoArchivo()}.pdf`);
  }

  fuente(estilo: "normal" | "bold", tamano: number, color: ColorPdf): void {
    this.documento.setFont("helvetica", estilo);
    this.documento.setFontSize(tamano);
    this.documento.setTextColor(...color);
  }

  private encabezadoTabla(titulosColumnas: string[], anchosColumnas: number[], opciones: OpcionesTablaPdf): void {
    const { margen, colores, letra } = ESTILO_PDF;
    if (opciones.tituloHoja || opciones.detalleHoja) {
      this.posicionY += 4;
      if (opciones.tituloHoja) {
        this.fuente("bold", letra.subtitulo, colores.principal);
        this.documento.text(opciones.tituloHoja, margen, this.posicionY);
      }
      if (opciones.detalleHoja) {
        this.fuente("normal", letra.detalle, colores.textoSuave);
        this.documento.text(opciones.detalleHoja, this.anchoHoja - margen, this.posicionY, { align: "right" });
      }
      this.posicionY += 10;
    }

    this.fuente("bold", letra.tabla, colores.blanco);
    const lineasPorTitulo = titulosColumnas.map((texto, posicion) => this.lineasCelda(texto, anchosColumnas[posicion]));
    const altoCabecera = this.altoFila(lineasPorTitulo);
    this.documento.setFillColor(...colores.principal);
    this.documento.rect(margen, this.posicionY, this.anchoUtil, altoCabecera, "F");
    this.escribirFila(lineasPorTitulo, anchosColumnas);
    this.posicionY += altoCabecera;
  }

  private escribirFila(lineasPorCelda: string[][], anchosColumnas: number[]): void {
    const { relleno, altoLinea } = ESTILO_PDF.celda;
    let posicionX = ESTILO_PDF.margen;
    lineasPorCelda.forEach((lineas, posicion) => {
      this.documento.text(lineas, posicionX + relleno, this.posicionY + relleno + altoLinea - 0.8);
      posicionX += anchosColumnas[posicion];
    });
  }

  private altoFila(lineasPorCelda: string[][]): number {
    const { relleno, altoLinea } = ESTILO_PDF.celda;
    return Math.max(...lineasPorCelda.map((lineas) => lineas.length)) * altoLinea + relleno * 2;
  }

  /** Parte el texto al ancho de la celda; lo que pase del máximo de líneas termina en "...". */
  private lineasCelda(texto: string, anchoColumna: number): string[] {
    const { relleno, lineasMaximas } = ESTILO_PDF.celda;
    const lineas: string[] = this.documento.splitTextToSize(texto, anchoColumna - relleno * 2);
    if (lineas.length <= lineasMaximas) return lineas;
    const visibles = lineas.slice(0, lineasMaximas);
    visibles[visibles.length - 1] = `${visibles[visibles.length - 1].slice(0, -3)}...`;
    return visibles;
  }

  private textoCelda(valor: unknown): string {
    if (valor === null || valor === undefined || String(valor).trim() === "") return "-";
    const texto = String(valor).trim();
    return PATRON_FECHA_BACKEND.test(texto) ? formatoFechaCorta(texto) : texto;
  }

  private dibujarLogo(logo: string): void {
    try {
      const { width: ancho, height: alto } = this.documento.getImageProperties(logo);
      const { ancho: anchoMaximo, alto: altoMaximo } = ESTILO_PDF.logo;
      const escala = Math.min(anchoMaximo / ancho, altoMaximo / alto);
      this.documento.addImage(logo, "PNG", ESTILO_PDF.margen, ESTILO_PDF.margen - 3, ancho * escala, alto * escala);
    } catch {
      // Un logo dañado o vacío no debe impedir el reporte.
    }
  }
}
