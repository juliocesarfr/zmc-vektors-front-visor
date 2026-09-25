import { Component, DestroyRef, OnInit, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";

import { ButtonModule } from "primeng/button";
import { CalendarModule } from "primeng/calendar";
import { DropdownModule } from "primeng/dropdown";
import { InputNumberModule } from "primeng/inputnumber";
import { PanelModule } from "primeng/panel";
import { ProgressBarModule } from "primeng/progressbar";
import { TableModule } from "primeng/table";
import { TooltipModule } from "primeng/tooltip";
import { DynamicDialogConfig, DynamicDialogRef } from "primeng/dynamicdialog";

import { ValidacionSistemaService } from "@host/_servicios/validar/validacion-sistema.service";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { ParamaeService } from "@host/_servicios/administracion/paramae.service";
import { NotificacionCierreService } from "@host/_servicios/cobranza/notificacion-cierre.service";
import { listadoProgramado } from "@host/_models/cobranza/notificacion-cierre";


@Component({
  selector: "app-buscar-programa-corte",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    CalendarModule,
    DropdownModule,
    InputNumberModule,
    PanelModule,
    ProgressBarModule,
    TableModule,
    TooltipModule,
  ],
  templateUrl: "./buscar-programa-corte.component.html",
  providers: [ValidacionSistemaService, DatePipe],
})
export class BuscarProgramaCorteComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  envioLista: listadoProgramado = new listadoProgramado();
  listaSede: any[] = [];
  estados: any[] = [
    { codigo: "001", descripcion: "PENDIENTE" },
    { codigo: "003", descripcion: "ATENDIDO" },
    { codigo: "005", descripcion: "ANULADO" },
  ];
  rangeDates: Date[] = [];
  programas: any[] = [];
  loading = false;

  constructor(
    private consultaService: ConsulGenericService,
    private paramaeService: ParamaeService,
    private validacionService: ValidacionSistemaService,
    private notificacionesService: NotificacionCierreService,
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) { }

  ngOnInit(): void {
    this.envioLista.codsede = sessionStorage.getItem("codsede") ?? "";
    this.envioLista.tipooperacion = this.config?.data?.tipooperacion ?? "001";

    this.consultaService
      .getconsultaService("SED", "001", "ALL", "ALL")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => (this.listaSede = data || []));

    this.paramaeService
      .usp_getfechaserver()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        const fecha = this.validacionService.convertir_string_a_date_obj(
          data.fechaserver,
        );
        if (!fecha) return;
        const fechaini = new Date(fecha);
        fechaini.setHours(0, 0, 0, 0);
        this.rangeDates = [fechaini, fecha];
        this.cargarLista();
      });
  }

  cargarLista(): void {
    if (this.rangeDates?.length < 2 || !this.rangeDates[1]) return;
    this.loading = true;
    this.envioLista.fecha_start =
      this.validacionService.convetir_de_date_a_string(this.rangeDates[0])!;
    this.envioLista.fecha_end =
      this.validacionService.convetir_de_date_a_string(this.rangeDates[1])!;

    this.notificacionesService
      .postlistadoProgramados(this.envioLista)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.programas = (data?.data || []).map((e: any) => ({
            ...e,
            pendientes: e.asignados - e.ejecutados - e.pagados,
            rendimiento:
              e.asignados != 0
                ? Number(((e.ejecutados / e.asignados) * 100).toFixed(2))
                : 0,
          }));
          this.loading = false;
        },
        error: () => {
          this.programas = [];
          this.loading = false;
        },
      });
  }

  seleccionar(row: any): void {
    this.ref.close(row);
  }
}
