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
import Polygon from "ol/geom/Polygon";
import Geometry from "ol/geom/Geometry";
import GeoJSON from "ol/format/GeoJSON";
import WKT from "ol/format/WKT";
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
import { crearFeaturePunto, crearFeatureLinea, extraerCoordenada, contarPuntosEnCirculo } from "../../../shared/mapa/geo.utils";
import {
  MapEstilosFactory,
  RADIOS_LECTURA,
} from "../../../shared/mapa/mapa-estilos";
import { agregarHerramientasMapa } from "../../../shared/mapa/herramientas-medicion";
import { observarTamanoMapa } from "../../../shared/mapa/observar-tamano-mapa";
import { GisConfigService } from "../../../core/gis";
import { CapasSidebarComponent } from "../../../shared/components/capas-sidebar/capas-sidebar.component";
import { VisorImagenesComponent } from "../../../shared/components/visor-imagenes/visor-imagenes.component";
import { crearCapaWms, crearCapaOsm, crearCapaSatelital, CAPAS_BASE_UI } from "../../../shared/mapa/capas";
import { coordenadaLonLat, abrirGoogleStreetView } from "../../../shared/mapa/street-view";
import { abrirConsultaUsuario } from "../../../shared/dialogos/consulta-usuario.dialog";
import { rangoFotosRecientes } from "../../../shared/utils/fechas.utils";
import type Circle from "ol/geom/Circle";

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
    CapasSidebarComponent,
    VisorImagenesComponent,
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

  private readonly gis = inject(GisConfigService);
  private readonly estilos = new MapEstilosFactory();

  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;
  @ViewChild("mapContainer", { static: false })
  private mapContainer!: ElementRef<HTMLDivElement>;

  // La subclase de reaperturas sobrescribe estos valores.
  protected tipoOperacion = "001"; // reapertura: '002'
  protected campoFechaEjecucion = "fcorte"; // reapertura: 'freapertura'
  protected etiquetaEjecutadoTxt = "CORTADO"; // reapertura: 'REAPERTURADO'
  protected titulo = "Seguimiento de Cortes con Programa";

  get etiquetaEjecutado(): string {
    return this.etiquetaEjecutadoTxt;
  }

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
    ejecutado: "#ef4444",
    pendiente: "#22c55e",
    pagado: "#3b82f6",
  };

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
  inspectores: ResumenInspector[] = [];

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

  private contarElementosEnRadio(circulo: Circle): void {
    const total = contarPuntosEnCirculo(this.cortesLayer?.getSource(), circulo);
    this.messageService.add({
      severity: "info",
      summary: "Selección de Radio",
      detail: `Se encontraron ${total} cortes/reaperturas en el área seleccionada.`,
    });
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
      data: { tipooperacion: this.tipoOperacion },
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
      const estado = this.estadoCorte(r);

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

  // OJO: si el origen manda lat,lng en vez de lng,lat, el polígono sale volteado.
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
    const proyeccionMapa = this.gis.proyeccionMapa;
    const src =
      Math.abs(x) > 180 || Math.abs(y) > 90
        ? this.gis.proyeccionUtm
        : proyeccionMapa;
    if (src !== proyeccionMapa) geom.transform(src, proyeccionMapa);
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

    agregarHerramientasMapa(this.map, (geometry) => {
      if (geometry && geometry.getType() === 'Circle') {
        this.contarElementosEnRadio(geometry);
      }
    });
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
    const color = this.COLORES[estado] ?? "#64748b";
    return new Style({
      fill: new Fill({ color: this.rgba(color, sel ? 0.5 : 0.28) }),
      stroke: new Stroke({ color, width: sel ? 3 : 1.5 }),
    });
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      const isDrawing = this.map.getInteractions().getArray().some(i => i.get('isDrawInteraction'));
      if (isDrawing) return;
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
    this.corteSeleccionado.observacion_history = undefined;

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
  // LIGHTBOX
  // ============================================================

  get observacionMasReciente(): string {
    if (!this.corteSeleccionado) return '-';
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
    } catch (e) { }

    return typeof obs === 'string' ? obs : '-';
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