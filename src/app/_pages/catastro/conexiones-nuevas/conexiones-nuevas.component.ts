import {
  Component,
  AfterViewInit,
  OnInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  ViewChild,
  ElementRef,
  inject,
} from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { volverAlMainGeoreferencia } from "../../../shared/utils/navegacion.utils";
import { ButtonModule } from "primeng/button";
import { ToastModule } from "primeng/toast";
import { DropdownModule } from "primeng/dropdown";
import { InputTextModule } from "primeng/inputtext";
import { CalendarModule } from "primeng/calendar";
import { MessageService } from "primeng/api";
import { CatastroService } from "@host/_servicios/vektors/catastro.service";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { SectoresCicloService } from "@host/_servicios/seguridad/sectores-ciclo.service";
import { TarifasService } from "@host/_servicios/catastro/tarifas.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin, of, Subject, Subscription } from "rxjs";
import { catchError, takeUntil } from "rxjs/operators";

import OlMap from "ol/Map";
import TileLayer from "ol/layer/Tile";
import BaseLayer from "ol/layer/Base";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import View from "ol/View";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import { containsCoordinate, createEmpty, extend, Extent, getCenter, isEmpty } from "ol/extent";
import { transform } from "ol/proj";
import Zoom from "ol/control/Zoom";
import { Fill, Stroke, Style } from "ol/style";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";

import { ORIGENES_COORDENADA } from "../../../shared/constantes/coordenadas";
import {
  CapaConsultable,
  ConsultaCapasGisService,
  DescargaShapeGisService,
  GisConfigService,
  WGS84,
} from "../../../core/gis";
import { observarTamanoMapa } from "../../../shared/mapa/observar-tamano-mapa";
import {
  MapEstilosFactory,
  RADIOS_LECTURA,
} from "../../../shared/mapa/mapa-estilos";
import { estaUsandoHerramientas } from "../../../shared/mapa/herramientas-medicion";
import { MARCA_CAPA_RESALTADO } from "../../../shared/mapa/interaccion-gis";
import { ControladorMapaGis } from "../../../shared/mapa/controlador-mapa-gis";
import { PanelesMapaGisComponent } from "../../../shared/components/paneles-mapa-gis/paneles-mapa-gis.component";
import { ColumnaListado, FilaListado } from "../../../shared/utils/listado-excel";
import { CapaShape, ColumnaShape } from "../../../shared/utils/shapefile";
import { ExcelService } from "@host/_servicios/reportes/excel.service";
import { crearFeaturePunto, extraerCoordenada } from "../../../shared/mapa/geo.utils";
import { FiltroConexionesNuevasRequest } from "@host/_models/vektors/Catastro/FiltroConexionesNuevasRequest";
import { CapasSidebarComponent } from "../../../shared/components/capas-sidebar/capas-sidebar.component";
import { crearCapaWms, crearCapaOsm, crearCapaSatelital, CAPAS_BASE_UI } from "../../../shared/mapa/capas";
import { coordenadaLonLat, abrirGoogleStreetView } from "../../../shared/mapa/street-view";
import { abrirConsultaUsuario } from "../../../shared/dialogos/consulta-usuario.dialog";
import { abrirVistaPreviaShape } from "../../../shared/dialogos/vista-previa-shape.dialog";
import { grupoDeEstadoServicio } from "../../../shared/constantes/estados-servicio";
import {
  contarPorGrupo,
  EntradaLeyenda,
  fondoMuestra,
  GrupoLeyenda,
  LeyendaGruposComponent,
} from "../../../shared/components/leyenda-grupos/leyenda-grupos.component";

// Relleno del lote semitransparente: debajo se siguen viendo las calles y el número del lote.
const OPACIDAD_RELLENO_LOTE = 0.45;

function colorConOpacidad(colorHexadecimal: string, opacidad: number): string {
  const valor = parseInt(colorHexadecimal.replace("#", ""), 16);
  return `rgba(${(valor >> 16) & 255}, ${(valor >> 8) & 255}, ${valor & 255}, ${opacidad})`;
}

const COLUMNAS_TABLA_CONEXIONES: ColumnaListado[] = [
  { campo: "codcliente", titulo: "Cód. cliente", anchoExcel: 12 },
  { campo: "cliente", titulo: "Titular", anchoExcel: 35 },
  { campo: "direccionCompleta", titulo: "Dirección", anchoExcel: 35 },
  { campo: "fechaingreso", titulo: "Fecha ingreso", anchoExcel: 12 },
  { campo: "codsector", titulo: "Sector", anchoExcel: 8 },
  { campo: "codmza", titulo: "Mza", anchoExcel: 8 },
  { campo: "nrolote", titulo: "Lote", anchoExcel: 8 },
  { campo: "categoria", titulo: "Categoría", anchoExcel: 22 },
  { campo: "unidtarifa", titulo: "Unidades de uso", anchoExcel: 16 },
  { campo: "tiposervicio", titulo: "Tipo de servicio", anchoExcel: 18 },
  { campo: "estadodeserv", titulo: "Estado del servicio", anchoExcel: 18 },
  { campo: "actividad", titulo: "Actividad", anchoExcel: 22 },
  { campo: "nromedidor", titulo: "Medidor", anchoExcel: 15 },
];

// Los nombres de columna de un .dbf no pasan de 10 caracteres. El DNI no sale: es dato personal.
const COLUMNAS_SHAPE_CONEXIONES: ColumnaShape[] = [
  { nombre: "codcliente", campo: "codcliente" },
  { nombre: "titular", campo: "cliente" },
  { nombre: "direccion", campo: "direccionCompleta" },
  { nombre: "f_ingreso", campo: "fechaingreso" },
  { nombre: "sector", campo: "codsector" },
  { nombre: "manzana", campo: "codmza" },
  { nombre: "lote", campo: "nrolote" },
  { nombre: "categoria", campo: "categoria" },
  { nombre: "unidades", campo: "unidtarifa" },
  { nombre: "tipo_serv", campo: "tiposervicio" },
  { nombre: "estado", campo: "estadodeserv" },
  { nombre: "actividad", campo: "actividad" },
  { nombre: "medidor", campo: "nromedidor" },
];

@Component({
  selector: "app-conexiones-nuevas",
  standalone: true,
  imports: [
    CapasSidebarComponent,
    PanelesMapaGisComponent,
    CommonModule,
    FormsModule,
    ButtonModule,
    ToastModule,
    DropdownModule,
    InputTextModule,
    CalendarModule,
    LeyendaGruposComponent,
  ],
  templateUrl: "./conexiones-nuevas.component.html",
  styleUrl: "./conexiones-nuevas.component.scss",
  providers: [MessageService, DialogService, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConexionesNuevasComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private readonly destroyRef = inject(DestroyRef);

  private readonly cicloCambiado = new Subject<void>();
  private readonly sucursalCambiada = new Subject<void>();
  private readonly gis = inject(GisConfigService);
  private readonly consultaCapasGis = inject(ConsultaCapasGisService);
  private readonly descargaShapeGis = inject(DescargaShapeGisService);
  private readonly excelService = inject(ExcelService);
  private readonly router = inject(Router);
  private readonly datePipe = inject(DatePipe);
  controladorGis?: ControladorMapaGis;
  private readonly estilos = new MapEstilosFactory();

  volverAlMain(): void {
    volverAlMainGeoreferencia(this.router);
  }
  private detenerObservadorMapa?: () => void;

  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;
  @ViewChild("mapContainer", { static: false })
  private mapContainer!: ElementRef<HTMLDivElement>;

  map!: OlMap;
  conexionesLayer!: VectorLayer<VectorSource>;
  lotesConexionesLayer!: VectorLayer<VectorSource>;
  lotesLayer!: TileLayer<TileWMS>;
  sectoresComercialesLayer!: TileLayer<TileWMS>;
  callesLayer!: TileLayer<TileWMS>;
  manzanasLayer!: TileLayer<TileWMS>;
  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;

  private registroCapas: Record<string, BaseLayer> = {};
  private capasVector: VectorLayer<VectorSource>[] = [];

  filtrosVisible = false;
  baseActive: string | null = "osm";
  cargando = false;
  descargandoShape = false;

  resultadoBusquedaJson: any[] = [];
  totalConexiones = 0;
  totalSinCoordenadas = 0;

  entradasLeyenda: EntradaLeyenda[] = [];
  /** Estado elegido en la leyenda: el mapa muestra solo ese y lo encuadra. `null` = todos. */
  grupoFiltrado: string | null = null;
  mostrarLeyenda = true;
  cargandoLotes = false;
  private busquedaLotes?: Subscription;

  dataCiclos: any[] = [];
  listaSucursales: any[] = [];
  listaSectores: any[] = [];
  listaEstadoServicio: any[] = [];
  listaTipoServicio: any[] = [];
  listaTramiteIngreso: any[] = [];
  listaTarifas: any[] = [];
  listaActividades: any[] = [];

  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: any = null;
  selectedEstadoServicio: any = null;
  selectedTipoServicio: any = null;
  selectedTramiteIngreso: any = null;
  selectedTarifa: any = null;
  selectedActividad: any = null;
  fechaInicial: Date = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  fechaFinal: Date = new Date();

  mostrarSearchPanel = false;
  searchCodCliente = "";
  isBusquedaClienteActiva = false;
  resultadoBusquedaOriginalJson: any[] | undefined = undefined;

  conexionSeleccionada: any = null;
  featureSeleccionado: Feature | null = null;
  ref: DynamicDialogRef | undefined;

  readonly baseLayers = CAPAS_BASE_UI;

  commercialLayers = [
    { id: "conexiones", label: "Conexiones nuevas", active: true },
    { id: "lotesConexiones", label: "Lotes de las conexiones", active: true },
    { id: "lotes", label: "Lotes", active: true },
    { id: "sectores", label: "Sectores Comerciales", active: false },
    { id: "manzanas", label: "Manzanas", active: false },
    { id: "calles", label: "Calles", active: false },
  ];

  constructor(
    private catastroService: CatastroService,
    private consulGenericService: ConsulGenericService,
    private sucursalesService: SucursalesService,
    private sectoresCicloService: SectoresCicloService,
    private tarifasService: TarifasService,
    private messageService: MessageService,
    private dialogService: DialogService,
  ) {}

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);
    this.crearMapa();

    forkJoin({
      ciclos: this.consulGenericService
        .getconsultaService("CCO", "ALL", "ALL", "ALL")
        .pipe(catchError(() => of<any[]>([]))),
      estadoServicio: this.consulGenericService
        .getconsultaService("TES", "ALL", "ALL", "ALL")
        .pipe(catchError(() => of<any[]>([]))),
      tipoServicio: this.consulGenericService
        .getconsultaService("TSE", "ALL", "ALL", "ALL")
        .pipe(catchError(() => of<any[]>([]))),
      tramiteIngreso: this.consulGenericService
        .getconsultaService("TTI", "ALL", "ALL", "ALL")
        .pipe(catchError(() => of<any[]>([]))),
      actividades: this.consulGenericService
        .getconsultaService("TAC", "ALL", "ALL", "ALL")
        .pipe(catchError(() => of<any[]>([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ ciclos, estadoServicio, tipoServicio, tramiteIngreso, actividades }) => {
          this.dataCiclos = [
            { codigo: "ALL", descripcion: "TODOS", codemp: "ALL", estareg: 1 },
            ...ciclos,
          ];
          if (this.dataCiclos.length > 0) {
            this.selectedCiclo = this.dataCiclos[1] || this.dataCiclos[0];
            this.onCicloChange();
          }

          this.listaEstadoServicio = [{ codigo: "ALL", descripcion: "TODOS" }, ...estadoServicio];
          this.selectedEstadoServicio = "ALL";

          this.listaTipoServicio = [{ codigo: "ALL", descripcion: "TODOS" }, ...tipoServicio];
          this.selectedTipoServicio = "ALL";

          this.listaTramiteIngreso = [{ codigo: "ALL", descripcion: "TODOS" }, ...tramiteIngreso];
          this.selectedTramiteIngreso = "ALL";

          this.listaActividades = [{ codigo: "ALL", descripcion: "TODOS" }, ...actividades];
          this.selectedActividad = "ALL";
        },
        error: (err) => {
          console.error("Error cargando catálogos iniciales:", err);
          this.avisar(
            "error",
            "Error",
            "Error al cargar catálogos iniciales. Revisa tu conexión.",
          );
        },
      });
  }

  onCicloChange(): void {
    this.cicloCambiado.next();
    this.sucursalCambiada.next();
    this.selectedSucursal = null;
    this.selectedSector = null;
    this.listaSucursales = [];
    this.listaSectores = [];
    this.listaTarifas = [];
    if (!this.selectedCiclo) return;

    this.sucursalesService
      .drop_sucursales_x_ciclo(this.selectedCiclo.codigo)
      .pipe(takeUntil(this.cicloCambiado), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.listaSucursales = data || [];
          if (this.listaSucursales.length > 0) {
            this.selectedSucursal = this.listaSucursales[0];
            this.onSucursalChange();
          }
        },
        error: (err) => {
          console.error("Error al cargar sucursales:", err);
          this.listaSucursales = [];
        },
      });
  }

  onSucursalChange(): void {
    this.sucursalCambiada.next();
    this.selectedSector = null;
    this.selectedTarifa = null;
    this.listaSectores = [];
    this.listaTarifas = [];

    if (!this.selectedSucursal) return;

    this.tarifasService
      .drop(this.selectedSucursal.codsuc)
      .pipe(takeUntil(this.sucursalCambiada), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          const tarifasUnicas = (data || []).filter(
            (tarifa: any, indice: number, todas: any[]) =>
              indice === todas.findIndex((otra) => otra.nomtar === tarifa.nomtar),
          );
          this.listaTarifas = [{ catetar: "ALL", nomtar: "TODOS", codigo: "ALL" }, ...tarifasUnicas];
          this.selectedTarifa = "ALL";
        },
        error: (err) => console.error("Error al cargar tarifas:", err),
      });

    if (this.selectedSucursal.codsuc === "ALL" || this.selectedCiclo.codigo === "ALL") {
      this.listaSectores = [{ codsector: "ALL", descripcion: "TODOS" }];
      this.selectedSector = this.listaSectores[0];
      return;
    }

    this.sectoresCicloService
      .drop_sectores_x_ciclo(this.selectedSucursal.codsuc, this.selectedCiclo.codigo)
      .pipe(takeUntil(this.sucursalCambiada), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.listaSectores = [{ codsector: "ALL", descripcion: "TODOS" }, ...(data || [])];
          this.selectedSector = this.listaSectores[0];
        },
        error: (err) => {
          console.error("Error al cargar sectores:", err);
          this.listaSectores = [{ codsector: "ALL", descripcion: "TODOS" }];
          this.selectedSector = this.listaSectores[0];
        },
      });
  }

  getDescEstadoServicio(): string {
    return this.listaEstadoServicio?.find((e) => e.codigo === this.selectedEstadoServicio)?.descripcion ?? "TODOS";
  }

  getDescTipoServicio(): string {
    return this.listaTipoServicio?.find((e) => e.codigo === this.selectedTipoServicio)?.descripcion ?? "TODOS";
  }

  getDescTramiteIngreso(): string {
    return this.listaTramiteIngreso?.find((e) => e.codigo === this.selectedTramiteIngreso)?.descripcion ?? "TODOS";
  }

  getDescTarifa(): string {
    return this.listaTarifas?.find((e) => e.catetar === this.selectedTarifa)?.nomtar ?? "TODOS";
  }

  getDescActividad(): string {
    return this.listaActividades?.find((e) => e.codigo === this.selectedActividad)?.descripcion ?? "TODOS";
  }

  get hayRangoDeFechasValido(): boolean {
    return !!this.fechaInicial && !!this.fechaFinal && this.fechaInicial <= this.fechaFinal;
  }

  procesar(): void {
    if (!this.selectedCiclo || !this.selectedSucursal) {
      this.avisar("warn", "Aviso de usuario", "Debe seleccionar Ciclo y Sucursal");
      return;
    }
    if (!this.hayRangoDeFechasValido) {
      this.avisar("warn", "Aviso de usuario", "La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }

    this.cargando = true;
    const toNull = (valor: any) => (!valor || valor === "ALL" ? null : valor);

    const filtro: FiltroConexionesNuevasRequest = {
      codciclo: toNull(this.selectedCiclo.codigo),
      codsuc: toNull(this.selectedSucursal.codsuc),
      codsector: toNull(this.selectedSector?.codsector),
      estadoservicio: toNull(this.selectedEstadoServicio),
      tiposervicio: toNull(this.selectedTipoServicio),
      catetar: toNull(this.selectedTarifa),
      fechaini: this.datePipe.transform(this.fechaInicial, "yyyy-MM-dd 00:00")!,
      fechafin: this.datePipe.transform(this.fechaFinal, "yyyy-MM-dd 23:59")!,
      codtipotramiteing: toNull(this.selectedTramiteIngreso),
      actividad: toNull(this.selectedActividad),
    };

    this.catastroService
      .listarConexionesNuevas(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          this.filtrosVisible = false;
          if (!response.success) {
            this.resultadoBusquedaJson = [];
            this.limpiarCapas();
            this.avisar("error", "Error", this.mensajeDeError(response.mensaje));
            return;
          }
          if (response.data && response.data.length > 0) {
            this.resultadoBusquedaJson = response.data;
            this.actualizarCapasComerciales();
          } else {
            this.resultadoBusquedaJson = [];
            this.limpiarCapas();
            this.avisar("info", "Resultados", "No se encontraron conexiones nuevas con los filtros seleccionados");
          }
        },
        error: (err) => {
          console.error("Error al cargar conexiones nuevas:", err);
          this.cargando = false;
          this.limpiarCapas();
          this.resultadoBusquedaJson = [];
          this.avisar("error", "Error", "Ocurrió un error al cargar las conexiones nuevas");
        },
      });
  }

  limpiar(): void {
    this.selectedCiclo = this.dataCiclos[1] || this.dataCiclos[0];
    this.onCicloChange();
    this.selectedEstadoServicio = "ALL";
    this.selectedTipoServicio = "ALL";
    this.selectedTramiteIngreso = "ALL";
    this.selectedActividad = "ALL";
    this.fechaInicial = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    this.fechaFinal = new Date();
    this.limpiarCapas();
    this.resultadoBusquedaJson = [];
  }

  private actualizarCapasComerciales(fitBounds = true): void {
    this.estilos.limpiar();
    this.limpiarCapas();

    const registros = this.resultadoBusquedaJson || [];
    this.totalConexiones = registros.length;
    if (registros.length === 0) return;

    const puntos = registros
      .map((registro) => {
        const punto = crearFeaturePunto(registro, ORIGENES_COORDENADA.usuario);
        punto?.set("_grupo", grupoDeEstadoServicio(registro.estadodeserv));
        return punto;
      })
      .filter((feature): feature is Feature => feature !== null);
    this.conexionesLayer.getSource()!.addFeatures(puntos);
    this.entradasLeyenda = contarPorGrupo(registros.map((registro) => grupoDeEstadoServicio(registro.estadodeserv)));
    this.pintarLotes(registros);

    this.totalSinCoordenadas = registros.length - puntos.length;

    this.ajustarVista(fitBounds);
  }

  private ajustarVista(fitBounds: boolean): void {
    const origenConexiones = this.conexionesLayer.getSource()!;

    if (origenConexiones.getFeatures().length === 0) {
      this.avisar("info", "Aviso", "No se encontraron coordenadas para las conexiones");
      return;
    }

    if (fitBounds) {
      this.map
        .getView()
        .fit(origenConexiones.getExtent(), { duration: 800, maxZoom: 18, padding: [60, 60, 60, 60] });
    }
    this.avisar("success", "Proceso completado", "Conexiones nuevas cargadas en el mapa");
  }

  private limpiarCapas(): void {
    this.capasVector.forEach((capa) => capa?.getSource()?.clear());
    this.controladorGis?.descartarListado();
    this.totalConexiones = 0;
    this.totalSinCoordenadas = 0;
    this.busquedaLotes?.unsubscribe();
    this.cargandoLotes = false;
    this.entradasLeyenda = [];
    this.grupoFiltrado = null;
  }

  /** Trae del GIS el polígono del lote de cada conexión y lo pinta con el color de su estado. */
  private pintarLotes(registros: any[]): void {
    this.busquedaLotes?.unsubscribe();
    const grupoPorCliente = new Map<string, GrupoLeyenda>();
    registros.forEach((registro) =>
      grupoPorCliente.set(String(registro.codcliente), grupoDeEstadoServicio(registro.estadodeserv)),
    );
    if (grupoPorCliente.size === 0) return;

    this.cargandoLotes = true;
    this.busquedaLotes = this.consultaCapasGis
      .buscarPrediosDeClientes(Array.from(grupoPorCliente.keys()), this.gis.proyeccionMapa)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lotes) => {
        this.cargandoLotes = false;
        const features: Feature[] = [];
        lotes.forEach((geometria, codigo) =>
          features.push(new Feature({ geometry: geometria, codcliente: Number(codigo), _grupo: grupoPorCliente.get(codigo) })),
        );
        this.lotesConexionesLayer.getSource()!.addFeatures(features);
      });
  }

  /** Como los estados de Seguimiento de programa: clic filtra y lleva al grupo, otro clic vuelve a todos. */
  filtrarPorGrupo(clave: string): void {
    this.grupoFiltrado = this.grupoFiltrado === clave ? null : clave;
    const grupoSeleccionado = this.featureSeleccionado?.get("_grupo") as GrupoLeyenda | undefined;
    if (this.grupoFiltrado && grupoSeleccionado && grupoSeleccionado.clave !== this.grupoFiltrado) this.cerrarPopup();
    this.refrescarCapasVector();

    const extension = createEmpty();
    [this.lotesConexionesLayer, this.conexionesLayer].forEach((capa) =>
      capa.getSource()!.getFeatures().forEach((feature) => {
        const grupo = feature.get("_grupo") as GrupoLeyenda | undefined;
        if (grupo && (!this.grupoFiltrado || grupo.clave === this.grupoFiltrado)) {
          extend(extension, feature.getGeometry()!.getExtent());
        }
      }),
    );
    if (!isEmpty(extension)) {
      this.map.getView().fit(extension, { duration: 700, maxZoom: 19, padding: [120, 120, 120, 340] });
    }
  }

  /** Muestra de color del estado de servicio, igual que en la leyenda del GIS. */
  fondoEstado(estado: unknown): string {
    return fondoMuestra(grupoDeEstadoServicio(estado));
  }

  ngAfterViewInit(): void {
    this.capasSidebar?.conectarMapa(this.map);

    requestAnimationFrame(() => {
      const elemento = this.mapContainer?.nativeElement;
      if (!elemento) return;
      this.map.setTarget(elemento);
      this.map.updateSize();
      this.detenerObservadorMapa = observarTamanoMapa(this.map, elemento);
    });
  }

  ngOnDestroy(): void {
    this.detenerObservadorMapa?.();
    this.controladorGis?.destruir();
    this.map?.setTarget(undefined);
    this.ref?.close();
  }

  toggleFiltros(): void {
    this.filtrosVisible = !this.filtrosVisible;
  }

  abrirBusqueda(): void {
    this.mostrarSearchPanel = true;
    this.searchCodCliente = "";
  }

  cerrarBusqueda(): void {
    this.mostrarSearchPanel = false;
    this.reiniciarBusqueda();
  }

  reiniciarBusqueda(): void {
    this.searchCodCliente = "";
    this.controladorGis?.quitarPredio();
    if (this.isBusquedaClienteActiva) {
      this.isBusquedaClienteActiva = false;
      if (this.resultadoBusquedaOriginalJson !== undefined) {
        this.resultadoBusquedaJson = this.resultadoBusquedaOriginalJson;
        this.resultadoBusquedaOriginalJson = undefined;
      }
      this.actualizarCapasComerciales();
    }
  }

  buscarPorCodCliente(): void {
    const codigo = String(this.searchCodCliente || "").trim();
    if (!codigo) {
      this.reiniciarBusqueda();
      return;
    }

    const registroCargado = (this.resultadoBusquedaOriginalJson ?? this.resultadoBusquedaJson).find(
      (registro: any) => String(registro.codcliente ?? "").trim() === codigo,
    );

    if (registroCargado) {
      this.mostrarSoloConexion(registroCargado, codigo);
      return;
    }

    if (!this.selectedSucursal || this.selectedSucursal.codsuc === "ALL") {
      this.avisar("warn", "Aviso", "Seleccione una sucursal para buscar un cliente que no está en el mapa.");
      return;
    }

    this.cargando = true;
    this.catastroService
      .buscarConexionNueva({ codsuc: this.selectedSucursal.codsuc, codcliente: Number(codigo) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          if (!response.success) {
            this.avisar("error", "Error", this.mensajeDeError(response.mensaje));
            return;
          }
          if (response.data) {
            this.searchCodCliente = "";
            this.mostrarSoloConexion(response.data, codigo);
          } else {
            this.avisar("warn", "Aviso", "No se encontró un cliente con ese código.");
          }
        },
        error: () => {
          this.cargando = false;
          this.avisar("error", "Error", "Ocurrió un error al buscar el cliente.");
        },
      });
  }

  /** Deja en el mapa solo ese cliente, recordando el resultado anterior para poder volver. */
  private mostrarSoloConexion(registro: any, codigo: string): void {
    if (!this.isBusquedaClienteActiva) {
      this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
      this.isBusquedaClienteActiva = true;
    }
    this.resultadoBusquedaJson = [registro];
    this.actualizarCapasComerciales(false);

    const coordenada = extraerCoordenada(registro, ORIGENES_COORDENADA.usuario);
    if (coordenada) {
      this.map.getView().animate({ center: coordenada, zoom: 21, duration: 700 });
    }
    const punto = this.buscarPunto(codigo);
    if (punto) this.seleccionarFeature(punto);
    this.controladorGis?.marcarPredio(codigo);
  }

  private buscarPunto(codigo: string): Feature | undefined {
    return this.conexionesLayer
      ?.getSource()
      ?.getFeatures()
      .find((feature) => String(feature.get("codcliente") ?? "").trim() === codigo);
  }

  // MAPA

  private crearMapa(): void {
    this.osmLayer = crearCapaOsm(this.baseActive === "osm");
    this.satelitalLayer = crearCapaSatelital(this.baseActive === "satelital");

    this.lotesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("lotes"), true);
    this.sectoresComercialesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("sectoresComerciales"), false);
    this.callesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("calles"), false);
    this.manzanasLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("manzanas"), false);

    const zoomActual = () => this.map?.getView().getZoom() ?? 14;

    const grupoVisible = (feature: { get: (clave: string) => unknown }) => {
      const grupo = feature.get("_grupo") as GrupoLeyenda | undefined;
      return grupo && (!this.grupoFiltrado || grupo.clave === this.grupoFiltrado) ? grupo : null;
    };

    this.conexionesLayer = new VectorLayer({
      source: new VectorSource(),
      visible: true,
      zIndex: 20,
      style: (feature) => {
        const grupo = grupoVisible(feature);
        if (!grupo) return undefined;
        return this.estilos.punto({
          forma: "circulo",
          color: grupo.color,
          zoom: zoomActual(),
          seleccionado: feature === this.featureSeleccionado,
          etiqueta: feature.get("codcliente"),
          ...RADIOS_LECTURA,
        });
      },
    });

    // La conexión proyectada va con borde punteado, como el rayado del GIS.
    this.lotesConexionesLayer = new VectorLayer({
      source: new VectorSource(),
      visible: true,
      zIndex: 10,
      style: (feature) => {
        const grupo = grupoVisible(feature);
        if (!grupo) return undefined;
        const seleccionado = feature.get("codcliente") === this.featureSeleccionado?.get("codcliente");
        return [
          new Style({ stroke: new Stroke({ color: "rgba(255, 255, 255, 0.9)", width: seleccionado ? 6 : 3 }) }),
          new Style({
            fill: new Fill({ color: colorConOpacidad(grupo.color, seleccionado ? 0.7 : OPACIDAD_RELLENO_LOTE) }),
            stroke: new Stroke({
              color: grupo.rayado ? "#1f2937" : grupo.color,
              width: seleccionado ? 3 : 1.5,
              lineDash: grupo.rayado ? [4, 3] : undefined,
            }),
          }),
        ];
      },
    });

    this.capasVector = [this.conexionesLayer, this.lotesConexionesLayer];

    this.registroCapas = {
      conexiones: this.conexionesLayer,
      lotesConexiones: this.lotesConexionesLayer,
      lotes: this.lotesLayer,
      sectores: this.sectoresComercialesLayer,
      calles: this.callesLayer,
      manzanas: this.manzanasLayer,
    };

    this.map = new OlMap({
      layers: [
        this.osmLayer,
        this.satelitalLayer,
        this.manzanasLayer,
        this.lotesLayer,
        this.sectoresComercialesLayer,
        this.callesLayer,
        this.lotesConexionesLayer,
        this.conexionesLayer,
      ],
      view: new View({
        projection: this.gis.proyeccionMapa,
        center: this.gis.vista.centro,
        zoom: this.gis.vista.zoom,
      }),
      controls: [new Zoom()],
    });

    this.controladorGis = new ControladorMapaGis(this.map, {
      consulta: this.consultaCapasGis,
      gis: this.gis,
      capasComerciales: () => this.capasComercialesConsultables(),
      capasTecnicas: () => this.capasSidebar?.capasTecnicasConsultables() ?? [],
      avisar: (detalle) => this.avisar("info", "Aviso", detalle),
      listado: {
        columnas: COLUMNAS_TABLA_CONEXIONES,
        tituloReporte: "PADRÓN DE CONEXIONES NUEVAS INSTALADAS",
        nombreArchivo: "conexiones_nuevas_area_",
        origen: ORIGENES_COORDENADA.usuario,
        registros: () => this.resultadoBusquedaJson ?? [],
        aFila: (registro) => this.aFilaTabla(registro),
        subcabecera: () => this.subcabeceraReporte(),
        excelService: this.excelService,
      },
    });

    this.initClick();
  }

  private capasComercialesConsultables(): CapaConsultable[] {
    return [
      { rol: "lotes", capa: this.lotesLayer },
      { rol: "calles", capa: this.callesLayer },
      { rol: "manzanas", capa: this.manzanasLayer },
      { rol: "sectoresComerciales", capa: this.sectoresComercialesLayer },
    ];
  }

  private subcabeceraReporte(): string[] {
    return [
      `Ciclo: ${this.selectedCiclo?.descripcion ?? "-"}`,
      `Sucursal: ${this.selectedSucursal?.nombre ?? "-"}`,
      `Sector: ${this.selectedSector?.descripcion ?? "-"}`,
      `Del ${this.datePipe.transform(this.fechaInicial, "dd/MM/yyyy")} al ${this.datePipe.transform(this.fechaFinal, "dd/MM/yyyy")}`,
    ];
  }

  setBaseLayer(id: string): void {
    this.baseActive = id;
    this.osmLayer.setVisible(id === "osm");
    this.satelitalLayer.setVisible(id === "satelital");
  }

  toggleCommercialLayer(opcionCapa: any): void {
    opcionCapa.active = !opcionCapa.active;
    this.registroCapas[opcionCapa.id]?.setVisible(opcionCapa.active);
  }

  onSidebarToggle(): void {
    setTimeout(() => this.map?.updateSize(), 300);
  }

  private initClick(): void {
    this.map.on("singleclick", (evento) => {
      if (estaUsandoHerramientas(this.map)) return;
      const feature = this.map.forEachFeatureAtPixel(evento.pixel, (f) => f, {
        hitTolerance: 5,
        layerFilter: (capa: any) => !capa.get("isDrawLayer") && !capa.get(MARCA_CAPA_RESALTADO),
      }) as Feature | undefined;

      if (feature) {
        this.seleccionarFeature(feature);
      } else {
        this.cerrarPopup();
        this.controladorGis?.consultarPunto(evento.coordinate);
      }
    });
  }

  private aFilaTabla(registro: Record<string, unknown>): FilaListado {
    const direccionCompleta = [registro["direccion"], registro["nrocalle"]]
      .filter((parte) => parte !== null && parte !== undefined && String(parte).trim() !== "")
      .join(" ");
    return { ...registro, direccionCompleta };
  }

  ubicarFilaEnMapa(fila: FilaListado): void {
    const codigo = String(fila["codcliente"] ?? "").trim();
    const punto = this.buscarPunto(codigo);
    if (!punto) {
      this.avisar("warn", "Aviso", `El cliente ${codigo} no tiene coordenadas para ubicarlo.`);
      return;
    }
    this.seleccionarFeature(punto);
    this.controladorGis?.encuadrarEnZonaLibre(punto.getGeometry()!.getExtent());
  }

  // Los dos popups ocupan el mismo lugar: abrir el de la conexión cierra el de GIS.
  private seleccionarFeature(feature: Feature): void {
    this.controladorGis?.cerrarPopupGis();
    this.featureSeleccionado = feature;
    this.refrescarCapasVector();
    this.conexionSeleccionada = feature.getProperties();
  }

  cerrarPopup(): void {
    this.conexionSeleccionada = null;
    this.featureSeleccionado = null;
    this.refrescarCapasVector();
  }

  private refrescarCapasVector(): void {
    this.conexionesLayer?.changed();
    this.lotesConexionesLayer?.changed();
  }

  abrirStreetView(x: unknown, y: unknown): void {
    const lonLat = coordenadaLonLat(x, y, this.gis.proyeccionUtm);
    if (!lonLat) {
      this.avisar("warn", "Aviso", "No hay coordenadas válidas para abrir Street View.");
      return;
    }
    abrirGoogleStreetView(lonLat);
  }

  verMasInformacion(codcliente: string | undefined): void {
    if (!codcliente) return;
    abrirConsultaUsuario(
      this.dialogService,
      codcliente,
      this.conexionSeleccionada?.codsuc || this.selectedSucursal?.codsuc,
    ).then((referencia) => (this.ref = referencia));
  }

  // SHAPE

  /** Muestra lo que tendrá el shape y descarga solo si el usuario confirma. */
  descargarShape(): void {
    if (this.descargandoShape) return;
    const extension = this.map.getView().calculateExtent(this.map.getSize());
    const capasGis = [
      ...this.capasComercialesConsultables(),
      ...(this.capasSidebar?.capasTecnicasConsultables() ?? []),
    ];
    const capasLocales = this.capasLocalesParaShape(extension);
    const nombreArchivo = `conexiones_nuevas_${new Date().toISOString().slice(0, 10)}`;

    this.ref = abrirVistaPreviaShape(this.dialogService, {
      nombreArchivo,
      capasLocales,
      capasGis: this.descargaShapeGis.etiquetasCapasGis(capasGis),
    });
    this.ref.onClose
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmado) => {
        if (confirmado) this.ejecutarDescargaShape(capasGis, capasLocales, extension, nombreArchivo);
      });
  }

  private async ejecutarDescargaShape(
    capasGis: CapaConsultable[],
    capasLocales: CapaShape[],
    extension: Extent,
    nombreArchivo: string,
  ): Promise<void> {
    this.descargandoShape = true;
    try {
      const { capas } = await this.descargaShapeGis.descargar({ capasGis, capasLocales, extension, nombreArchivo });
      if (capas.length === 0) {
        this.avisar("warn", "Sin datos", "Encienda al menos una capa con elementos en la zona que se ve.");
      } else {
        this.avisar("success", "Shape descargado", `Capas: ${capas.join(", ")}.`);
      }
    } catch (error) {
      this.avisar(
        "error",
        "No se pudo descargar",
        error instanceof Error ? error.message : "GeoServer no respondió. Intente de nuevo.",
      );
    } finally {
      this.descargandoShape = false;
    }
  }

  // Desde los registros y no desde los puntos pintados: los clientes de un mismo predio comparten un punto.
  private capasLocalesParaShape(extension: Extent): CapaShape[] {
    const aLonLat = (coordenada: number[]) => transform(coordenada, this.gis.proyeccionMapa, WGS84);
    const registros = this.conexionesLayer.getVisible() ? this.resultadoBusquedaJson ?? [] : [];
    return [
      {
        nombre: "conexiones_nuevas",
        tipo: "punto",
        columnas: COLUMNAS_SHAPE_CONEXIONES,
        elementos: registros.flatMap((registro) => {
          const coordenada = extraerCoordenada(registro, ORIGENES_COORDENADA.usuario);
          if (!coordenada || !containsCoordinate(extension, coordenada)) return [];
          return [{ coordenadas: [aLonLat(coordenada)], atributos: this.aFilaTabla(registro) }];
        }),
      },
    ];
  }

  // El backend responde 200 con success=false y el detalle en mensaje (p. ej. error SQL de la base GIS).
  private mensajeDeError(mensaje: string | undefined): string {
    return mensaje?.trim() || "Ocurrió un error al consultar las conexiones nuevas";
  }

  /** Clic en la tarjeta "Sin Coord.": Excel de los clientes cargados que no se pintan en el mapa. */
  async descargarSinCoordenadas(): Promise<void> {
    if (this.totalSinCoordenadas === 0) return;
    const cantidad = await (this.controladorGis?.descargarSinCoordenadas() ?? Promise.resolve(0));
    if (cantidad === 0) {
      this.avisar("info", "Aviso", "Todos los registros cargados tienen coordenadas.");
    } else {
      this.avisar("success", "Excel descargado", `${cantidad} registros sin coordenadas.`);
    }
  }

  private avisar(severity: string, summary: string, detail: string): void {
    this.messageService.add({ severity, summary, detail });
  }
}
