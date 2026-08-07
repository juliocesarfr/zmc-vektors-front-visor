import {
  Component,
  OnInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  inject,
} from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { ToastModule } from "primeng/toast";
import { DropdownModule } from "primeng/dropdown";
import { InputTextModule } from "primeng/inputtext";
import { MessageService } from "primeng/api";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { SectoresCicloService } from "@host/_servicios/seguridad/sectores-ciclo.service";
import { TarifasService } from "@host/_servicios/catastro/tarifas.service";
import { TipousuarioService } from "@host/_servicios/catastro/tipousuario.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin, of } from "rxjs";
import { catchError, finalize } from "rxjs/operators";
import { DialogService, DynamicDialogModule } from "primeng/dynamicdialog";
import { TooltipModule } from "primeng/tooltip";

import OlMap from "ol/Map";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Feature } from "ol";

import { MapaVisorComponent } from "../../../shared/components/mapa-visor/mapa-visor.component";
import { MapaPopupClienteComponent } from "../../../shared/components/mapa-popup-cliente/mapa-popup-cliente.component";
import { MapEstilosFactory, RADIOS_LECTURA } from "../../../util/Mapaestilos.factory";
import { crearFeaturePunto, extraerCoordenada } from "../../../util/Geo.utils";
import { FiltroPadronClientesVMARequest } from "@host/_models/vektors/VMA/FiltroPadronClientesVMARequest";
import { VmaService } from "@host/_servicios/vektors/vma.service";
import { ConfigOrigenCoordenada, ORIGENES_COORDENADA } from "../../../config/Controldigitacion.config";
import { fromCircle } from "ol/geom/Polygon";


@Component({
  selector: "app-padron-clientes-vma",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ToastModule,
    DropdownModule,
    InputTextModule,
    DynamicDialogModule,
    TooltipModule,
    MapaVisorComponent,
    MapaPopupClienteComponent
  ],
  templateUrl: "./padron-clientes-vma.component.html",
  styleUrl: "./padron-clientes-vma.component.scss",
  providers: [
    DatePipe,
    MessageService,
    DialogService,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PadronClientesVmaComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly estilos = new MapEstilosFactory();

  map?: OlMap;

  cargando = false;
  filtrosVisible = true;
  totalClientes = 0;
  totalSinCoordenadas = 0;
  resultadoBusquedaJson: any[] | null = null;
  featureSeleccionado: Feature | null = null;
  clienteSeleccionado: any = null;

  dataCiclos: any[] = [];
  listaSucursales: any[] = [];
  listaSectores: any[] = [];
  listaEstadoServicio: any[] = [];
  listaTipoServicio: any[] = [];
  listaTarifas: any[] = [];
  listaActividades: any[] = [];
  listaTipoUsuario: any[] = [];

  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: any = null;
  selectedEstadoServicio: any = null;
  selectedTipoServicio: any = null;
  selectedTarifa: any = null;
  selectedActividad: any = null;
  selectedTipoUsuario: any = null;

  usuariosLayer = new VectorLayer({
    source: new VectorSource(),
    style: (feature) => {
      const zoom = this.map?.getView().getZoom() ?? 15;
      return this.estilos.punto({
        forma: 'circulo',
        color: '#3b82f6',
        zoom,
        seleccionado: feature === this.featureSeleccionado,
        etiqueta: (feature as Feature).get('codcliente'),
        ...RADIOS_LECTURA,
      });
    },
    zIndex: 10,
  });

  capasVector = [this.usuariosLayer];

  constructor(
    private vmaService: VmaService,
    private consulGenericService: ConsulGenericService,
    private sucursalesService: SucursalesService,
    private sectoresCicloService: SectoresCicloService,
    private tarifasService: TarifasService,
    private tipoUsuarioService: TipousuarioService,
    private messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.cargarCombosEstaticos();
  }

  ngOnDestroy(): void {}

  onMapReady(map: OlMap): void {
    this.map = map;
    MapEstilosFactory.setupAdvancedMapTools(this.map, (geometry) => {
      if (geometry && geometry.getType() === 'Circle') {
        this.contarElementosEnRadio(geometry);
      }
    });
  }


  toggleFiltros(): void {
    this.filtrosVisible = !this.filtrosVisible;
  }

  private avisar(
    severity: "success" | "info" | "warn" | "error",
    summary: string,
    detail: string,
  ): void {
    this.messageService.add({ severity, summary, detail, life: 3000 });
  }

  private cargarCombosEstaticos(): void {
    this.cargando = true;

    forkJoin({
      ciclos: this.consulGenericService.getconsultaService("CCO", "ALL", "ALL", "ALL").pipe(catchError(() => of<any[]>(([])))),
      estados: this.consulGenericService.getconsultaService("TES", "ALL", "ALL", "ALL").pipe(catchError(() => of<any[]>(([])))),
      tiposServ: this.consulGenericService.getconsultaService("TSE", "ALL", "ALL", "ALL").pipe(catchError(() => of<any[]>(([])))),
      actividades: this.consulGenericService.getconsultaService("TAC", "ALL", "ALL", "ALL").pipe(catchError(() => of<any[]>(([])))),
      tipoUsuarios: this.tipoUsuarioService.drop().pipe(catchError(() => of<any[]>(([])))),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((err) => {
          console.error("Error cargando combos principales", err);
          this.avisar("error", "Error", "No se pudieron cargar los filtros iniciales");
          return of(null);
        }),
        finalize(() => (this.cargando = false)),
      )
      .subscribe((res) => {
        if (!res) return;
        this.dataCiclos = res.ciclos || [];
        this.listaEstadoServicio = [
          { codigo: "ALL", descripcion: "TODOS" },
          ...(res.estados || [])
        ];
        this.listaTipoServicio = [
          { codigo: "ALL", descripcion: "TODOS" },
          ...(res.tiposServ || [])
        ];
        this.listaActividades = [
          { codigo: "ALL", descripcion: "TODOS" },
          ...(res.actividades || [])
        ];
        this.listaTipoUsuario = [
          { tipousuario: "ALL", descripcion: "TODOS" },
          ...(res.tipoUsuarios || [])
        ];

        this.selectedEstadoServicio = "ALL";
        this.selectedTipoServicio = "ALL";
        this.selectedActividad = "ALL";
        this.selectedTipoUsuario = "ALL";
      });
  }

  onCicloChange(): void {
    this.selectedSucursal = null;
    this.selectedSector = null;
    this.selectedTarifa = null;
    this.listaSucursales = [];
    this.listaSectores = [];
    this.listaTarifas = [];
    if (!this.selectedCiclo) return;

    this.sucursalesService
      .drop_sucursales_x_ciclo(this.selectedCiclo.codigo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => (this.listaSucursales = data || []),
        error: (err) => console.error("Error al cargar sucursales:", err)
      });
  }

  onSucursalChange(): void {
    this.selectedSector = null;
    this.selectedTarifa = null;
    this.listaSectores = [];
    this.listaTarifas = [];

    if (!this.selectedSucursal) return;

    this.tarifasService
      .drop(this.selectedSucursal.codsuc)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.listaTarifas = [
            { catetar: "ALL", nomtar: "TODOS" },
            ...(data || [])
          ];
          this.selectedTarifa = "ALL";
        },
        error: (err) => console.error("Error al cargar tarifas:", err)
      });

    this.sectoresCicloService
      .drop_sectores_x_ciclo(this.selectedSucursal.codsuc, this.selectedCiclo.codigo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.listaSectores = [
            { codsector: "ALL", descripcion: "TODOS" },
            ...(data || [])
          ];
          this.selectedSector = this.listaSectores[0];
        },
        error: (err) => {
          console.error("Error al cargar sectores:", err);
          this.listaSectores = [{ codsector: "ALL", descripcion: "TODOS" }];
          this.selectedSector = this.listaSectores[0];
        }
      });
  }

  getDescEstadoServicio(): string {
    return this.listaEstadoServicio?.find(e => e.codigo === this.selectedEstadoServicio)?.descripcion ?? "TODOS";
  }

  getDescTipoServicio(): string {
    return this.listaTipoServicio?.find(e => e.codigo === this.selectedTipoServicio)?.descripcion ?? "TODOS";
  }

  getDescTarifa(): string {
    const tarifa = this.listaTarifas?.find(e => e.catetar === this.selectedTarifa);
    return tarifa ? tarifa.nomtar : '';
  }

  getDescActividad(): string {
    return this.listaActividades?.find(e => e.codigo === this.selectedActividad)?.descripcion ?? "TODOS";
  }

  getDescTipoUsuario(): string {
    return this.listaTipoUsuario?.find(e => e.tipousuario === this.selectedTipoUsuario)?.descripcion ?? "TODOS";
  }

  procesar(): void {
    this.limpiarCapas();
    this.cerrarPopup();

    if (!this.selectedCiclo || !this.selectedSucursal) {
      this.avisar("warn", "Faltan filtros", "Seleccione ciclo y sucursal como mínimo.");
      return;
    }

    this.cargando = true;
    const toNull = (val: any) => (!val || val === "ALL") ? null : val;

    const filtro: FiltroPadronClientesVMARequest = {
      codciclo: toNull(this.selectedCiclo.codigo),
      codsuc: toNull(this.selectedSucursal.codsuc),
      codsector: toNull(this.selectedSector?.codsector),
      estservicio: toNull(this.selectedEstadoServicio),
      tiposervicio: toNull(this.selectedTipoServicio),
      catetar: toNull(this.selectedTarifa),
      tipousuario: toNull(this.selectedTipoUsuario),
      actividad: toNull(this.selectedActividad),
    };

    this.vmaService.listarPadronNoDomestico(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          if (response?.success) {
            this.resultadoBusquedaJson = response.data;
            this.dibujarResultados(true);
            this.filtrosVisible = false;
          } else {
            this.avisar("error", "Error", response?.mensaje || "Ocurrió un error.");
          }
        },
        error: (err) => {
          this.cargando = false;
          console.error("Error consultando padrón VMA:", err);
          this.avisar("error", "Error", "Problemas de conexión con el servidor");
        }
      });
  }

  limpiar(): void {
    this.selectedSucursal = null;
    this.onCicloChange(); 
    this.limpiarCapas();
    this.cerrarPopup();
  }

  private dibujarResultados(fitBounds = true): void {
    this.estilos.limpiar();
    this.limpiarCapas();

    const registros = this.resultadoBusquedaJson || [];
    this.totalClientes = registros.length;
    if (registros.length === 0) return;

    const featuresUsr = registros
      .map((r: any) => crearFeaturePunto(r, ORIGENES_COORDENADA.usuario))
      .filter((f): f is Feature => f !== null);
    this.usuariosLayer.getSource()!.addFeatures(featuresUsr);

    this.totalSinCoordenadas = registros.length - featuresUsr.length;
    this.ajustarVista(fitBounds);
  }

  private ajustarVista(fitBounds: boolean): void {
    const srcUsuarios = this.usuariosLayer.getSource()!;
    if (srcUsuarios.getFeatures().length === 0) {
      this.avisar("info", "Aviso", "No se encontraron coordenadas para los clientes");
      return;
    }
    if (fitBounds && this.map) {
      const extent = srcUsuarios.getExtent();
      this.map.getView().fit(extent, { duration: 800, maxZoom: 18, padding: [60, 60, 60, 60] });
    }
    this.avisar("success", "Proceso completado", "Clientes cargados en el mapa");
  }

  private limpiarCapas(): void {
    this.usuariosLayer.getSource()?.clear();
    this.totalClientes = 0;
    this.totalSinCoordenadas = 0;
  }

  onFeatureClick(feature: Feature): void {
    this.featureSeleccionado = feature;
    this.clienteSeleccionado = feature.getProperties();
    this.refrescarCapasVector();
  }

  onMapClick(): void {
    this.cerrarPopup();
  }

  cerrarPopup(): void {
    this.clienteSeleccionado = null;
    this.featureSeleccionado = null;
    this.refrescarCapasVector();
  }

  private refrescarCapasVector(): void {
    this.usuariosLayer?.changed();
  }

  abrirStreetView(): void {
    if (!this.clienteSeleccionado) return;
    const coordObj = extraerCoordenada(this.clienteSeleccionado, ORIGENES_COORDENADA["usuario"]);
    if (coordObj) {
      const svUrl = `http://maps.google.com/maps?q=&layer=c&cbll=${coordObj[1]},${coordObj[0]}&cbp=11,0,0,0,0`;
      window.open(svUrl, "StreetView", "width=800,height=600");
    } else {
      this.avisar("warn", "Aviso", "El cliente no tiene coordenadas válidas.");
    }
  }

  buscarCliente(query: string): void {
    if (!this.selectedSucursal) return;

    this.cargando = true;
    this.vmaService.buscarPadronNoDomestico({
      codsuc: this.selectedSucursal.codsuc,
      codcliente: Number(query)
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          if (response?.success && response.data) {
            this.resultadoBusquedaJson = [response.data];
            this.dibujarResultados(true);
            
            const features = this.usuariosLayer.getSource()?.getFeatures();
            if (features && features.length > 0) {
              this.onFeatureClick(features[0]);
            }
            
            this.avisar("success", "Encontrado", `Cliente ${query} encontrado.`);
          } else {
            this.avisar("error", "No encontrado", response?.mensaje || "No existe.");
          }
        },
        error: (err) => {
          this.cargando = false;
          this.avisar("error", "Error", "Problemas de conexión con el servidor");
        }
      });
  }

  limpiarBusquedaCliente(): void {
    this.resultadoBusquedaJson = null;
    this.limpiarCapas();
    this.cerrarPopup();
  }

  private contarElementosEnRadio(circleGeom: any): void {
    const polygon = fromCircle(circleGeom);
    const extent = polygon.getExtent();
    let count = 0;
    const source = this.usuariosLayer.getSource();
    if (source) {
      source.forEachFeatureIntersectingExtent(extent, (feature) => {
        const geom = feature.getGeometry();
        if (geom && polygon.intersectsCoordinate((geom as any).getCoordinates())) {
          count++;
        }
      });
    }
    this.messageService.add({
      severity: 'info',
      summary: 'Selección de Radio',
      detail: `Se encontraron ${count} clientes en el área seleccionada.`
    });
  }
}
