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
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin, of } from "rxjs";
import { catchError, finalize } from "rxjs/operators";
import { DialogService, DynamicDialogModule } from "primeng/dynamicdialog";
import { TooltipModule } from "primeng/tooltip";

import OlMap from "ol/Map";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Feature } from "ol";
import { fromCircle } from "ol/geom/Polygon";

import { MapaVisorComponent } from "../../../shared/components/mapa-visor/mapa-visor.component";
import { MapaPopupClienteComponent } from "../../../shared/components/mapa-popup-cliente/mapa-popup-cliente.component";
import { MapEstilosFactory, RADIOS_LECTURA } from "../../../util/Mapaestilos.factory";
import { crearFeaturePunto, extraerCoordenada } from "../../../util/Geo.utils";
import { FiltroFacturacionAltosConsumidoresRequest } from "@host/_models/vektors/Facturacion/FiltroFacturacionAltosConsumidoresRequest";
import { FacturacionService } from "@host/_servicios/vektors/facturacion.service";
import { ConfigOrigenCoordenada, ORIGENES_COORDENADA } from "../../../config/Controldigitacion.config";

@Component({
  selector: "app-facturacion-clientes-altos-consumidores",
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
  templateUrl: "./facturacion-clientes-altos-consumidores.component.html",
  styleUrl: "./facturacion-clientes-altos-consumidores.component.scss",
  providers: [
    DatePipe,
    MessageService,
    DialogService,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class FacturacionClientesAltosConsumidoresComponent implements OnInit, OnDestroy {
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
  anios: any[] = [];
  meses: any[] = [];

  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: any = null;
  selectedEstadoServicio: any = null;
  selectedTipoServicio: any = null;
  selectedTarifa: any = null;
  selectedAnio: any = null;
  selectedMes: any = null;

  usuariosLayer = new VectorLayer({
    source: new VectorSource(),
    style: (feature) => {
      const zoom = this.map?.getView().getZoom() ?? 15;
      return this.estilos.punto({
        forma: 'circulo',
        color: '#dc2626', 
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
    private facturacionService: FacturacionService,
    private consulGenericService: ConsulGenericService,
    private sucursalesService: SucursalesService,
    private sectoresCicloService: SectoresCicloService,
    private tarifasService: TarifasService,
    private messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.cargarCombosEstaticos();
    this.cargarCombosDinamicos();
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
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= 2020; i--) {
      this.anios.push({ label: i.toString(), value: i.toString() });
    }
    this.selectedAnio = this.anios[0].value;

    this.meses = [
      { label: 'Enero', value: '01' },
      { label: 'Febrero', value: '02' },
      { label: 'Marzo', value: '03' },
      { label: 'Abril', value: '04' },
      { label: 'Mayo', value: '05' },
      { label: 'Junio', value: '06' },
      { label: 'Julio', value: '07' },
      { label: 'Agosto', value: '08' },
      { label: 'Septiembre', value: '09' },
      { label: 'Octubre', value: '10' },
      { label: 'Noviembre', value: '11' },
      { label: 'Diciembre', value: '12' },
    ];
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    this.selectedMes = currentMonth;
  }

  private cargarCombosDinamicos(): void {
    this.cargando = true;

    forkJoin({
      ciclos: this.consulGenericService.getconsultaService("CCO", "ALL", "ALL", "ALL").pipe(catchError(() => of<any[]>(([])))),
      estados: this.consulGenericService.getconsultaService("TES", "ALL", "ALL", "ALL").pipe(catchError(() => of<any[]>(([])))),
      tiposServ: this.consulGenericService.getconsultaService("TSE", "ALL", "ALL", "ALL").pipe(catchError(() => of<any[]>(([]))))
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

        this.selectedEstadoServicio = "ALL";
        this.selectedTipoServicio = "ALL";
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
    const codCiclo = this.selectedCiclo.codigo || this.selectedCiclo.idcodigogeneral || this.selectedCiclo.codciclo;

    this.sucursalesService
      .drop_sucursales_x_ciclo(codCiclo)
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

    const codCiclo = this.selectedCiclo.codigo || this.selectedCiclo.idcodigogeneral || this.selectedCiclo.codciclo;

    this.sectoresCicloService
      .drop_sectores_x_ciclo(this.selectedSucursal.codsuc, codCiclo)
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
    return this.listaEstadoServicio?.find(e => e.codigo === this.selectedEstadoServicio || e.idcodigogeneral === this.selectedEstadoServicio)?.descripcion ?? "TODOS";
  }

  getDescTipoServicio(): string {
    return this.listaTipoServicio?.find(e => e.codigo === this.selectedTipoServicio || e.idcodigogeneral === this.selectedTipoServicio)?.descripcion ?? "TODOS";
  }

  getDescTarifa(): string {
    const tarifa = this.listaTarifas?.find(e => e.catetar === this.selectedTarifa);
    return tarifa ? tarifa.nomtar : '';
  }

  procesar(): void {
    this.limpiarCapas();
    this.cerrarPopup();

    if (!this.selectedCiclo || !this.selectedSucursal) {
      this.avisar("warn", "Faltan filtros", "Seleccione ciclo y sucursal como mínimo.");
      return;
    }

    this.cargando = true;
    const toPercent = (val: any) => (!val || val === "ALL" || val === "") ? "%" : val;

    const codCiclo = this.selectedCiclo.codigo || this.selectedCiclo.idcodigogeneral || this.selectedCiclo.codciclo;

    const filtro: FiltroFacturacionAltosConsumidoresRequest = {
      codciclo: toPercent(codCiclo),
      codsuc: toPercent(this.selectedSucursal.codsuc),
      codsector: toPercent(this.selectedSector?.codsector),
      codest: toPercent(this.selectedEstadoServicio),
      anio: toPercent(this.selectedAnio),
      mes: toPercent(this.selectedMes),
      tipserv: toPercent(this.selectedTipoServicio),
      catet: toPercent(this.selectedTarifa)
    };

    this.facturacionService.listarFacturacionAltosConsumidores(filtro)
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
          console.error("Error consultando altos consumidores:", err);
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
    if (registros.length === 0) {
        this.avisar("info", "Aviso", "No se encontraron resultados.");
        return;
    }

    registros.forEach((r: any) => {
      ['lon', 'lat', 'longitud', 'latitud', 'lonpredio', 'latpredio', 'coord_x', 'coord_y'].forEach(key => {
         if (typeof r[key] === 'string' && r[key].includes(',')) {
            r[key] = r[key].replace(',', '.');
         }
      });
    });

    const featuresUsr = registros
      .map((r: any) => crearFeaturePunto(r, ORIGENES_COORDENADA.usuario))
      .filter((f): f is Feature => f !== null);
    
    this.usuariosLayer.getSource()!.addFeatures(featuresUsr);

    this.totalSinCoordenadas = registros.length - featuresUsr.length;

    if (this.totalSinCoordenadas === this.totalClientes) {
      const sample = registros[0] || {};
      const keys = Object.keys(sample).filter(k => k.toLowerCase().includes('lon') || k.toLowerCase().includes('lat') || k.toLowerCase().includes('coord') || k.toLowerCase().includes('x') || k.toLowerCase().includes('y')).join(', ');
      this.avisar("warn", "Sin Coordenadas", `Revisa la consola. Posibles campos: ${keys || 'Ninguno encontrado'}`);
    }

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
    
    let props = feature.getProperties();
    if(props['actinac']) {
       props['actinac_str'] = props['actinac'] === 'A' ? 'ACTIVO' : 'INACTIVO';
    }
    
    this.clienteSeleccionado = props;
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
    this.facturacionService.buscarFacturacionAltosConsumidores({
      codisuc: this.selectedSucursal.codsuc,
      mes: this.selectedMes,
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
