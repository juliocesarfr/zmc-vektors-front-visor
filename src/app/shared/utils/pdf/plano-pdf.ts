import type { ReportePdf } from "./reporte-pdf";
import { ESTILO_PDF } from "./estilo-pdf";

export interface RecuadroPdf {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

const DISTANCIAS_BARRA_ESCALA_M = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
const LARGO_MAXIMO_BARRA_ESCALA_MM = 45;

/** Norte en la esquina de arriba a la derecha del plano. */
export function dibujarNorte(reporte: ReportePdf, plano: RecuadroPdf): void {
  const { documento } = reporte;
  const { principal, blanco } = ESTILO_PDF.colores;
  const centroX = plano.x + plano.ancho - 9;
  const centroY = plano.y + 10;

  documento.setFillColor(...blanco);
  documento.setDrawColor(...principal);
  documento.setLineWidth(0.3);
  documento.circle(centroX, centroY, 6, "FD");
  documento.setFillColor(...principal);
  documento.triangle(centroX, centroY - 4.2, centroX - 2.2, centroY + 2.2, centroX + 2.2, centroY + 2.2, "F");
  reporte.fuente("bold", 6, principal);
  documento.text("N", centroX, centroY + 4.9, { align: "center" });
}

/** Barra de escala en la esquina de abajo a la derecha del plano, con una distancia redonda. */
export function dibujarBarraEscala(reporte: ReportePdf, plano: RecuadroPdf, metrosPorMilimetro: number): void {
  const { documento } = reporte;
  const { principal, blanco } = ESTILO_PDF.colores;
  const distancia =
    [...DISTANCIAS_BARRA_ESCALA_M]
      .reverse()
      .find((metros) => metros / metrosPorMilimetro <= LARGO_MAXIMO_BARRA_ESCALA_MM) ?? DISTANCIAS_BARRA_ESCALA_M[0];
  const largo = distancia / metrosPorMilimetro;
  const derecha = plano.x + plano.ancho - 4;
  const izquierda = derecha - largo;
  const base = plano.y + plano.alto - 5;

  documento.setFillColor(...blanco);
  documento.rect(izquierda - 3, base - 7, largo + 6, 9.5, "F");
  documento.setFillColor(...principal);
  documento.rect(izquierda, base - 1.4, largo / 2, 1.4, "F");
  documento.setDrawColor(...principal);
  documento.setLineWidth(0.25);
  documento.rect(izquierda, base - 1.4, largo, 1.4);

  reporte.fuente("normal", 6.5, principal);
  documento.text("0", izquierda, base - 2.6, { align: "center" });
  documento.text(distancia >= 1000 ? `${distancia / 1000} km` : `${distancia} m`, derecha, base - 2.6, {
    align: "center",
  });
}

export function textoEscala(metrosPorMilimetro: number): string {
  return `Escala aprox. 1:${formatearNumero(Math.round(metrosPorMilimetro * 1000))}`;
}

export function textoArea(metrosCuadrados: number): string {
  const metros = `${formatearNumero(Math.round(metrosCuadrados))} m²`;
  return metrosCuadrados >= 10000
    ? `${metros} (${formatearNumero(Math.round(metrosCuadrados / 100) / 100)} ha)`
    : metros;
}

function formatearNumero(valor: number): string {
  return valor.toLocaleString("es-PE");
}
