import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";

import { ControladorMapaGis } from "../../mapa/controlador-mapa-gis";
import { FilaListado } from "../../utils/listado-excel";
import { MapaPopupGisComponent } from "../mapa-popup-gis/mapa-popup-gis.component";
import { TablaSeleccionMapaComponent } from "../tabla-seleccion-mapa/tabla-seleccion-mapa.component";

/** Tabla del área dibujada y popup de la consulta GIS de un `ControladorMapaGis`. */
@Component({
  selector: "app-paneles-mapa-gis",
  standalone: true,
  imports: [CommonModule, MapaPopupGisComponent, TablaSeleccionMapaComponent],
  template: `
    <ng-container *ngIf="controlador">
      <app-tabla-seleccion-mapa
        *ngIf="controlador.filasListado"
        [titulo]="controlador.tituloListado"
        [columnas]="controlador.columnasListado"
        [filas]="controlador.filasListado"
        [subcabeceraExcel]="controlador.subcabeceraListado"
        [tituloExcel]="controlador.tituloExcelListado"
        [nombreArchivoExcel]="controlador.nombreArchivoListado"
        [hayPanelDerecho]="hayPanelDerecho || controlador.elementosGis.length > 0"
        (filaElegida)="filaElegida.emit($event)"
        (descartar)="controlador.descartarListado()"
      ></app-tabla-seleccion-mapa>

      <app-mapa-popup-gis
        *ngIf="controlador.elementosGis.length > 0"
        [elementos]="controlador.elementosGis"
        (cerrar)="controlador.cerrarPopupGis()"
        (elementoActivoCambia)="controlador.resaltarElementoGis($event)"
      ></app-mapa-popup-gis>
    </ng-container>
  `,
})
export class PanelesMapaGisComponent {
  @Input() controlador?: ControladorMapaGis;
  /** La pantalla tiene abierto a la derecha su popup o su buscador: la tabla se corre. */
  @Input() hayPanelDerecho = false;

  @Output() filaElegida = new EventEmitter<FilaListado>();
}
