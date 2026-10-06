import { Component, EventEmitter, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";

import { ElementoGis } from "../../../core/gis";

const LARGO_VALOR_FILA_COMPLETA = 26;

/** Ficha de un elemento de GeoServer (válvula, tubería, lote…) consultado al hacer clic en el mapa. */
@Component({
  selector: "app-mapa-popup-gis",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./mapa-popup-gis.component.html",
  styleUrls: ["./mapa-popup-gis.component.scss"],
})
export class MapaPopupGisComponent implements OnChanges {
  @Input() elementos: ElementoGis[] = [];

  @Output() cerrar = new EventEmitter<void>();
  /** Para resaltar en el mapa el elemento de la pestaña elegida. */
  @Output() elementoActivoCambia = new EventEmitter<ElementoGis>();

  indiceActivo = 0;

  get elementoActivo(): ElementoGis | undefined {
    return this.elementos[this.indiceActivo];
  }

  ngOnChanges(): void {
    this.indiceActivo = 0;
  }

  seleccionarElemento(indice: number): void {
    this.indiceActivo = indice;
    this.elementoActivoCambia.emit(this.elementos[indice]);
  }

  ocupaFilaCompleta(valor: string): boolean {
    return valor.length > LARGO_VALOR_FILA_COMPLETA;
  }
}
