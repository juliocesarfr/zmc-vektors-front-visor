import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ControladorMapaGis } from '../../mapa/controlador-mapa-gis';
import { FilaListado } from '../../utils/listado-excel';
import { MapaPopupGisComponent } from '../mapa-popup-gis/mapa-popup-gis.component';
import { TablaSeleccionMapaComponent } from '../tabla-seleccion-mapa/tabla-seleccion-mapa.component';

/** Tabla del área dibujada y popup de la consulta GIS de un `ControladorMapaGis`. */
@Component({
  selector: 'app-paneles-mapa-gis',
  standalone: true,
  imports: [MapaPopupGisComponent, TablaSeleccionMapaComponent],
  template: `
    @if (controlador) {
      @if (controlador.filasListado) {
        <app-tabla-seleccion-mapa
          [titulo]="controlador.tituloListado"
          [columnas]="controlador.columnasListado"
          [filas]="controlador.filasListado"
          [subcabeceraExcel]="controlador.subcabeceraListado"
          [tituloExcel]="controlador.tituloExcelListado"
          [nombreArchivoExcel]="controlador.nombreArchivoListado"
          [hayPanelDerecho]="hayPanelDerecho || controlador.elementosGis.length > 0"
          (filaElegida)="filaElegida.emit($event)"
          [estaGenerandoPdf]="controlador.estaGenerandoPdf"
          [puedeVer3d]="controlador.puedeVer3d"
          [estaPreparando3d]="controlador.estaPreparando3d"
          (ver3d)="controlador.verListadoEn3d()"
          (descartar)="controlador.descartarListado()"
          (descargarPdf)="controlador.descargarPdfListado($event)"
        ></app-tabla-seleccion-mapa>
      }
      @if (controlador.elementosGis.length > 0) {
        <app-mapa-popup-gis
          [elementos]="controlador.elementosGis"
          (cerrar)="controlador.cerrarPopupGis()"
          (elementoActivoCambia)="controlador.resaltarElementoGis($event)"
        ></app-mapa-popup-gis>
      }
    }
  `,
})
export class PanelesMapaGisComponent {
  @Input() controlador?: ControladorMapaGis;
  /** La pantalla tiene abierto a la derecha su popup o su buscador: la tabla se corre. */
  @Input() hayPanelDerecho = false;

  @Output() filaElegida = new EventEmitter<FilaListado>();
}
