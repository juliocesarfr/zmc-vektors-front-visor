import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Table, TableModule } from "primeng/table";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { ExcelService } from "@host/_servicios/reportes/excel.service";

import {
  ColumnaListado,
  FilaListado,
  descargarListadoExcel,
} from "../../utils/listado-excel";

/**
 * Listado de lo que quedó dentro de un dibujo del mapa, con exportación a Excel de lo que
 * se está viendo (respeta el filtro). Al cerrarla queda como pastilla para recuperarla.
 */
@Component({
  selector: "app-tabla-seleccion-mapa",
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, ButtonModule, InputTextModule],
  templateUrl: "./tabla-seleccion-mapa.component.html",
  styleUrls: ["./tabla-seleccion-mapa.component.scss"],
})
export class TablaSeleccionMapaComponent implements OnChanges {
  private readonly excelService = inject(ExcelService);

  @Input() titulo = "Clientes en el área seleccionada";
  @Input() columnas: ColumnaListado[] = [];
  @Input() filas: FilaListado[] = [];
  @Input() tituloExcel = "CLIENTES EN EL ÁREA SELECCIONADA";
  @Input() subcabeceraExcel: string[] = [];
  @Input() nombreArchivoExcel = "clientes_area_";
  /** Hay un popup abierto a la derecha: la tabla se corre para no tapar ni quedar tapada. */
  @Input() hayPanelDerecho = false;

  @Output() filaElegida = new EventEmitter<FilaListado>();
  /** El usuario descartó el listado desde la pastilla: ya no hay nada que recuperar. */
  @Output() descartar = new EventEmitter<void>();

  @ViewChild("tabla") private tabla?: Table;

  textoFiltro = "";
  estaMinimizada = false;
  estaOculta = false;
  estaExportando = false;
  private filasFiltradas: FilaListado[] | null = null;

  // Un listado nuevo trae otros clientes: el filtro escrito para el anterior ya no aplica.
  ngOnChanges(cambios: SimpleChanges): void {
    if (!cambios["filas"]) return;
    this.textoFiltro = "";
    this.filasFiltradas = null;
    this.estaMinimizada = false;
    this.estaOculta = false;
    this.tabla?.clear();
  }

  get camposFiltro(): string[] {
    return this.columnas.map((columna) => columna.campo);
  }

  get filasVisibles(): FilaListado[] {
    return this.filasFiltradas ?? this.filas;
  }

  // La tabla de PrimeNG se destruye al ocultarse: el filtro escrito ya no estaría aplicado al volver.
  ocultar(): void {
    this.estaOculta = true;
    this.textoFiltro = "";
    this.filasFiltradas = null;
  }

  alFiltrar(evento: { filteredValue?: FilaListado[] }): void {
    this.filasFiltradas = this.textoFiltro ? evento.filteredValue ?? null : null;
  }

  async exportarExcel(): Promise<void> {
    const filas = this.filasVisibles;
    if (filas.length === 0 || this.estaExportando) return;

    this.estaExportando = true;
    try {
      await descargarListadoExcel(this.excelService, {
        titulo: this.tituloExcel,
        subcabecera: this.subcabeceraExcel,
        nombreArchivo: this.nombreArchivoExcel,
        columnas: this.columnas,
        filas,
      });
    } finally {
      this.estaExportando = false;
    }
  }
}
