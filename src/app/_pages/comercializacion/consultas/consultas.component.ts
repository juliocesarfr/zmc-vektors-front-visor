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
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { volverAlMainGeoreferencia } from "../../../shared/utils/navegacion.utils";
import { ButtonModule } from "primeng/button";
import { ToastModule } from "primeng/toast";
import { SelectModule } from "primeng/select";
import { InputTextModule } from "primeng/inputtext";
import { AutoCompleteModule } from "primeng/autocomplete";
import { MessageService } from "primeng/api";
import { CatastroService } from "@host/_servicios/vektors/catastro.service";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { SectoresCicloService } from "@host/_servicios/seguridad/sectores-ciclo.service";
import { TarifasService } from "@host/_servicios/catastro/tarifas.service";
import { UrbamaeService } from "@host/_servicios/catastro/urbamae.service";
import { TipousuarioService } from "@host/_servicios/catastro/tipousuario.service";
import { CallesService } from "@host/_servicios/catastro/calles.service";
import { TipodocidentService } from "@host/_servicios/catastro/tipodocident.service";
import { BusquedaAvanzadaClientesService } from "@host/_servicios/vektors/busqueda-avanzada-clientes.service";
import { BusquedaAvanzadaClientesRequest } from "@host/_models/vektors/busqueda-avanzada-clientes.models";
import { Calles } from "@host/_models/catastro/calles";
import { TipoDocIdent } from "@host/_models/catastro/tipodocident";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin, of, Subject, Subscription, TimeoutError } from "rxjs";
import { catchError, finalize, takeUntil, timeout } from "rxjs/operators";

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
import { ZOOM_PREDIO } from "../../../shared/mapa/predio-buscado";
import { ControladorMapaGis } from "../../../shared/mapa/controlador-mapa-gis";
import { PanelesMapaGisComponent } from "../../../shared/components/paneles-mapa-gis/paneles-mapa-gis.component";
import { ColumnaListado, FilaListado, direccionDe } from "../../../shared/utils/listado-excel";
import { ExcelService } from "@host/_servicios/reportes/excel.service";
import { crearFeaturePunto, extraerCoordenada } from "../../../shared/mapa/geo.utils";
import { FiltroPadronClientesTipoActividadRequest } from "@host/_models/vektors/Catastro/FiltroPadronClientesTipoActividadRequest";
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
import { CapaShape, ColumnaShape } from "../../../shared/utils/shapefile";

const COLUMNAS_TABLA_PADRON: ColumnaListado[] = [
  { campo: "codcliente", titulo: "Cód. cliente", anchoExcel: 12 },
  { campo: "propietario", titulo: "Titular", anchoExcel: 35 },
  { campo: "direccion", titulo: "Dirección", anchoExcel: 35 },
  { campo: "codsector", titulo: "Sector", anchoExcel: 8 },
  { campo: "codmza", titulo: "Mza", anchoExcel: 8 },
  { campo: "nrolote", titulo: "Lote", anchoExcel: 8 },
  { campo: "nromed", titulo: "Medidor", anchoExcel: 15 },
  { campo: "tarifa", titulo: "Categoría", anchoExcel: 22 },
  { campo: "actividad", titulo: "Actividad", anchoExcel: 22 },
  { campo: "estadoservicio", titulo: "Estado del servicio", anchoExcel: 18 },
  { campo: "tiposervicio", titulo: "Tipo de servicio", anchoExcel: 18 },
  { campo: "consumo", titulo: "Consumo", anchoExcel: 10 },
];

// Las mismas columnas del listado; los nombres de columna de un .dbf no pasan de 10 caracteres.
const COLUMNAS_SHAPE_PADRON: ColumnaShape[] = [
  { nombre: "codcliente", campo: "codcliente" },
  { nombre: "titular", campo: "propietario" },
  { nombre: "direccion", campo: "direccion" },
  { nombre: "sector", campo: "codsector" },
  { nombre: "manzana", campo: "codmza" },
  { nombre: "lote", campo: "nrolote" },
  { nombre: "medidor", campo: "nromed" },
  { nombre: "categoria", campo: "tarifa" },
  { nombre: "actividad", campo: "actividad" },
  { nombre: "estado", campo: "estadoservicio" },
  { nombre: "tipo_serv", campo: "tiposervicio" },
  { nombre: "consumo", campo: "consumo" },
];

// Sin respuesta en este tiempo se avisa y se libera la pantalla en vez de quedarse cargando.
const MS_ESPERA_SERVIDOR = 40000;
// Es el valor por defecto del backend (usp_vektors_busqueda_avanzada_clientes): en la práctica, sin tope.
const SIN_TOPE_DE_REGISTROS = 99999;

@Component({
  selector: "app-consultas",
  standalone: true,
  imports: [
    CapasSidebarComponent,
    PanelesMapaGisComponent,
    CommonModule,
    FormsModule,
    ButtonModule,
    ToastModule,
    SelectModule,
    InputTextModule,
    AutoCompleteModule,
    LeyendaGruposComponent,
  ],
  templateUrl: "./consultas.component.html",
  styleUrl: "./consultas.component.scss",
  providers: [MessageService, DialogService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConsultasComponent
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
  private readonly busquedaAvanzadaService = inject(BusquedaAvanzadaClientesService);
  private readonly callesService = inject(CallesService);
  private readonly tipodocidentService = inject(TipodocidentService);
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
  usuariosLayer!: VectorLayer<VectorSource>;
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
  totalClientes = 0;
  totalSinCoordenadas = 0;

  entradasLeyenda: EntradaLeyenda[] = [];
  /** Estado elegido en la leyenda: el mapa muestra solo ese y lo encuadra. `null` = todos. */
  grupoFiltrado: string | null = null;
  mostrarLeyenda = true;

  dataCiclos: any[] = [];
  listaSucursales: any[] = [];
  listaSectores: any[] = [];
  listaEstadoServicio: any[] = [];
  listaTipoServicio: any[] = [];
  listaTarifas: any[] = [];
  listaUrbanizaciones: any[] = [];
  listaActividades: any[] = [];
  listaTipoUsuario: any[] = [];

  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: any = null;
  selectedEstadoServicio: any = null;
  selectedTipoServicio: any = null;
  selectedTarifa: any = null;
  selectedUrbanizacion: any = null;
  selectedActividad: any = null;
  selectedTipoUsuario: any = null;

  mostrarSearchPanel = false;
  /** El buscador se ocultó para mostrar la ficha y vuelve a abrirse al cerrarla. */
  buscadorEstabaAbierto = false;
  isBusquedaClienteActiva = false;
  /** Padrón cargado con los filtros: es lo que vuelve a verse al limpiar la búsqueda. */
  resultadoBusquedaOriginalJson: any[] | undefined = undefined;
  private peticionBusqueda?: Subscription;

  tabActivaBuscador = "usuario";
  searchSuministro = "";
  searchDniRuc = "";
  searchNombre = "";
  searchSector = "";
  searchManzana = "";
  searchLote = "";
  resultadosTab: any[] = [];
  /** Filtra la tabla de resultados por código, titular, dirección, manzana o lote. */
  filtroResultados = "";

  tiposDocumento: TipoDocIdent[] = [];
  tipoDocumentoElegido: string | null = null;
  /** Calles de la sucursal: primero se elige la calle y luego se buscan sus clientes. */
  private callesSucursal: Calles[] = [];
  private codsucCalles: string | null = null;
  callesSugeridas: Calles[] = [];
  calleElegida: Calles | null = null;

  clienteSeleccionado: any = null;
  featureSeleccionado: Feature | null = null;
  ref: DynamicDialogRef | null | undefined;

  readonly baseLayers = CAPAS_BASE_UI;

  commercialLayers = [
    { id: "usuarios", label: "Usuarios", active: true },
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
    private urbamaeService: UrbamaeService,
    private tipoUsuarioService: TipousuarioService,
    private messageService: MessageService,
    private dialogService: DialogService,
  ) {}

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);
    this.crearMapa();
    this.cargarTiposDocumento();

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
      actividades: this.consulGenericService
        .getconsultaService("TAC", "ALL", "ALL", "ALL")
        .pipe(catchError(() => of<any[]>([]))),
      tipoUsuario: this.tipoUsuarioService
        .drop()
        .pipe(catchError(() => of<any[]>([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({
          ciclos,
          estadoServicio,
          tipoServicio,
          actividades,
          tipoUsuario,
        }) => {
          this.dataCiclos = [
            { codigo: "ALL", descripcion: "TODOS", codemp: "ALL", estareg: 1 },
            ...ciclos,
          ];
          if (this.dataCiclos.length > 0) {
            this.selectedCiclo = this.dataCiclos[1] || this.dataCiclos[0];
            this.onCicloChange();
          }

          this.listaEstadoServicio = [
            { codigo: "ALL", descripcion: "TODOS" },
            ...estadoServicio,
          ];
          this.selectedEstadoServicio = "ALL";

          this.listaTipoServicio = [
            { codigo: "ALL", descripcion: "TODOS" },
            ...tipoServicio,
          ];
          this.selectedTipoServicio = "ALL";

          this.listaActividades = [
            { codigo: "ALL", descripcion: "TODOS" },
            ...actividades,
          ];
          this.selectedActividad = "ALL";

          this.listaTipoUsuario = [
            { tipousuario: "ALL", descripcion: "TODOS" },
            ...(tipoUsuario || []),
          ];
          this.selectedTipoUsuario = "ALL";
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
    this.listaUrbanizaciones = [];
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
    this.codsucCalles = null;
    if (this.tabActivaBuscador === "calles") this.cargarCallesSucursal();
    this.selectedSector = null;
    this.selectedTarifa = null;
    this.selectedUrbanizacion = null;
    this.listaSectores = [];
    this.listaTarifas = [];
    this.listaUrbanizaciones = [];

    if (!this.selectedSucursal) return;

    const sucursalCode = this.selectedSucursal.codsuc;

    this.tarifasService
      .drop(sucursalCode)
      .pipe(takeUntil(this.sucursalCambiada), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          const uniqueData = (data || []).filter(
            (item: any, index: number, self: any[]) =>
              index === self.findIndex((t) => t.nomtar === item.nomtar),
          );
          this.listaTarifas = [
            { catetar: "ALL", nomtar: "TODOS", codigo: "ALL" },
            ...uniqueData,
          ];
          this.selectedTarifa = "ALL";
        },
        error: (err) => console.error("Error al cargar tarifas:", err),
      });

    if (
      this.selectedSucursal.codsuc === "ALL" ||
      this.selectedCiclo.codigo === "ALL"
    ) {
      this.listaSectores = [{ codsector: "ALL", descripcion: "TODOS" }];
      this.selectedSector = this.listaSectores[0];
      return;
    }

    this.sectoresCicloService
      .drop_sectores_x_ciclo(
        this.selectedSucursal.codsuc,
        this.selectedCiclo.codigo,
      )
      .pipe(takeUntil(this.sucursalCambiada), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.listaSectores = [
            { codsector: "ALL", descripcion: "TODOS" },
            ...(data || []),
          ];
          this.selectedSector = this.listaSectores[0];
        },
        error: (err) => {
          console.error("Error al cargar sectores:", err);
          this.listaSectores = [{ codsector: "ALL", descripcion: "TODOS" }];
          this.selectedSector = this.listaSectores[0];
        },
      });

    this.urbamaeService
      .drop_x_sucursales(this.selectedSucursal.codsuc)
      .pipe(takeUntil(this.sucursalCambiada), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.listaUrbanizaciones = [
            { codurbaso: "ALL", descripcionurba: "TODOS" },
            ...(data || []),
          ];
          this.selectedUrbanizacion = "ALL";
        },
        error: (err) => console.error("Error al cargar urbanizaciones:", err),
      });
  }

  getDescEstadoServicio(): string {
    return (
      this.listaEstadoServicio?.find(
        (e) => e.codigo === this.selectedEstadoServicio,
      )?.descripcion ?? "TODOS"
    );
  }

  getDescTipoUsuario(): string {
    return (
      this.listaTipoUsuario?.find(
        (e) => e.tipousuario === this.selectedTipoUsuario,
      )?.descripcion ?? "TODOS"
    );
  }

  getDescTipoServicio(): string {
    return (
      this.listaTipoServicio?.find(
        (e) => e.codigo === this.selectedTipoServicio,
      )?.descripcion ?? "TODOS"
    );
  }

  getDescTarifa(): string {
    return (
      this.listaTarifas?.find((e) => e.catetar === this.selectedTarifa)
        ?.nomtar ?? "TODOS"
    );
  }

  getTarifaName(catetar: string): string {
    if (!catetar) return "";
    const tarifa = this.listaTarifas?.find((t) => t.catetar === catetar);
    return tarifa ? tarifa.nomtar : "";
  }

  getDescUrbanizacion(): string {
    return (
      this.listaUrbanizaciones?.find(
        (e) => e.codurbaso === this.selectedUrbanizacion,
      )?.descripcionurba ?? "TODOS"
    );
  }

  getDescActividad(): string {
    return (
      this.listaActividades?.find((e) => e.codigo === this.selectedActividad)
        ?.descripcion ?? "TODOS"
    );
  }

  procesar(): void {
    if (!this.selectedCiclo || !this.selectedSucursal) {
      this.avisar(
        "warn",
        "Aviso de usuario",
        "Debe seleccionar Ciclo y Sucursal",
      );
      return;
    }

    this.cargando = true;
    const toNull = (val: any, key?: string) =>
      !val || val === "ALL" ? null : val;

    const filtro: FiltroPadronClientesTipoActividadRequest = {
      codciclo: toNull(this.selectedCiclo.codigo),
      codsuc: toNull(this.selectedSucursal.codsuc),
      codsector: toNull(this.selectedSector?.codsector),
      estservicio: toNull(this.selectedEstadoServicio),
      tiposervicio: toNull(this.selectedTipoServicio),
      catetar: toNull(this.selectedTarifa),
      urbani: toNull(this.selectedUrbanizacion),
      tipousuario: toNull(this.selectedTipoUsuario),
      actividad: toNull(this.selectedActividad),
    };

    this.catastroService
      .listarPadronActividad(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          this.filtrosVisible = false;
          this.olvidarBusquedaCliente();
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
            this.avisar(
              "info",
              "Resultados",
              "No se encontraron registros con los filtros seleccionados",
            );
          }
        },
        error: (err) => {
          console.error("Error al cargar padrón de clientes:", err);
          this.cargando = false;
          this.limpiarCapas();
          this.resultadoBusquedaJson = [];
          this.avisar(
            "error",
            "Error",
            "Ocurrió un error al cargar el padrón de clientes",
          );
        },
      });
  }

  limpiar(): void {
    this.selectedCiclo = this.dataCiclos[1] || this.dataCiclos[0];
    this.onCicloChange();
    this.selectedEstadoServicio = "ALL";
    this.selectedTipoServicio = "ALL";
    this.selectedActividad = "ALL";
    this.selectedTipoUsuario = "ALL";
    this.olvidarBusquedaCliente();
    this.limpiarCapas();
    this.resultadoBusquedaJson = [];
  }

  private actualizarCapasComerciales(fitBounds = true, avisarResultado = true): void {
    this.estilos.limpiar();
    this.limpiarCapas();

    const registros = this.resultadoBusquedaJson || [];
    this.totalClientes = registros.length;
    if (registros.length === 0) return;

    const featuresUsr = registros
      .map((registro) => {
        const punto = crearFeaturePunto(registro, ORIGENES_COORDENADA.usuario);
        punto?.set("_grupo", grupoDeEstadoServicio(registro.estadoservicio));
        return punto;
      })
      .filter((f): f is Feature => f !== null);
    this.usuariosLayer.getSource()!.addFeatures(featuresUsr);
    this.entradasLeyenda = contarPorGrupo(registros.map((registro) => grupoDeEstadoServicio(registro.estadoservicio)));

    this.totalSinCoordenadas = registros.length - featuresUsr.length;

    this.ajustarVista(fitBounds, avisarResultado);
  }

  private ajustarVista(fitBounds: boolean, avisarResultado: boolean): void {
    const srcUsuarios = this.usuariosLayer.getSource()!;

    if (srcUsuarios.getFeatures().length === 0) {
      if (!avisarResultado) return;
      this.avisar(
        "info",
        "Aviso",
        "No se encontraron coordenadas para los clientes",
      );
      return;
    }

    if (fitBounds) {
      const extent = srcUsuarios.getExtent();
      this.map
        .getView()
        .fit(extent!, { duration: 800, maxZoom: 18, padding: [60, 60, 60, 60] });
    }
    if (!avisarResultado) return;
    this.avisar(
      "success",
      "Proceso completado",
      "Clientes cargados en el mapa",
    );
  }

  private limpiarCapas(): void {
    this.capasVector.forEach((capa) => capa?.getSource()?.clear());
    this.controladorGis?.descartarListado();
    this.totalClientes = 0;
    this.totalSinCoordenadas = 0;
    this.entradasLeyenda = [];
    this.grupoFiltrado = null;
  }

  /** Como los estados de Seguimiento de programa: clic filtra y lleva al grupo, otro clic vuelve a todos. */
  filtrarPorGrupo(clave: string): void {
    this.grupoFiltrado = this.grupoFiltrado === clave ? null : clave;
    const grupoSeleccionado = this.featureSeleccionado?.get("_grupo") as GrupoLeyenda | undefined;
    if (this.grupoFiltrado && grupoSeleccionado && grupoSeleccionado.clave !== this.grupoFiltrado) this.cerrarPopup();
    this.refrescarCapasVector();

    const extension = createEmpty();
    this.usuariosLayer.getSource()!.getFeatures().forEach((punto) => {
      const grupo = punto.get("_grupo") as GrupoLeyenda | undefined;
      if (grupo && (!this.grupoFiltrado || grupo.clave === this.grupoFiltrado)) {
        extend(extension, punto.getGeometry()!.getExtent());
      }
    });
    if (!isEmpty(extension)) {
      this.map.getView().fit(extension, { duration: 700, maxZoom: 18, padding: [120, 120, 120, 340] });
    }
  }

  /** Muestra de color del estado de servicio, igual que en la leyenda del GIS. */
  fondoEstado(codigo: unknown): string {
    return fondoMuestra(grupoDeEstadoServicio(codigo));
  }

  ngAfterViewInit(): void {
    this.capasSidebar?.conectarMapa(this.map);

    requestAnimationFrame(() => {
      const el = this.mapContainer?.nativeElement;
      if (!el) return;
      this.map.setTarget(el);
      this.map.updateSize();
      this.detenerObservadorMapa = observarTamanoMapa(this.map, el);
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

  // El buscador y la ficha ocupan el mismo lado del mapa: abrir uno cierra el otro.
  abrirBusqueda(): void {
    this.buscadorEstabaAbierto = false;
    this.cerrarPopup();
    this.mostrarSearchPanel = true;
    if (this.tabActivaBuscador === "calles") this.cargarCallesSucursal();
  }

  cerrarBusqueda(): void {
    this.mostrarSearchPanel = false;
    this.reiniciarBusqueda();
  }

  /** Vacía el buscador y vuelve a mostrar el padrón cargado con los filtros. */
  reiniciarBusqueda(): void {
    this.buscadorEstabaAbierto = false;
    this.peticionBusqueda?.unsubscribe();
    this.searchSuministro = "";
    this.searchDniRuc = "";
    this.searchNombre = "";
    this.searchSector = "";
    this.searchManzana = "";
    this.searchLote = "";
    this.calleElegida = null;
    this.tipoDocumentoElegido = null;
    this.filtroResultados = "";
    this.resultadosTab = [];
    this.controladorGis?.quitarPredio();
    this.controladorGis?.quitarCalle();
    if (this.isBusquedaClienteActiva) {
      this.isBusquedaClienteActiva = false;
      if (this.resultadoBusquedaOriginalJson !== undefined) {
        this.resultadoBusquedaJson = this.resultadoBusquedaOriginalJson;
        this.resultadoBusquedaOriginalJson = undefined;
      }
      this.cerrarPopup();
      this.actualizarCapasComerciales();
    }
  }

  private olvidarBusquedaCliente(): void {
    this.isBusquedaClienteActiva = false;
    this.resultadoBusquedaOriginalJson = undefined;
    this.controladorGis?.quitarPredio();
    this.controladorGis?.quitarCalle();
  }

  setTabBuscador(tab: string): void {
    this.tabActivaBuscador = tab;
    this.resultadosTab = [];
    this.filtroResultados = "";
    if (tab === "calles") this.cargarCallesSucursal();
  }

  /** Tabla de resultados filtrada con el texto que escribe el usuario; muestra todos, sin páginas. */
  get resultadosFiltrados(): any[] {
    const texto = this.filtroResultados.trim().toUpperCase();
    if (!texto) return this.resultadosTab;
    return this.resultadosTab.filter((registro) =>
      [registro.codcliente, registro.propietario, registro.descripcioncalle, registro.nrocalle, registro.codmza, registro.nrolote]
        .some((valor) => String(valor ?? "").toUpperCase().includes(texto)),
    );
  }

  private cargarTiposDocumento(): void {
    this.tipodocidentService.drop().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (tipos) => (this.tiposDocumento = tipos || []),
      error: () => (this.tiposDocumento = []),
    });
  }

  private cargarCallesSucursal(): void {
    const codsuc = this.selectedSucursal?.codsuc;
    if (!codsuc || codsuc === "ALL" || codsuc === this.codsucCalles) return;
    this.callesService.drop_x_sucursales(codsuc).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (calles) => {
        this.callesSucursal = calles || [];
        this.codsucCalles = codsuc;
      },
      error: () => this.avisar("error", "Calles", "No se pudieron cargar las calles de la sucursal."),
    });
  }

  /** Igual que en Consulta de Usuario: sugiere las calles que empiezan con lo escrito. */
  sugerirCalles(evento: { query: string }): void {
    const texto = (evento.query || "").trim().toLowerCase();
    this.callesSugeridas = this.callesSucursal.filter((calle) =>
      String(calle.descripcioncalle ?? "").toLowerCase().startsWith(texto),
    );
  }

  buscarPorOpcion(opcion: number): void {
    if (opcion === 1) {
      const codigo = String(this.searchSuministro || "").trim();
      if (!codigo) return this.avisar("warn", "Campo vacío", "Ingrese el Nro. de Suministro.");
      // Si ya está en el padrón cargado se usa ese registro: trae estado, consumo y lecturas que la búsqueda no trae.
      const enPadron = this.padronCargado().find((registro) => this.codigoDe(registro) === codigo);
      if (enPadron) {
        this.resultadosTab = [];
        this.elegirResultado(enPadron);
        return;
      }
      this.buscarClientes({ codcliente: codigo }, "No se encontró ningún cliente con ese suministro.");
      return;
    }
    if (opcion === 2) {
      const numero = String(this.searchDniRuc || "").trim();
      if (!this.tipoDocumentoElegido) return this.avisar("warn", "Tipo de documento", "Elija primero el tipo de documento.");
      if (!numero) return this.avisar("warn", "Campo vacío", "Ingrese el número de documento.");
      this.buscarClientes(
        { tipodocident: this.tipoDocumentoElegido, nrodocumento: numero },
        "No se encontró ningún cliente con ese documento.",
      );
      return;
    }
    const nombre = String(this.searchNombre || "").trim().toUpperCase();
    if (!nombre) return this.avisar("warn", "Campo vacío", "Ingrese los apellidos y nombres.");
    this.buscarClientes({ propietario: nombre, letrainicio: 0 }, "No se encontró ningún cliente con ese nombre.");
  }

  buscarPorCalle(): void {
    const calle = this.calleElegida?.descripcioncalle?.trim();
    if (!calle) {
      this.avisar("warn", "Calle", "Elija primero una calle de la lista.");
      return;
    }
    this.buscarClientes({ codcalle: calle }, `No se encontraron clientes en la calle "${calle}".`);
  }

  buscarPorManzana(): void {
    if (!this.searchSector && !this.searchManzana && !this.searchLote) {
      this.avisar("warn", "Campos vacíos", "Ingrese al menos el Sector, Manzana o Lote.");
      return;
    }
    this.buscarClientes(
      {
        codsector: this.searchSector.trim() || "ALL",
        codmza: this.searchManzana.trim() || "ALL",
        nrolote: this.searchLote.trim() || "ALL",
      },
      "No se encontraron clientes en la manzana o lote indicado.",
    );
  }

  /** La tabla se llena con todo lo que devuelve el servidor; con un único resultado se elige solo. */
  private buscarClientes(filtro: BusquedaAvanzadaClientesRequest, mensajeSinResultados: string): void {
    this.peticionBusqueda?.unsubscribe();
    this.resultadosTab = [];
    this.filtroResultados = "";
    this.cargando = true;
    this.peticionBusqueda = this.busquedaAvanzadaService
      .buscarClientesAvanzada({
        codsuc: this.selectedSucursal?.codsuc || "ALL",
        inicio: 0,
        nropagina: SIN_TOPE_DE_REGISTROS,
        ...filtro,
      })
      .pipe(
        timeout(MS_ESPERA_SERVIDOR),
        finalize(() => (this.cargando = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (respuesta) => {
          // La búsqueda trae el código en estadoservicio/tiposervicio; la ficha y la leyenda muestran la descripción, como en el padrón.
          const clientes = (respuesta?.data || []).map((cliente) => ({
            ...cliente,
            estadoservicio: cliente.desestadoservicio || cliente.descripcionestservicio || cliente.estadoservicio,
            tiposervicio: cliente.destiposervicio || cliente.tiposervicio,
          }));
          this.resultadosTab = clientes;
          if (clientes.length === 0) {
            this.avisar("warn", "Sin resultados", mensajeSinResultados);
          } else if (clientes.length === 1) {
            this.elegirResultado(clientes[0]);
          }
        },
        error: (error) => this.avisarErrorBusqueda(error),
      });
  }

  private avisarErrorBusqueda(error: any): void {
    if (error instanceof TimeoutError) {
      this.avisar("error", "Sin respuesta", "El servidor tardó demasiado en responder. Intente de nuevo.");
    } else if (error?.status === 401 || error?.status === 403) {
      this.avisar("error", "Acceso denegado", "No tiene permisos para consultar los clientes.");
    } else {
      this.avisar("error", "Error", "Ocurrió un error al buscar los clientes.");
    }
  }

  /** Pone en el mapa todos los clientes de la tabla (los filtrados, si hay filtro). */
  agregarTodoAlMapa(): void {
    const registros = this.resultadosFiltrados;
    if (registros.length === 0) return;
    this.guardarPadronCargado();
    this.cerrarPopup();
    this.controladorGis?.quitarPredio();
    this.resultadoBusquedaJson = registros;
    const nombreCalle = this.tabActivaBuscador === "calles" ? this.calleElegida?.descripcioncalle : undefined;
    this.actualizarCapasComerciales(false);
    if (nombreCalle) {
      this.controladorGis?.marcarCalle(nombreCalle, () => this.encuadrarPuntos());
    } else {
      // Deja libre el lado del buscador para que ningún cliente quede debajo de él.
      this.encuadrarPuntos();
    }
  }

  /** El usuario eligió un cliente: el mapa muestra solo ese, con su ficha y su lote marcado. */
  elegirResultado(registro: any): void {
    const codigo = this.codigoDe(registro);
    this.guardarPadronCargado();
    this.controladorGis?.quitarCalle();
    this.resultadoBusquedaJson = [registro];
    this.actualizarCapasComerciales(false, false);

    const punto = this.usuariosLayer
      ?.getSource()
      ?.getFeatures()
      .find((feature) => this.codigoDe(feature.getProperties()) === codigo);
    if (punto) {
      this.seleccionarFeature(punto);
    } else {
      this.controladorGis?.cerrarPopupGis();
      this.featureSeleccionado = null;
      this.clienteSeleccionado = registro;
    }
    // La ficha ocupa el lado derecho; el buscador vuelve al cerrarla solo si había tabla para elegir otro.
    this.mostrarSearchPanel = false;
    this.buscadorEstabaAbierto = this.resultadosTab.length > 1;

    // Sin punto del usuario se ubica por su predio o su ficha de agua, como en el visor principal.
    const coordenada = punto
      ? getCenter(punto.getGeometry()!.getExtent())
      : extraerCoordenada(registro, ORIGENES_COORDENADA.predio)
        ?? extraerCoordenada(registro, ORIGENES_COORDENADA.agua);
    if (coordenada) {
      this.map.getView().animate({ center: coordenada, zoom: ZOOM_PREDIO, duration: 800 });
    } else {
      this.avisar("warn", "Sin ubicación", `El cliente ${codigo} no tiene coordenadas registradas: solo se muestra su ficha.`);
    }
    this.controladorGis?.marcarPredio(codigo, coordenada ?? undefined);
  }

  private guardarPadronCargado(): void {
    if (this.isBusquedaClienteActiva) return;
    this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
    this.isBusquedaClienteActiva = true;
  }

  private padronCargado(): any[] {
    return (this.isBusquedaClienteActiva ? this.resultadoBusquedaOriginalJson : this.resultadoBusquedaJson) ?? [];
  }

  private encuadrarPuntos(): void {
    const extension = this.usuariosLayer.getSource()!.getExtent();
    if (!isEmpty(extension!)) this.controladorGis?.encuadrarEnZonaLibre(extension!);
  }

  private codigoDe(registro: any): string {
    return String(registro?.codcliente || registro?.nroSuministro || "").trim();
  }

  // MAPA

  private crearMapa(): void {
    this.osmLayer = crearCapaOsm(this.baseActive === "osm");
    this.satelitalLayer = crearCapaSatelital(this.baseActive === "satelital");

    this.lotesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("lotes"), true);
    this.sectoresComercialesLayer = crearCapaWms(this.gis.urlWms(),
      this.gis.capa("sectoresComerciales"),
      false,
    );
    this.callesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("calles"), false);
    this.manzanasLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("manzanas"), false);

    const zoomActual = () => this.map?.getView().getZoom() ?? 14;

    this.usuariosLayer = new VectorLayer({
      source: new VectorSource(),
      visible: true,
      style: (f) => {
        const grupo = f.get("_grupo") as GrupoLeyenda | undefined;
        if (this.grupoFiltrado && grupo?.clave !== this.grupoFiltrado) return undefined;
        return this.estilos.punto({
          forma: "circulo",
          color: grupo?.color ?? "#3b82f6",
          zoom: zoomActual(),
          seleccionado: f === this.featureSeleccionado,
          etiqueta: f.get("codcliente") || f.get("nroSuministro"),
          ...RADIOS_LECTURA,
        });
      },
    });

    this.capasVector = [this.usuariosLayer];

    this.registroCapas = {
      usuarios: this.usuariosLayer,
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
        this.usuariosLayer,
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
        columnas: COLUMNAS_TABLA_PADRON,
        tituloReporte: "PADRÓN DE CLIENTES",
        nombreArchivo: "padron_clientes_area_",
        origen: ORIGENES_COORDENADA.usuario,
        registros: () => this.resultadoBusquedaJson ?? [],
        aFila: (registro) => this.aFilaTabla(registro),
        subcabecera: () => [
          `Ciclo: ${this.selectedCiclo?.descripcion ?? "-"}`,
          `Sucursal: ${this.selectedSucursal?.nombre ?? "-"}`,
          `Sector: ${this.selectedSector?.descripcion ?? "-"}`,
        ],
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

  setBaseLayer(id: string): void {
    this.baseActive = id;
    this.osmLayer.setVisible(id === "osm");
    this.satelitalLayer.setVisible(id === "satelital");
  }

  toggleCommercialLayer(layerOption: any): void {
    layerOption.active = !layerOption.active;
    const capa = this.registroCapas[layerOption.id];
    if (capa) {
      capa.setVisible(layerOption.active);
    }
  }

  onSidebarToggle(): void {
    setTimeout(() => {
      this.map?.updateSize();
    }, 300);
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      if (estaUsandoHerramientas(this.map)) return;
      const feature = this.map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        hitTolerance: 5,
        layerFilter: (layer: any) =>
          !layer.get("isDrawLayer") && !layer.get(MARCA_CAPA_RESALTADO),
      }) as Feature | undefined;

      if (feature) {
        this.seleccionarFeature(feature);
      } else {
        this.cerrarPopup();
        this.controladorGis?.consultarPunto(evt.coordinate);
      }
    });
  }

  private aFilaTabla(registro: Record<string, unknown>): FilaListado {
    const direccion = direccionDe(registro);
    const catetar = String(registro["catetar"] ?? "");
    return { ...registro, direccion, tarifa: this.getTarifaName(catetar) || catetar };
  }

  ubicarFilaEnMapa(fila: FilaListado): void {
    const codigo = String(fila["codcliente"] ?? "").trim();
    const punto = this.usuariosLayer
      ?.getSource()
      ?.getFeatures()
      .find((f) => String(f.get("codcliente") ?? "").trim() === codigo);
    if (!punto) {
      this.avisar("warn", "Aviso", `El cliente ${codigo} no tiene coordenadas para ubicarlo.`);
      return;
    }
    this.seleccionarFeature(punto);
    this.controladorGis?.encuadrarEnZonaLibre(punto.getGeometry()!.getExtent());
  }

  // Los dos popups ocupan el mismo lugar: abrir el del cliente cierra el de GIS.
  private seleccionarFeature(feature: Feature): void {
    this.controladorGis?.cerrarPopupGis();
    this.featureSeleccionado = feature;
    this.refrescarCapasVector();
    this.clienteSeleccionado = feature.getProperties();
    if (this.mostrarSearchPanel) {
      this.buscadorEstabaAbierto = true;
      this.mostrarSearchPanel = false;
    }
  }

  cerrarPopup(): void {
    this.clienteSeleccionado = null;
    this.featureSeleccionado = null;
    this.refrescarCapasVector();
    if (this.buscadorEstabaAbierto) {
      this.mostrarSearchPanel = true;
      this.buscadorEstabaAbierto = false;
    }
  }

  private refrescarCapasVector(): void {
    this.usuariosLayer?.changed();
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
      // Con "Todas" las sucursales el código de la sucursal sale del propio cliente.
      this.clienteSeleccionado?.codsuc || this.selectedSucursal?.codsuc,
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
    const nombreArchivo = `padron_clientes_${new Date().toISOString().slice(0, 10)}`;

    this.ref = abrirVistaPreviaShape(this.dialogService, {
      nombreArchivo,
      capasLocales,
      capasGis: this.descargaShapeGis.etiquetasCapasGis(capasGis),
    });
    this.ref?.onClose
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
    const registros = this.usuariosLayer.getVisible() ? this.resultadoBusquedaJson ?? [] : [];
    return [
      {
        nombre: "padron_clientes",
        tipo: "punto",
        columnas: COLUMNAS_SHAPE_PADRON,
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
    return mensaje?.trim() || "Ocurrió un error al consultar el padrón de clientes";
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
