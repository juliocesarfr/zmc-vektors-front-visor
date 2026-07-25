import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
  HostListener,
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
import Polygon from "ol/geom/Polygon";
import Geometry from "ol/geom/Geometry";
import GeoJSON from "ol/format/GeoJSON";
import WKT from "ol/format/WKT";
import { Style, Fill, Stroke } from "ol/style";
import { transform } from "ol/proj";
import { getCenter } from "ol/extent";

import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { CobranzaService } from "@host/_servicios/vektors/cobranza.service";
import { ControlImgService } from "@host/_servicios/procesar-img/control-img.service";
import { ConsultaUsuarioService } from "@host/_servicios/consulta/consulta-usuario.service";
import { ConsultaUsuarioComponent } from "@mf-consulta/_pages/consulta-usuario/consulta-usuario.component";
import { FiltrarProgramaPrecorte } from "@host/_models/vektors/Cobranza/FiltrarProgramaPrecorte";

import {
  GEOSERVER_URL,
  GEOSERVER_CAPAS,
  PROYECCION_MAPA,
  PROYECCION_UTM_18S,
  VISTA_INICIAL,
  TIPOS_RECEPCION_IMG,
  TIPOS_RECEPCION_IMGCORE,
  ORIGENES_COORDENADA,
  DISTANCIA_MAX_ACOMETIDA_M,
  COLOR_FICHA_AGUA,
  COLOR_FICHA_ALC,
} from "../../../config/Controldigitacion.config";
import {
  crearFeaturePunto,
  crearFeatureLinea,
  extraerCoordenada,
} from "../../../util/Geo.utils";
import {
  MapEstilosFactory,
  RADIOS_LECTURA,
} from "../../../util/Mapaestilos.factory";
import { observarTamanoMapa } from "../.././../util/Mapinit.util";

/* La parametrización corte/reapertura vive como propiedades protected de la
 * clase (ver abajo) para que la ventana de reaperturas EXTIENDA esta y solo
 * sobreescriba esos 4 valores, sin duplicar la lógica del mapa. */

export type EstadoCorte = "ejecutado" | "pagado" | "pendiente";

export interface RegistroCorte {
  codemp?: string;
  codsuc?: string;
  codcliente?: number | string;
  codsector?: string;
  codmza?: string;
  nrolote?: string;
  nrosublote?: string;
  propietario?: string;
  telefono?: string;
  nromed?: string;
  descripcioncorta?: string;
  descripcioncalle?: string;
  nrocalle?: string;
  descripcionurba?: string;
  codinspector?: string;
  inspector?: string;
  codestado?: string;
  estadoservicio2?: string;
  estadocliente?: string;
  diapago?: string;
  fcorte?: string;
  freapertura?: string;
  fechavencmto?: string;
  impdeuda?: number;
  impmesdeuda?: number;
  nromesesdeuda?: number;
  impdeudareclamo?: number;
  nromesesdeudareclamo?: number;
  impdeudapagada?: number;
  catetar?: string;
  tarifa?: string;
  c_destipocoragu?: string;
  c_destipocordes?: string;
  lecturaultima?: number;
  // georreferencia (viene del core / PostgreSQL)
  lon?: number;
  lat?: number;
  lonpredio?: number;
  latpredio?: number;
  lonagua?: number;
  latagua?: number;
  londesague?: number;
  latdesague?: number;
  lonacometidaagua?: number;
  latacometidaagua?: number;
  lonacometidadesague?: number;
  latacometidadesague?: number;
  capaloteslatylog?: string;
  [k: string]: any;
}

interface ResumenInspector {
  codinspector: string;
  inspector: string;
  total: number;
  ejecutados: number;
  pagados: number;
  pendientes: number;
  rendimiento: number;
}

@Component({
  selector: "app-seguimiento-cortescon-programa",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DropdownModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    ToastModule,
    TagModule,
  ],
  templateUrl: "./seguimiento-cortescon-programa.component.html",
  styleUrl: "./seguimiento-cortescon-programa.component.scss",
  providers: [MessageService, DialogService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SeguimientoCortesconProgramaComponent
  implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private cobranzaService = inject(CobranzaService);
  private detenerObservadorMapa?: () => void;

  /** Fábrica de estilos compartida con la ventana de lecturas (cachea puntos). */
  private readonly estilos = new MapEstilosFactory();

  @ViewChild("mapContainer", { static: false })
  private mapContainer!: ElementRef<HTMLDivElement>;

  // --- Parametrización corte/reapertura (la subclase de reaperturas hace override) ---
  protected tipoOperacion = "001"; // reapertura: '002'
  protected campoFechaEjecucion = "fcorte"; // reapertura: 'freapertura'
  protected etiquetaEjecutadoTxt = "CORTADO"; // reapertura: 'REAPERTURADO'
  protected titulo = "Seguimiento de Cortes con Programa";

  /** Expuesto al template. */
  get etiquetaEjecutado(): string {
    return this.etiquetaEjecutadoTxt;
  }

  // ---- Mapa y capas ----
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

  protected COLORES: Record<EstadoCorte, string> = {
    ejecutado: "#ef4444", // cortado -> ROJO
    pendiente: "#22c55e", // pendiente -> VERDE
    pagado: "#3b82f6", // pagó -> AZUL (otro color)
  };

  // ---- Filtros ----
  dataSucursales: any[] = [];
  selectedSucursal: any = null;
  nroPrecorte: number | null = null;

  // ---- Datos ----
  private registrosOriginal: RegistroCorte[] = [];
  registros: RegistroCorte[] = [];
  filtroInspector: string | null = null;
  filtroEstado: EstadoCorte | null = null;

  // ---- Resumen ----
  total = 0;
  ejecutados = 0;
  pagados = 0;
  pendientes = 0;
  rendimiento = 0;
  totalSinCoordenadas = 0;
  inspectores: ResumenInspector[] = [];

  // ---- UI ----
  filtrosVisible = true;
  sidebarOpen = true;
  panelInspectores = false;
  mostrarLeyenda = true;
  mostrarSearchPanel = false;
  baseActive: string | null = "osm";
  cargando = false;
  searchCodCliente = "";

  corteSeleccionado: RegistroCorte | null = null;
  private featureSeleccionado: Feature | null = null;

  // ---- Evidencias (fotos) ----
  imagenesPopup: any[] = [];
  cargandoImagenes = false;

  // ---- Lightbox ----
  imagenAbierta: string | null = null;
  imagenAbiertaIndex = -1;
  imagenZoom = 1;
  imagenRotacion = 0;
  isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  imgOffsetX = 0;
  imgOffsetY = 0;

  baseLayers = [
    { id: "osm", label: "OSM" },
    { id: "satelital", label: "Satelital" },
  ];

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
    this.consultaService
      .getconsultaService("SUC", "ALL", "ALL", "ALL")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((resp) => {
        this.dataSucursales = resp || [];

        // Handoff desde la ventana de resumen: si viene codsuc/nroprecorte, auto-busca.
        const codsucIni = this.dialogConfig?.data?.codsuc;
        this.selectedSucursal = codsucIni
          ? (this.dataSucursales.find((s) => s.codsuc === codsucIni) ??
            this.dataSucursales[0])
          : this.dataSucursales[0];

        const nroIni = this.dialogConfig?.data?.nroprecorte;
        if (nroIni && this.selectedSucursal) {
          this.nroPrecorte = Number(nroIni);
          this.ejecutarBusqueda();
        }
      });
  }

  ngAfterViewInit(): void {
    this.crearMapa();
    this.initClick();

    requestAnimationFrame(() => {
      const el =
        this.mapContainer?.nativeElement ?? document.getElementById("map");
      if (!el) {
        console.error(
          "[SeguimientoCortes] No se encontró el contenedor del mapa.",
        );
        return;
      }
      this.map.setTarget(el);
      this.map.updateSize();
      this.detenerObservadorMapa = observarTamanoMapa(this.map, el);
    });
  }

  ngOnDestroy(): void {
    this.detenerObservadorMapa?.();
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

  private ejecutarBusqueda(): void {
    const filtro: FiltrarProgramaPrecorte = {
      codsuc: this.selectedSucursal.codsuc,
      nroprecorte: this.nroPrecorte!,
      tipooperacion: this.tipoOperacion,
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

  protected estadoCorte(r: RegistroCorte): EstadoCorte {
    if (r?.codestado === "003") return "ejecutado";
    if (r?.diapago) return "pagado";
    return "pendiente";
  }

  etiquetaEstado(r: RegistroCorte): string {
    const e = this.estadoCorte(r);
    if (e === "ejecutado") return this.etiquetaEjecutadoTxt;
    if (e === "pagado") return "PAGADO";
    return "PENDIENTE";
  }

  colorEstado(r: RegistroCorte): string {
    return this.COLORES[this.estadoCorte(r)];
  }

  fechaEjecucion(r: RegistroCorte): string | undefined {
    return r?.[this.campoFechaEjecucion];
  }

  private rgba(hex: string, alpha: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  // ============================================================
  // PLOTEO  (reutiliza crearFeaturePunto / crearFeatureLinea de Geo.utils)
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
      const estado = this.estadoCorte(r);

      // Punto del usuario (con fallback al predio) — reutiliza tu util.
      const fp =
        crearFeaturePunto(r, ORIGENES_COORDENADA.usuario) ??
        crearFeaturePunto(r, ORIGENES_COORDENADA.predio);
      if (fp) sp.addFeature(fp);
      else sinCoord++;

      // Acometidas (líneas) — reutiliza tu util, con el tope de distancia.
      const la = crearFeatureLinea(
        r,
        ORIGENES_COORDENADA.agua,
        ORIGENES_COORDENADA.acomagua,
        DISTANCIA_MAX_ACOMETIDA_M,
      );
      if (la) sa.addFeature(la);

      const ld = crearFeatureLinea(
        r,
        ORIGENES_COORDENADA.desague,
        ORIGENES_COORDENADA.acomdesague,
        DISTANCIA_MAX_ACOMETIDA_M,
      );
      if (ld) sd.addFeature(ld);

      // Polígono del lote (sin util propio: se parsea capaloteslatylog).
      const g = this.geomLote(r.capaloteslatylog);
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

  /**
   * Parsea capaloteslatylog a una geometría en la proyección del mapa.
   * Soporta GeoJSON, WKT (POLYGON/MULTIPOLYGON) y pares de coordenadas.
   * OJO: si el origen manda lat,lng en lugar de lng,lat, el polígono sale
   * volteado. Confirmar con un valor real y, si aplica, invertir aquí.
   */
  private geomLote(raw?: string): Geometry | null {
    if (!raw) return null;
    let geom: Geometry | null = null;
    try {
      const s = String(raw).trim();
      if (s.startsWith("{")) {
        geom = new GeoJSON().readGeometry(s);
      } else if (/POLYGON|MULTIPOLYGON/i.test(s)) {
        geom = new WKT().readGeometry(s);
      } else {
        const anillo = this.parsearPares(s);
        if (anillo && anillo.length >= 3) geom = new Polygon([anillo]);
      }
    } catch {
      return null;
    }
    if (!geom) return null;

    const flat = (geom as any).getFlatCoordinates?.() ?? [];
    const x = flat[0];
    const y = flat[1];
    if (x == null || y == null) return null;
    const src =
      Math.abs(x) > 180 || Math.abs(y) > 90 ? PROYECCION_UTM_18S : PROYECCION_MAPA;
    if (src !== PROYECCION_MAPA) geom.transform(src, PROYECCION_MAPA);
    return geom;
  }

  private parsearPares(s: string): number[][] | null {
    try {
      if (s.startsWith("[")) {
        const arr = JSON.parse(s);
        if (Array.isArray(arr) && Array.isArray(arr[0])) {
          return arr.map((p: any) => [Number(p[0]), Number(p[1])]);
        }
      }
      const nums = s
        .split(/[,\s]+/)
        .map(Number)
        .filter((n) => !isNaN(n));
      if (nums.length >= 6 && nums.length % 2 === 0) {
        const pts: number[][] = [];
        for (let i = 0; i < nums.length; i += 2)
          pts.push([nums[i], nums[i + 1]]);
        return pts;
      }
    } catch { }
    return null;
  }

  // ============================================================
  // RESUMEN / INSPECTORES
  // ============================================================

  private calcularResumen(): void {
    const rs = this.registros ?? [];
    this.total = rs.length;
    this.ejecutados = rs.filter(
      (r) => this.estadoCorte(r) === "ejecutado",
    ).length;
    this.pagados = rs.filter((r) => this.estadoCorte(r) === "pagado").length;
    this.pendientes = rs.filter(
      (r) => this.estadoCorte(r) === "pendiente",
    ).length;
    this.rendimiento = this.total
      ? Number(((this.ejecutados / this.total) * 100).toFixed(1))
      : 0;
  }

  private calcularInspectores(): void {
    const mapa = new Map<string, ResumenInspector>();
    for (const r of this.registrosOriginal ?? []) {
      const key = r.codinspector || "—";
      if (!mapa.has(key)) {
        mapa.set(key, {
          codinspector: key,
          inspector: r.inspector || "Sin inspector",
          total: 0,
          ejecutados: 0,
          pagados: 0,
          pendientes: 0,
          rendimiento: 0,
        });
      }
      const it = mapa.get(key)!;
      it.total++;
      const e = this.estadoCorte(r);
      if (e === "ejecutado") it.ejecutados++;
      else if (e === "pagado") it.pagados++;
      else it.pendientes++;
    }
    const arr = [...mapa.values()];
    arr.forEach(
      (it) =>
      (it.rendimiento = it.total
        ? Number(((it.ejecutados / it.total) * 100).toFixed(1))
        : 0),
    );
    arr.sort((a, b) => b.total - a.total);
    this.inspectores = arr;
  }

  private aplicarFiltros(): void {
    let base = this.registrosOriginal ?? [];
    if (this.filtroInspector) {
      base = base.filter(
        (r) => (r.codinspector || "—") === this.filtroInspector,
      );
    }
    if (this.filtroEstado) {
      base = base.filter((r) => this.estadoCorte(r) === this.filtroEstado);
    }
    this.registros = base;
    this.cerrarPopup();
    this.plotear(true);
  }

  filtrarPorInspector(insp: ResumenInspector): void {
    this.filtroInspector =
      this.filtroInspector === insp.codinspector ? null : insp.codinspector;
    this.aplicarFiltros();
  }

  filtrarPorEstado(estado: EstadoCorte): void {
    this.filtroEstado = this.filtroEstado === estado ? null : estado;
    this.aplicarFiltros();
  }

  /** Limpia el filtro por inspector y vuelve a pintar todo el precorte. */
  limpiarFiltroInspector(): void {
    if (!this.filtroInspector) return;
    this.filtroInspector = null;
    this.aplicarFiltros();
  }

  /** Limpia AMBOS filtros del mapa (inspector + estado). */
  limpiarFiltrosMapa(): void {
    if (!this.filtroInspector && !this.filtroEstado) return;
    this.filtroInspector = null;
    this.filtroEstado = null;
    this.aplicarFiltros();
  }

  // ============================================================
  // MAPA
  // ============================================================

  private crearWms(layer: string, visible: boolean): TileLayer<TileWMS> {
    return new TileLayer({
      visible,
      source: new TileWMS({
        url: GEOSERVER_URL,
        params: { LAYERS: layer, TILED: false },
        serverType: "geoserver",
        transition: 0,
      }),
    });
  }

  private crearMapa(): void {
    this.osmLayer = new TileLayer({
      source: new OSM(),
      visible: this.baseActive === "osm",
    });
    this.satelitalLayer = new TileLayer({
      source: new XYZ({
        url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      }),
      visible: this.baseActive === "satelital",
    });

    this.lotesLayer = this.crearWms(GEOSERVER_CAPAS.lotes, true);
    this.sectoresLayer = this.crearWms(
      GEOSERVER_CAPAS.sectoresComerciales,
      false,
    );
    this.callesLayer = this.crearWms(GEOSERVER_CAPAS.calles, false);

    this.lotesUsuarioLayer = new VectorLayer({
      source: new VectorSource(),
      visible: true,
      style: (f) => this.estiloLote(f as Feature),
    });

    // Acometidas: reutiliza lineaAcometida de MapEstilosFactory (doble trazo +
    // auto-extensión para que las líneas cortas sean clickeables).
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
        this.estilos.lineaAcometida(COLOR_FICHA_ALC, false, resolution),
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
        projection: PROYECCION_MAPA,
        center: VISTA_INICIAL.centro,
        zoom: VISTA_INICIAL.zoom,
      }),
    });
  }

  /** Punto de corte: reutiliza MapEstilosFactory.punto (círculo, radio por
   *  zoom, cache, y etiqueta de codcliente a zoom >= 17 o seleccionado).
   *  El color viene de la lógica de estado de cortes. */
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
    const color = this.COLORES[estado] ?? "#64748b";
    return new Style({
      fill: new Fill({ color: this.rgba(color, sel ? 0.5 : 0.28) }),
      stroke: new Stroke({ color, width: sel ? 3 : 1.5 }),
    });
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      const f = this.map.forEachFeatureAtPixel(
        evt.pixel,
        (ft, layer) => (layer === this.cortesLayer ? ft : undefined),
        { hitTolerance: 6 },
      ) as Feature | undefined;
      if (f) this.seleccionarFeature(f);
      else this.cerrarPopup();
    });
  }

  // ============================================================
  // SIDEBAR DE CAPAS
  // ============================================================

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

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

  private seleccionarFeature(feature: Feature): void {
    this.featureSeleccionado = feature;
    this.corteSeleccionado = feature.getProperties() as RegistroCorte;
    this.corteSeleccionado.observacion_history = undefined; // Reset
    
    const codsuc = (this.corteSeleccionado.codsuc as string) || this.selectedSucursal?.codsuc || "";
    const codcliente = this.corteSeleccionado.codcliente;
    if (codsuc && codcliente) {
      this.consultaUsuarioService.obtenerCorteReaperturaXcliente(codsuc, codcliente)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(res => {
          if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
            const parseDate = (d: string) => {
              if (!d) return 0;
              if (d.includes('/')) {
                const [datePart] = d.split(' ');
                const [day, month, year] = datePart.split('/');
                const y = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
                return new Date(y, parseInt(month) - 1, parseInt(day)).getTime();
              }
              const parsed = new Date(d).getTime();
              return isNaN(parsed) ? 0 : parsed;
            };

            const fechaRefStr = (this.corteSeleccionado as any)?.[this.campoFechaEjecucion] || this.corteSeleccionado?.fcorte || this.corteSeleccionado?.freapertura;
            const fechaRef = parseDate(fechaRefStr as string);

            const cortes = res.data;
            const targetRow = cortes.find((c: any) => {
              if (fechaRef > 0) {
                const obsDate = parseDate(c.fecha || c.fechareg || c.fecha_registro);
                if (obsDate > 0 && obsDate < fechaRef) return false;
              }
              return true;
            });
            
            if (this.corteSeleccionado && targetRow) {
              this.corteSeleccionado.observacion_history = targetRow.observacion?.trim() || '-';
            }
          }
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

    const hoy = new Date();
    const fFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    const fIni = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) =>
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

    this.controlImgService
      .read_x_tipolistar({
        codsuc,
        codcliente,
        fecha_inicial: fmt(fIni),
        fecha_final: fmt(fFin),
        tipoarchivo: "IMG",
        tiporecepcion: TIPOS_RECEPCION_IMGCORE,
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
  }

  abrirStreetView(r: RegistroCorte | null): void {
    if (!r) return;
    const candidatos: [any, any][] = [
      [r.lon, r.lat],
      [r.lonpredio, r.latpredio],
    ];
    let coord: [number, number] | null = null;
    for (const [x, y] of candidatos) {
      if (x != null && y != null && !(Number(x) === 0 && Number(y) === 0)) {
        coord = [Number(x), Number(y)];
        break;
      }
    }
    if (!coord) {
      this.avisar(
        "warn",
        "Aviso",
        "Este predio no tiene coordenadas para Street View",
      );
      return;
    }
    let [lng, lat] = coord;

    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
      [lng, lat] = transform([lng, lat], PROYECCION_UTM_18S, "EPSG:4326") as [
        number,
        number,
      ];
    }
    window.open(
      `https://www.google.com/maps?layer=c&cbll=${lat},${lng}`,
      "_blank",
    );
  }

  verMasInformacion(codcliente: string | number | undefined): void {
    if (!codcliente) return;
    this.ref = this.dialogService.open(ConsultaUsuarioComponent, {
      header: "Consulta General de Usuario",
      width: "90%",
      height: "95%",
      baseZIndex: 10000,
      maximizable: true,
      data: {
        codcliente,
        codsuc: this.selectedSucursal?.codsuc || this.corteSeleccionado?.codsuc,
        operacion: "Vektors",
      },
    });
  }

  // ============================================================
  // LIGHTBOX
  // ============================================================

  get observacionMasReciente(): string {
    if (!this.corteSeleccionado) return '-';
    // Use the fetched history observation first, fallback to the previous logic
    if (this.corteSeleccionado.observacion_history) {
      return this.corteSeleccionado.observacion_history;
    }
    
    let obs = this.corteSeleccionado.observaciones || this.corteSeleccionado.observacion;
    if (!obs) return '-';
    
    try {
      if (typeof obs === 'string') {
        const parsed = JSON.parse(obs);
        if (Array.isArray(parsed)) {
          obs = parsed;
        }
      }
      if (Array.isArray(obs) && obs.length > 0) {
        const sorted = [...obs].sort((a, b) => {
          const dA = new Date(a.fechareg || a.fecha || a.fecha_registro || 0).getTime();
          const dB = new Date(b.fechareg || b.fecha || b.fecha_registro || 0).getTime();
          return dB - dA;
        });
        return sorted[0].observacion || sorted[0].observaciones || sorted[0].descripcion || '-';
      }
    } catch(e) { }
    
    return typeof obs === 'string' ? obs : '-';
  }

  get imagenActual(): any | null {
    return this.imagenAbiertaIndex >= 0
      ? this.imagenesPopup[this.imagenAbiertaIndex]
      : null;
  }

  abrirImagenCompleta(index: number): void {
    if (index < 0 || index >= this.imagenesPopup.length) return;
    this.imagenAbiertaIndex = index;
    this.imagenAbierta = this.imagenesPopup[index].src;
    this.resetZoom();
  }

  cerrarImagenCompleta(): void {
    this.imagenAbierta = null;
    this.imagenAbiertaIndex = -1;
    this.resetZoom();
  }

  siguienteImagen(event?: Event): void {
    event?.stopPropagation();
    if (this.imagenesPopup.length === 0) return;
    this.abrirImagenCompleta(
      (this.imagenAbiertaIndex + 1) % this.imagenesPopup.length,
    );
  }

  anteriorImagen(event?: Event): void {
    event?.stopPropagation();
    if (this.imagenesPopup.length === 0) return;
    this.abrirImagenCompleta(
      (this.imagenAbiertaIndex - 1 + this.imagenesPopup.length) %
      this.imagenesPopup.length,
    );
  }

  zoomIn(): void {
    this.imagenZoom = Math.min(this.imagenZoom + 0.25, 5);
  }

  zoomOut(): void {
    this.imagenZoom = Math.max(this.imagenZoom - 0.25, 0.25);
    if (this.imagenZoom <= 1) this.resetOffset();
  }

  resetZoom(): void {
    this.imagenZoom = 1;
    this.imagenRotacion = 0;
    this.resetOffset();
  }

  rotarIzquierda(): void {
    this.imagenRotacion -= 90;
  }

  rotarDerecha(): void {
    this.imagenRotacion += 90;
  }

  onWheelZoom(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    this.imagenZoom = Math.min(Math.max(this.imagenZoom + delta, 0.25), 5);
    if (this.imagenZoom <= 1) this.resetOffset();
  }

  onDragStart(event: MouseEvent): void {
    if (this.imagenZoom <= 1) return;
    this.isDragging = true;
    this.dragStartX = event.clientX - this.imgOffsetX;
    this.dragStartY = event.clientY - this.imgOffsetY;
    event.preventDefault();
  }

  onDragMove(event: MouseEvent): void {
    if (!this.isDragging || this.imagenZoom <= 1) return;
    this.imgOffsetX = event.clientX - this.dragStartX;
    this.imgOffsetY = event.clientY - this.dragStartY;
  }

  onDragEnd(): void {
    this.isDragging = false;
  }

  private resetOffset(): void {
    this.imgOffsetX = 0;
    this.imgOffsetY = 0;
  }

  @HostListener("document:keydown", ["$event"])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (this.imagenAbierta) {
      if (event.key === "ArrowRight") this.siguienteImagen();
      else if (event.key === "ArrowLeft") this.anteriorImagen();
      else if (event.key === "Escape") this.cerrarImagenCompleta();
      return;
    }
    if (event.key === "Escape" && this.corteSeleccionado) this.cerrarPopup();
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