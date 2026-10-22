import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { DynamicDialogConfig, DynamicDialogRef } from "primeng/dynamicdialog";

import { CapaShape } from "../../utils/shapefile";

export interface VistaPreviaShape {
  nombreArchivo: string;
  /** Capas armadas con los datos de la pantalla, ya recortadas a la vista del mapa. */
  capasLocales: CapaShape[];
  /** Capas de GeoServer encendidas: se recortan a la vista recién al descargar. */
  capasGis: string[];
}

/** Muestra qué va a tener el .zip antes de descargarlo; cierra con `true` si el usuario confirma. */
@Component({
  selector: "app-vista-previa-shape",
  standalone: true,
  imports: [CommonModule, ButtonModule, TableModule],
  templateUrl: "./vista-previa-shape.component.html",
  styleUrls: ["./vista-previa-shape.component.scss"],
})
export class VistaPreviaShapeComponent {
  private readonly ref = inject(DynamicDialogRef);
  readonly datos: VistaPreviaShape = inject(DynamicDialogConfig).data;

  readonly capasConElementos = this.datos.capasLocales.filter((capa) => capa.elementos.length > 0);
  capaVisible: CapaShape | null = this.capasConElementos[0] ?? null;

  get hayAlgoParaDescargar(): boolean {
    return this.capasConElementos.length > 0 || this.datos.capasGis.length > 0;
  }

  get totalElementos(): number {
    return this.capasConElementos.reduce((total, capa) => total + capa.elementos.length, 0);
  }

  verCapa(capa: CapaShape): void {
    this.capaVisible = capa;
  }

  coordenadaDe(elemento: CapaShape["elementos"][number]): string {
    const [lon, lat] = elemento.coordenadas[0] ?? [];
    return lon == null || lat == null ? "-" : `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }

  cancelar(): void {
    this.ref.close(false);
  }

  descargar(): void {
    this.ref.close(true);
  }
}
