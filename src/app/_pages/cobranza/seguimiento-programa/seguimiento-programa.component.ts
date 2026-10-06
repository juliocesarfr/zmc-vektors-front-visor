import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  ViewChild,
  ElementRef,
  inject,
  Optional,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { of } from "rxjs";
import { catchError } from "rxjs/operators";

import { DropdownModule } from "primeng/dropdown";
import { ButtonModule } from "primeng/button";
import { InputNumberModule } from "primeng/inputnumber";
import { InputTextModule } from "primeng/inputtext";
import { ToastModule } from "primeng/toast";
import { TagModule } from "primeng/tag";
import { TooltipModule } from "primeng/tooltip";
import { MessageService } from "primeng/api";
import {
  DialogService,
  DynamicDialogRef,
  DynamicDialogConfig,
} from "primeng/dynamicdialog";

import OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import LayerGroup from "ol/layer/Group";
import BaseLayer from "ol/layer/Base";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import TileWMS from "ol/source/TileWMS";
import Feature from "ol/Feature";
import { Style, Fill, Stroke } from "ol/style";
import { getCenter } from "ol/extent";

import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { CobranzaService } from "@host/_servicios/vektors/cobranza.service";
import { ControlImgService } from "@host/_servicios/procesar-img/control-img.service";
import { ConsultaUsuarioService } from "@host/_servicios/consulta/consulta-usuario.service";
import { FiltrarProgramaPrecorte } from "@host/_models/vektors/Cobranza/FiltrarProgramaPrecorte";
import { BuscarProgramaCorteComponent } from "../buscar-programa-corte/buscar-programa-corte.component";

import { TIPOS_RECEPCION_FOTOS_CORTE } from "../../../shared/constantes/lecturas";
import { ORIGENES_COORDENADA, DISTANCIA_MAX_ACOMETIDA_M } from "../../../shared/constantes/coordenadas";
import { COLOR_FICHA_AGUA, COLOR_FICHA_ALCANTARILLADO } from "../../../shared/constantes/colores-mapa";
import { crearFeaturePunto, crearFeatureLinea, extraerCoordenada } from "../../../shared/mapa/geo.utils";
import {
  MapEstilosFactory,
  RADIOS_LECTURA,
} from "../../../shared/mapa/mapa-estilos";
import { estaUsandoHerramientas } from "../../../shared/mapa/herramientas-medicion";
import { ControladorMapaGis } from "../../../shared/mapa/controlador-mapa-gis";
import { PanelesMapaGisComponent } from "../../../shared/components/paneles-mapa-gis/paneles-mapa-gis.component";
import { ColumnaListado, FilaListado, direccionDe } from "../../../shared/utils/listado-excel";
import { ExcelService } from "@host/_servicios/reportes/excel.service";
import { observarTamanoMapa } from "../../../shared/mapa/observar-tamano-mapa";
import { ConsultaCapasGisService, GisConfigService } from "../../../core/gis";
import { CapasSidebarComponent } from "../../../shared/components/capas-sidebar/capas-sidebar.component";
import { VisorImagenesComponent } from "../../../shared/components/visor-imagenes/visor-imagenes.component";
import { crearCapaWms, crearCapaOsm, crearCapaSatelital, CAPAS_BASE_UI } from "../../../shared/mapa/capas";
import { coordenadaLonLat, abrirGoogleStreetView } from "../../../shared/mapa/street-view";
import { abrirConsultaUsuario } from "../../../shared/dialogos/consulta-usuario.dialog";
import { rangoFotosRecientes } from "../../../shared/utils/fechas.utils";
import { ActivatedRoute } from "@angular/router";
import { EstadoCorte, MODO_CORTE, ModoSeguimiento } from "./modos-seguimiento";
import {
  ResumenInspectorCorte,
  codigoInspectorDe,
  colorConTransparencia,
  estadoDelCorte,
  geometriaDelLote,
  observacionDeLaOperacion,
  observacionMasRecienteDe,
  resumenPorInspector,
  totalesPorEstado,
} from "./seguimiento-programa.reglas";
import { RegistroCorte } from "@host/_models/vektors/Cobranza/RegistroCorte";

const COLUMNAS_TABLA_PROGRAMA: ColumnaListado[] = [
  { campo: "codcliente", titulo: "Cód. cliente", anchoExcel: 12 },
  { campo: "propietario", titulo: "Titular", anchoExcel: 35 },
  { campo: "direccion", titulo: "Dirección", anchoExcel: 35 },
  { campo: "codmza", titulo: "Mza", anchoExcel: 8 },
  { campo: "nrolote", titulo: "Lote", anchoExcel: 8 },
  { campo: "estadoOperacion", titulo: "Estado", anchoExcel: 16 },
  { campo: "fechaOperacion", titulo: "Fecha de ejecución", anchoExcel: 18 },
  { campo: "nromesesdeuda", titulo: "Meses de deuda", anchoExcel: 10 },
  { campo: "impdeuda", titulo: "Deuda (S/)", anchoExcel: 12 },
  { campo: "inspector", titulo: "Inspector", anchoExcel: 30 },
];

@Component({
  selector: "app-seguimiento-programa",
  standalone: true,
  imports: [
    CapasSidebarComponent,
    VisorImagenesComponent,
    PanelesMapaGisComponent,
    CommonModule,
    FormsModule,
    DropdownModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    ToastModule,
    TagModule,
    TooltipModule,
  ],
  templateUrl: "./seguimiento-programa.component.html",
  styleUrl: "./seguimiento-programa.component.scss",
  providers: [MessageService, DialogService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { "[class.modo-reapertura]": "modo.esReapertura" },
})
/** Seguimiento en el mapa de un programa de cortes o de reaperturas (según `modo`). */
export class SeguimientoProgramaComponent
  implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private cobranzaService = inject(CobranzaService);
  private detenerObservadorMapa?: () => void;

  private readonly gis = inject(GisConfigService);
  private readonly consultaCapasGis = inject(ConsultaCapasGisService);
  private readonly excelService = inject(ExcelService);
  controladorGis?: ControladorMapaGis;
  private readonly estilos = new MapEstilosFactory();

  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;
  @ViewChild("mapContainer", { static: false })
  private mapContainer!: ElementRef<HTMLDivElement>;

  /** Corte o reapertura: lo indica la ruta (`data.modo`) o quien abre la pantalla como diálogo. */
  readonly modo: ModoSeguimiento =
    inject(DynamicDialogConfig, { optional: true })?.data?.modo ??
    inject(ActivatedRoute).snapshot.data["modo"] ??
    MODO_CORTE;

  map!: OlMap;
  cortesLayer!: VectorLayer<VectorSource>;
  lotesUsuarioLayer!: VectorLayer<VectorSource>;
  acomAguaLayer!: VectorLayer<VectorSource>;
  acomDesagueLayer!: VectorLayer<VectorSource>;
  lotesLayer!: TileLayer<TileWMS>;
  sectoresLayer!: TileLayer<TileWMS>;
  callesLayer!: TileLayer<TileWMS>;
  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;
  private registroCapas: Record<string, BaseLayer> = {};

  dataSucursales: any[] = [];
  selectedSucursal: any = null;
  nroPrecorte: number | null = null;

  private registrosOriginal: RegistroCorte[] = [];
  registros: RegistroCorte[] = [];
  filtroInspector: string | null = null;
  filtroEstado: EstadoCorte | null = null;

  total = 0;
  ejecutados = 0;
  pagados = 0;
  pendientes = 0;
  rendimiento = 0;
  totalSinCoordenadas = 0;
  inspectores: ResumenInspectorCorte[] = [];

  filtrosVisible = true;
  panelInspectores = false;
  mostrarLeyenda = true;
  mostrarSearchPanel = false;
  baseActive: string | null = "osm";
  cargando = false;
  searchCodCliente = "";

  corteSeleccionado: RegistroCorte | null = null;
  private featureSeleccionado: Feature | null = null;

  imagenesPopup: any[] = [];
  cargandoImagenes = false;

  /** Foto abierta en el visor; -1 = cerrado. */
  indiceFotoAbierta = -1;

  readonly baseLayers = CAPAS_BASE_UI;

  commercialLayers = [
    { id: "cortes", label: "Cortes / Estados", active: true },
    { id: "lotes_usuario", label: "Lote del Usuario", active: true },
    { id: "acometida_agua", label: "Acometida de Agua", active: false },
    {
      id: "acometida_alc",
      label: "Acometida de Alcantarillado",
      active: false,
    },
    { id: "lotes", label: "Lotes (GeoServer)", active: true },
    { id: "sectores", label: "Sectores Comerciales", active: false },
    { id: "calles", label: "Calles", active: false },
  ];

  ref: DynamicDialogRef | undefined;

  constructor(
    private consultaService: ConsulGenericService,
    private controlImgService: ControlImgService,
    private consultaUsuarioService: ConsultaUsuarioService,
    private messageService: MessageService,
    private dialogService: DialogService,
    @Optional() private dialogConfig?: DynamicDialogConfig,
  ) { }

  // ============================================================
  // CICLO DE VIDA
  // ============================================================

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);

    this.consultaService
      .getconsultaService("SUC", "ALL", "ALL", "ALL")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((resp) => {
        this.dataSucursales = resp || [];

        // Si viene codsuc/nroprecorte desde el resumen se busca solo; si no, se usa la sucursal del token.
        const codsucIni =
          this.dialogConfig?.data?.codsuc ?? sessionStorage.getItem("codsuc");
        this.selectedSucursal =
          this.dataSucursales.find((s) => s.codsuc === codsucIni) ??
          this.dataSucursales[0];

        const nroIni = this.dialogConfig?.data?.nroprecorte;
        if (nroIni && this.selectedSucursal) {
          this.nroPrecorte = Number(nroIni);
          this.ejecutarBusqueda();
        }
      });
  }

  ngAfterViewInit(): void {
    this.crearMapa();
    this.capasSidebar?.conectarMapa(this.map);
    this.initClick();

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

  // ============================================================
  // FILTROS / CARGA
  // ============================================================

  toggleFiltros(): void {
    this.filtrosVisible = !this.filtrosVisible;
  }

  procesar(): void {
    if (!this.selectedSucursal) {
      this.avisar("warn", "Aviso", "Seleccione una sucursal");
      return;
    }
    if (!this.nroPrecorte) {
      this.avisar("warn", "Aviso", "Ingrese el N° de precorte");
      return;
    }
    this.filtroInspector = null;
    this.filtroEstado = null;
    this.ejecutarBusqueda();
  }

  abrirBuscarPrograma(): void {
    this.ref = this.dialogService.open(BuscarProgramaCorteComponent, {
      header: "Buscar N° de Programa",
      width: "80%",
      contentStyle: { overflow: "auto" },
      baseZIndex: 10000,
      maximizable: true,
      data: { tipooperacion: this.modo.tipoOperacion },
    });
    this.ref.onClose
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((programa) => {
        if (!programa?.nroprecorte) return;
        const suc = this.dataSucursales.find(
          (s) => s.codsuc === programa.filtrocodsuc,
        );
        if (suc) this.selectedSucursal = suc;
        this.nroPrecorte = Number(programa.nroprecorte);
        this.procesar();
      });
  }

  private ejecutarBusqueda(): void {
    const filtro: FiltrarProgramaPrecorte = {
      codsuc: this.selectedSucursal.codsuc,
      nroprecorte: this.nroPrecorte!,
      tipooperacion: this.modo.tipoOperacion,
    };

    this.cargando = true;
    this.cobranzaService
      .listarCorteconprograma(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.cargando = false;
          this.filtrosVisible = false;
          const data = (resp?.data || []) as RegistroCorte[];
          this.registrosOriginal = data;
          this.registros = data;
          this.calcularInspectores();
          this.plotear(true);
          if (!data.length) {
            this.avisar("info", "Aviso", "El precorte no tiene registros");
          }
        },
        error: () => {
          this.cargando = false;
          this.registrosOriginal = [];
          this.registros = [];
          this.limpiarCapasVector();
          this.calcularResumen();
          this.inspectores = [];
          this.avisar("error", "Aviso", "Error al cargar el precorte");
        },
      });
  }

  limpiar(): void {
    this.nroPrecorte = null;
    this.registrosOriginal = [];
    this.registros = [];
    this.filtroInspector = null;
    this.filtroEstado = null;
    this.limpiarCapasVector();
    this.total = this.ejecutados = this.pagados = this.pendientes = 0;
    this.rendimiento = 0;
    this.totalSinCoordenadas = 0;
    this.inspectores = [];
    this.cerrarPopup();
  }

  private limpiarCapasVector(): void {
    this.controladorGis?.descartarListado();
    [
      this.cortesLayer,
      this.lotesUsuarioLayer,
      this.acomAguaLayer,
      this.acomDesagueLayer,
    ].forEach((c) => c?.getSource()?.clear());
  }

  // ============================================================
  // ESTADO / COLOR
  // ============================================================

  etiquetaEstado(r: RegistroCorte): string {
    const e = estadoDelCorte(r);
    if (e === "ejecutado") return this.modo.etiquetaEjecutado;
    if (e === "pagado") return "PAGADO";
    return "PENDIENTE";
  }

  colorEstado(r: RegistroCorte): string {
    return this.modo.colores[estadoDelCorte(r)];
  }

  fechaEjecucion(r: RegistroCorte): string | undefined {
    return r?.[this.modo.campoFechaEjecucion];
  }

  // ============================================================
  // PLOTEO
  // ============================================================

  private plotear(fit = false): void {
    const sp = this.cortesLayer.getSource()!;
    const sa = this.acomAguaLayer.getSource()!;
    const sd = this.acomDesagueLayer.getSource()!;
    const sl = this.lotesUsuarioLayer.getSource()!;
    [sp, sa, sd, sl].forEach((s) => s.clear());
    this.estilos.limpiar();

    let sinCoord = 0;

    for (const r of this.registros ?? []) {
      const estado = estadoDelCorte(r);

      const fp =
        crearFeaturePunto(r, ORIGENES_COORDENADA.usuario) ??
        crearFeaturePunto(r, ORIGENES_COORDENADA.predio);
      if (fp) sp.addFeature(fp);
      else sinCoord++;

      const la = crearFeatureLinea(
        r,
        ORIGENES_COORDENADA.agua,
        ORIGENES_COORDENADA.acometidaAgua,
        DISTANCIA_MAX_ACOMETIDA_M,
      );
      if (la) sa.addFeature(la);

      const ld = crearFeatureLinea(
        r,
        ORIGENES_COORDENADA.desague,
        ORIGENES_COORDENADA.acometidaDesague,
        DISTANCIA_MAX_ACOMETIDA_M,
      );
      if (ld) sd.addFeature(ld);

      const g = geometriaDelLote(r.capaloteslatylog, this.gis.proyeccionMapa, this.gis.proyeccionUtm);
      if (g) {
        const fl = new Feature({ geometry: g });
        fl.setProperties({ _estado: estado, _codcliente: r.codcliente });
        sl.addFeature(fl);
      }
    }

    this.totalSinCoordenadas = sinCoord;
    this.calcularResumen();

    if (fit) {
      const ext = sp.getFeatures().length
        ? sp.getExtent()
        : sl.getFeatures().length
          ? sl.getExtent()
          : null;
      if (ext) {
        this.map.getView().fit(ext, {
          duration: 700,
          maxZoom: 18,
          padding: [60, 60, 60, 60],
        });
      }
    }
  }

  // ============================================================
  // RESUMEN / INSPECTORES
  // ============================================================

  private calcularResumen(): void {
    const totales = totalesPorEstado(this.registros ?? []);
    this.total = totales.total;
    this.ejecutados = totales.ejecutados;
    this.pagados = totales.pagados;
    this.pendientes = totales.pendientes;
    this.rendimiento = totales.rendimiento;
  }

  private calcularInspectores(): void {
    this.inspectores = resumenPorInspector(this.registrosOriginal ?? []);
  }

  private aplicarFiltros(): void {
    let base = this.registrosOriginal ?? [];
    if (this.filtroInspector) {
      base = base.filter((r) => codigoInspectorDe(r) === this.filtroInspector);
    }
    if (this.filtroEstado) {
      base = base.filter((r) => estadoDelCorte(r) === this.filtroEstado);
    }
    this.registros = base;
    this.cerrarPopup();
    this.plotear(true);
  }

  filtrarPorInspector(insp: ResumenInspectorCorte): void {
    this.filtroInspector =
      this.filtroInspector === insp.codinspector ? null : insp.codinspector;
    this.aplicarFiltros();
  }

  filtrarPorEstado(estado: EstadoCorte): void {
    this.filtroEstado = this.filtroEstado === estado ? null : estado;
    this.aplicarFiltros();
  }

  limpiarFiltroInspector(): void {
    if (!this.filtroInspector) return;
    this.filtroInspector = null;
    this.aplicarFiltros();
  }

  // ============================================================
  // MAPA
  // ============================================================

  private crearMapa(): void {
    this.osmLayer = crearCapaOsm(this.baseActive === "osm");
    this.satelitalLayer = crearCapaSatelital(this.baseActive === "satelital");

    this.lotesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("lotes"), true);
    this.sectoresLayer = crearCapaWms(this.gis.urlWms(),
      this.gis.capa("sectoresComerciales"),
      false,
    );
    this.callesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("calles"), false);

    this.lotesUsuarioLayer = new VectorLayer({
      source: new VectorSource(),
      visible: true,
      style: (f) => this.estiloLote(f as Feature),
    });

    this.acomAguaLayer = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: (f, resolution) =>
        this.estilos.lineaAcometida(COLOR_FICHA_AGUA, false, resolution),
    });

    this.acomDesagueLayer = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: (f, resolution) =>
        this.estilos.lineaAcometida(COLOR_FICHA_ALCANTARILLADO, false, resolution),
    });

    this.cortesLayer = new VectorLayer({
      source: new VectorSource(),
      visible: true,
      style: (f) => this.estiloPunto(f as Feature),
    });

    this.registroCapas = {
      cortes: this.cortesLayer,
      lotes_usuario: this.lotesUsuarioLayer,
      acometida_agua: this.acomAguaLayer,
      acometida_alc: this.acomDesagueLayer,
      lotes: this.lotesLayer,
      sectores: this.sectoresLayer,
      calles: this.callesLayer,
    };

    this.map = new OlMap({
      layers: [
        new LayerGroup({ layers: [this.osmLayer, this.satelitalLayer] }),
        this.sectoresLayer,
        this.callesLayer,
        this.lotesLayer,
        this.lotesUsuarioLayer,
        this.acomAguaLayer,
        this.acomDesagueLayer,
        this.cortesLayer,
      ],
      view: new View({
        projection: this.gis.proyeccionMapa,
        center: this.gis.vista.centro,
        zoom: this.gis.vista.zoom,
      }),
    });

    this.controladorGis = new ControladorMapaGis(this.map, {
      consulta: this.consultaCapasGis,
      gis: this.gis,
      capasComerciales: () => [
        { rol: "lotes", capa: this.lotesLayer },
        { rol: "calles", capa: this.callesLayer },
        { rol: "sectoresComerciales", capa: this.sectoresLayer },
      ],
      capasTecnicas: () => this.capasSidebar?.capasTecnicasConsultables() ?? [],
      avisar: (detalle) => this.avisar("info", "Aviso", detalle),
      listado: {
        columnas: COLUMNAS_TABLA_PROGRAMA,
        tituloReporte: this.modo.titulo.toUpperCase(),
        nombreArchivo: this.modo.esReapertura ? "reaperturas_area_" : "cortes_area_",
        origen: ORIGENES_COORDENADA.usuario,
        registros: () => this.registros ?? [],
        aFila: (registro) => this.aFilaTabla(registro as RegistroCorte),
        subcabecera: () => [
          `Sucursal: ${this.selectedSucursal?.nombre ?? "-"}`,
          `Programa: ${this.nroPrecorte ?? "-"}`,
        ],
        excelService: this.excelService,
      },
    });
  }

  private aFilaTabla(registro: RegistroCorte): FilaListado {
    const direccion = direccionDe(registro);
    return {
      ...registro,
      direccion,
      estadoOperacion: this.etiquetaEstado(registro),
      fechaOperacion: this.fechaEjecucion(registro) ?? "",
    };
  }

  ubicarFilaEnMapa(fila: FilaListado): void {
    const codigo = String(fila["codcliente"] ?? "").trim();
    const punto = this.cortesLayer
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

  private estiloPunto(feature: Feature): Style {
    const r = feature.getProperties() as RegistroCorte;
    const sel = feature === this.featureSeleccionado;
    const zoom = this.map?.getView().getZoom() ?? 0;
    return this.estilos.punto({
      forma: "circulo",
      color: this.colorEstado(r),
      zoom,
      seleccionado: sel,
      etiqueta: String(r.codcliente ?? ""),
      ...RADIOS_LECTURA,
    });
  }

  private estiloLote(feature: Feature): Style {
    const estado = feature.get("_estado") as EstadoCorte;
    const sel =
      feature.get("_codcliente") === this.corteSeleccionado?.codcliente;
    const color = this.modo.colores[estado] ?? "#64748b";
    return new Style({
      fill: new Fill({ color: colorConTransparencia(color, sel ? 0.5 : 0.28) }),
      stroke: new Stroke({ color, width: sel ? 3 : 1.5 }),
    });
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      if (estaUsandoHerramientas(this.map)) return;
      const f = this.map.forEachFeatureAtPixel(
        evt.pixel,
        (ft, layer) => (layer === this.cortesLayer ? ft : undefined),
        { hitTolerance: 6 },
      ) as Feature | undefined;
      if (f) {
        this.seleccionarFeature(f);
      } else {
        this.cerrarPopup();
        this.controladorGis?.consultarPunto(evt.coordinate);
      }
    });
  }

  // ============================================================
  // SIDEBAR DE CAPAS
  // ============================================================

  setBaseLayer(id: string): void {
    this.baseActive = this.baseActive === id ? null : id;
    this.osmLayer?.setVisible(this.baseActive === "osm");
    this.satelitalLayer?.setVisible(this.baseActive === "satelital");
  }

  toggleCommercialLayer(layer: { id: string; active: boolean }): void {
    layer.active = !layer.active;
    this.registroCapas[layer.id]?.setVisible(layer.active);
  }

  // ============================================================
  // SELECCIÓN / POPUP / BÚSQUEDA
  // ============================================================

  // Los dos popups ocupan el mismo lugar: abrir el del cliente cierra el de GIS.
  private seleccionarFeature(feature: Feature): void {
    this.controladorGis?.cerrarPopupGis();
    this.featureSeleccionado = feature;
    this.corteSeleccionado = feature.getProperties() as RegistroCorte;
    this.corteSeleccionado.observacion_history = undefined;

    const codsuc = (this.corteSeleccionado.codsuc as string) || this.selectedSucursal?.codsuc || "";
    const codcliente = this.corteSeleccionado.codcliente;
    if (codsuc && codcliente) {
      this.consultaUsuarioService.obtenerCorteReaperturaXcliente(codsuc, codcliente)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((res) => {
          const historial = Array.isArray(res?.data) ? res.data : [];
          if (!this.corteSeleccionado || historial.length === 0) return;
          const corte = this.corteSeleccionado;
          const fechaEjecucion = corte[this.modo.campoFechaEjecucion] || corte.fcorte || corte.freapertura;
          const observacion = observacionDeLaOperacion(historial, fechaEjecucion);
          if (observacion !== undefined) corte.observacion_history = observacion;
        });
    }

    this.cortesLayer.changed();
    this.lotesUsuarioLayer.changed();
    this.cargarImagenes(this.corteSeleccionado);
  }

  cerrarPopup(): void {
    this.corteSeleccionado = null;
    this.featureSeleccionado = null;
    this.imagenesPopup = [];
    this.cortesLayer?.changed();
    this.lotesUsuarioLayer?.changed();
  }

  private cargarImagenes(r: RegistroCorte): void {
    this.imagenesPopup = [];
    this.cargandoImagenes = true;
    const codsuc = (r.codsuc as string) || this.selectedSucursal?.codsuc || "";
    const codcliente = r.codcliente;

    this.controlImgService
      .read_x_tipolistar({
        codsuc,
        codcliente,
        ...rangoFotosRecientes(),
        tipoarchivo: "IMG",
        tiporecepcion: TIPOS_RECEPCION_FOTOS_CORTE,
      })
      .pipe(
        catchError(() => of({ mensaje: "ERROR", data: [] })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((imagenes: any) => {
        this.cargandoImagenes = false;
        this.imagenesPopup =
          imagenes?.mensaje === "EXITO" && imagenes?.data?.length > 0
            ? imagenes.data
              .filter((e: any) => !e.tiporecepcionimages?.includes("FIRMA"))
              .map((e: any) => ({
                ...e,
                src: e.img64?.startsWith("data:")
                  ? e.img64
                  : "data:image/jpeg;base64," + e.img64,
                tiporecepcionimages: e.tiporecepcionimages
                  .split(",")
                  .map((t: string) => t.replace("-IMG", "").trim()),
              }))
            : [];
      });
  }

  buscarPorCodCliente(): void {
    const q = String(this.searchCodCliente || "").trim();
    if (!q) return;

    if (!this.nroPrecorte) {
      this.avisar("warn", "Aviso", "No hay un programa seleccionado");
      return;
    }

    this.cobranzaService.buscarPreCortePorCliente({
      codsuc: this.selectedSucursal?.codsuc || "002",
      codcliente: Number(q),
      nroPrecorte: this.nroPrecorte ? Number(this.nroPrecorte) : 0
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        if (res?.success && res.data) {
          this.controladorGis?.marcarPredio(q);
          const src = this.cortesLayer.getSource()!;
          const f = src.getFeatures().find((ft) => String(ft.get("codcliente") ?? "").trim() === q);

          if (f) {
            this.seleccionarFeature(f);
            const g = f.getGeometry();
            if (g) {
              this.map.getView().animate({ center: getCenter(g.getExtent()), zoom: 20, duration: 700 });
            }
          } else {
            const coord = extraerCoordenada(res.data, ORIGENES_COORDENADA["usuario"]);
            if (coord) {
              this.map.getView().animate({ center: coord, zoom: 20, duration: 700 });
              this.avisar("success", "Aviso", "Ubicación encontrada en el servidor");
            } else {
              this.avisar("warn", "Aviso", "El suministro está en el programa pero no tiene coordenadas");
            }
          }
        } else {
          this.avisar("error", "Aviso", res?.mensaje || "No se encontró el código en este programa");
        }
      },
      error: () => this.avisar("error", "Error", "Ocurrió un error en la búsqueda")
    });
  }

  abrirBusqueda(): void {
    this.mostrarSearchPanel = true;
    this.searchCodCliente = "";
  }

  cerrarBusqueda(): void {
    this.mostrarSearchPanel = false;
    this.searchCodCliente = "";
    this.controladorGis?.quitarPredio();
  }

  abrirStreetView(r: RegistroCorte | null): void {
    if (!r) return;
    const lonLat =
      coordenadaLonLat(r.lon, r.lat, this.gis.proyeccionUtm) ??
      coordenadaLonLat(r.lonpredio, r.latpredio, this.gis.proyeccionUtm);
    if (!lonLat) {
      this.avisar("warn", "Aviso", "Este predio no tiene coordenadas para Street View");
      return;
    }
    abrirGoogleStreetView(lonLat);
  }

  verMasInformacion(codcliente: string | number | undefined): void {
    if (!codcliente) return;
    this.ref = abrirConsultaUsuario(
      this.dialogService,
      codcliente,
      this.selectedSucursal?.codsuc || this.corteSeleccionado?.codsuc,
    );
  }

  // ============================================================
  // POPUP
  // ============================================================

  get observacionMasReciente(): string {
    if (!this.corteSeleccionado) return "-";
    return this.corteSeleccionado.observacion_history || observacionMasRecienteDe(this.corteSeleccionado);
  }

  // ============================================================
  // UTIL
  // ============================================================

  private avisar(
    severity: "success" | "info" | "warn" | "error",
    summary: string,
    detail: string,
  ): void {
    this.messageService.add({ severity, summary, detail });
  }
}