import {
  Component,
  AfterViewInit,
  OnInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
  HostListener,
  DestroyRef,
  NgZone,
  ViewChild,
  ElementRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { forkJoin, of, Subject, Observable } from "rxjs";
import { catchError, switchMap, tap, takeUntil, map } from "rxjs/operators";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";

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
import Feature, { FeatureLike } from "ol/Feature";
import Point from "ol/geom/Point";
import { extend, getCenter } from "ol/extent";

import { MessageService } from "primeng/api";
import { AperturaMicromedicionService } from "@host/_servicios/micromedicion/apertura-micromedicion.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { SectoresCicloService } from "@host/_servicios/seguridad/sectores-ciclo.service";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { MicromedicionService } from "@host/_servicios/vektors/micromedicion.service";
import { ControlImgService } from "@host/_servicios/procesar-img/control-img.service";
import { ClientesService } from "@host/_servicios/catastro/clientes.service";
import { FiltroLecturas } from "@host/_models/vektors/FiltroLecturas";
import { FormsModule } from "@angular/forms";
import { DropdownModule } from "primeng/dropdown";
import { ButtonModule } from "primeng/button";
import { MultiSelectModule } from "primeng/multiselect";
import { InputNumberModule } from "primeng/inputnumber";
import { ToastModule } from "primeng/toast";
import { InputTextModule } from "primeng/inputtext";

import {
  DISTANCIA_MAX_ACOMETIDA_M,
  ORIGENES_COORDENADA,
} from "../../../shared/constantes/coordenadas";
import {
  colorPorEstadoLectura,
  COLOR_FICHA_AGUA,
  COLOR_FICHA_ALCANTARILLADO,
} from "../../../shared/constantes/colores-mapa";
import {
  LISTA_MESES,
  TIPOS_PROMEDIO,
  TIPOS_RECEPCION_FOTOS_LECTURA,
  SECTOR_TODOS,
} from "../../../shared/constantes/lecturas";
import { RegistroLectura } from "@host/_models/vektors/RegistroLectura";
import { SectorCiclo } from "@host/_models/vektors/SectorCiclo";
import { ROTULO_ENVIVO_MS } from "../../../shared/mapa/destello-lecturas";
import {
  crearFeaturePunto,
  crearFeatureLinea,
  extraerCoordenada,
} from "../../../shared/mapa/geo.utils";
import { DestelloLecturas } from "../../../shared/mapa/destello-lecturas";
import { LecturasEnVivoService } from "../../../core/tiempo-real";
import {
  ContextoTiempoReal,
  LecturaEnVivo,
} from "@host/_models/vektors/LecturaEnVivo";
import {
  FormaPunto,
  MapEstilosFactory,
  RADIOS_LECTURA,
  RADIOS_FICHA,
} from "../../../shared/mapa/mapa-estilos";
import { estaUsandoHerramientas } from "../../../shared/mapa/herramientas-medicion";
import { observarTamanoMapa } from "../../../shared/mapa/observar-tamano-mapa";
import { MARCA_CAPA_RESALTADO } from "../../../shared/mapa/interaccion-gis";
import { ZOOM_PREDIO } from "../../../shared/mapa/predio-buscado";
import { ControladorMapaGis } from "../../../shared/mapa/controlador-mapa-gis";
import {
  CapaConsultable,
  ConsultaCapasGisService,
  GisConfigService,
} from "../../../core/gis";
import { CapasSidebarComponent } from "../../../shared/components/capas-sidebar/capas-sidebar.component";
import { VisorImagenesComponent } from "../../../shared/components/visor-imagenes/visor-imagenes.component";
import { PanelesMapaGisComponent } from "../../../shared/components/paneles-mapa-gis/paneles-mapa-gis.component";
import {
  ColumnaListado,
  FilaListado,
  direccionDe,
} from "../../../shared/utils/listado-excel";
import { ExcelService } from "@host/_servicios/reportes/excel.service";
import {
  crearCapaWms,
  crearCapaOsm,
  crearCapaSatelital,
  CAPAS_BASE_UI,
} from "../../../shared/mapa/capas";
import {
  coordenadaLonLat,
  abrirGoogleStreetView,
} from "../../../shared/mapa/street-view";
import { abrirConsultaUsuario } from "../../../shared/dialogos/consulta-usuario.dialog";

import {
  formatoFechaCorta,
  rangoFotosRecientes,
} from "../../../shared/utils/fechas.utils";
import { FactArchService } from "@host/_servicios/facturacion/fact-arch.service";

/** Qué ficha muestra el popup según la capa en que se hizo clic. */
type TipoPopup = "lectura" | "agua" | "alcantarillado";

const COLUMNAS_TABLA_LECTURAS: ColumnaListado[] = [
  { campo: "codcliente", titulo: "Cód. cliente", anchoExcel: 12 },
  { campo: "propietario", titulo: "Titular", anchoExcel: 35 },
  { campo: "direccion", titulo: "Dirección", anchoExcel: 35 },
  { campo: "codsector", titulo: "Sector", anchoExcel: 8 },
  { campo: "codmza", titulo: "Mza", anchoExcel: 8 },
  { campo: "nrolote", titulo: "Lote", anchoExcel: 8 },
  { campo: "nromed", titulo: "Medidor", anchoExcel: 15 },
  { campo: "lecturaanterior", titulo: "Lect. anterior", anchoExcel: 12 },
  { campo: "lecturaultima", titulo: "Lect. actual", anchoExcel: 12 },
  { campo: "consumo", titulo: "Consumo", anchoExcel: 10 },
  {
    campo: "descripcionEstadoLectura",
    titulo: "Estado de lectura",
    anchoExcel: 24,
  },
  { campo: "inspector", titulo: "Inspector", anchoExcel: 30 },
];

@Component({
  selector: "app-controldigitacion",
  standalone: true,
  imports: [
    CapasSidebarComponent,
    VisorImagenesComponent,
    PanelesMapaGisComponent,
    CommonModule,
    FormsModule,
    DropdownModule,
    MultiSelectModule,
    ButtonModule,
    InputNumberModule,
    ToastModule,
    InputTextModule,
  ],
  templateUrl: "./controldigitacion.component.html",
  styleUrl: "./controldigitacion.component.scss",
  providers: [
    MessageService,
    DialogService,
    // Al destruirse se da de baja del socket sin cerrarlo para las demás pantallas.
    LecturasEnVivoService,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ControldigitacionComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private readonly destroyRef = inject(DestroyRef);

  // Al cambiar de opción en un combo se cancelan las cargas que siguen pendientes de la
  // opción anterior; si no, una respuesta que llega tarde llenaría los combos con datos viejos.
  private readonly cicloCambiado = new Subject<void>();
  private readonly sucursalCambiada = new Subject<void>();
  private readonly gis = inject(GisConfigService);
  private readonly consultaCapasGis = inject(ConsultaCapasGisService);
  controladorGis?: ControladorMapaGis;
  private readonly estilos = new MapEstilosFactory();
  private detenerObservadorMapa?: () => void;

  private readonly enVivo = inject(LecturasEnVivoService);
  private destellos?: DestelloLecturas;
  private readonly zone = inject(NgZone);
  private readonly factArchService = inject(FactArchService);
  private readonly excelService = inject(ExcelService);

  totalEnVivo = 0;
  ultimaEnVivo: { inspector: string; codcliente: string } | null = null;
  conectadoEnVivo = false;
  private timeoutRotulo?: number;

  @ViewChild(CapasSidebarComponent)
  private capasSidebar?: CapasSidebarComponent;
  @ViewChild("mapContainer", { static: false })
  private mapContainer!: ElementRef<HTMLDivElement>;

  map!: OlMap;
  lecturasLayer!: VectorLayer<VectorSource>;
  cajaAguaLayer!: VectorLayer<VectorSource>;
  fichaAlcLayer!: VectorLayer<VectorSource>;
  acomAguaLayer!: VectorLayer<VectorSource>;
  acomDesagueLayer!: VectorLayer<VectorSource>;
  lotesLayer!: TileLayer<TileWMS>;
  sectoresComercialesLayer!: TileLayer<TileWMS>;
  callesLayer!: TileLayer<TileWMS>;
  rutaLecturaLayer!: TileLayer<TileWMS>;
  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;

  private registroCapas: Record<string, BaseLayer> = {};
  private capasVector: VectorLayer<VectorSource>[] = [];

  tipoPopup: TipoPopup = "lectura";

  private readonly codsedeSesion = sessionStorage.getItem("codsede");

  dataCiclos: any[] = [];
  fechaCiclos: any;
  listaSucursales: any[] = [];
  listaSectores: SectorCiclo[] = [];
  listaEstadosLectura: any[] = [];

  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: SectorCiclo | null = null; // '%' = todos
  selectedEstados: string[] = [];
  selectedAnio = "";
  selectedMes = "";
  consumoInicial: number | null = 0;
  consumoFinal: number | null = 0;
  selectedTipoPromedio: (typeof TIPOS_PROMEDIO)[number] | null =
    TIPOS_PROMEDIO[0]; // default: MEDIDO

  resultadoBusquedaJson: RegistroLectura[] | null = null;

  readonly listaMeses = LISTA_MESES;
  readonly tiposPromedio = TIPOS_PROMEDIO;
  readonly listaYear: { anio: string }[] = Array.from(
    { length: 6 },
    (_, i) => ({
      anio: String(new Date().getFullYear() - i),
    }),
  );

  filtrosVisible = false;
  baseActive: string | null = "osm";
  cargando = false;
  totalLecturas = 0;
  totalSinCoordenadas = 0;
  lecturaSeleccionada: RegistroLectura | null = null;
  mostrarLeyenda = true;
  mostrarSearchPanel = false;
  searchCodCliente = "";
  featureSeleccionado: Feature | null = null;
  resultadoBusquedaOriginalJson: RegistroLectura[] | null | undefined =
    undefined;
  isBusquedaClienteActiva = false;

  readonly baseLayers = CAPAS_BASE_UI;

  commercialLayers = [
    { id: "usuarios", label: "Usuarios", active: true },
    { id: "lotes", label: "Lotes", active: true },
    { id: "caja_agua", label: "Ficha Agua", active: false },
    { id: "acometida", label: "Acometida de Agua", active: false },
    { id: "ficha_alc", label: "Ficha Alcantarillado", active: false },
    { id: "acc_alc", label: "Acometida de Alcantarillado", active: false },
    { id: "sectores", label: "Sectores Comerciales", active: false },
    { id: "calles", label: "Calles", active: false },
    { id: "rutaLectura", label: "Ruta de Lectura", active: false },
  ];

  imagenesPopup: any[] = [];
  cargandoImagenes = false;
  datosClientePopup: any = null;
  ref: DynamicDialogRef | undefined;

  /** Foto abierta en el visor; -1 = cerrado. */
  indiceFotoAbierta = -1;

  constructor(
    private aperturaService: AperturaMicromedicionService,
    private sucursalesService: SucursalesService,
    private sectoresService: SectoresCicloService,
    private consultaService: ConsulGenericService,
    private micromedicionService: MicromedicionService,
    private controlImgService: ControlImgService,
    private clientesService: ClientesService,
    private messageService: MessageService,
    private dialogService: DialogService,
  ) {}

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);

    this.aperturaService
      .getCiclos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        if (response.status === "SUCCESS" && response.data?.length > 0) {
          this.dataCiclos = response.data;
          this.selectedCiclo = this.dataCiclos[0];
          this.onCicloChange(true);
        }
      });

    this.consultaService
      .getconsultaService("TEL", "ALL", "ALL", "ALL")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => (this.listaEstadosLectura = data));

    // Aquí y no en ngAfterViewInit: si se navega antes, takeUntilDestroyed lanzaría.
    this.iniciarTiempoReal();
  }

  ngAfterViewInit(): void {
    this.crearMapa();
    this.capasSidebar?.conectarMapa(this.map);

    this.controladorGis = new ControladorMapaGis(this.map, {
      consulta: this.consultaCapasGis,
      gis: this.gis,
      capasComerciales: () => this.capasComercialesConsultables(),
      capasTecnicas: () => this.capasSidebar?.capasTecnicasConsultables() ?? [],
      avisar: (detalle) => this.avisar("info", "Aviso", detalle),
      listado: {
        columnas: COLUMNAS_TABLA_LECTURAS,
        tituloReporte: "CONTROL DE DIGITACIÓN",
        nombreArchivo: "control_digitacion_area_",
        origen: ORIGENES_COORDENADA.usuario,
        registros: () => this.resultadoBusquedaJson ?? [],
        aFila: (registro) => this.aFilaTabla(registro),
        subcabecera: () => [
          `Ciclo: ${this.selectedCiclo?.descripcion ?? "-"}`,
          `Sucursal: ${this.selectedSucursal?.nombre ?? "-"}`,
          `Sector: ${this.selectedSector?.descripcion ?? "-"}`,
          `Periodo: ${this.selectedMes}/${this.selectedAnio}`,
        ],
        excelService: this.excelService,
      },
    });

    this.initClick();

    requestAnimationFrame(() => {
      const el = this.mapContainer?.nativeElement;
      if (!el) return;
      this.map.setTarget(el);
      this.map.updateSize();
      this.detenerObservadorMapa = observarTamanoMapa(this.map, el);

      this.destellos = new DestelloLecturas(this.map, this.zone);
    });
  }

  ngOnDestroy(): void {
    this.detenerObservadorMapa?.();
    this.destellos?.limpiar();
    this.controladorGis?.destruir();
    clearTimeout(this.timeoutRotulo);
    this.map?.setTarget(undefined);
    this.ref?.close();
  }

  // ============================================================
  // TIEMPO REAL
  // ============================================================

  private iniciarTiempoReal(): void {
    this.enVivo.lecturas$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lectura) => this.aplicarLecturaEnVivo(lectura));

    this.enVivo.conectado$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((activo) => (this.conectadoEnVivo = activo));

    this.enVivo.conectar(this.contextoTiempoReal());
  }

  private contextoTiempoReal(): ContextoTiempoReal {
    return {
      codsuc: this.selectedSucursal?.codsuc ?? null,
      codciclo: this.selectedCiclo?.codciclo ?? null,
      anio: this.selectedAnio ?? null,
      mes: this.selectedMes ?? null,
    };
  }

  // Si el cliente no está en el mapa se ignora, para no salirse del filtro aplicado.
  private aplicarLecturaEnVivo(lectura: LecturaEnVivo): void {
    const feature = this.lecturasLayer
      ?.getSource()
      ?.getFeatures()
      .find(
        (f) =>
          String(f.get("codcliente") ?? f.get("nroSuministro") ?? "").trim() ===
          lectura.codcliente,
      );

    if (!feature) return;

    if (lectura.estadolectura) {
      feature.set("estadolectura", lectura.estadolectura);
    }
    if (lectura.tipoestlectura) {
      feature.set("tipoestlectura", lectura.tipoestlectura);
    }
    if (lectura.codinspector) {
      feature.set("codinspector", lectura.codinspector);
    }

    this.totalEnVivo++;
    this.mostrarRotulo(lectura);

    const geometria = feature.getGeometry();
    const coordenada =
      geometria?.getType() === "Point"
        ? (geometria as Point).getCoordinates()
        : null;

    if (coordenada) {
      this.destellos?.mostrar(lectura.codcliente, coordenada, {
        color: colorPorEstadoLectura(lectura.estadolectura),
        inspector: lectura.codinspector,
        detalle: lectura.inspector || lectura.codcliente,
      });
    }
  }

  private mostrarRotulo(lectura: LecturaEnVivo): void {
    this.ultimaEnVivo = {
      inspector: lectura.inspector || lectura.codinspector || "—",
      codcliente: lectura.codcliente,
    };

    clearTimeout(this.timeoutRotulo);
    this.timeoutRotulo = window.setTimeout(() => {
      this.ultimaEnVivo = null;
    }, ROTULO_ENVIVO_MS);
  }

  // ============================================================
  // FILTROS
  // ============================================================

  toggleFiltros(): void {
    this.filtrosVisible = !this.filtrosVisible;
  }

  onCicloChange(autoLoad = false): void {
    this.cicloCambiado.next();
    this.sucursalCambiada.next();
    this.selectedSucursal = null;
    this.selectedSector = null;
    this.limpiarCapas();
    if (!this.selectedCiclo) return;

    this.aperturaService
      .getfechaCiclos(this.selectedCiclo.codciclo)
      .pipe(
        tap((response) => {
          this.fechaCiclos = response.data;
          this.factArchService
            .recuperar_ultimo_periodo_comercial("001")
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((res) => {
              const aniomes = res?.aniomes || "202609";
              const anio = aniomes.substring(0, 4);
              const mes = aniomes.substring(4, 6);
              if (!this.listaYear.find((y) => y.anio === anio)) {
                this.listaYear.unshift({ anio: anio });
              }
              this.selectedAnio = anio;
              this.selectedMes = mes;
            });
        }),
        switchMap(() =>
          this.sucursalesService.drop_sucursales_x_ciclo(
            this.selectedCiclo.codciclo,
          ),
        ),
        takeUntil(this.cicloCambiado),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((data) => {
        this.listaSucursales = data;
        if (autoLoad && data?.length > 0) {
          this.selectedSucursal = data[0];
          this.onSucursalChange();
        }
      });
  }

  onSucursalChange(): void {
    this.sucursalCambiada.next();
    this.selectedSector = null;
    if (!this.selectedSucursal) return;

    this.sectoresService
      .drop_sectores_x_ciclo(
        this.selectedSucursal.codsuc,
        this.selectedCiclo.codciclo,
      )
      .pipe(
        takeUntil(this.sucursalCambiada),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((data) => {
        this.listaSectores = [SECTOR_TODOS, ...data];
        const def = this.sectorPorDefecto();
        this.selectedSector = def;
        this.consumoInicial = 0;
        this.consumoFinal = 0;
      });
  }

  private sectorPorDefecto(): SectorCiclo | null {
    return (
      this.listaSectores.find(
        (s) => s.codsector === "01" || s.codsector === "1",
      ) ??
      this.listaSectores[1] ??
      this.listaSectores[0] ??
      null
    );
  }

  private construirFiltro(): FiltroLecturas {
    return {
      codsuc: this.selectedSucursal.codsuc,
      codsede: this.selectedSucursal.codsuc ?? "%",
      codsector: this.selectedSector ? this.selectedSector.codsector : "%",
      codciclo: this.selectedCiclo.codciclo,
      anio: this.selectedAnio,
      mes: this.selectedMes,
      estadolectura: (this.selectedEstados || []).join(","),
      consumoini: this.consumoInicial,
      consumofin: this.consumoFinal,
      tipopromedio: this.selectedTipoPromedio?.codigo ?? "",
    };
  }

  private filtrosBasicosValidos(): boolean {
    if (
      !this.selectedCiclo ||
      !this.selectedSucursal ||
      !this.selectedAnio ||
      !this.selectedMes
    ) {
      this.avisar(
        "warn",
        "Aviso de usuario",
        "Debe seleccionar Ciclo, Sucursal, Año y Mes",
      );
      return false;
    }
    return true;
  }

  procesar(): void {
    if (!this.filtrosBasicosValidos()) return;
    if (
      this.consumoInicial != null &&
      this.consumoFinal != null &&
      this.consumoInicial > this.consumoFinal
    ) {
      this.avisar(
        "warn",
        "Aviso de usuario",
        "El consumo inicial no puede ser mayor al final",
      );
      return;
    }

    this.enVivo.actualizarContexto(this.contextoTiempoReal());

    this.ejecutarBusqueda(this.construirFiltro(), (registros) => {
      this.resultadoBusquedaJson = registros;
      this.actualizarCapasComerciales();
    });
  }

  private ejecutarBusqueda(
    filtro: FiltroLecturas,
    onData: (registros: RegistroLectura[]) => void,
  ): void {
    this.cargando = true;
    this.micromedicionService
      .listarLecturas(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.cargando = false;
          this.filtrosVisible = false;
          onData(data.data || []);
        },
        error: () => {
          this.cargando = false;
          this.limpiarCapas();
          this.resultadoBusquedaJson = null;
          this.avisar(
            "error",
            "Aviso de usuario",
            "Ocurrió un error al cargar las lecturas",
          );
        },
      });
  }

  limpiar(): void {
    const def = this.sectorPorDefecto();
    this.selectedSector = def;
    this.selectedEstados = [];
    this.consumoInicial = 0;
    this.consumoFinal = 0;
    this.selectedTipoPromedio = TIPOS_PROMEDIO[0];
    this.resultadoBusquedaJson = null;
    if (this.fechaCiclos) {
      this.factArchService
        .recuperar_ultimo_periodo_comercial("001")
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((res) => {
          const aniomes = res?.aniomes || "202609";
          const anio = aniomes.substring(0, 4);
          const mes = aniomes.substring(4, 6);
          if (!this.listaYear.find((y) => y.anio === anio)) {
            this.listaYear.unshift({ anio: anio });
          }
          this.selectedAnio = anio;
          this.selectedMes = mes;
        });
    }
    this.limpiarCapas();
  }

  // ============================================================
  // PINTADO DE PUNTOS
  // ============================================================

  private actualizarCapasComerciales(fitBounds = true): void {
    this.estilos.limpiar();
    this.limpiarCapas();

    const registros = this.resultadoBusquedaJson || [];
    this.totalLecturas = registros.length;
    if (registros.length === 0) return;

    const puntos = (origen: keyof typeof ORIGENES_COORDENADA) => {
      const coords = new Set<string>();
      return registros
        .map((r) => crearFeaturePunto(r, ORIGENES_COORDENADA[origen]))
        .filter((f): f is Feature => {
          if (!f) return false;
          const geom = f.getGeometry();
          if (!geom || geom.getType() !== "Point") return false;
          const [lon, lat] = (geom as any).getCoordinates();
          const key = `${lon.toFixed(6)}_${lat.toFixed(6)}`;
          if (coords.has(key)) return false;
          coords.add(key);
          return true;
        });
    };

    const lineas = (
      origen: keyof typeof ORIGENES_COORDENADA,
      destino: keyof typeof ORIGENES_COORDENADA,
    ) =>
      registros
        .map((r) =>
          crearFeatureLinea(
            r,
            ORIGENES_COORDENADA[origen],
            ORIGENES_COORDENADA[destino],
            DISTANCIA_MAX_ACOMETIDA_M,
          ),
        )
        .filter((f): f is Feature => f !== null);

    const featuresUsr = puntos("usuario");
    this.lecturasLayer.getSource()!.addFeatures(featuresUsr);
    this.cajaAguaLayer.getSource()!.addFeatures(puntos("agua"));
    this.fichaAlcLayer.getSource()!.addFeatures(puntos("desague"));
    this.acomAguaLayer
      .getSource()!
      .addFeatures(lineas("agua", "acometidaAgua"));
    this.acomDesagueLayer
      .getSource()!
      .addFeatures(lineas("desague", "acometidaDesague"));

    this.totalSinCoordenadas = registros.length - featuresUsr.length;

    this.ajustarVista(fitBounds);
  }

  private ajustarVista(fitBounds: boolean): void {
    const srcUsuarios = this.lecturasLayer.getSource()!;
    const srcCajaAgua = this.cajaAguaLayer.getSource()!;

    if (
      srcUsuarios.getFeatures().length === 0 &&
      srcCajaAgua.getFeatures().length === 0
    ) {
      this.avisar(
        "info",
        "Aviso",
        "No se encontraron coordenadas para los registros",
      );
      return;
    }

    let extent: number[] | null = null;
    if (srcUsuarios.getFeatures().length > 0) extent = srcUsuarios.getExtent();
    if (srcCajaAgua.getFeatures().length > 0) {
      extent = extent
        ? extend(extent, srcCajaAgua.getExtent())
        : srcCajaAgua.getExtent();
    }

    if (extent && fitBounds) {
      this.map
        .getView()
        .fit(extent, { duration: 800, maxZoom: 18, padding: [60, 60, 60, 60] });
    }
    this.avisar(
      "success",
      "Proceso completado",
      "Lecturas cargadas en el mapa",
    );
  }

  private limpiarCapas(): void {
    this.capasVector.forEach((capa) => capa?.getSource()?.clear());
    this.controladorGis?.quitarPredio();
    this.destellos?.limpiar();
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;
    this.totalLecturas = 0;
    this.totalSinCoordenadas = 0;
    this.totalEnVivo = 0;
    this.ultimaEnVivo = null;
    this.controladorGis?.descartarListado();
    clearTimeout(this.timeoutRotulo);
  }

  private refrescarCapasVector(): void {
    this.capasVector.forEach((capa) => capa?.changed());
  }

  // ============================================================
  // MAPA
  // ============================================================

  private crearMapa(): void {
    this.osmLayer = crearCapaOsm(this.baseActive === "osm");
    this.satelitalLayer = crearCapaSatelital(this.baseActive === "satelital");

    this.lotesLayer = crearCapaWms(
      this.gis.urlWms(),
      this.gis.capa("lotes"),
      true,
    );
    this.sectoresComercialesLayer = crearCapaWms(
      this.gis.urlWms(),
      this.gis.capa("sectoresComerciales"),
      false,
    );
    this.callesLayer = crearCapaWms(
      this.gis.urlWms(),
      this.gis.capa("calles"),
      false,
    );
    this.rutaLecturaLayer = crearCapaWms(
      this.gis.urlWms(),
      this.gis.capa("rutaLectura"),
      false,
    );

    this.lecturasLayer = this.crearCapaPuntos(
      { forma: "circulo", radios: RADIOS_LECTURA, visible: true },
      (f) => colorPorEstadoLectura(f.get("estadolectura")),
    );
    this.cajaAguaLayer = this.crearCapaPuntos(
      { forma: "rombo", radios: RADIOS_FICHA, visible: false },
      () => COLOR_FICHA_AGUA,
    );
    this.fichaAlcLayer = this.crearCapaPuntos(
      { forma: "rombo", radios: RADIOS_FICHA, visible: false },
      () => COLOR_FICHA_ALCANTARILLADO,
    );
    this.acomAguaLayer = this.crearCapaAcometida(COLOR_FICHA_AGUA);
    this.acomDesagueLayer = this.crearCapaAcometida(COLOR_FICHA_ALCANTARILLADO);

    this.capasVector = [
      this.lecturasLayer,
      this.cajaAguaLayer,
      this.fichaAlcLayer,
      this.acomAguaLayer,
      this.acomDesagueLayer,
    ];

    this.registroCapas = {
      usuarios: this.lecturasLayer,
      lotes: this.lotesLayer,
      caja_agua: this.cajaAguaLayer,
      acometida: this.acomAguaLayer,
      ficha_alc: this.fichaAlcLayer,
      acc_alc: this.acomDesagueLayer,
      sectores: this.sectoresComercialesLayer,
      calles: this.callesLayer,
      rutaLectura: this.rutaLecturaLayer,
    };

    this.map = new OlMap({
      // Sin target aquí: en el microfrontend el id "map" engancha otro div. Se asigna en ngAfterViewInit.
      layers: [
        new LayerGroup({ layers: [this.osmLayer, this.satelitalLayer] }),
        this.sectoresComercialesLayer,
        this.callesLayer,
        this.lotesLayer,
        this.rutaLecturaLayer,
        this.acomAguaLayer,
        this.acomDesagueLayer,
        this.fichaAlcLayer,
        this.cajaAguaLayer,
        this.lecturasLayer,
      ],
      view: new View({
        projection: this.gis.proyeccionMapa,
        center: this.gis.vista.centro,
        zoom: this.gis.vista.zoom,
      }),
    });
  }

  /** Capa de puntos (usuarios o fichas) con etiqueta del código y resaltado del seleccionado. */
  private crearCapaPuntos(
    opciones: {
      forma: FormaPunto;
      radios: typeof RADIOS_LECTURA;
      visible: boolean;
    },
    colorDe: (punto: FeatureLike) => string,
  ): VectorLayer<VectorSource> {
    return new VectorLayer({
      source: new VectorSource(),
      visible: opciones.visible,
      style: (punto) =>
        this.estilos.punto({
          forma: opciones.forma,
          color: colorDe(punto),
          zoom: this.map?.getView().getZoom() ?? 14,
          seleccionado: punto === this.featureSeleccionado,
          etiqueta: punto.get("codcliente") || punto.get("nroSuministro"),
          ...opciones.radios,
        }),
    });
  }

  /** Capa de líneas ficha → acometida. */
  private crearCapaAcometida(color: string): VectorLayer<VectorSource> {
    return new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: (linea, resolucion) =>
        this.estilos.lineaAcometida(
          color,
          linea === this.featureSeleccionado,
          resolucion,
        ),
    });
  }

  private tipoPopupDeCapa(capa: BaseLayer | null): TipoPopup {
    if (capa === this.cajaAguaLayer || capa === this.acomAguaLayer)
      return "agua";
    if (capa === this.fichaAlcLayer || capa === this.acomDesagueLayer)
      return "alcantarillado";
    return "lectura";
  }

  // Los dos popups ocupan el mismo lugar: abrir el del cliente cierra el de GIS.
  private seleccionarFeature(feature: Feature, tipo: TipoPopup): void {
    this.controladorGis?.cerrarPopupGis();
    this.tipoPopup = tipo;
    this.featureSeleccionado = feature;
    this.refrescarCapasVector();
    this.lecturaSeleccionada = feature.getProperties() as RegistroLectura;
    this.cargarDatosPopup(this.lecturaSeleccionada);
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      if (estaUsandoHerramientas(this.map)) return;
      let clickedLayer: BaseLayer | null = null;
      const feature = this.map.forEachFeatureAtPixel(
        evt.pixel,
        (f, layer) => {
          clickedLayer = layer;
          return f;
        },
        {
          hitTolerance: 5,
          layerFilter: (layer: any) =>
            !layer.get("isDrawLayer") && !layer.get(MARCA_CAPA_RESALTADO),
        },
      ) as Feature | undefined;

      if (feature) {
        this.seleccionarFeature(feature, this.tipoPopupDeCapa(clickedLayer));
      } else {
        this.cerrarPopup();
        this.controladorGis?.consultarPunto(evt.coordinate);
      }
    });
  }

  // ============================================================
  // CONSULTA GIS (GetFeatureInfo)
  // ============================================================

  private capasComercialesConsultables(): CapaConsultable[] {
    return [
      { rol: "rutaLectura", capa: this.rutaLecturaLayer },
      { rol: "lotes", capa: this.lotesLayer },
      { rol: "calles", capa: this.callesLayer },
      { rol: "sectoresComerciales", capa: this.sectoresComercialesLayer },
    ];
  }

  private aFilaTabla(registro: Record<string, unknown>): FilaListado {
    const direccion = direccionDe(registro);
    return {
      ...registro,
      direccion,
      descripcionEstadoLectura: this.getDescripcionEstadoLectura(
        String(registro["estadolectura"] ?? ""),
      ),
    };
  }

  ubicarFilaEnMapa(fila: FilaListado): void {
    const codigo = this.codigoDe(fila);
    const punto = this.buscarPuntoPorCodigo(this.lecturasLayer, codigo);
    if (!punto) {
      this.avisar(
        "warn",
        "Aviso",
        `El cliente ${codigo} no tiene coordenadas para ubicarlo.`,
      );
      return;
    }
    this.seleccionarFeature(punto, "lectura");
    this.controladorGis?.encuadrarEnZonaLibre(punto.getGeometry()!.getExtent());
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

  seleccionarSectores(sectores: SectorCiclo[]): void {
    if (!sectores || sectores.length === 0) return;
    const isTodos = sectores.some((s) => s.codsector === "%");
    const source = this.lotesLayer.getSource() as TileWMS;

    if (isTodos) {
      source.updateParams({ LAYERS: this.gis.capa("lotes") });
    } else {
      const layers = sectores
        .map((s) => this.gis.lotesPorSector(s.codsector.slice(-2)))
        .join(",");
      source.updateParams({ LAYERS: layers });
    }
    source.refresh();
  }

  // ============================================================
  // CONSULTA
  // ============================================================

  verMasInformacion(codcliente: string | undefined): void {
    if (!codcliente) return;
    this.ref = abrirConsultaUsuario(
      this.dialogService,
      codcliente,
      this.selectedSucursal?.codsuc ||
        this.lecturaSeleccionada?.codsuc ||
        this.datosClientePopup?.codsuc,
    );
  }

  cerrarPopup(): void {
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;
    this.refrescarCapasVector();
  }

  activarCapasPorDefectoBusqueda(): void {
    const capasActivar = ["caja_agua", "ficha_alc", "acometida", "acc_alc"];
    this.commercialLayers.forEach((c) => {
      if (capasActivar.includes(c.id) && !c.active) {
        c.active = true;
        this.registroCapas[c.id]?.setVisible(true);
      }
    });
  }

  getDescripcionEstadoLectura(codigo: string): string {
    if (!codigo) return "-";
    const estado = this.listaEstadosLectura.find((e) => e.codigo === codigo);
    return estado ? estado.descripcion : codigo;
  }

  // `situacionmed` llega como string: "1" instalado, "2" retirado, "3" reinstalado.
  getEtiquetaMovimientoMedidor(): string {
    switch (this.situacionMedidor()) {
      case "2":
        return "F. Retiro";
      case "3":
        return "F. Reinstalación";
      default:
        return "F. Instalación";
    }
  }

  // En "instalado" `fechainst` llega siempre null: la fecha real está en `fechainsmed`.
  getFechaMovimientoMedidor(): string {
    const medidor: any = this.datosClientePopup?._medidor;

    switch (this.situacionMedidor()) {
      case "2":
        return formatoFechaCorta(medidor?.fecharetiro);
      case "3":
        return formatoFechaCorta(medidor?.fechareinst);
      default:
        return formatoFechaCorta(medidor?.fechainst || medidor?.fechainsmed);
    }
  }

  private situacionMedidor(): string {
    return String(this.datosClientePopup?._medidor?.situacionmed ?? "").trim();
  }

  private cargarDatosPopup(lectura: RegistroLectura): void {
    this.imagenesPopup = [];
    this.datosClientePopup = null;
    this.cargandoImagenes = true;
    const codsuc = lectura.codsuc || this.selectedSucursal?.codsuc || "002";
    const codcliente = lectura.codcliente;

    forkJoin({
      imagenes: this.controlImgService
        .read_x_tipolistar({
          codsuc,
          codcliente,
          ...rangoFotosRecientes(),
          tipoarchivo: "IMG",
          tiporecepcion: TIPOS_RECEPCION_FOTOS_LECTURA,
        })
        .pipe(catchError(() => of({ mensaje: "ERROR", data: [] }))),
      cliente: this.clientesService
        .obtener_datos_ficha_catastral(codsuc, codcliente)
        .pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ imagenes, cliente }) => {
          this.cargandoImagenes = false;

          if (cliente) {
            this.datosClientePopup = {
              ...(cliente.clie || {}),
              _predio: cliente.pred || {},
              _medidor: cliente.medidor_cliente || {},
              _conexionAgua: cliente.conx_agua || {},
              _conexionDesague: cliente.conx_desague || {},
              _calidad: cliente.calidad || {},
            };
          }

          this.imagenesPopup =
            imagenes?.mensaje === "EXITO" && imagenes?.data?.length > 0
              ? imagenes.data
                  .filter((e: any) => !e.tiporecepcionimages?.includes("FIRMA"))
                  .map((e: any) => ({
                    ...e,
                    src: e.img64?.startsWith("data:")
                      ? e.img64
                      : "data:image/jpeg;base64," + e.img64,

                    fechareg: e?.fechareg,
                  }))
              : [];
        },
        error: () => (this.cargandoImagenes = false),
      });
  }

  // ============================================================
  // BUSCADOR POR CÓDIGO
  // ============================================================

  /**
   * Busca el código primero entre los puntos ya pintados; si no está, lo pide
   * al servidor (puede estar en otro sector del mismo ciclo).
   */
  buscarPorCodCliente(): void {
    const codigo = String(this.searchCodCliente || "").trim();
    if (!codigo) {
      this.reiniciarBusqueda();
      return;
    }

    this.refrescarCapasVector();
    if (this.buscarEnMapa(codigo)) return;

    if (!this.filtrosBasicosValidos()) return;

    this.cargando = true;
    this.consultarSuministro(codigo).subscribe({
      next: (registros) => {
        this.cargando = false;
        if (registros.length === 0) {
          this.avisar(
            "warn",
            "Aviso",
            "No se encontró un usuario con ese código en ningún sector para este ciclo.",
          );
          return;
        }
        this.mostrarSoloRegistros(registros);

        const punto = this.buscarPuntoPorCodigo(this.lecturasLayer, codigo);
        if (punto) {
          this.seleccionarFeature(punto, "lectura");
          this.activarCapasPorDefectoBusqueda();
          this.acercarAPunto(punto);
          this.controladorGis?.marcarPredio(codigo);
        } else {
          this.mostrarPopupSinPunto(registros[0]);
        }
      },
      error: () => {
        this.cargando = false;
        this.avisar(
          "error",
          "Error",
          "Ocurrió un error al buscar el cliente en el servidor.",
        );
      },
    });
  }

  /** Selecciona el código si ya está pintado en alguna capa. Devuelve `true` si lo encontró. */
  private buscarEnMapa(codigo: string): boolean {
    const capas: { capa: VectorLayer<VectorSource>; tipo: TipoPopup }[] = [
      { capa: this.lecturasLayer, tipo: "lectura" },
      { capa: this.cajaAguaLayer, tipo: "agua" },
      { capa: this.fichaAlcLayer, tipo: "alcantarillado" },
      { capa: this.acomAguaLayer, tipo: "agua" },
      { capa: this.acomDesagueLayer, tipo: "alcantarillado" },
    ];

    for (const { capa, tipo } of capas) {
      const punto = this.buscarPuntoPorCodigo(capa, codigo);
      if (!punto) continue;

      this.seleccionarFeature(punto, tipo);
      this.activarCapasPorDefectoBusqueda();
      this.guardarResultadoOriginal();

      // Deja en el mapa solo ese usuario y lo vuelve a seleccionar ya repintado.
      const registro = this.resultadoBusquedaOriginalJson?.find(
        (r) => this.codigoDe(r) === codigo,
      );
      if (registro) {
        this.resultadoBusquedaJson = [registro];
        this.actualizarCapasComerciales(false);

        const repintado = this.buscarPuntoPorCodigo(this.lecturasLayer, codigo);
        if (repintado) {
          this.seleccionarFeature(repintado, "lectura");
          this.acercarAPunto(repintado);
        }
      }
      this.controladorGis?.marcarPredio(codigo);
      return true;
    }
    return false;
  }

  abrirBusqueda(): void {
    this.mostrarSearchPanel = true;
    this.searchCodCliente = "";
    this.refrescarCapasVector();
  }

  reiniciarBusqueda(): void {
    this.searchCodCliente = "";
    this.cerrarPopup();
    this.controladorGis?.quitarPredio();
    if (this.isBusquedaClienteActiva) {
      this.isBusquedaClienteActiva = false;
      if (this.resultadoBusquedaOriginalJson !== undefined) {
        this.resultadoBusquedaJson = this.resultadoBusquedaOriginalJson;
        this.resultadoBusquedaOriginalJson = undefined;
      }
      this.actualizarCapasComerciales(true);
    } else if (
      this.resultadoBusquedaJson &&
      this.resultadoBusquedaJson.length > 0
    ) {
      this.ajustarVista(true);
    }
  }

  cerrarBusqueda(): void {
    this.mostrarSearchPanel = false;
    this.reiniciarBusqueda();
  }

  @HostListener("window:buscar-codcliente", ["$event"])
  onBuscarCodCliente(event: CustomEvent): void {
    const codcliente: string = event.detail?.codcliente;
    if (!codcliente) return;
    if (!this.filtrosBasicosValidos()) return;

    this.cargando = true;
    this.consultarSuministro(codcliente).subscribe({
      next: (registros) => {
        this.cargando = false;
        this.filtrosVisible = false;
        if (registros.length === 0) {
          this.avisar(
            "info",
            "Aviso",
            "No se encontró ningún registro para el Código de Cliente",
          );
          return;
        }
        this.mostrarSoloRegistros(registros);

        const punto = this.buscarPuntoPorCodigo(this.lecturasLayer, codcliente);
        if (punto) {
          this.seleccionarFeature(punto, "lectura");
          this.activarCapasPorDefectoBusqueda();
          this.centrarEnUsuario(registros[0]);
          this.controladorGis?.marcarPredio(codcliente);
        } else {
          this.mostrarPopupSinPunto(registros[0]);
        }
      },
      error: () => {
        this.cargando = false;
        this.limpiarCapas();
        this.resultadoBusquedaJson = null;
        this.avisar(
          "error",
          "Aviso de usuario",
          "Ocurrió un error al cargar las lecturas",
        );
      },
    });
  }

  /** Lecturas del suministro en el periodo seleccionado; el backend a veces devuelve un objeto y no una lista. */
  private consultarSuministro(codigo: string): Observable<RegistroLectura[]> {
    return this.micromedicionService
      .buscarLecturasPorSuministro({
        codsuc: this.selectedSucursal.codsuc,
        anio: this.selectedAnio,
        mes: this.selectedMes,
        nroSuministro: Number(codigo),
      })
      .pipe(
        map((respuesta) => {
          const datos = respuesta.data;
          if (!datos) return [];
          return Array.isArray(datos) ? datos : [datos];
        }),
        takeUntilDestroyed(this.destroyRef),
      );
  }

  /** Muestra solo estos registros en el mapa, recordando el resultado anterior para poder volver. */
  private mostrarSoloRegistros(registros: RegistroLectura[]): void {
    this.guardarResultadoOriginal();
    this.resultadoBusquedaJson = registros;
    this.searchCodCliente = "";
    this.actualizarCapasComerciales(false);
  }

  /** Recuerda el resultado de la búsqueda por filtros la primera vez que se busca un cliente. */
  private guardarResultadoOriginal(): void {
    if (this.isBusquedaClienteActiva) return;
    this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
    this.isBusquedaClienteActiva = true;
  }

  /** El registro no tiene coordenadas pintables: se abre el popup igual y se centra en el usuario. */
  private mostrarPopupSinPunto(registro: RegistroLectura): void {
    this.controladorGis?.cerrarPopupGis();
    this.lecturaSeleccionada = registro;
    this.cargarDatosPopup(registro);
    this.activarCapasPorDefectoBusqueda();
    this.centrarEnUsuario(registro);
    this.controladorGis?.marcarPredio(this.codigoDe(registro));
  }

  private buscarPuntoPorCodigo(
    capa: VectorLayer<VectorSource> | undefined,
    codigo: string,
  ): Feature | undefined {
    const buscado = codigo.trim().toLowerCase();
    return capa
      ?.getSource()
      ?.getFeatures()
      .find((f) => this.codigoDe(f.getProperties()).toLowerCase() === buscado);
  }

  /** Código del cliente de un registro o de un punto; algunas consultas lo traen como `nroSuministro`. */
  private codigoDe(registro: Record<string, unknown>): string {
    return String(
      registro["codcliente"] || registro["nroSuministro"] || "",
    ).trim();
  }

  private acercarAPunto(punto: Feature): void {
    const geometria = punto.getGeometry();
    if (!geometria) return;
    this.map.getView().animate({
      center: getCenter(geometria.getExtent()),
      zoom: ZOOM_PREDIO,
      duration: 800,
    });
  }

  private centrarEnUsuario(registro: RegistroLectura): void {
    const coordenada = extraerCoordenada(registro, ORIGENES_COORDENADA.usuario);
    if (coordenada)
      this.map
        .getView()
        .animate({ center: coordenada, zoom: 17, duration: 600 });
  }

  // ============================================================
  // OTROS
  // ============================================================

  abrirStreetView(x: unknown, y: unknown): void {
    const lonLat = coordenadaLonLat(x, y, this.gis.proyeccionUtm);
    if (!lonLat) {
      this.avisar(
        "warn",
        "Aviso",
        "No hay coordenadas válidas para abrir Street View.",
      );
      return;
    }
    abrirGoogleStreetView(lonLat);
  }

  private avisar(
    severity: "success" | "info" | "warn" | "error",
    summary: string,
    detail: string,
  ): void {
    this.messageService.add({ severity, summary, detail });
  }
}