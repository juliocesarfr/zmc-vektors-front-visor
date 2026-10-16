import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  DestroyRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { TableModule } from "primeng/table";
import { DropdownModule } from "primeng/dropdown";
import { InputTextModule } from "primeng/inputtext";
import { ButtonModule } from "primeng/button";
import { CheckboxModule } from "primeng/checkbox";
import { TooltipModule } from "primeng/tooltip";
import { TagModule } from "primeng/tag";
import { PaginatorModule } from "primeng/paginator";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { CallesService } from "@host/_servicios/catastro/calles.service";
import { UrbamaeService } from "@host/_servicios/catastro/urbamae.service";
import { TipodocidentService } from "@host/_servicios/catastro/tipodocident.service";

import {
  BusquedaAvanzadaClientesRequest,
  BusquedaAvanzadaClienteResponse,
} from "../../models/busqueda-avanzada-clientes.models";
import { BusquedaAvanzadaClientesService } from "../../services/busqueda-avanzada-clientes.service";

@Component({
  selector: "app-busqueda-avanzada-clientes",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    DropdownModule,
    InputTextModule,
    ButtonModule,
    CheckboxModule,
    TooltipModule,
    TagModule,
    PaginatorModule,
  ],
  templateUrl: "./busqueda-avanzada-clientes.component.html",
  styleUrls: ["./busqueda-avanzada-clientes.component.scss"],
})
export class BusquedaAvanzadaClientesComponent implements OnInit {
  private sucursalesService = inject(SucursalesService);
  private callesService = inject(CallesService);
  private urbamaeService = inject(UrbamaeService);
  private tipodocidentService = inject(TipodocidentService);
  private busquedaService = inject(BusquedaAvanzadaClientesService);
  private destroyRef = inject(DestroyRef);

  @Input() set codsuc(val: string) {
    if (val) {
      this._codsuc = val;
      this.seleccionarTodasSucursales = false;
      this.cargarCatalogosPorSucursal(val);
    }
  }

  @Output() clienteSeleccionado = new EventEmitter<BusquedaAvanzadaClienteResponse>();
  @Output() cerrar = new EventEmitter<void>();

  _codsuc: string = "ALL";
  seleccionarTodasSucursales: boolean = true;

  // Catálogos dropdowns
  listaSucursales: any[] = [];
  listaCalles: any[] = [];
  listaUrbanizaciones: any[] = [];
  listaTiposDoc: any[] = [];

  // Filtros del formulario
  codcalle: string = "ALL";
  codurbaso: string = "ALL";
  codcliente: string = "";
  nromedidor: string = "";
  tipodocident: string = "ALL";
  nrodocumento: string = "";
  propietario: string = "";
  letrainicio: number = 0; // 0: Contiene (%val%), 1: Inicia con (val%)

  // Filtros adicionales avanzados
  mostrarFiltrosAvanzados: boolean = false;
  codsector: string = "";
  codmza: string = "";
  nrolote: string = "";
  nrosublote: string = "";
  nrorecibo: string = "";
  nropedidoqr: string = "";
  nropedidovisa: string = "";

  // Estado y Resultados
  cargando: boolean = false;
  listaClientes: BusquedaAvanzadaClienteResponse[] = [];
  totalRecords: number = 0;
  first: number = 0;
  rows: number = 10;

  ngOnInit(): void {
    const codsucSession = sessionStorage.getItem("codsuc") || "001";
    if (this._codsuc === "ALL" && !this.seleccionarTodasSucursales) {
      this._codsuc = codsucSession;
    }
    this.cargarCatalogosGenerales(codsucSession);
  }

  cargarCatalogosGenerales(codsucDefault: string): void {
    this.sucursalesService
      .obtener_x_estareg()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp: any) => {
          this.listaSucursales = Array.isArray(resp) ? resp : (resp?.data || []);
        },
        error: () => (this.listaSucursales = []),
      });

    this.tipodocidentService
      .drop()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: any) => {
          this.listaTiposDoc = Array.isArray(data) ? data : (data?.data || []);
        },
        error: () => (this.listaTiposDoc = []),
      });

    this.cargarCatalogosPorSucursal(codsucDefault);
  }

  cargarCatalogosPorSucursal(codsuc: string): void {
    if (!codsuc || codsuc === "ALL") {
      this.listaCalles = [];
      this.listaUrbanizaciones = [];
      return;
    }

    this.callesService
      .drop_x_sucursales(codsuc)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: any) => {
          this.listaCalles = data || [];
        },
        error: () => (this.listaCalles = []),
      });

    this.urbamaeService
      .drop_x_sucursales(codsuc)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: any) => {
          this.listaUrbanizaciones = data || [];
        },
        error: () => (this.listaUrbanizaciones = []),
      });
  }

  onSucursalChange(): void {
    this.codcalle = "ALL";
    this.codurbaso = "ALL";
    if (this._codsuc && this._codsuc !== "ALL") {
      this.cargarCatalogosPorSucursal(this._codsuc);
    } else {
      this.listaCalles = [];
      this.listaUrbanizaciones = [];
    }
  }

  onToggleTodasSucursales(): void {
    if (this.seleccionarTodasSucursales) {
      this._codsuc = "ALL";
      this.listaCalles = [];
      this.listaUrbanizaciones = [];
      this.codcalle = "ALL";
      this.codurbaso = "ALL";
    } else {
      const codsucSession = sessionStorage.getItem("codsuc") || "001";
      this._codsuc = codsucSession;
      this.cargarCatalogosPorSucursal(this._codsuc);
    }
  }

  buscarClick(): void {
    this.first = 0;
    this.ejecutarBusqueda();
  }

  onPageChange(event: any): void {
    this.first = event.first;
    this.rows = event.rows;
    this.ejecutarBusqueda();
  }

  ejecutarBusqueda(): void {
    this.cargando = true;

    // Cálculo de rango para Sybase IDENTITY:
    // pseudo_key between @inicio and @nropagina
    const inicio = this.first + 1;
    const nropagina = this.first + this.rows;

    const request: BusquedaAvanzadaClientesRequest = {
      codsuc: this.seleccionarTodasSucursales ? "ALL" : (this._codsuc || "ALL"),
      inicio: inicio,
      nropagina: nropagina,
      codcalle: this.codcalle || "ALL",
      codcliente: this.codcliente ? this.codcliente.trim() : "ALL",
      nromedidor: this.nromedidor ? this.nromedidor.trim() : "ALL",
      codurbaso: this.codurbaso || "ALL",
      tipodocident: this.tipodocident || "ALL",
      nrodocumento: this.nrodocumento ? this.nrodocumento.trim() : "ALL",
      propietario: this.propietario ? this.propietario.trim() : "ALL",
      letrainicio: this.letrainicio,
      codsector: this.codsector ? this.codsector.trim() : "ALL",
      codmza: this.codmza ? this.codmza.trim() : "ALL",
      nrolote: this.nrolote ? this.nrolote.trim() : "ALL",
      nrosublote: this.nrosublote ? this.nrosublote.trim() : "ALL",
      nrorecibo: this.nrorecibo ? this.nrorecibo.trim() : "ALL",
      nropedidoqr: this.nropedidoqr ? this.nropedidoqr.trim() : "ALL",
      nropedidovisa: this.nropedidovisa ? this.nropedidovisa.trim() : "ALL",
    };

    this.busquedaService
      .buscarClientesAvanzada(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.cargando = false;
          const datos = resp?.data || [];
          this.listaClientes = datos;
          if (datos.length > 0 && datos[0].rows != null) {
            this.totalRecords = datos[0].rows;
          } else {
            this.totalRecords = datos.length;
          }
        },
        error: (err) => {
          this.cargando = false;
          this.listaClientes = [];
          this.totalRecords = 0;
          console.error("Error en búsqueda avanzada de clientes:", err);
        },
      });
  }

  limpiarFiltros(): void {
    this.codcalle = "ALL";
    this.codurbaso = "ALL";
    this.codcliente = "";
    this.nromedidor = "";
    this.tipodocident = "ALL";
    this.nrodocumento = "";
    this.propietario = "";
    this.letrainicio = 0;
    this.codsector = "";
    this.codmza = "";
    this.nrolote = "";
    this.nrosublote = "";
    this.nrorecibo = "";
    this.nropedidoqr = "";
    this.nropedidovisa = "";
    this.listaClientes = [];
    this.totalRecords = 0;
    this.first = 0;
  }

  seleccionarCliente(cliente: BusquedaAvanzadaClienteResponse): void {
    this.clienteSeleccionado.emit(cliente);
  }

  tieneCoordenadas(cliente: BusquedaAvanzadaClienteResponse): boolean {
    return !!(
      (cliente.lon != null && cliente.lat != null) ||
      (cliente.lonpredio != null && cliente.latpredio != null) ||
      (cliente.lonagua != null && cliente.latagua != null)
    );
  }
}
