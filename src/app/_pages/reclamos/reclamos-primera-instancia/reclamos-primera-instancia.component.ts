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
import { MessageService } from "primeng/api";
import { ReclamosService } from "@host/_servicios/vektors/reclamos.service";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { OficinasService } from "@host/_servicios/catastro/oficinas.service";
import { ReclamoconceptoService } from "@host/_servicios/administracion/reclamoconcepto.service";
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
import VectorImageLayer from "ol/layer/VectorImage";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import { containsCoordinate, createEmpty, extend, Extent, isEmpty } from "ol/extent";
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
import { MapEstilosFactory, RADIOS_LECTURA } from "../../../shared/mapa/mapa-estilos";
import { estaUsandoHerramientas } from "../../../shared/mapa/herramientas-medicion";
import { MARCA_CAPA_RESALTADO } from "../../../shared/mapa/interaccion-gis";
import { ControladorMapaGis } from "../../../shared/mapa/controlador-mapa-gis";
import { PanelesMapaGisComponent } from "../../../shared/components/paneles-mapa-gis/paneles-mapa-gis.component";
import { ColumnaListado, FilaListado } from "../../../shared/utils/listado-excel";
import { CapaShape, ColumnaShape } from "../../../shared/utils/shapefile";
import { ExcelService } from "@host/_servicios/reportes/excel.service";
import { crearFeaturePunto, extraerCoordenada } from "../../../shared/mapa/geo.utils";
import {
  FiltroReclamosPrimeraInstanciaRequest,
  ReclamoPrimeraInstancia,
} from "@host/_models/vektors/Reclamos/ReclamosPrimeraInstancia";
import { CapasSidebarComponent } from "../../../shared/components/capas-sidebar/capas-sidebar.component";
import { crearCapaWms, crearCapaOsm, crearCapaSatelital, CAPAS_BASE_UI } from "../../../shared/mapa/capas";
import { coordenadaLonLat, abrirGoogleStreetView } from "../../../shared/mapa/street-view";
import { abrirConsultaUsuario } from "../../../shared/dialogos/consulta-usuario.dialog";
import { abrirVistaPreviaShape } from "../../../shared/dialogos/vista-previa-shape.dialog";
import {
  contarPorGrupo,
  EntradaLeyenda,
  fondoMuestra,
  GrupoLeyenda,
  LeyendaGruposComponent,
} from "../../../shared/components/leyenda-grupos/leyenda-grupos.component";
import { GruposEstadoReclamo } from "./estados-reclamo";

import { FotosFichaClienteComponent } from "../../../shared/components/fotos-ficha-cliente/fotos-ficha-cliente.component";
import { elementoEnPixel } from "../../../shared/mapa/elemento-bajo-cursor";
// Relleno del lote semitransparente: debajo se siguen viendo las calles y el número del lote.
const OPACIDAD_RELLENO_LOTE = 0.45;

const TODOS = "ALL";

function colorConOpacidad(colorHexadecimal: string, opacidad: number): string {
  const valor = parseInt(colorHexadecimal.replace("#", ""), 16);
  return `rgba(${(valor >> 16) & 255}, ${(valor >> 8) & 255}, ${valor & 255}, ${opacidad})`;
}

// Los mismos tipos del reporte de solicitudes de reclamo de primera instancia.
const TIPOS_RECLAMO = [
  { codigo: TODOS, descripcion: "TODOS" },
  { codigo: "1", descripcion: "CON FACTURACION" },
  { codigo: "2", descripcion: "SIN FACTURACION" },
  { codigo: "3", descripcion: "OPERACIONAL" },
  { codigo: "4", descripcion: "AL. GENERAL" },
  { codigo: "5", descripcion: "VMA" },
  { codigo: "7", descripcion: "SOLICITUD INSPECCIÓN" },
];

const CONCEPTO_TODOS = { codReclamo: TODOS, descripcion: "TODOS" };

const COLUMNAS_TABLA_RECLAMOS: ColumnaListado[] = [
  { campo: "nroreclamo", titulo: "N° reclamo", anchoExcel: 12 },
  { campo: "codcliente", titulo: "Cód. cliente", anchoExcel: 12 },
  { campo: "reclamante", titulo: "Reclamante", anchoExcel: 35 },
  { campo: "propietario", titulo: "Propietario", anchoExcel: 35 },
  { campo: "direccionCompleta", titulo: "Dirección", anchoExcel: 35 },
  { campo: "fecharec", titulo: "Fecha del reclamo", anchoExcel: 18 },
  { campo: "codreclamo", titulo: "Cód. concepto", anchoExcel: 12 },
  { campo: "tiporeclamo", titulo: "Concepto del reclamo", anchoExcel: 30 },
  { campo: "estadoDelReclamo", titulo: "Estado", anchoExcel: 20 },
  { campo: "fechamaxresol", titulo: "Fecha máxima de resolución", anchoExcel: 22 },
  { campo: "fechares", titulo: "Fecha de resolución", anchoExcel: 18 },
  { campo: "codoficina", titulo: "Oficina", anchoExcel: 22 },
];

// Los nombres de columna de un .dbf no pasan de 10 caracteres.
const COLUMNAS_SHAPE_RECLAMOS: ColumnaShape[] = [
  { nombre: "nroreclamo", campo: "nroreclamo" },
  { nombre: "codcliente", campo: "codcliente" },
  { nombre: "reclamante", campo: "reclamante" },
  { nombre: "direccion", campo: "direccionCompleta" },
  { nombre: "f_reclamo", campo: "fecharec" },
  { nombre: "tipo", campo: "tiporeclamo" },
  { nombre: "concepto", campo: "codreclamo" },
  { nombre: "estado", campo: "estadoDelReclamo" },
  { nombre: "f_max_res", campo: "fechamaxresol" },
  { nombre: "f_resol", campo: "fechares" },
];

@Component({
  selector: "app-reclamos-primera-instancia",
  standalone: true,
  imports: [FotosFichaClienteComponent, 
    CapasSidebarComponent,
    PanelesMapaGisComponent,
    CommonModule,
    FormsModule,
    ButtonModule,
    ToastModule,
    SelectModule,
    InputTextModule,
    DatePickerModule,
    LeyendaGruposComponent,
  ],
  templateUrl: "./reclamos-primera-instancia.component.html",
  styleUrl: "./reclamos-primera-instancia.component.scss",
  providers: [MessageService, DialogService, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ReclamosPrimeraInstanciaComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);

  private readonly sedeCambiada = new Subject<void>();
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
  private readonly gruposEstado = new GruposEstadoReclamo();

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

  resultadoBusquedaJson: ReclamoPrimeraInstancia[] = [];
  totalReclamos = 0;
  totalSinCoordenadas = 0;

  entradasLeyenda: EntradaLeyenda[] = [];
  /** Estado elegido en la leyenda: el mapa muestra solo ese y lo encuadra. `null` = todos. */
  grupoFiltrado: string | null = null;
  mostrarLeyenda = true;
  cargandoLotes = false;
  private busquedaLotes?: Subscription;

  listaSedes: any[] = [];
  listaOficinas: any[] = [];
  readonly listaTiposReclamo = TIPOS_RECLAMO;
  listaConceptos: any[] = [CONCEPTO_TODOS];
  private tiposReclamoConConceptos: any[] = [];

  selectedSede: string = TODOS;
  selectedOficina: string = TODOS;
  selectedTipoReclamo: string = TODOS;
  selectedConcepto: string = TODOS;
  fechaInicial: Date = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  fechaFinal: Date = new Date();

  mostrarSearchPanel = false;
  searchCodCliente = "";
  isBusquedaClienteActiva = false;
  resultadoBusquedaOriginalJson: ReclamoPrimeraInstancia[] | undefined = undefined;

  reclamoSeleccionado: any = null;
  featureSeleccionado: Feature | null = null;
  ref: DynamicDialogRef | null | undefined;

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
    private oficinasService: OficinasService,
    private reclamoconceptoService: ReclamoconceptoService,
    private messageService: MessageService,
    private dialogService: DialogService,
  ) {}

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);
    this.crearMapa();

    forkJoin({
      sedes: this.consulGenericService
        .getconsultaService("SED", "ALL", "ALL", "ALL")
        .pipe(catchError(() => of<any[]>([]))),
      tiposReclamo: this.reclamoconceptoService.tipoReclamo().pipe(catchError(() => of<any[]>([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ sedes, tiposReclamo }) => {
          this.listaSedes = [{ codigo: TODOS, descripcion: "TODOS" }, ...(sedes || [])];
          this.tiposReclamoConConceptos = tiposReclamo || [];
          this.selectedSede = this.sedePorDefecto();
          this.onSedeChange();
        },
        error: (err) => {
          console.error("Error cargando catálogos iniciales:", err);
          this.avisar("error", "Error", "Error al cargar catálogos iniciales. Revisa tu conexión.");
        },
      });
  }

  /** La sede del usuario si está en la lista; si no, "TODOS". */
  private sedePorDefecto(): string {
    const estaEnLaLista = this.listaSedes.some((sede) => String(sede.codigo).trim() === this.codsedeSesion);
    return this.codsedeSesion && estaEnLaLista ? this.codsedeSesion : TODOS;
  }

  /** Las oficinas son de una sede: con "TODOS" se usan las de la sede del usuario, como en el reporte. */
  onSedeChange(): void {
    this.sedeCambiada.next();
    this.selectedOficina = TODOS;
    this.listaOficinas = [{ codoficina: TODOS, descripcion: "TODOS" }];

    const codigoSede = this.selectedSede === TODOS ? this.codsedeSesion : this.selectedSede;
    if (!codigoSede) return;

    this.oficinasService
      .oficinaxsede(codigoSede)
      .pipe(takeUntil(this.sedeCambiada), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (oficinas) => {
          this.listaOficinas = [{ codoficina: TODOS, descripcion: "TODOS" }, ...(oficinas || [])];
        },
        error: (err) => console.error("Error al cargar oficinas:", err),
      });
  }

  /** Los conceptos dependen del tipo, con la misma regla del reporte de reclamos. */
  onTipoReclamoChange(): void {
    this.selectedConcepto = TODOS;
    const ordenados = (conceptos: any[]) =>
      [...conceptos].sort((primero, segundo) => String(primero.codReclamo).localeCompare(String(segundo.codReclamo)));
    const conceptosDelTipo = (codigoTipo: string) =>
      this.tiposReclamoConConceptos.find((tipo) => String(tipo.idReclamo) === codigoTipo)?.conceptos ?? [];

    let conceptos: any[] = [];
    if (["1", "2", "3", "4"].includes(this.selectedTipoReclamo)) {
      conceptos = conceptosDelTipo(this.selectedTipoReclamo);
    } else if (this.selectedTipoReclamo === "5") {
      conceptos = this.tiposReclamoConConceptos.flatMap((tipo) =>
        (tipo?.conceptos ?? []).filter((concepto: any) => concepto.vma === 1),
      );
    } else if (this.selectedTipoReclamo === "7") {
      conceptos = conceptosDelTipo("1");
    }
    this.listaConceptos = [CONCEPTO_TODOS, ...ordenados(conceptos)];
  }

  getDescSede(): string {
    return this.listaSedes.find((sede) => sede.codigo === this.selectedSede)?.descripcion ?? "TODOS";
  }

  getDescOficina(): string {
    return this.listaOficinas.find((oficina) => oficina.codoficina === this.selectedOficina)?.descripcion ?? "TODOS";
  }

  getDescTipoReclamo(): string {
    return this.listaTiposReclamo.find((tipo) => tipo.codigo === this.selectedTipoReclamo)?.descripcion ?? "TODOS";
  }

  getDescConcepto(): string {
    return this.listaConceptos.find((concepto) => concepto.codReclamo === this.selectedConcepto)?.descripcion ?? "TODOS";
  }

  get hayRangoDeFechasValido(): boolean {
    return !!this.fechaInicial && !!this.fechaFinal && this.fechaInicial <= this.fechaFinal;
  }

  private fechaDesde(): string {
    return this.datePipe.transform(this.fechaInicial, "yyyy-MM-dd 00:00")!;
  }

  private fechaHasta(): string {
    return this.datePipe.transform(this.fechaFinal, "yyyy-MM-dd 23:59")!;
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

    const filtro: FiltroReclamosPrimeraInstanciaRequest = {
      codsuc: null,
      codsede: this.sinTodos(this.selectedSede),
      fechaini: this.fechaDesde(),
      fechafin: this.fechaHasta(),
      codreclamo: this.sinTodos(this.selectedConcepto),
      tiporeclamo: this.sinTodos(this.selectedTipoReclamo),
      codoficina: this.sinTodos(this.selectedOficina),
    };

    this.reclamosService
      .listarReclamosPrimeraInstancia(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          this.filtrosVisible = false;
          this.isBusquedaClienteActiva = false;
          this.resultadoBusquedaOriginalJson = undefined;
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
    this.onSedeChange();
    this.selectedTipoReclamo = TODOS;
    this.onTipoReclamoChange();
    this.fechaInicial = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    this.fechaFinal = new Date();
    this.limpiarCapas();
    this.resultadoBusquedaJson = [];
    this.cerrarPopup();
  }

  private actualizarCapasComerciales(fitBounds = true): void {
    this.estilos.limpiar();
    this.limpiarCapas();

    const registros = this.resultadoBusquedaJson || [];
    this.totalReclamos = registros.length;
    if (registros.length === 0) return;

    const puntos = registros
      .map((registro) => {
        const punto = crearFeaturePunto(registro, ORIGENES_COORDENADA.usuario);
        punto?.set("_grupo", this.gruposEstado.grupoDe(registro));
        return punto;
      })
      .filter((feature): feature is Feature => feature !== null);
    this.reclamosLayer.getSource()!.addFeatures(puntos);
    this.entradasLeyenda = contarPorGrupo(registros.map((registro) => this.gruposEstado.grupoDe(registro)));
    this.pintarLotes(registros);

    this.totalSinCoordenadas = registros.length - puntos.length;

    this.ajustarVista(fitBounds);
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
    this.controladorGis?.descartarListado();
    this.totalReclamos = 0;
    this.totalSinCoordenadas = 0;
    this.busquedaLotes?.unsubscribe();
    this.cargandoLotes = false;
    this.entradasLeyenda = [];
    this.grupoFiltrado = null;
  }

  /**
   * Trae del GIS el polígono del lote de cada cliente con reclamo. Un cliente con varios
   * reclamos tiene un solo lote: se pinta con el estado de su reclamo más reciente en la lista.
   */
  private pintarLotes(registros: ReclamoPrimeraInstancia[]): void {
    this.busquedaLotes?.unsubscribe();
    const grupoPorCliente = new Map<string, GrupoLeyenda>();
    registros.forEach((registro) => {
      if (registro.codcliente == null) return;
      grupoPorCliente.set(String(registro.codcliente), this.gruposEstado.grupoDe(registro));
    });
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
        this.lotesReclamosLayer.getSource()!.addFeatures(features);
      });
  }

  /** Clic en un estado de la leyenda filtra y lleva al grupo; otro clic vuelve a todos. */
  filtrarPorGrupo(clave: string): void {
    this.grupoFiltrado = this.grupoFiltrado === clave ? null : clave;
    const grupoSeleccionado = this.featureSeleccionado?.get("_grupo") as GrupoLeyenda | undefined;
    if (this.grupoFiltrado && grupoSeleccionado && grupoSeleccionado.clave !== this.grupoFiltrado) this.cerrarPopup();
    this.refrescarCapasVector();

    const extension = createEmpty();
    [this.lotesReclamosLayer, this.reclamosLayer].forEach((capa) =>
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

  /** Muestra de color del estado del reclamo, la misma de la leyenda. */
  fondoEstado(registro: ReclamoPrimeraInstancia): string {
    return fondoMuestra(this.gruposEstado.grupoDe(registro));
  }

  estadoDelReclamo(registro: ReclamoPrimeraInstancia): string {
    return this.gruposEstado.grupoDe(registro).etiqueta;
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
    if (!/^\d+$/.test(codigo)) {
      this.avisar("warn", "Aviso", "El código de cliente solo lleva números.");
      return;
    }

    const reclamosCargados = (this.resultadoBusquedaOriginalJson ?? this.resultadoBusquedaJson).filter(
      (registro) => String(registro.codcliente ?? "").trim() === codigo,
    );

    if (reclamosCargados.length > 0) {
      this.mostrarSoloReclamosDelCliente(reclamosCargados, codigo);
      return;
    }

    if (!this.hayRangoDeFechasValido) {
      this.avisar("warn", "Aviso", "Corrija el rango de fechas para buscar un cliente que no está en el mapa.");
      return;
    }

    this.cargando = true;
    this.reclamosService
      .buscarReclamosPrimeraInstancia({
        codsuc: null,
        codsede: this.sinTodos(this.selectedSede),
        fechaini: this.fechaDesde(),
        fechafin: this.fechaHasta(),
        codcliente: Number(codigo),
      })
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
  private mostrarSoloReclamosDelCliente(reclamos: ReclamoPrimeraInstancia[], codigo: string): void {
    if (!this.isBusquedaClienteActiva) {
      this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
      this.isBusquedaClienteActiva = true;
    }
    this.resultadoBusquedaJson = reclamos;
    this.actualizarCapasComerciales(false);

    const coordenada = extraerCoordenada(reclamos[0], ORIGENES_COORDENADA.usuario);
    if (coordenada) {
      this.map.getView().animate({ center: coordenada, zoom: 21, duration: 700 });
    }
    const punto = this.reclamosLayer
      .getSource()!
      .getFeatures()
      .find((feature) => String(feature.get("codcliente") ?? "").trim() === codigo);
    if (punto) this.seleccionarFeature(punto);
    this.controladorGis?.marcarPredio(codigo);
    if (reclamos.length > 1) {
      this.avisar("info", "Aviso", `El cliente ${codigo} tiene ${reclamos.length} reclamos en el rango: están en el listado.`);
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

    const grupoVisible = (feature: { get: (clave: string) => unknown }) => {
      const grupo = feature.get("_grupo") as GrupoLeyenda | undefined;
      return grupo && (!this.grupoFiltrado || grupo.clave === this.grupoFiltrado) ? grupo : null;
    };

    this.reclamosLayer = new VectorImageLayer({
      imageRatio: 1.5,
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

    this.lotesReclamosLayer = new VectorImageLayer({
      imageRatio: 1.5,
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
            stroke: new Stroke({ color: grupo.color, width: seleccionado ? 3 : 1.5 }),
          }),
        ];
      },
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
        tituloReporte: "SOLICITUDES DE RECLAMO DE PRIMERA INSTANCIA",
        nombreArchivo: "reclamos_primera_instancia_area_",
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
      `Sede: ${this.getDescSede()}`,
      `Oficina: ${this.getDescOficina()}`,
      `Tipo: ${this.getDescTipoReclamo()}`,
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
      const feature = elementoEnPixel(
        this.map,
        evento.pixel,
        (capa) => !capa.get("isDrawLayer") && !capa.get(MARCA_CAPA_RESALTADO),
      )?.elemento;

      if (feature) {
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

  private aFilaTabla(registro: Record<string, unknown>): FilaListado {
    return {
      ...registro,
      direccionCompleta: this.direccionDe(registro),
      estadoDelReclamo: this.estadoDelReclamo(registro as ReclamoPrimeraInstancia),
    };
  }

  // Se ubica por número de reclamo: un cliente puede tener varios.
  ubicarFilaEnMapa(fila: FilaListado): void {
    const numeroReclamo = String(fila["nroreclamo"] ?? "").trim();
    const punto = this.reclamosLayer
      ?.getSource()
      ?.getFeatures()
      .find((feature) => String(feature.get("nroreclamo") ?? "").trim() === numeroReclamo);
    if (!punto) {
      this.avisar("warn", "Aviso", `El cliente ${fila["codcliente"] ?? ""} no tiene coordenadas para ubicarlo.`);
      return;
    }
    this.seleccionarFeature(punto);
    this.controladorGis?.encuadrarEnZonaLibre(punto.getGeometry()!.getExtent());
  }

  // Los dos popups ocupan el mismo lugar: abrir el del reclamo cierra el de GIS.
  private seleccionarFeature(feature: Feature): void {
    this.controladorGis?.cerrarPopupGis();
    // El clic sobre un lote abre el reclamo de ese cliente.
    const punto =
      feature.get("nroreclamo") != null
        ? feature
        : this.reclamosLayer
            .getSource()!
            .getFeatures()
            .find((candidato) => candidato.get("codcliente") === feature.get("codcliente"));
    if (!punto) return;
    this.featureSeleccionado = punto;
    this.refrescarCapasVector();
    this.reclamoSeleccionado = punto.getProperties();
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

  verMasInformacion(codcliente: string | undefined): void {
    if (!codcliente) return;
    abrirConsultaUsuario(this.dialogService, codcliente, this.reclamoSeleccionado?.codsuc).then(
      (referencia) => (this.ref = referencia),
    );
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
    const nombreArchivo = `reclamos_primera_instancia_${new Date().toISOString().slice(0, 10)}`;

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

  // Desde los registros y no desde los puntos pintados: los reclamos de un mismo cliente comparten un punto.
  private capasLocalesParaShape(extension: Extent): CapaShape[] {
    const aLonLat = (coordenada: number[]) => transform(coordenada, this.gis.proyeccionMapa, WGS84);
    const registros = this.reclamosLayer.getVisible() ? this.resultadoBusquedaJson ?? [] : [];
    return [
      {
        nombre: "reclamos_primera_instancia",
        tipo: "punto",
        columnas: COLUMNAS_SHAPE_RECLAMOS,
        elementos: registros.flatMap((registro) => {
          const coordenada = extraerCoordenada(registro, ORIGENES_COORDENADA.usuario);
          if (!coordenada || !containsCoordinate(extension, coordenada)) return [];
          return [
            {
              coordenadas: [aLonLat(coordenada)],
              atributos: this.aFilaTabla(registro as Record<string, unknown>),
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

  /** Clic en la tarjeta "Sin Coord.": Excel de los reclamos cargados que no se pintan en el mapa. */
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
