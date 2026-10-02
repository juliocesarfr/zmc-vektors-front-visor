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
import { forkJoin, of } from "rxjs";
import { catchError, switchMap, tap } from "rxjs/operators";
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
import Feature from "ol/Feature";
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

import { DISTANCIA_MAX_ACOMETIDA_M, ORIGENES_COORDENADA } from "../../../shared/constantes/coordenadas";
import { colorPorEstadoLectura, COLOR_FICHA_AGUA, COLOR_FICHA_ALCANTARILLADO } from "../../../shared/constantes/colores-mapa";
import { LISTA_MESES, TIPOS_PROMEDIO, TIPOS_RECEPCION_FOTOS_LECTURA } from "../../../shared/constantes/lecturas";
import { TipoPopup, RegistroLectura } from "../../../shared/modelos/registro-lectura.model";
import { Sector, SECTOR_TODOS } from "../../../shared/modelos/sector.model";
import { ROTULO_ENVIVO_MS } from "../../../shared/mapa/destello-lecturas";
import {
  crearFeaturePunto,
  crearFeatureLinea,
  extraerCoordenada,
} from "../../../shared/mapa/geo.utils";
import { DestelloLecturas } from "../../../shared/mapa/destello-lecturas";
import {
  ContextoTiempoReal,
  LecturaEnVivo,
  LecturasEnVivoService,
} from "../../../core/tiempo-real";
import {
  MapEstilosFactory,
  RADIOS_LECTURA,
  RADIOS_FICHA,
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

@Component({
  selector: "app-controldigitacion",
  standalone: true,
  imports: [
    CapasSidebarComponent,
    VisorImagenesComponent,
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
  implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly gis = inject(GisConfigService);
  private readonly estilos = new MapEstilosFactory();
  private detenerObservadorMapa?: () => void;

  private readonly enVivo = inject(LecturasEnVivoService);
  private destellos?: DestelloLecturas;
  private readonly zone = inject(NgZone);

  totalEnVivo = 0;
  ultimaEnVivo: { inspector: string; codcliente: string } | null = null;
  conectadoEnVivo = false;
  private timeoutRotulo?: number;

  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;
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
  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;

  private registroCapas: Record<string, BaseLayer> = {};
  private capasVector: VectorLayer<VectorSource>[] = [];

  tipoPopup: TipoPopup = "lectura";

  private readonly _codsede = sessionStorage.getItem("codsede");

  dataCiclos: any[] = [];
  fechaCiclos: any;
  listaSucursalesxusr: any[] = [];
  totalSectores2: Sector[] = [];
  lista_estadolec: any[] = [];

  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: Sector | null = null; // '%' = todos
  selectedEstados: string[] = [];
  selectedAnio = "";
  selectedMes = "";
  consumoini: number | null = 0;
  consumofin: number | null = 0;
  selectedTipoPromedio: (typeof TIPOS_PROMEDIO)[number] | null =
    TIPOS_PROMEDIO[0]; // default: MEDIDO

  resultadoBusquedaJson: RegistroLectura[] | null = null;

  readonly listaMeses = LISTA_MESES;
  readonly tipopromedio = TIPOS_PROMEDIO;
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
  ];


  imagenesPopup: any[] = [];
  cargandoImagenes = false;
  datosClientePopup: any = null;
  ref: DynamicDialogRef | undefined;

  /** Foto abierta en el visor; -1 = cerrado. */
  indiceFotoAbierta = -1;

  constructor(
    private aperturaservices: AperturaMicromedicionService,
    private seguridadService: SucursalesService,
    private sectoresService: SectoresCicloService,
    private consultaService: ConsulGenericService,
    private micromedicionService: MicromedicionService,
    private controlImgService: ControlImgService,
    private clientesService: ClientesService,
    private messageService: MessageService,
    private dialogService: DialogService,
  ) { }

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);

    this.aperturaservices
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
      .subscribe((data) => (this.lista_estadolec = data));

    // Aquí y no en ngAfterViewInit: si se navega antes, takeUntilDestroyed lanzaría.
    this.iniciarTiempoReal();
  }

  ngAfterViewInit(): void {
    this.crearMapa();
    this.capasSidebar?.conectarMapa(this.map);

    agregarHerramientasMapa(this.map);

    this.initClick();

    requestAnimationFrame(() => {
      const el =
        this.mapContainer?.nativeElement ?? document.getElementById("map");
      if (!el) {
        console.error(
          "[ControlDigitacion] No se encontró el contenedor del mapa (#map ni #mapContainer).",
        );
        return;
      }
      this.map.setTarget(el);
      this.map.updateSize();
      this.detenerObservadorMapa = observarTamanoMapa(this.map, el);

      this.destellos = new DestelloLecturas(this.map, this.zone);
    });
  }

  ngOnDestroy(): void {
    this.detenerObservadorMapa?.();
    this.destellos?.limpiar();
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
    this.selectedSucursal = null;
    this.selectedSector = null;
    this.limpiarCapas();
    if (!this.selectedCiclo) return;

    this.aperturaservices
      .getfechaCiclos(this.selectedCiclo.codciclo)
      .pipe(
        tap((response) => {
          this.fechaCiclos = response.data;
          this.selectedAnio = this.fechaCiclos.year;
          this.selectedMes = this.fechaCiclos.month;
        }),
        switchMap(() =>
          this.seguridadService.drop_sucursales_x_ciclo(
            this.selectedCiclo.codciclo,
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((data) => {
        this.listaSucursalesxusr = data;
        if (autoLoad && data?.length > 0) {
          this.selectedSucursal = data[0];
          this.onSucursalChange();
        }
      });
  }

  onSucursalChange(): void {
    this.selectedSector = null;
    if (!this.selectedSucursal) return;

    this.sectoresService
      .drop_sectores_x_ciclo(
        this.selectedSucursal.codsuc,
        this.selectedCiclo.codciclo,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.totalSectores2 = [SECTOR_TODOS, ...data];
        const def = this.sectorPorDefecto();
        this.selectedSector = def;
        this.consumoini = 0;
        this.consumofin = 0;
      });
  }

  private sectorPorDefecto(): Sector | null {
    return (
      this.totalSectores2.find(
        (s) => s.codsector === "01" || s.codsector === "1",
      ) ??
      this.totalSectores2[1] ??
      this.totalSectores2[0] ??
      null
    );
  }

  private construirFiltro(): FiltroLecturas {
    return {
      codsuc: this.selectedSucursal.codsuc,
      codsede: this._codsede ?? "%",
      codsector: this.selectedSector ? this.selectedSector.codsector : "%",
      codciclo: this.selectedCiclo.codciclo,
      anio: this.selectedAnio,
      mes: this.selectedMes,
      estadolectura: (this.selectedEstados || []).join(","),
      consumoini: this.consumoini,
      consumofin: this.consumofin,
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
      this.consumoini != null &&
      this.consumofin != null &&
      this.consumoini > this.consumofin
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
    this.consumoini = 0;
    this.consumofin = 0;
    this.selectedTipoPromedio = TIPOS_PROMEDIO[0];
    this.resultadoBusquedaJson = null;
    if (this.fechaCiclos) {
      this.selectedAnio = this.fechaCiclos.year;
      this.selectedMes = this.fechaCiclos.month;
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

    const puntos = (origen: keyof typeof ORIGENES_COORDENADA) =>
      registros
        .map((r) => crearFeaturePunto(r, ORIGENES_COORDENADA[origen]))
        .filter((f): f is Feature => f !== null);

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
    this.acomAguaLayer.getSource()!.addFeatures(lineas("agua", "acometidaAgua"));
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
    this.destellos?.limpiar();
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;
    this.totalLecturas = 0;
    this.totalSinCoordenadas = 0;
    this.totalEnVivo = 0;
    this.ultimaEnVivo = null;
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

    this.lotesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("lotes"), true);
    this.sectoresComercialesLayer = crearCapaWms(this.gis.urlWms(),
      this.gis.capa("sectoresComerciales"),
      false,
    );
    this.callesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("calles"), false);

    const zoomActual = () => this.map?.getView().getZoom() ?? 14;

    this.lecturasLayer = new VectorLayer({
      source: new VectorSource(),
      visible: true,
      style: (f) => {
        return this.estilos.punto({
          forma: "circulo",
          color: colorPorEstadoLectura(f.get("estadolectura")),
          zoom: zoomActual(),
          seleccionado: f === this.featureSeleccionado,
          etiqueta: f.get("codcliente") || f.get("nroSuministro"),
          ...RADIOS_LECTURA,
        });
      },
    });

    this.cajaAguaLayer = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: (f) => {
        return this.estilos.punto({
          forma: "rombo",
          color: COLOR_FICHA_AGUA,
          zoom: zoomActual(),
          seleccionado: f === this.featureSeleccionado,
          etiqueta: f.get("codcliente") || f.get("nroSuministro"),
          ...RADIOS_FICHA,
        });
      },
    });

    this.fichaAlcLayer = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: (f) => {
        return this.estilos.punto({
          forma: "rombo",
          color: COLOR_FICHA_ALCANTARILLADO,
          zoom: zoomActual(),
          seleccionado: f === this.featureSeleccionado,
          etiqueta: f.get("codcliente") || f.get("nroSuministro"),
          ...RADIOS_FICHA,
        });
      },
    });

    this.acomAguaLayer = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: (f, resolution) => {
        return this.estilos.lineaAcometida(
          COLOR_FICHA_AGUA,
          f === this.featureSeleccionado,
          resolution,
        );
      },
    });

    this.acomDesagueLayer = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: (f, resolution) => {
        return this.estilos.lineaAcometida(
          COLOR_FICHA_ALCANTARILLADO,
          f === this.featureSeleccionado,
          resolution,
        );
      },
    });

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
    };

    this.map = new OlMap({
      // Sin target aquí: en el microfrontend el id "map" engancha otro div. Se asigna en ngAfterViewInit.
      layers: [
        new LayerGroup({ layers: [this.osmLayer, this.satelitalLayer] }),
        this.sectoresComercialesLayer,
        this.callesLayer,
        this.lotesLayer,
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

  private tipoPopupDeCapa(capa: BaseLayer | null): TipoPopup {
    if (capa === this.cajaAguaLayer || capa === this.acomAguaLayer)
      return "agua";
    if (capa === this.fichaAlcLayer || capa === this.acomDesagueLayer)
      return "alcantarillado";
    return "lectura";
  }

  private seleccionarFeature(feature: Feature, tipo: TipoPopup): void {
    this.tipoPopup = tipo;
    this.featureSeleccionado = feature;
    this.refrescarCapasVector();
    this.lecturaSeleccionada = feature.getProperties() as RegistroLectura;
    this.cargarDatosPopup(this.lecturaSeleccionada);
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      const isDrawing = this.map.getInteractions().getArray().some(i => i.get('isDrawInteraction'));
      if (isDrawing) return;
      let clickedLayer: BaseLayer | null = null;
      const feature = this.map.forEachFeatureAtPixel(
        evt.pixel,
        (f, layer) => {
          clickedLayer = layer;
          return f;
        },
        { hitTolerance: 5, layerFilter: (layer: any) => !layer.get('isDrawLayer') }
      ) as Feature | undefined;

      if (feature) {
        this.seleccionarFeature(feature, this.tipoPopupDeCapa(clickedLayer));
      } else {
        this.cerrarPopup();
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

  seleccionarSectores(sectores: Sector[]): void {
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
      this.selectedSucursal?.codsuc || this.lecturaSeleccionada?.codsuc || this.datosClientePopup?.codsuc,
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
    const estado = this.lista_estadolec.find((e) => e.codigo === codigo);
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
        return this.formatoFechaCorta(medidor?.fecharetiro);
      case "3":
        return this.formatoFechaCorta(medidor?.fechareinst);
      default:
        return this.formatoFechaCorta(
          medidor?.fechainst || medidor?.fechainsmed,
        );
    }
  }

  private situacionMedidor(): string {
    return String(this.datosClientePopup?._medidor?.situacionmed ?? "").trim();
  }

  // El backend manda "2026-06-18 08:47:00.0" (no ISO): se recorta a YYYY-MM-DD.
  private formatoFechaCorta(valor: unknown): string {
    if (!valor) return "-";

    const texto = String(valor).trim();
    if (!texto) return "-";

    const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

    const fecha = new Date(texto);
    if (isNaN(fecha.getTime())) return "-";

    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
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

  buscarPorCodCliente(): void {
    const query = String(this.searchCodCliente || "").trim();
    if (!query) {
      this.reiniciarBusqueda();
      return;
    }

    this.refrescarCapasVector();

    const capas: { layer: VectorLayer<VectorSource>; tipo: TipoPopup }[] = [
      { layer: this.lecturasLayer, tipo: "lectura" },
      { layer: this.cajaAguaLayer, tipo: "agua" },
      { layer: this.fichaAlcLayer, tipo: "alcantarillado" },
      { layer: this.acomAguaLayer, tipo: "agua" },
      { layer: this.acomDesagueLayer, tipo: "alcantarillado" },
    ];

    for (const { layer, tipo } of capas) {
      const feature = layer
        ?.getSource()
        ?.getFeatures()
        .find((f) => {
          const fc = String(
            f.get("codcliente") || f.get("nroSuministro") || "",
          ).trim();
          return fc === query;
        });

      if (feature) {
        this.seleccionarFeature(feature, tipo);
        this.activarCapasPorDefectoBusqueda();

        if (!this.isBusquedaClienteActiva) {
          this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
          this.isBusquedaClienteActiva = true;
        }

        const userFeature = this.resultadoBusquedaOriginalJson?.find(
          (r: any) =>
            String(r.codcliente || r.nroSuministro || "").trim() === query,
        );
        if (userFeature) {
          this.resultadoBusquedaJson = [userFeature];
          this.actualizarCapasComerciales(false);

          const refound = this.lecturasLayer
            ?.getSource()
            ?.getFeatures()
            .find(
              (f) =>
                String(
                  f.get("codcliente") || f.get("nroSuministro") || "",
                ).trim() === query,
            );
          if (refound) {
            this.seleccionarFeature(refound, "lectura");
            const geom = refound.getGeometry();
            if (geom) {
              this.map.getView().animate({
                center: getCenter(geom.getExtent()),
                zoom: 21,
                duration: 800,
              });
            }
          }
        }
        return;
      }
    }

    if (!this.filtrosBasicosValidos()) return;

    this.cargando = true;
    this.micromedicionService
      .buscarLecturasPorSuministro({
        codsuc: this.selectedSucursal.codsuc,
        anio: this.selectedAnio,
        mes: this.selectedMes,
        nroSuministro: Number(query),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.cargando = false;
          const registros = data.data
            ? Array.isArray(data.data)
              ? data.data
              : [data.data]
            : [];

          if (registros.length === 0) {
            this.avisar(
              "warn",
              "Aviso",
              "No se encontró un usuario con ese código en ningún sector para este ciclo.",
            );
            return;
          }

          if (!this.isBusquedaClienteActiva) {
            this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
            this.isBusquedaClienteActiva = true;
          }

          this.resultadoBusquedaJson = registros;

          this.searchCodCliente = "";
          this.actualizarCapasComerciales(false);

          const fEncontrado = this.lecturasLayer
            ?.getSource()
            ?.getFeatures()
            .find((f) => {
              const fc = String(
                f.get("codcliente") || f.get("nroSuministro") || "",
              ).trim();
              return fc === query;
            });
          if (fEncontrado) {
            this.seleccionarFeature(fEncontrado, "lectura");
            this.activarCapasPorDefectoBusqueda();
            const geom = fEncontrado.getGeometry();
            if (geom) {
              this.map.getView().animate({
                center: getCenter(geom.getExtent()),
                zoom: 21,
                duration: 800,
              });
            }
          } else {
            this.lecturaSeleccionada = registros[0];
            this.cargarDatosPopup(registros[0]);
            this.activarCapasPorDefectoBusqueda();

            const coord = extraerCoordenada(
              registros[0],
              ORIGENES_COORDENADA["usuario"],
            );
            if (coord) {
              this.map
                .getView()
                .animate({ center: coord, zoom: 17, duration: 600 });
            }
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

  abrirBusqueda(): void {
    this.mostrarSearchPanel = true;
    this.searchCodCliente = "";
    this.refrescarCapasVector();
  }

  reiniciarBusqueda(): void {
    this.searchCodCliente = "";
    this.cerrarPopup();
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
    this.micromedicionService
      .buscarLecturasPorSuministro({
        codsuc: this.selectedSucursal.codsuc,
        anio: this.selectedAnio,
        mes: this.selectedMes,
        nroSuministro: Number(codcliente),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.cargando = false;
          this.filtrosVisible = false;
          const query = codcliente.trim().toLowerCase();
          const registros = data.data
            ? Array.isArray(data.data)
              ? data.data
              : [data.data]
            : [];

          if (registros.length === 0) {
            this.avisar(
              "info",
              "Aviso",
              "No se encontró ningún registro para el Código de Cliente",
            );
            return;
          }

          if (!this.isBusquedaClienteActiva) {
            this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
            this.isBusquedaClienteActiva = true;
          }

          this.resultadoBusquedaJson = registros;
          this.searchCodCliente = "";
          this.actualizarCapasComerciales(false);

          const feature = this.lecturasLayer
            .getSource()
            ?.getFeatures()
            .find((f) => {
              const fc = String(
                f.get("codcliente") || f.get("nroSuministro") || "",
              )
                .trim()
                .toLowerCase();
              return fc === query;
            });

          if (feature) {
            this.seleccionarFeature(feature, "lectura");
            this.activarCapasPorDefectoBusqueda();
          } else {
            this.lecturaSeleccionada = registros[0];
            this.cargarDatosPopup(registros[0]);
            this.activarCapasPorDefectoBusqueda();
          }

          const coord = extraerCoordenada(
            registros[0],
            ORIGENES_COORDENADA["usuario"],
          );
          if (coord) {
            this.map
              .getView()
              .animate({ center: coord, zoom: 17, duration: 600 });
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

  // ============================================================
  // LIGHTBOX DE IMÁGENES
  // ============================================================


  // ============================================================
  // OTROS
  // ============================================================

  abrirStreetView(x: unknown, y: unknown): void {
    const lonLat = coordenadaLonLat(x, y, this.gis.proyeccionUtm);
    if (!lonLat) {
      this.avisar("warn", "Aviso", "No hay coordenadas válidas para abrir Street View.");
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
