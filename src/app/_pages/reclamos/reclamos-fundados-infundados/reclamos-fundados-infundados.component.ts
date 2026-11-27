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
import { SelectModule } from "primeng/select";
import { InputTextModule } from "primeng/inputtext";
import { DatePickerModule } from "primeng/datepicker";
import { DialogModule } from "primeng/dialog";
import { MessageService } from "primeng/api";
import { ReclamosService } from "@host/_servicios/vektors/reclamos.service";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { of, Subscription } from "rxjs";
import { catchError } from "rxjs/operators";

import OlMap from "ol/Map";
import TileLayer from "ol/layer/Tile";
import BaseLayer from "ol/layer/Base";
import HeatmapLayer from "ol/layer/Heatmap";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import View from "ol/View";
import VectorImageLayer from "ol/layer/VectorImage";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { containsCoordinate, createEmpty, extend, Extent, isEmpty } from "ol/extent";
import { getPointResolution, transform, transformExtent } from "ol/proj";
import Zoom from "ol/control/Zoom";
import { Fill, Stroke, Style, Text } from "ol/style";
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
import { MapEstilosFactory, RADIOS_FICHA, RADIOS_LECTURA } from "../../../shared/mapa/mapa-estilos";
import { estaUsandoHerramientas } from "../../../shared/mapa/herramientas-medicion";
import { MARCA_CAPA_RESALTADO } from "../../../shared/mapa/interaccion-gis";
import { ControladorMapaGis } from "../../../shared/mapa/controlador-mapa-gis";
import { PanelesMapaGisComponent } from "../../../shared/components/paneles-mapa-gis/paneles-mapa-gis.component";
import { TablaSeleccionMapaComponent } from "../../../shared/components/tabla-seleccion-mapa/tabla-seleccion-mapa.component";
import { ColumnaListado, FilaListado } from "../../../shared/utils/listado-excel";
import { CapaShape, ColumnaShape } from "../../../shared/utils/shapefile";
import { ExcelService } from "@host/_servicios/reportes/excel.service";
import { crearFeaturePunto, extraerCoordenada } from "../../../shared/mapa/geo.utils";
import {
  FiltroReclamosFundadosInfundadosRequest,
  ReclamoFundadoInfundado,
} from "@host/_models/vektors/Reclamos/ReclamosFundadosInfundados";
import { descripcionRazonFundado } from "@host/_models/vektors/Reclamos/RazonesFundado";
import { CapasSidebarComponent } from "../../../shared/components/capas-sidebar/capas-sidebar.component";
import { crearCapaWms, crearCapaOsm, crearCapaSatelital, CAPAS_BASE_UI } from "../../../shared/mapa/capas";
import { coordenadaLonLat, abrirGoogleStreetView } from "../../../shared/mapa/street-view";
import { abrirConsultaUsuario } from "../../../shared/dialogos/consulta-usuario.dialog";
import { abrirVistaPreviaShape } from "../../../shared/dialogos/vista-previa-shape.dialog";
import {
  EntradaLeyenda,
  fondoMuestra,
  GrupoLeyenda,
} from "../../../shared/components/leyenda-grupos/leyenda-grupos.component";
import {
  colorResultado,
  compararMasReciente,
  esFundado,
  esInfundado,
  esReincidente,
  estaFueraDePlazo,
  estaSinNotificar,
  etiquetaEnlaceRebaja,
  etiquetaInstancia,
  etiquetaInstanciaCorta,
  etiquetaPlazo,
  etiquetaResultado,
  etiquetaResultadoInstancia,
  etiquetaRevocado,
  FILTROS_RAPIDOS,
  FiltroRapido,
  grupoDelCliente,
  grupoNotificacion,
  grupoPlazo,
  gruposDelModo,
  guardaRazonFundado,
  MINIMO_REINCIDENTE,
  ModoPintado,
  MODOS_PINTADO,
  VistaMapa,
} from "./reglas-reclamo";

import { FotosFichaClienteComponent } from "../../../shared/components/fotos-ficha-cliente/fotos-ficha-cliente.component";
import { elementoEnPixel } from "../../../shared/mapa/elemento-bajo-cursor";
// Relleno del lote semitransparente: debajo se siguen viendo las calles y el número del lote.
const OPACIDAD_RELLENO_LOTE = 0.45;

const TODOS = "ALL";
// Grupos de la razón de un fundado que no es un código del catálogo.
const SIN_RAZON = "SIN";
const RAZON_NO_GUARDADA = "NOG";

/** Código de la razón de un reclamo fundado para agrupar y filtrar: el del catálogo, sin registrar o no guardada. */
function codigoDeRazon(reclamo: ReclamoFundadoInfundado): string {
  if (!guardaRazonFundado(reclamo)) return RAZON_NO_GUARDADA;
  return String(reclamo.razonfundado ?? "").trim() || SIN_RAZON;
}

function nombreDeRazon(codigo: string): string {
  if (codigo === SIN_RAZON) return "Sin registrar";
  if (codigo === RAZON_NO_GUARDADA) return "Conciliación o reconsideración (no guardan la razón)";
  return descripcionRazonFundado(codigo);
}

// Lado de la cuadrícula con que se buscan las zonas con más reclamos (la proyección del mapa está en metros).
const LADO_ZONA_METROS = 200;
const PROYECCION_METROS = "EPSG:3857";
const CANTIDAD_ZONAS = 3;
// Debajo de este zoom los números de reclamos por cliente se tapan unos a otros.
const ZOOM_MINIMO_CANTIDAD = 15;
// Mapa de calor: con 5 reclamos el cliente pesa lo máximo, y cada punto cubre unos 60 m del terreno a cualquier zoom
// (con un radio fijo en píxeles, al alejarse todo el centro se juntaba en una sola mancha roja).
const RECLAMOS_PESO_MAXIMO = 5;
const RADIO_CALOR_METROS = 60;
const RADIO_CALOR_MINIMO_PX = 3;
const RADIO_CALOR_MAXIMO_PX = 45;

function colorConOpacidad(colorHexadecimal: string, opacidad: number): string {
  const valor = parseInt(colorHexadecimal.replace("#", ""), 16);
  return `rgba(${(valor >> 16) & 255}, ${(valor >> 8) & 255}, ${valor & 255}, ${opacidad})`;
}

function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte * 1000) / total) / 10 : 0;
}

/** Un punto por cliente: el código de cliente lo comparten las coordenadas y el lote del GIS. */
function claveCliente(registro: { codcliente?: unknown }): string {
  return String(registro?.codcliente ?? "").trim();
}

// Los estados en que un reclamo ya tiene resultado, como en el reporte de reclamos fundados.
const ESTADOS_CON_RESULTADO = [
  { codigo: TODOS, descripcion: "TODAS" },
  { codigo: "004", descripcion: "004 - CONCILIACIÓN" },
  { codigo: "005", descripcion: "005 - RESOLUCIÓN" },
  { codigo: "007", descripcion: "007 - RESOL. RECONSIDERACIÓN" },
  { codigo: "009", descripcion: "009 - RESOL. APELACIÓN" },
];

// Los mismos rótulos del reporte de reclamos fundados.
const TIPOS_DE_RECLAMO: Record<string, string> = {
  "1": "CON FACTURACIÓN",
  "2": "SIN FACTURACIÓN",
  "3": "OPERACIONAL",
  "4": "ALCANCE GENERAL",
  "5": "VMA",
  "7": "SOLICITUD DE INSPECCIÓN",
};

const MEDIOS_DE_RECLAMO: Record<string, string> = {
  "001": "PERSONAL",
  "002": "TELÉFONO",
  "003": "INTERNET",
  "004": "ESCRITO",
};

// Las mismas columnas en la tabla y en el Excel.
const COLUMNAS_TABLA_RECLAMOS: ColumnaListado[] = [
  { campo: "nroreclamo", titulo: "N° reclamo", anchoExcel: 12 },
  { campo: "codcliente", titulo: "Cód. cliente", anchoExcel: 12 },
  { campo: "propietario", titulo: "Propietario", anchoExcel: 35 },
  { campo: "reclamante", titulo: "Reclamante", anchoExcel: 35 },
  { campo: "direccionCompleta", titulo: "Dirección", anchoExcel: 35 },
  { campo: "sucursal", titulo: "Sucursal", anchoExcel: 18 },
  { campo: "codsector", titulo: "Sector", anchoExcel: 8 },
  { campo: "fecharec", titulo: "Fecha del reclamo", anchoExcel: 14 },
  { campo: "tipoDeReclamo", titulo: "Tipo de reclamo", anchoExcel: 22 },
  { campo: "destiporeclam", titulo: "Concepto del reclamo", anchoExcel: 30 },
  { campo: "medioDelReclamo", titulo: "Medio", anchoExcel: 12 },
  { campo: "desoficina", titulo: "Oficina", anchoExcel: 20 },
  { campo: "instancia", titulo: "Instancia vigente", anchoExcel: 22 },
  { campo: "resultadoDelReclamo", titulo: "Resultado", anchoExcel: 14 },
  { campo: "razonDelFundado", titulo: "Razón del fundado", anchoExcel: 26 },
  { campo: "mesanio", titulo: "Meses reclamados", anchoExcel: 18 },
  { campo: "montoreclamo", titulo: "Monto reclamado (S/)", anchoExcel: 14 },
  { campo: "fechaate", titulo: "Fecha de atención", anchoExcel: 14 },
  { campo: "fecharesolconcil", titulo: "Fecha de conciliación", anchoExcel: 14 },
  { campo: "asistioConciliacion", titulo: "Asistió a la conciliación", anchoExcel: 12 },
  { campo: "fechares", titulo: "Fecha de resolución", anchoExcel: 14 },
  { campo: "fechamaxresol", titulo: "Fecha máxima de resolución", anchoExcel: 14 },
  { campo: "diasresolucion", titulo: "Días hábiles hasta resolver", anchoExcel: 12 },
  { campo: "diasplazo", titulo: "Plazo (días hábiles)", anchoExcel: 10 },
  { campo: "fechanotificares", titulo: "Fecha de notificación", anchoExcel: 14 },
  { campo: "fechalimitenotificacion", titulo: "Límite de notificación", anchoExcel: 14 },
  { campo: "estadoDelPlazo", titulo: "Estado del plazo", anchoExcel: 22 },
  { campo: "notificacionVigente", titulo: "Resolución vigente notificada", anchoExcel: 14 },
  { campo: "resultadoPrimeraInstancia", titulo: "Resultado 1ª instancia", anchoExcel: 14 },
  { campo: "resultadoReconsideracion", titulo: "Resultado reconsideración", anchoExcel: 14 },
  { campo: "fecharesolrecon", titulo: "Fecha reconsideración", anchoExcel: 14 },
  { campo: "resultadoApelacion", titulo: "Resultado apelación", anchoExcel: 14 },
  { campo: "fecharesolapela", titulo: "Fecha apelación", anchoExcel: 14 },
  { campo: "revocadoPorTrass", titulo: "Revocado por el TRASS", anchoExcel: 12 },
  { campo: "reclamoscliente", titulo: "Reclamos del cliente en el periodo", anchoExcel: 12 },
  { campo: "nrorebaja", titulo: "N° rebaja", anchoExcel: 12 },
  { campo: "cantidadDeRebajas", titulo: "Rebajas", anchoExcel: 8 },
  { campo: "totalreba", titulo: "Total rebajado (S/)", anchoExcel: 14 },
  { campo: "fecharebaja", titulo: "Fecha de rebaja", anchoExcel: 14 },
  { campo: "enlaceDeLaRebaja", titulo: "Enlace de la rebaja", anchoExcel: 30 },
  { campo: "fechainspeccion", titulo: "Fecha de inspección", anchoExcel: 14 },
  { campo: "resultadoinspeccion", titulo: "Resultado de la inspección interna", anchoExcel: 26 },
  { campo: "observacioninspeccion", titulo: "Observación de la inspección interna", anchoExcel: 60 },
  { campo: "observacionmedidor", titulo: "Observación del medidor (externa)", anchoExcel: 30 },
  { campo: "inspector", titulo: "Inspector", anchoExcel: 26 },
  { campo: "usuarioresolvio", titulo: "Resolvió", anchoExcel: 26 },
  { campo: "notificador", titulo: "Notificador", anchoExcel: 26 },
  { campo: "finalizado", titulo: "Fin del reclamo", anchoExcel: 10 },
  { campo: "conNulidad", titulo: "Con nulidad", anchoExcel: 10 },
];

// Los nombres de columna de un .dbf no pasan de 10 caracteres.
const COLUMNAS_SHAPE_RECLAMOS: ColumnaShape[] = [
  { nombre: "nroreclamo", campo: "nroreclamo" },
  { nombre: "codcliente", campo: "codcliente" },
  { nombre: "resultado", campo: "resultadoDelReclamo" },
  { nombre: "instancia", campo: "instancia" },
  { nombre: "razon", campo: "razonDelFundado" },
  { nombre: "reclamante", campo: "reclamante" },
  { nombre: "direccion", campo: "direccionCompleta" },
  { nombre: "f_reclamo", campo: "fecharec" },
  { nombre: "tipo", campo: "tipoDeReclamo" },
  { nombre: "concepto", campo: "destiporeclam" },
  { nombre: "f_resol", campo: "fechares" },
  { nombre: "plazo", campo: "estadoDelPlazo" },
  { nombre: "notificado", campo: "notificacionVigente" },
  { nombre: "reclamos", campo: "reclamoscliente" },
  { nombre: "tot_rebaja", campo: "totalreba" },
];

/** Lo que se consultó al pulsar BUSCAR: la cabecera, el Excel y la búsqueda de un cliente dicen esto, no lo que hay en el panel. */
interface ConsultaProcesada {
  filtro: FiltroReclamosFundadosInfundadosRequest;
  sede: string;
  instancia: string;
  desde: Date;
  hasta: Date;
}

interface Opcion {
  codigo: string;
  descripcion: string;
}

interface Tarjetas {
  reclamos: number;
  fundados: number;
  porcentajeFundados: number;
  infundados: number;
  fueraDePlazo: number;
  alLimite: number;
  deReincidentes: number;
  sinNotificar: number;
  totalRebajado: number;
}

interface ZonaConReclamos {
  nombre: string;
  reclamos: number;
  clientes: number;
  extension: Extent;
}

/** Filtro que sale de un clic en el resumen (una sede, una instancia o una razón). */
interface FiltroDelResumen {
  etiqueta: string;
  cumple: (reclamo: ReclamoFundadoInfundado) => boolean;
}

interface Indicador {
  codigo: string;
  nombre: string;
  valor: string;
  referencia: string;
}

interface FilaResumen {
  clave: string;
  nombre: string;
  total: number;
  fundados: number;
  porcentajeFundados: number;
  fueraDePlazo: number;
  apelados: number;
  esAtipica: boolean;
}

interface FilaRazon {
  codigo: string;
  nombre: string;
  cantidad: number;
  porcentaje: number;
}

interface ResumenReclamos {
  total: number;
  fundados: number;
  indicadores: Indicador[];
  sedes: FilaResumen[];
  sedesAtipicas: string;
  instancias: FilaResumen[];
  razones: FilaRazon[];
  porcentajeConCausa: number;
}

const VACIO: Tarjetas = {
  reclamos: 0,
  fundados: 0,
  porcentajeFundados: 0,
  infundados: 0,
  fueraDePlazo: 0,
  alLimite: 0,
  deReincidentes: 0,
  sinNotificar: 0,
  totalRebajado: 0,
};

@Component({
  selector: "app-reclamos-fundados-infundados",
  standalone: true,
  imports: [
    FotosFichaClienteComponent,
    CapasSidebarComponent,
    PanelesMapaGisComponent,
    TablaSeleccionMapaComponent,
    CommonModule,
    FormsModule,
    ButtonModule,
    ToastModule,
    SelectModule,
    InputTextModule,
    DatePickerModule,
    DialogModule,
  ],
  templateUrl: "./reclamos-fundados-infundados.component.html",
  styleUrl: "./reclamos-fundados-infundados.component.scss",
  providers: [MessageService, DialogService, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ReclamosFundadosInfundadosComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);

  /** Sede del usuario que inició sesión: es la que sale elegida por defecto. */
  private readonly codsedeSesion = (sessionStorage.getItem("codsede") ?? "").trim();
  private readonly gis = inject(GisConfigService);
  private readonly consultaCapasGis = inject(ConsultaCapasGisService);
  private readonly descargaShapeGis = inject(DescargaShapeGisService);
  private readonly excelService = inject(ExcelService);
  private readonly router = inject(Router);
  private readonly datePipe = inject(DatePipe);
  controladorGis?: ControladorMapaGis;
  private readonly estilos = new MapEstilosFactory();
  private readonly estilosCantidad = new Map<number, Style>();

  volverAlMain(): void {
    volverAlMainGeoreferencia(this.router);
  }
  private detenerObservadorMapa?: () => void;

  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;
  @ViewChild("mapContainer", { static: false })
  private mapContainer!: ElementRef<HTMLDivElement>;

  map!: OlMap;
  reclamosLayer!: VectorImageLayer<VectorSource>;
  lotesReclamosLayer!: VectorImageLayer<VectorSource>;
  calorLayer!: HeatmapLayer;
  lotesLayer!: TileLayer<TileWMS>;
  sectoresComercialesLayer!: TileLayer<TileWMS>;
  callesLayer!: TileLayer<TileWMS>;
  manzanasLayer!: TileLayer<TileWMS>;
  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;

  private registroCapas: Record<string, BaseLayer> = {};
  private capasVector: VectorImageLayer<VectorSource>[] = [];

  filtrosVisible = true;
  baseActive: string | null = "osm";
  cargando = false;
  descargandoShape = false;

  /** Lo que devolvió el procedimiento: es la única fuente del mapa, las tarjetas, la ficha, el resumen y el Excel. */
  resultadoBusquedaJson: ReclamoFundadoInfundado[] = [];
  /** Los reclamos que quedan con los filtros del panel, «Mostrar solo», el resumen y la leyenda. */
  reclamosVisibles: ReclamoFundadoInfundado[] = [];
  private conjuntoReclamosVisibles = new Set<ReclamoFundadoInfundado>();
  /** Reclamos visibles agrupados por cliente: se arma una vez por recálculo y lo usan el número del punto, las zonas, el calor y la ficha. */
  private reclamosVisiblesPorCliente = new Map<string, ReclamoFundadoInfundado[]>();
  totalClientesVisibles = 0;
  totalSinCoordenadas = 0;
  tarjetas: Tarjetas = { ...VACIO };
  zonas: ZonaConReclamos[] = [];

  /** Todos los reclamos cargados de cada cliente (para el historial de la ficha). */
  private reclamosPorCliente = new Map<string, ReclamoFundadoInfundado[]>();
  private puntoPorCliente = new Map<string, Feature>();
  /** Color de cada cliente visible; el que no está aquí no se pinta. */
  private grupoPorCliente = new Map<string, GrupoLeyenda>();

  readonly modosPintado = MODOS_PINTADO;
  modoPintado: ModoPintado = "resultado";
  vistaMapa: VistaMapa = "puntos";
  entradasLeyenda: EntradaLeyenda[] = [];
  /** Grupo elegido en la leyenda: el mapa muestra solo los clientes de ese grupo. `null` = todos. */
  grupoFiltrado: string | null = null;
  mostrarLeyenda = true;
  cargandoLotes = false;
  private busquedaLotes?: Subscription;

  readonly filtrosRapidos = FILTROS_RAPIDOS;
  filtrosRapidosActivos = new Set<string>();
  filtroDelResumen: FiltroDelResumen | null = null;

  listaSedes: any[] = [];
  readonly listaEstados = ESTADOS_CON_RESULTADO;
  opcionesTipo: Opcion[] = [];
  opcionesConcepto: Opcion[] = [];
  opcionesRazon: Opcion[] = [];
  opcionesSector: Opcion[] = [];

  selectedSede: string = TODOS;
  selectedEstado: string = TODOS;
  selectedTipo: string = TODOS;
  selectedConcepto: string = TODOS;
  selectedRazon: string = TODOS;
  selectedSector: string = TODOS;
  fechaInicial: Date = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  fechaFinal: Date = new Date();

  mostrarSearchPanel = false;
  searchCodCliente = "";
  isBusquedaClienteActiva = false;
  /** Cliente que se está viendo solo, para la etiqueta de la cabecera que permite volver a todos. */
  clienteBuscado = "";
  resultadoBusquedaOriginalJson: ReclamoFundadoInfundado[] | undefined = undefined;

  reclamoSeleccionado: ReclamoFundadoInfundado | null = null;
  featureSeleccionado: Feature | null = null;
  ref: DynamicDialogRef | null | undefined;

  mostrarListado = false;
  filasListado: FilaListado[] = [];
  subcabeceraListado: string[] = [];
  readonly columnasListado = COLUMNAS_TABLA_RECLAMOS;

  mostrarResumen = false;
  resumen: ResumenReclamos | null = null;

  readonly baseLayers = CAPAS_BASE_UI;

  commercialLayers = [
    { id: "reclamos", label: "Reclamos", active: true },
    { id: "lotesReclamos", label: "Lotes de los reclamos", active: true },
    { id: "lotes", label: "Lotes", active: true },
    { id: "sectores", label: "Sectores Comerciales", active: false },
    { id: "manzanas", label: "Manzanas", active: false },
    { id: "calles", label: "Calles", active: false },
  ];

  constructor(
    private reclamosService: ReclamosService,
    private consulGenericService: ConsulGenericService,
    private messageService: MessageService,
    private dialogService: DialogService,
  ) {}

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);
    this.crearMapa();

    this.consulGenericService
      .getconsultaService("SED", "ALL", "ALL", "ALL")
      .pipe(catchError(() => of<any[]>([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((sedes) => {
        this.listaSedes = [{ codigo: TODOS, descripcion: "TODAS" }, ...(sedes || [])];
        this.selectedSede = this.sedePorDefecto();
      });
  }

  /** La sede del usuario si está en la lista; si no, todas. */
  private sedePorDefecto(): string {
    const estaEnLaLista = this.listaSedes.some((sede) => String(sede.codigo).trim() === this.codsedeSesion);
    return this.codsedeSesion && estaEnLaLista ? this.codsedeSesion : TODOS;
  }

  consultaProcesada: ConsultaProcesada | null = null;

  get sedeProcesada(): string {
    return this.consultaProcesada?.sede ?? this.getDescSede();
  }

  get instanciaProcesada(): string {
    return this.consultaProcesada?.instancia ?? this.getDescEstado();
  }

  get desdeProcesado(): Date {
    return this.consultaProcesada?.desde ?? this.fechaInicial;
  }

  get hastaProcesado(): Date {
    return this.consultaProcesada?.hasta ?? this.fechaFinal;
  }

  getDescSede(): string {
    return this.listaSedes.find((sede) => sede.codigo === this.selectedSede)?.descripcion ?? "TODAS";
  }

  getDescEstado(): string {
    return this.listaEstados.find((estado) => estado.codigo === this.selectedEstado)?.descripcion ?? "TODAS";
  }

  private nombreDeSede(codsede: string): string {
    const sede = this.listaSedes.find((candidata) => String(candidata.codigo).trim() === codsede);
    return sede?.descripcion ?? codsede;
  }

  tipoDeReclamo(registro: ReclamoFundadoInfundado): string {
    const codigo = String(registro?.tiporeclamo ?? "").trim();
    return TIPOS_DE_RECLAMO[codigo] ?? codigo;
  }

  medioDelReclamo(registro: ReclamoFundadoInfundado): string {
    const codigo = String(registro?.medioreclamo ?? "").trim();
    return MEDIOS_DE_RECLAMO[codigo] ?? codigo;
  }

  get hayRangoDeFechasValido(): boolean {
    return !!this.fechaInicial && !!this.fechaFinal && this.fechaInicial <= this.fechaFinal;
  }

  get hayReclamosCargados(): boolean {
    return this.resultadoBusquedaJson.length > 0;
  }

  get cantidadFiltrosSobreLoCargado(): number {
    return (
      this.filtrosRapidosActivos.size +
      [this.selectedTipo, this.selectedConcepto, this.selectedRazon, this.selectedSector].filter((valor) => valor !== TODOS).length
    );
  }

  private fechaDesde(): string {
    return this.datePipe.transform(this.fechaInicial, "yyyy-MM-dd 00:00:00")!;
  }

  private fechaHasta(): string {
    return this.datePipe.transform(this.fechaFinal, "yyyy-MM-dd 23:59:59")!;
  }

  private sinTodos(valor: string | null | undefined): string | null {
    return !valor || valor === TODOS ? null : valor;
  }

  procesar(): void {
    if (!this.hayRangoDeFechasValido) {
      this.avisar("warn", "Aviso de usuario", "La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }

    this.cargando = true;

    const filtro: FiltroReclamosFundadosInfundadosRequest = {
      codsede: this.sinTodos(this.selectedSede),
      fechaini: this.fechaDesde(),
      fechafin: this.fechaHasta(),
      estadoreclamo: this.sinTodos(this.selectedEstado),
    };

    this.reclamosService
      .listarReclamosFundadosInfundados(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          this.filtrosVisible = false;
          this.isBusquedaClienteActiva = false;
          this.resultadoBusquedaOriginalJson = undefined;
          this.cerrarPopup();
          if (!response.success) {
            this.resultadoBusquedaJson = [];
            this.limpiarCapas();
            this.avisar("error", "Error", this.mensajeDeError(response.mensaje));
            return;
          }
          this.consultaProcesada = {
            filtro,
            sede: this.getDescSede(),
            instancia: this.getDescEstado(),
            desde: new Date(this.fechaInicial),
            hasta: new Date(this.fechaFinal),
          };
          this.resultadoBusquedaJson = response.data ?? [];
          this.armarOpcionesSobreLoCargado();
          if (this.resultadoBusquedaJson.length > 0) {
            this.actualizarCapasComerciales();
          } else {
            this.limpiarCapas();
            this.avisar("info", "Resultados", "No se encontraron reclamos con los filtros seleccionados");
          }
        },
        error: (err) => {
          console.error("Error al cargar reclamos:", err);
          this.cargando = false;
          this.limpiarCapas();
          this.resultadoBusquedaJson = [];
          this.avisar("error", "Error", "Ocurrió un error al cargar los reclamos");
        },
      });
  }

  limpiar(): void {
    this.selectedSede = this.sedePorDefecto();
    this.selectedEstado = TODOS;
    this.selectedTipo = TODOS;
    this.selectedConcepto = TODOS;
    this.selectedRazon = TODOS;
    this.selectedSector = TODOS;
    this.filtrosRapidosActivos = new Set();
    this.filtroDelResumen = null;
    this.fechaInicial = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    this.fechaFinal = new Date();
    this.limpiarCapas();
    this.resultadoBusquedaJson = [];
    this.consultaProcesada = null;
    this.armarOpcionesSobreLoCargado();
    this.cerrarPopup();
  }

  // ---------- Filtros sobre lo cargado ----------

  /** Las opciones salen de los reclamos cargados: no se ofrece lo que no hay. */
  private armarOpcionesSobreLoCargado(): void {
    const registros = this.resultadoBusquedaJson;
    const distintos = (obtener: (registro: ReclamoFundadoInfundado) => Opcion | null): Opcion[] => {
      const opciones = new Map<string, Opcion>();
      registros.forEach((registro) => {
        const opcion = obtener(registro);
        if (opcion && !opciones.has(opcion.codigo)) opciones.set(opcion.codigo, opcion);
      });
      const ordenadas = Array.from(opciones.values()).sort((primera, segunda) => primera.descripcion.localeCompare(segunda.descripcion));
      return [{ codigo: TODOS, descripcion: "TODOS" }, ...ordenadas];
    };
    const codigo = (valor: unknown) => String(valor ?? "").trim();

    this.opcionesTipo = distintos((registro) =>
      codigo(registro.tiporeclamo) ? { codigo: codigo(registro.tiporeclamo), descripcion: this.tipoDeReclamo(registro) } : null,
    );
    this.opcionesConcepto = distintos((registro) =>
      codigo(registro.codreclamo)
        ? { codigo: codigo(registro.codreclamo), descripcion: [codigo(registro.codreclamo), codigo(registro.destiporeclam)].filter(Boolean).join(" - ") }
        : null,
    );
    this.opcionesRazon = distintos((registro) => {
      if (!esFundado(registro)) return null;
      const razon = codigoDeRazon(registro);
      return { codigo: razon, descripcion: nombreDeRazon(razon).toUpperCase() };
    });
    this.opcionesSector = distintos((registro) =>
      codigo(registro.codsector) ? { codigo: codigo(registro.codsector), descripcion: `SECTOR ${codigo(registro.codsector)}` } : null,
    );

    const sigueDisponible = (valor: string, opciones: Opcion[]) => (opciones.some((opcion) => opcion.codigo === valor) ? valor : TODOS);
    this.selectedTipo = sigueDisponible(this.selectedTipo, this.opcionesTipo);
    this.selectedConcepto = sigueDisponible(this.selectedConcepto, this.opcionesConcepto);
    this.selectedRazon = sigueDisponible(this.selectedRazon, this.opcionesRazon);
    this.selectedSector = sigueDisponible(this.selectedSector, this.opcionesSector);
  }

  private cumpleFiltrosDelPanel(registro: ReclamoFundadoInfundado): boolean {
    const codigo = (valor: unknown) => String(valor ?? "").trim();
    if (this.selectedTipo !== TODOS && codigo(registro.tiporeclamo) !== this.selectedTipo) return false;
    if (this.selectedConcepto !== TODOS && codigo(registro.codreclamo) !== this.selectedConcepto) return false;
    if (this.selectedSector !== TODOS && codigo(registro.codsector) !== this.selectedSector) return false;
    if (this.selectedRazon !== TODOS) {
      if (!esFundado(registro) || codigoDeRazon(registro) !== this.selectedRazon) return false;
    }
    return true;
  }

  private cumpleFiltrosRapidos(registro: ReclamoFundadoInfundado): boolean {
    for (const filtro of FILTROS_RAPIDOS) {
      if (this.filtrosRapidosActivos.has(filtro.clave) && !filtro.cumple(registro)) return false;
    }
    return true;
  }

  estaActivoFiltroRapido(clave: string): boolean {
    return this.filtrosRapidosActivos.has(clave);
  }

  /** Los filtros se combinan; los que se contradicen (fundados e infundados) se apagan entre sí. */
  alternarFiltroRapido(clave: string): void {
    const activos = new Set(this.filtrosRapidosActivos);
    if (activos.has(clave)) {
      activos.delete(clave);
    } else {
      const filtro = FILTROS_RAPIDOS.find((candidato) => candidato.clave === clave);
      if (!filtro) return;
      FILTROS_RAPIDOS.forEach((otro: FiltroRapido) => {
        if (filtro.excluye?.includes(otro.clave) || otro.excluye?.includes(clave)) activos.delete(otro.clave);
      });
      activos.add(clave);
    }
    this.filtrosRapidosActivos = activos;
    this.recalcular();
  }

  quitarFiltrosRapidos(): void {
    this.filtrosRapidosActivos = new Set();
    this.recalcular();
  }

  quitarFiltroDelResumen(): void {
    this.filtroDelResumen = null;
    this.recalcular();
  }

  alCambiarFiltroSobreLoCargado(): void {
    this.recalcular();
  }

  // ---------- Mapa: un punto por cliente ----------

  private actualizarCapasComerciales(fitBounds = true): void {
    this.estilos.limpiar();
    this.limpiarCapas();

    const registros = this.resultadoBusquedaJson || [];
    if (registros.length === 0) return;

    registros.forEach((registro) => {
      const clave = claveCliente(registro);
      if (!clave) return;
      const reclamos = this.reclamosPorCliente.get(clave) ?? [];
      reclamos.push(registro);
      this.reclamosPorCliente.set(clave, reclamos);
    });
    this.reclamosPorCliente.forEach((reclamos) => reclamos.sort(compararMasReciente));

    const puntos: Feature[] = [];
    this.reclamosPorCliente.forEach((reclamos, clave) => {
      const conCoordenada = reclamos.find((reclamo) => extraerCoordenada(reclamo, ORIGENES_COORDENADA.usuario));
      if (!conCoordenada) return;
      const punto = crearFeaturePunto(conCoordenada, ORIGENES_COORDENADA.usuario);
      if (!punto) return;
      punto.set("_cliente", clave);
      // El mapa puede estar en grados: las zonas de 200 m se arman en metros (se convierte una sola vez).
      punto.set("_metros", transform((punto.getGeometry() as Point).getCoordinates(), this.gis.proyeccionMapa, PROYECCION_METROS));
      this.puntoPorCliente.set(clave, punto);
      puntos.push(punto);
    });
    this.reclamosLayer.getSource()!.addFeatures(puntos);

    this.recalcular();
    this.pintarLotes();
    this.ajustarVista(fitBounds);
  }

  /**
   * Aplica los filtros sobre lo cargado y repinta. El orden importa: primero los filtros por reclamo, luego el
   * color de cada cliente con los reclamos que le quedan, la leyenda (cuenta clientes) y al final el grupo elegido en ella.
   */
  private recalcular(): void {
    const filtrados = this.resultadoBusquedaJson.filter(
      (registro) =>
        this.cumpleFiltrosDelPanel(registro) &&
        this.cumpleFiltrosRapidos(registro) &&
        (!this.filtroDelResumen || this.filtroDelResumen.cumple(registro)),
    );

    const filtradosPorCliente = new Map<string, ReclamoFundadoInfundado[]>();
    filtrados.forEach((registro) => {
      const clave = claveCliente(registro);
      const reclamos = filtradosPorCliente.get(clave) ?? [];
      reclamos.push(registro);
      filtradosPorCliente.set(clave, reclamos);
    });

    const grupos = new Map<string, GrupoLeyenda>();
    filtradosPorCliente.forEach((reclamos, clave) => grupos.set(clave, grupoDelCliente(this.modoPintado, reclamos)));

    const totalClientes = grupos.size;
    this.entradasLeyenda = gruposDelModo(this.modoPintado)
      .map((grupo) => {
        let cantidad = 0;
        grupos.forEach((grupoDelCliente) => {
          if (grupoDelCliente.clave === grupo.clave) cantidad++;
        });
        return { grupo, cantidad, porcentaje: Math.round(porcentaje(cantidad, totalClientes)) };
      })
      .filter((entrada) => entrada.cantidad > 0);

    if (this.grupoFiltrado && !this.entradasLeyenda.some((entrada) => entrada.grupo.clave === this.grupoFiltrado)) {
      this.grupoFiltrado = null;
    }

    this.grupoPorCliente = new Map();
    grupos.forEach((grupo, clave) => {
      if (!this.grupoFiltrado || grupo.clave === this.grupoFiltrado) this.grupoPorCliente.set(clave, grupo);
    });
    this.reclamosVisibles = filtrados.filter((registro) => this.grupoPorCliente.has(claveCliente(registro)));
    this.conjuntoReclamosVisibles = new Set(this.reclamosVisibles);
    this.reclamosVisiblesPorCliente = new Map();
    this.reclamosVisibles.forEach((registro) => {
      const clave = claveCliente(registro);
      const reclamos = this.reclamosVisiblesPorCliente.get(clave);
      if (reclamos) reclamos.push(registro);
      else this.reclamosVisiblesPorCliente.set(clave, [registro]);
    });
    // El número sobre el punto cuenta lo mismo que el listado: los reclamos visibles del cliente.
    this.puntoPorCliente.forEach((punto, clave) =>
      punto.set("_cantidad", this.reclamosVisiblesPorCliente.get(clave)?.length ?? 0, true),
    );
    this.totalClientesVisibles = this.grupoPorCliente.size;
    this.totalSinCoordenadas = this.reclamosVisibles.filter((registro) => !this.puntoPorCliente.has(claveCliente(registro))).length;

    this.calcularTarjetas();
    this.calcularZonas();
    this.actualizarCalor();
    if (this.mostrarListado) this.armarListado();
    if (this.resumen) this.resumen = this.calcularResumen();

    if (this.reclamoSeleccionado && !this.grupoPorCliente.has(claveCliente(this.reclamoSeleccionado))) {
      this.cerrarPopup();
    }
    this.refrescarCapasVector();
  }

  private calcularTarjetas(): void {
    const tarjetas: Tarjetas = { ...VACIO };
    this.reclamosVisibles.forEach((reclamo) => {
      tarjetas.reclamos++;
      if (esFundado(reclamo)) tarjetas.fundados++;
      if (esInfundado(reclamo)) tarjetas.infundados++;
      if (estaFueraDePlazo(reclamo)) tarjetas.fueraDePlazo++;
      if (String(reclamo.estadoplazo ?? "").trim() === "AL") tarjetas.alLimite++;
      if (esReincidente(reclamo)) tarjetas.deReincidentes++;
      if (estaSinNotificar(reclamo)) tarjetas.sinNotificar++;
      // Cada rebaja está asignada a un solo reclamo en el procedimiento: la suma no la cuenta dos veces.
      tarjetas.totalRebajado += Number(reclamo.totalreba) || 0;
    });
    tarjetas.porcentajeFundados = Math.round(porcentaje(tarjetas.fundados, tarjetas.reclamos));
    this.tarjetas = tarjetas;
  }

  /** Celdas de 200 m con más reclamos visibles; el nombre lleva el sector que más se repite en la celda. */
  private calcularZonas(): void {
    const celdas = new Map<string, { reclamos: number; clientes: number; sectores: Map<string, number>; extension: Extent }>();
    this.grupoPorCliente.forEach((_grupo, clave) => {
      const punto = this.puntoPorCliente.get(clave);
      if (!punto) return;
      const [x, y] = punto.get("_metros") as number[];
      const columna = Math.floor(x / LADO_ZONA_METROS);
      const fila = Math.floor(y / LADO_ZONA_METROS);
      const llave = `${columna}_${fila}`;
      const celda = celdas.get(llave) ?? {
        reclamos: 0,
        clientes: 0,
        sectores: new Map<string, number>(),
        extension: transformExtent(
          [columna * LADO_ZONA_METROS, fila * LADO_ZONA_METROS, (columna + 1) * LADO_ZONA_METROS, (fila + 1) * LADO_ZONA_METROS],
          PROYECCION_METROS,
          this.gis.proyeccionMapa,
        ),
      };
      const reclamos = this.reclamosVisiblesPorCliente.get(clave) ?? [];
      celda.reclamos += reclamos.length;
      celda.clientes++;
      const sector = String(reclamos[0]?.codsector ?? "").trim();
      if (sector) celda.sectores.set(sector, (celda.sectores.get(sector) ?? 0) + reclamos.length);
      celdas.set(llave, celda);
    });

    this.zonas = Array.from(celdas.values())
      .filter((celda) => celda.reclamos > 1)
      .sort((primera, segunda) => segunda.reclamos - primera.reclamos || segunda.clientes - primera.clientes)
      .slice(0, CANTIDAD_ZONAS)
      .map((celda, posicion) => {
        const sector = Array.from(celda.sectores.entries()).sort((primero, segundo) => segundo[1] - primero[1])[0]?.[0];
        return {
          nombre: `Zona ${posicion + 1}${sector ? " · Sector " + sector : ""}`,
          reclamos: celda.reclamos,
          clientes: celda.clientes,
          extension: celda.extension,
        };
      });
  }

  irAZona(zona: ZonaConReclamos): void {
    this.controladorGis?.encuadrarEnZonaLibre(zona.extension);
  }

  private actualizarCalor(): void {
    const origen = this.calorLayer?.getSource();
    if (!origen) return;
    origen.clear();
    const elementos: Feature[] = [];
    this.reclamosVisiblesPorCliente.forEach((reclamos, clave) => {
      const cantidad = reclamos.length;
      const punto = this.puntoPorCliente.get(clave);
      if (!punto) return;
      elementos.push(
        new Feature({
          geometry: (punto.getGeometry() as Point).clone(),
          peso: Math.min(1, cantidad / RECLAMOS_PESO_MAXIMO),
        }),
      );
    });
    origen.addFeatures(elementos);
  }

  elegirModoPintado(modo: ModoPintado): void {
    if (this.modoPintado === modo) return;
    this.modoPintado = modo;
    this.grupoFiltrado = null;
    this.recalcular();
  }

  get explicacionModo(): string {
    return MODOS_PINTADO.find((opcion) => opcion.modo === this.modoPintado)?.explicacion ?? "";
  }

  elegirVista(vista: VistaMapa): void {
    this.vistaMapa = vista;
    this.aplicarVisibilidadReclamos();
  }

  private get capaReclamosEncendida(): boolean {
    return this.commercialLayers.find((capa) => capa.id === "reclamos")?.active ?? true;
  }

  private aplicarVisibilidadReclamos(): void {
    const encendida = this.capaReclamosEncendida;
    const lotesEncendidos = this.commercialLayers.find((capa) => capa.id === "lotesReclamos")?.active ?? true;
    this.reclamosLayer.setVisible(encendida && this.vistaMapa === "puntos");
    this.calorLayer.setVisible(encendida && this.vistaMapa === "calor");
    // Los lotes pintados por grupo le meten ruido al calor: en esa vista se apagan.
    this.lotesReclamosLayer.setVisible(lotesEncendidos && this.vistaMapa === "puntos");
  }

  private ajustarVista(fitBounds: boolean): void {
    const origenReclamos = this.reclamosLayer.getSource()!;

    if (origenReclamos.getFeatures().length === 0) {
      this.avisar("info", "Aviso", "No se encontraron coordenadas para los reclamos");
      return;
    }

    if (fitBounds) {
      this.map
        .getView()
        .fit(origenReclamos.getExtent()!, { duration: 800, maxZoom: 18, padding: [60, 60, 60, 60] });
    }
    // Sin encuadre es la búsqueda de un cliente: avisar "reclamos cargados" ahí solo confunde.
    if (!fitBounds) return;
    this.avisar("success", "Proceso completado", "Reclamos cargados en el mapa");
  }

  private limpiarCapas(): void {
    this.capasVector.forEach((capa) => capa?.getSource()?.clear());
    this.calorLayer?.getSource()?.clear();
    this.controladorGis?.descartarListado();
    this.reclamosPorCliente = new Map();
    this.puntoPorCliente = new Map();
    this.grupoPorCliente = new Map();
    this.reclamosVisibles = [];
    this.conjuntoReclamosVisibles = new Set();
    this.reclamosVisiblesPorCliente = new Map();
    this.totalClientesVisibles = 0;
    this.totalSinCoordenadas = 0;
    this.tarjetas = { ...VACIO };
    this.zonas = [];
    this.busquedaLotes?.unsubscribe();
    this.cargandoLotes = false;
    this.entradasLeyenda = [];
    this.grupoFiltrado = null;
    this.filasListado = [];
    this.mostrarListado = false;
    this.resumen = null;
    this.mostrarResumen = false;
  }

  /** Trae del GIS el polígono del lote de cada cliente con reclamo; su color sale del mismo grupo que el punto. */
  private pintarLotes(): void {
    this.busquedaLotes?.unsubscribe();
    const clientes = Array.from(this.reclamosPorCliente.keys());
    if (clientes.length === 0) return;

    this.cargandoLotes = true;
    this.busquedaLotes = this.consultaCapasGis
      .buscarPrediosDeClientes(clientes, this.gis.proyeccionMapa)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lotes) => {
        this.cargandoLotes = false;
        const features: Feature[] = [];
        lotes.forEach((geometria, codigo) =>
          features.push(new Feature({ geometry: geometria, codcliente: Number(codigo), _cliente: String(codigo).trim() })),
        );
        this.lotesReclamosLayer.getSource()!.addFeatures(features);
      });
  }

  /** Clic en un grupo de la leyenda: el mapa muestra solo ese grupo y lo encuadra; otro clic vuelve a todos. */
  filtrarPorGrupo(clave: string): void {
    this.grupoFiltrado = this.grupoFiltrado === clave ? null : clave;
    this.recalcular();

    const extension = createEmpty();
    this.grupoPorCliente.forEach((_grupo, cliente) => {
      const punto = this.puntoPorCliente.get(cliente);
      if (punto) extend(extension, punto.getGeometry()!.getExtent());
    });
    if (!isEmpty(extension)) {
      this.map.getView().fit(extension, { duration: 700, maxZoom: 19, padding: [120, 120, 120, 340] });
    }
  }

  muestraDeGrupo(grupo: GrupoLeyenda): string {
    return fondoMuestra(grupo);
  }

  // ---------- Etiquetas (todas salen de reglas-reclamo) ----------

  resultadoDelReclamo(registro: ReclamoFundadoInfundado): string {
    return etiquetaResultado(registro);
  }

  colorDelResultado(registro: ReclamoFundadoInfundado): string {
    return colorResultado(registro);
  }

  instanciaDelReclamo(registro: ReclamoFundadoInfundado): string {
    return etiquetaInstancia(registro);
  }

  /** La instancia en pocas letras, para la lista de reclamos del cliente. */
  instanciaCorta(registro: ReclamoFundadoInfundado): string {
    return etiquetaInstanciaCorta(registro);
  }

  razonDelFundado(registro: ReclamoFundadoInfundado): string {
    return esFundado(registro) ? descripcionRazonFundado(registro.razonfundado) : "";
  }

  plazoDelReclamo(registro: ReclamoFundadoInfundado): GrupoLeyenda {
    return grupoPlazo(registro);
  }

  notificacionDelReclamo(registro: ReclamoFundadoInfundado): GrupoLeyenda {
    return grupoNotificacion(registro);
  }

  resultadoDeInstancia(resultado: number | null | undefined): string {
    return etiquetaResultadoInstancia(resultado);
  }

  enlaceDeLaRebaja(registro: ReclamoFundadoInfundado): string {
    return etiquetaEnlaceRebaja(registro);
  }

  /** Avance del plazo de la primera instancia, en porcentaje de los días hábiles del plazo. */
  avanceDelPlazo(registro: ReclamoFundadoInfundado): number {
    const plazo = Number(registro.diasplazo);
    const usados = Number(registro.diasresolucion);
    if (!(plazo > 0) || registro.diasresolucion === null || registro.diasresolucion === undefined) return 0;
    return Math.min(100, Math.round((usados * 100) / plazo));
  }

  /** Fecha de notificación de la instancia vigente (la notificación de la tarjeta y del mapa es la de esa instancia). */
  fechaNotificacionVigente(registro: ReclamoFundadoInfundado): string {
    const estado = String(registro.estadorec ?? "").trim();
    if (estado === "007") return registro.fechanotificarecon ?? "";
    if (estado === "009") return registro.fechanotificaapela ?? "";
    if (estado === "005") return registro.fechanotificares ?? "";
    return "";
  }

  get reclamosDelClienteSeleccionado(): ReclamoFundadoInfundado[] {
    if (!this.reclamoSeleccionado) return [];
    return this.reclamosPorCliente.get(claveCliente(this.reclamoSeleccionado)) ?? [this.reclamoSeleccionado];
  }

  /** Lugar del reclamo elegido en la lista del cliente (el más reciente es el 1). */
  get posicionDelReclamoSeleccionado(): number {
    return this.reclamosDelClienteSeleccionado.indexOf(this.reclamoSeleccionado as ReclamoFundadoInfundado) + 1;
  }

  /** La lista del cliente muestra todos sus reclamos cargados; los que no cumplen los filtros se ven apagados. */
  estaVisible(reclamo: ReclamoFundadoInfundado): boolean {
    return this.conjuntoReclamosVisibles.has(reclamo);
  }

  get fundadosDelClienteSeleccionado(): number {
    return this.reclamosDelClienteSeleccionado.filter(esFundado).length;
  }

  elegirReclamoDelHistorial(reclamo: ReclamoFundadoInfundado): void {
    this.reclamoSeleccionado = reclamo;
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
    this.clienteBuscado = "";
    this.controladorGis?.quitarPredio();
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

  buscarPorCodCliente(): void {
    const codigo = String(this.searchCodCliente || "").trim();
    if (!codigo) {
      this.reiniciarBusqueda();
      return;
    }
    if (!/^\d+$/.test(codigo)) {
      this.avisar("warn", "Aviso", "El código de cliente solo lleva números.");
      return;
    }

    const reclamosCargados = (this.resultadoBusquedaOriginalJson ?? this.resultadoBusquedaJson).filter(
      (registro) => claveCliente(registro) === codigo,
    );

    if (reclamosCargados.length > 0) {
      this.mostrarSoloReclamosDelCliente(reclamosCargados, codigo);
      return;
    }

    // El cliente se busca con lo mismo que se consultó, para no mezclar en el mapa reclamos de otro rango o sede.
    if (!this.consultaProcesada && !this.hayRangoDeFechasValido) {
      this.avisar("warn", "Aviso", "Corrija el rango de fechas para buscar un cliente que no está en el mapa.");
      return;
    }
    const filtro: FiltroReclamosFundadosInfundadosRequest = this.consultaProcesada?.filtro ?? {
      codsede: this.sinTodos(this.selectedSede),
      fechaini: this.fechaDesde(),
      fechafin: this.fechaHasta(),
      estadoreclamo: this.sinTodos(this.selectedEstado),
    };

    this.cargando = true;
    this.reclamosService
      .buscarReclamosFundadosInfundados({ ...filtro, codcliente: Number(codigo) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          if (!response.success) {
            this.avisar("error", "Error", this.mensajeDeError(response.mensaje));
            return;
          }
          if (response.data && response.data.length > 0) {
            this.searchCodCliente = "";
            this.mostrarSoloReclamosDelCliente(response.data, codigo);
          } else {
            this.avisar("warn", "Aviso", "Ese cliente no tiene reclamos en el rango de fechas.");
          }
        },
        error: () => {
          this.cargando = false;
          this.avisar("error", "Error", "Ocurrió un error al buscar el cliente.");
        },
      });
  }

  /** Deja en el mapa solo los reclamos de ese cliente, recordando el resultado anterior para poder volver. */
  private mostrarSoloReclamosDelCliente(reclamos: ReclamoFundadoInfundado[], codigo: string): void {
    if (!this.isBusquedaClienteActiva) {
      this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
      this.isBusquedaClienteActiva = true;
    }
    this.clienteBuscado = codigo;
    // El buscador ocupa el mismo rincón que la ficha: se cierra y la búsqueda queda como etiqueta en la cabecera.
    this.mostrarSearchPanel = false;
    this.resultadoBusquedaJson = reclamos;
    this.cerrarPopup();
    this.actualizarCapasComerciales(false);

    const coordenada = extraerCoordenada(reclamos[0], ORIGENES_COORDENADA.usuario);
    if (coordenada) {
      this.map.getView().animate({ center: coordenada, zoom: 21, duration: 700 });
    }
    const punto = this.puntoPorCliente.get(codigo);
    if (punto) this.seleccionarFeature(punto);
    this.controladorGis?.marcarPredio(codigo);
    if (this.reclamosVisibles.length < reclamos.length) {
      this.avisar("info", "Aviso", "Algunos reclamos del cliente no se ven por los filtros de «Mostrar solo» o del panel.");
    } else if (reclamos.length > 1) {
      this.avisar("info", "Aviso", `El cliente ${codigo} tiene ${reclamos.length} reclamos en el rango: están en su ficha.`);
    }
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

    this.reclamosLayer = new VectorImageLayer({
      imageRatio: 1.5,
      source: new VectorSource(),
      visible: true,
      zIndex: 20,
      style: (feature) => {
        const grupo = this.grupoPorCliente.get(feature.get("_cliente"));
        if (!grupo) return undefined;
        const cantidad = Number(feature.get("_cantidad")) || 1;
        const zoom = zoomActual();
        const estiloPunto = this.estilos.punto({
          forma: "circulo",
          color: grupo.color,
          zoom,
          seleccionado: feature === this.featureSeleccionado,
          etiqueta: feature.get("codcliente"),
          // El cliente con varios reclamos se ve más grande, como en la maqueta.
          ...(cantidad > 1 ? RADIOS_FICHA : RADIOS_LECTURA),
        });
        return cantidad > 1 && zoom >= ZOOM_MINIMO_CANTIDAD ? [estiloPunto, this.estiloCantidad(cantidad)] : estiloPunto;
      },
    });

    this.lotesReclamosLayer = new VectorImageLayer({
      imageRatio: 1.5,
      source: new VectorSource(),
      visible: true,
      zIndex: 10,
      style: (feature) => {
        const grupo = this.grupoPorCliente.get(feature.get("_cliente"));
        if (!grupo) return undefined;
        const seleccionado = feature.get("_cliente") === this.featureSeleccionado?.get("_cliente");
        return [
          new Style({ stroke: new Stroke({ color: "rgba(255, 255, 255, 0.9)", width: seleccionado ? 6 : 3 }) }),
          new Style({
            fill: new Fill({ color: colorConOpacidad(grupo.color, seleccionado ? 0.7 : OPACIDAD_RELLENO_LOTE) }),
            stroke: new Stroke({ color: grupo.color, width: seleccionado ? 3 : 1.5 }),
          }),
        ];
      },
    });

    this.calorLayer = new HeatmapLayer({
      source: new VectorSource(),
      visible: false,
      zIndex: 19,
      blur: 6,
      radius: 4,
      weight: (feature) => Number(feature.get("peso")) || 0,
    });

    this.capasVector = [this.reclamosLayer, this.lotesReclamosLayer];

    this.registroCapas = {
      reclamos: this.reclamosLayer,
      lotesReclamos: this.lotesReclamosLayer,
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
        this.lotesReclamosLayer,
        this.calorLayer,
        this.reclamosLayer,
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
        columnas: COLUMNAS_TABLA_RECLAMOS,
        tituloReporte: "RECLAMOS FUNDADOS E INFUNDADOS",
        nombreArchivo: "reclamos_fundados_infundados_area_",
        origen: ORIGENES_COORDENADA.usuario,
        // El área dibujada lista lo que se ve en el mapa: respeta los filtros y la leyenda.
        registros: () => this.reclamosVisibles,
        aFila: (registro) => this.aFilaTabla(registro as ReclamoFundadoInfundado),
        subcabecera: () => this.subcabeceraReporte(),
        excelService: this.excelService,
      },
    });

    this.initClick();
    this.map.getView().on("change:resolution", () => this.ajustarRadioCalor());
    this.ajustarRadioCalor();
  }

  /** Radio del calor en píxeles según los metros que representa cada píxel al zoom actual. */
  private ajustarRadioCalor(): void {
    const vista = this.map.getView();
    const resolucion = vista.getResolution();
    if (!resolucion) return;
    const metrosPorPixel = getPointResolution(vista.getProjection(), resolucion, vista.getCenter() ?? [0, 0], "m");
    const radio = Math.min(RADIO_CALOR_MAXIMO_PX, Math.max(RADIO_CALOR_MINIMO_PX, RADIO_CALOR_METROS / metrosPorPixel));
    this.calorLayer.setRadius(radio);
    this.calorLayer.setBlur(radio * 1.5);
  }

  /** Número de reclamos del cliente sobre su punto. */
  private estiloCantidad(cantidad: number): Style {
    let estilo = this.estilosCantidad.get(cantidad);
    if (!estilo) {
      estilo = new Style({
        zIndex: 2,
        text: new Text({
          text: String(cantidad),
          font: "800 10px Inter, system-ui, sans-serif",
          offsetX: 11,
          offsetY: -11,
          padding: [1, 4, 0, 4],
          fill: new Fill({ color: "#ffffff" }),
          backgroundFill: new Fill({ color: "#0f172a" }),
          backgroundStroke: new Stroke({ color: "#ffffff", width: 1.5 }),
        }),
      });
      this.estilosCantidad.set(cantidad, estilo);
    }
    return estilo;
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
    const subcabecera = [
      `Sede: ${this.sedeProcesada}`,
      `Instancia: ${this.instanciaProcesada}`,
      `Del ${this.datePipe.transform(this.desdeProcesado, "dd/MM/yyyy")} al ${this.datePipe.transform(this.hastaProcesado, "dd/MM/yyyy")}`,
    ];
    const filtros = this.descripcionFiltrosSobreLoCargado();
    if (filtros) subcabecera.push(`Mostrar solo: ${filtros}`);
    return subcabecera;
  }

  /** Lo que se eligió sobre lo cargado, para que el Excel diga de dónde salen sus filas. */
  private descripcionFiltrosSobreLoCargado(): string {
    const descripcion = (valor: string, opciones: Opcion[]) => opciones.find((opcion) => opcion.codigo === valor)?.descripcion ?? valor;
    const partes: string[] = [];
    if (this.selectedTipo !== TODOS) partes.push(`tipo ${descripcion(this.selectedTipo, this.opcionesTipo)}`);
    if (this.selectedConcepto !== TODOS) partes.push(`concepto ${descripcion(this.selectedConcepto, this.opcionesConcepto)}`);
    if (this.selectedRazon !== TODOS) partes.push(`razón ${descripcion(this.selectedRazon, this.opcionesRazon)}`);
    if (this.selectedSector !== TODOS) partes.push(descripcion(this.selectedSector, this.opcionesSector).toLowerCase());
    FILTROS_RAPIDOS.filter((filtro) => this.filtrosRapidosActivos.has(filtro.clave)).forEach((filtro) => partes.push(filtro.nombre.toLowerCase()));
    if (this.filtroDelResumen) partes.push(this.filtroDelResumen.etiqueta.toLowerCase());
    if (this.grupoFiltrado) {
      const grupo = this.entradasLeyenda.find((entrada) => entrada.grupo.clave === this.grupoFiltrado)?.grupo;
      if (grupo) partes.push(`clientes «${grupo.etiqueta.toLowerCase()}» por ${this.modoPintado}`);
    }
    return partes.join(", ");
  }

  setBaseLayer(id: string): void {
    this.baseActive = id;
    this.osmLayer.setVisible(id === "osm");
    this.satelitalLayer.setVisible(id === "satelital");
  }

  toggleCommercialLayer(opcionCapa: any): void {
    opcionCapa.active = !opcionCapa.active;
    if (opcionCapa.id === "reclamos" || opcionCapa.id === "lotesReclamos") {
      this.aplicarVisibilidadReclamos();
      return;
    }
    this.registroCapas[opcionCapa.id]?.setVisible(opcionCapa.active);
  }

  onSidebarToggle(): void {
    setTimeout(() => this.map?.updateSize(), 300);
  }

  private initClick(): void {
    this.map.on("singleclick", (evento) => {
      if (estaUsandoHerramientas(this.map)) return;
      const feature = elementoEnPixel(
        this.map,
        evento.pixel,
        (capa) => !capa.get("isDrawLayer") && !capa.get(MARCA_CAPA_RESALTADO) && capa !== this.calorLayer,
      )?.elemento;

      if (feature && this.grupoPorCliente.has(feature.get("_cliente"))) {
        this.seleccionarFeature(feature);
      } else {
        this.cerrarPopup();
        this.controladorGis?.consultarPunto(evento.coordinate);
      }
    });
  }

  /** La dirección viene armada del procedimiento; si no, se arma con la calle y el número. */
  direccionDe(registro: Record<string, unknown>): string {
    const direccion = String(registro["direccion"] ?? "").trim();
    if (direccion) return direccion;
    return [registro["descripcioncorta"], registro["descripcioncalle"], registro["nrocalle"]]
      .filter((parte) => parte !== null && parte !== undefined && String(parte).trim() !== "")
      .join(" ");
  }

  /** Una fila de la tabla y del Excel; lo que no tiene dato queda en blanco. */
  private aFilaTabla(registro: ReclamoFundadoInfundado): FilaListado {
    const tieneConciliacion = !!String(registro.fecharesolconcil ?? "").trim();
    const tieneRebaja = Number(registro.cantidadrebajas) > 0;
    const notificacion = String(registro.notificacion ?? "").trim();
    return {
      ...registro,
      direccionCompleta: this.direccionDe(registro),
      tipoDeReclamo: this.tipoDeReclamo(registro),
      medioDelReclamo: this.medioDelReclamo(registro),
      instancia: etiquetaInstancia(registro),
      resultadoDelReclamo: etiquetaResultado(registro),
      razonDelFundado: this.razonDelFundado(registro),
      asistioConciliacion: tieneConciliacion ? (Number(registro.asistioconciliacion) === 1 ? "SI" : "NO") : "",
      estadoDelPlazo: String(registro.estadoplazo ?? "").trim() === "NA" ? "" : etiquetaPlazo(registro),
      notificacionVigente: notificacion === "SI" || notificacion === "NO" ? notificacion : "",
      resultadoPrimeraInstancia: etiquetaResultadoInstancia(registro.resultadoprimera),
      resultadoReconsideracion: etiquetaResultadoInstancia(registro.resultadoreconsideracion),
      resultadoApelacion:
        Number(registro.improcedente) === 1 ? "Improcedente" : etiquetaResultadoInstancia(registro.resultadoapelacion),
      revocadoPorTrass: etiquetaRevocado(registro),
      cantidadDeRebajas: tieneRebaja ? registro.cantidadrebajas : null,
      enlaceDeLaRebaja: etiquetaEnlaceRebaja(registro),
      finalizado: registro.procesado ? "SI" : "NO",
      conNulidad: Number(registro.nulidad) === 1 ? "SI" : "",
    };
  }

  // ---------- Listado y Excel ----------

  abrirListado(): void {
    if (!this.hayReclamosCargados) return;
    this.controladorGis?.descartarListado();
    this.mostrarListado = true;
    this.armarListado();
  }

  cerrarListado(): void {
    this.mostrarListado = false;
  }

  private armarListado(): void {
    this.filasListado = this.reclamosVisibles.map((registro) => this.aFilaTabla(registro));
    this.subcabeceraListado = this.subcabeceraReporte();
  }

  // Se ubica por número de reclamo: un cliente puede tener varios.
  ubicarFilaEnMapa(fila: FilaListado): void {
    const reclamo = this.resultadoBusquedaJson.find(
      (registro) =>
        String(registro.nroreclamo ?? "") === String(fila["nroreclamo"] ?? "") &&
        String(registro.codsede ?? "") === String(fila["codsede"] ?? "") &&
        claveCliente(registro) === claveCliente(fila),
    );
    const punto = this.puntoPorCliente.get(claveCliente(fila));
    if (!reclamo || !punto) {
      this.avisar("warn", "Aviso", `El cliente ${fila["codcliente"] ?? ""} no tiene coordenadas para ubicarlo.`);
      return;
    }
    this.seleccionarFeature(punto, reclamo);
    this.controladorGis?.encuadrarEnZonaLibre(punto.getGeometry()!.getExtent());
  }

  // Los dos popups ocupan el mismo lugar: abrir el del reclamo cierra el de GIS.
  // La ficha abre en el reclamo más reciente del cliente que se ve con los filtros.
  private seleccionarFeature(feature: Feature, reclamoElegido?: ReclamoFundadoInfundado): void {
    this.controladorGis?.cerrarPopupGis();
    const clave = String(feature.get("_cliente") ?? claveCliente(feature.getProperties())).trim();
    const punto = this.puntoPorCliente.get(clave);
    const visibles = [...(this.reclamosVisiblesPorCliente.get(clave) ?? [])].sort(compararMasReciente);
    const reclamo = reclamoElegido ?? visibles[0];
    if (!punto || !reclamo) return;
    this.featureSeleccionado = punto;
    this.reclamoSeleccionado = reclamo;
    this.refrescarCapasVector();
  }

  cerrarPopup(): void {
    this.reclamoSeleccionado = null;
    this.featureSeleccionado = null;
    this.refrescarCapasVector();
  }

  private refrescarCapasVector(): void {
    this.reclamosLayer?.changed();
    this.lotesReclamosLayer?.changed();
  }

  abrirStreetView(x: unknown, y: unknown): void {
    const lonLat = coordenadaLonLat(x, y, this.gis.proyeccionUtm);
    if (!lonLat) {
      this.avisar("warn", "Aviso", "No hay coordenadas válidas para abrir Street View.");
      return;
    }
    abrirGoogleStreetView(lonLat);
  }

  verMasInformacion(codcliente: number | string | undefined): void {
    if (codcliente === undefined || codcliente === null || codcliente === "") return;
    abrirConsultaUsuario(this.dialogService, String(codcliente), this.reclamoSeleccionado?.codsuc).then(
      (referencia) => (this.ref = referencia),
    );
  }

  // ---------- Resumen ----------

  abrirResumen(): void {
    if (!this.hayReclamosCargados) return;
    this.resumen = this.calcularResumen();
    this.mostrarResumen = true;
  }

  alCerrarResumen(): void {
    this.mostrarResumen = false;
    this.resumen = null;
  }

  /** Todo sale de los reclamos visibles: los totales por sede, por instancia y por razón suman lo mismo que las tarjetas. */
  private calcularResumen(): ResumenReclamos {
    const reclamos = this.reclamosVisibles;
    const total = reclamos.length;
    const fundados = reclamos.filter(esFundado);

    const agrupar = (clave: (reclamo: ReclamoFundadoInfundado) => string, nombre: (codigo: string) => string): FilaResumen[] => {
      const filas = new Map<string, FilaResumen>();
      reclamos.forEach((reclamo) => {
        const codigo = clave(reclamo);
        const fila = filas.get(codigo) ?? {
          clave: codigo,
          nombre: nombre(codigo),
          total: 0,
          fundados: 0,
          porcentajeFundados: 0,
          fueraDePlazo: 0,
          apelados: 0,
          esAtipica: false,
        };
        fila.total++;
        if (esFundado(reclamo)) fila.fundados++;
        if (estaFueraDePlazo(reclamo)) fila.fueraDePlazo++;
        if (String(reclamo.estadorec ?? "").trim() === "009") fila.apelados++;
        filas.set(codigo, fila);
      });
      return Array.from(filas.values())
        .map((fila) => ({ ...fila, porcentajeFundados: porcentaje(fila.fundados, fila.total) }))
        .sort((primera, segunda) => segunda.total - primera.total);
    };

    const porcentajeGeneral = porcentaje(fundados.length, total);
    // Una sede con suficientes reclamos que se aleja mucho del porcentaje general merece revisar el criterio o la carga.
    const sedes = agrupar((reclamo) => String(reclamo.codsede ?? "").trim(), (codigo) => this.nombreDeSede(codigo)).map((fila) => ({
      ...fila,
      esAtipica: fila.total >= 20 && Math.abs(fila.porcentajeFundados - porcentajeGeneral) >= 30,
    }));
    const instancias = agrupar((reclamo) => String(reclamo.estadorec ?? "").trim(), (codigo) => etiquetaInstancia({ estadorec: codigo }));

    const razones = new Map<string, FilaRazon>();
    fundados.forEach((reclamo) => {
      const codigo = codigoDeRazon(reclamo);
      const fila = razones.get(codigo) ?? { codigo, nombre: nombreDeRazon(codigo), cantidad: 0, porcentaje: 0 };
      fila.cantidad++;
      razones.set(codigo, fila);
    });
    const filasRazon = Array.from(razones.values())
      .map((fila) => ({ ...fila, porcentaje: porcentaje(fila.cantidad, fundados.length) }))
      .sort((primera, segunda) => segunda.cantidad - primera.cantidad);
    // Solo cuentan las instancias que guardan la razón; «Otro» no explica la causa.
    const fundadosConRazonPosible = fundados.filter(guardaRazonFundado);
    const conCausa = fundadosConRazonPosible.filter((reclamo) => {
      const codigo = String(reclamo.razonfundado ?? "").trim();
      return codigo && codigo !== "006";
    }).length;

    const conNotificacion = reclamos.filter((reclamo) => reclamo.diasnotificacion !== null && reclamo.diasnotificacion !== undefined);
    const promedioNotificacion =
      conNotificacion.length > 0
        ? conNotificacion.reduce((suma, reclamo) => suma + Number(reclamo.diasnotificacion), 0) / conNotificacion.length
        : null;
    const conPlazo = reclamos.filter((reclamo) => String(reclamo.estadoplazo ?? "").trim() !== "NA");
    const fueraDePlazo = conPlazo.filter(estaFueraDePlazo).length;
    const apelados = reclamos.filter((reclamo) => String(reclamo.estadorec ?? "").trim() === "009");
    const revocados = apelados.filter((reclamo) => Number(reclamo.revocado) === 1).length;
    const formato = (valor: number) => valor.toLocaleString("es-PE", { maximumFractionDigits: 1 });

    return {
      total,
      fundados: fundados.length,
      indicadores: [
        {
          codigo: "EP-16",
          nombre: "Tiempo medio hasta notificar",
          valor: promedioNotificacion === null ? "" : `${formato(promedioNotificacion)} días`,
          referencia: `Días hábiles desde el reclamo hasta notificar la 1ª instancia · ${conNotificacion.length} reclamos notificados`,
        },
        {
          codigo: "EP-17",
          nombre: "Atendidos fuera de plazo",
          valor: conPlazo.length > 0 ? `${formato(porcentaje(fueraDePlazo, conPlazo.length))} %` : "",
          referencia: `${fueraDePlazo} de ${conPlazo.length} resueltos en 1ª instancia · incluye silencio positivo`,
        },
        {
          codigo: "EP-20",
          nombre: "Apelaciones por cada 100",
          valor: total > 0 ? formato(porcentaje(apelados.length, total)) : "",
          referencia: `${apelados.length} con resolución de apelación de ${total} reclamos`,
        },
        {
          codigo: "",
          nombre: "Fundados",
          valor: total > 0 ? `${formato(porcentajeGeneral)} %` : "",
          referencia: `${fundados.length} de ${total} reclamos`,
        },
        {
          codigo: "",
          nombre: "Revocados por el TRASS",
          valor: String(revocados),
          referencia: apelados.length > 0 ? `${formato(porcentaje(revocados, apelados.length))} % de los apelados` : "Sin apelaciones",
        },
      ],
      sedes,
      sedesAtipicas: sedes
        .filter((fila) => fila.esAtipica)
        .map((fila) => `${fila.nombre} (${formato(fila.porcentajeFundados)} %)`)
        .join(", "),
      instancias,
      razones: filasRazon,
      porcentajeConCausa: porcentaje(conCausa, fundadosConRazonPosible.length),
    };
  }

  maximoRazon(): number {
    return Math.max(1, ...(this.resumen?.razones ?? []).map((fila) => fila.cantidad));
  }

  filtrarPorSede(fila: FilaResumen): void {
    this.aplicarFiltroDelResumen(`Sede ${fila.nombre}`, (reclamo) => String(reclamo.codsede ?? "").trim() === fila.clave);
  }

  filtrarPorInstancia(fila: FilaResumen): void {
    this.aplicarFiltroDelResumen(fila.nombre, (reclamo) => String(reclamo.estadorec ?? "").trim() === fila.clave);
  }

  filtrarPorRazon(fila: FilaRazon): void {
    this.aplicarFiltroDelResumen(
      `Razón ${fila.nombre}`,
      (reclamo) => esFundado(reclamo) && codigoDeRazon(reclamo) === fila.codigo,
    );
  }

  private aplicarFiltroDelResumen(etiqueta: string, cumple: (reclamo: ReclamoFundadoInfundado) => boolean): void {
    this.filtroDelResumen = { etiqueta, cumple };
    this.alCerrarResumen();
    this.recalcular();
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
    const nombreArchivo = `reclamos_fundados_infundados_${new Date().toISOString().slice(0, 10)}`;

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

  // Un elemento por reclamo visible: los reclamos de un mismo cliente comparten el punto.
  private capasLocalesParaShape(extension: Extent): CapaShape[] {
    const aLonLat = (coordenada: number[]) => transform(coordenada, this.gis.proyeccionMapa, WGS84);
    const registros = this.capaReclamosEncendida ? this.reclamosVisibles : [];
    return [
      {
        nombre: "reclamos_fundados_infundados",
        tipo: "punto",
        columnas: COLUMNAS_SHAPE_RECLAMOS,
        elementos: registros.flatMap((registro) => {
          const coordenada = extraerCoordenada(registro, ORIGENES_COORDENADA.usuario);
          if (!coordenada || !containsCoordinate(extension, coordenada)) return [];
          return [
            {
              coordenadas: [aLonLat(coordenada)],
              atributos: this.aFilaTabla(registro),
            },
          ];
        }),
      },
    ];
  }

  // El backend responde 200 con success=false y el detalle en mensaje (p. ej. error SQL de la base GIS).
  private mensajeDeError(mensaje: string | undefined): string {
    return mensaje?.trim() || "Ocurrió un error al consultar los reclamos";
  }

  /** Clic en la tarjeta "Sin Coord.": Excel de los reclamos visibles que no se pintan en el mapa. */
  async descargarSinCoordenadas(): Promise<void> {
    if (this.totalSinCoordenadas === 0) return;
    const cantidad = await (this.controladorGis?.descargarSinCoordenadas() ?? Promise.resolve(0));
    if (cantidad === 0) {
      this.avisar("info", "Aviso", "Todos los registros cargados tienen coordenadas.");
    } else {
      this.avisar("success", "Excel descargado", `${cantidad} registros sin coordenadas.`);
    }
  }

  readonly minimoReincidente = MINIMO_REINCIDENTE;

  private avisar(severity: string, summary: string, detail: string): void {
    this.messageService.add({ severity, summary, detail });
  }
}
