import {
  Component,
  AfterViewInit,
  OnInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
  HostListener,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule, DatePipe } from "@angular/common";
import { forkJoin, of } from "rxjs";
import { catchError, switchMap, tap } from "rxjs/operators";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";
import { ConsultaUsuarioComponent } from "@mf-consulta/_pages/consulta-usuario/consulta-usuario.component";

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
import { transform } from "ol/proj";
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
import { ValidacionSistemaService } from "@host/_servicios/validar/validacion-sistema.service";
import { FormsModule } from "@angular/forms";
import { DropdownModule } from "primeng/dropdown";
import { ButtonModule } from "primeng/button";
import { MultiSelectModule } from "primeng/multiselect";
import { InputNumberModule } from "primeng/inputnumber";
import { ToastModule } from "primeng/toast";
import { TagModule } from "primeng/tag";
import { InputTextModule } from "primeng/inputtext";

import {
  GEOSERVER_URL,
  GEOSERVER_CAPAS,
  PROYECCION_MAPA,
  PROYECCION_UTM_18S,
  VISTA_INICIAL,
  DISTANCIA_MAX_ACOMETIDA_M,
  ORIGENES_COORDENADA,
  colorPorEstadoLectura,
  COLOR_FICHA_AGUA,
  COLOR_FICHA_ALC,
  LISTA_MESES,
  TIPOS_PROMEDIO,
  TIPOS_RECEPCION_IMG,
  TipoPopup,
  RegistroLectura,
  Sector,
  SECTOR_TODOS,
} from "../../../config/Controldigitacion.config";
import {
  crearFeaturePunto,
  crearFeatureLinea,
  extraerCoordenada,
} from "../.././../util/Geo.utils";
import {
  MapEstilosFactory,
  RADIOS_LECTURA,
  RADIOS_FICHA,
} from "../../../util/Mapaestilos.factory";

@Component({
  selector: "app-controldigitacion",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DropdownModule,
    MultiSelectModule,
    ButtonModule,
    InputNumberModule,
    ToastModule,
    TagModule,
    InputTextModule,
  ],
  templateUrl: "./controldigitacion.component.html",
  styleUrl: "./controldigitacion.component.scss",
  providers: [
    DatePipe,
    ValidacionSistemaService,
    MessageService,
    DialogService,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ControldigitacionComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private readonly destroyRef = inject(DestroyRef);
  private readonly estilos = new MapEstilosFactory();

  // ---- Mapa y capas ----
  map!: OlMap;
  lecturasLayer!: VectorLayer<VectorSource>;
  cajaAguaLayer!: VectorLayer<VectorSource>;
  fichaAlcLayer!: VectorLayer<VectorSource>;
  acomAguaLayer!: VectorLayer<VectorSource>;
  acomDesagueLayer!: VectorLayer<VectorSource>;
  lotesLayer!: TileLayer<TileWMS>;
<<<<<<< HEAD
  osmLayer!: TileLayer<any>;
  satelitalLayer!: TileLayer<any>;
  secuenciaLecturaLayer!: TileLayer<TileWMS>;
  sectoresComercialesLayer!: TileLayer<TileWMS>;
  tipoPopup: 'lectura' | 'agua' | 'alcantarillado' = 'lectura';
=======
  sectoresComercialesLayer!: TileLayer<TileWMS>;
  callesLayer!: TileLayer<TileWMS>;
  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;
>>>>>>> b8173999d2f532e30c8b19bc01459d7600dae8ab

  /** id de capa comercial (HTML) → capa de OpenLayers. Evita el if/else gigante. */
  private registroCapas: Record<string, BaseLayer> = {};
  /** Capas vectoriales que se limpian/refrescan juntas. */
  private capasVector: VectorLayer<VectorSource>[] = [];

  tipoPopup: TipoPopup = "lectura";

  // ---- Sesión ----
  private readonly _codsede = sessionStorage.getItem("codsede");
  private readonly _codemp = sessionStorage.getItem("codemp");

  // ---- Filtros ----
  dataCiclos: any[] = [];
  fechaCiclos: any;
  listaSucursalesxusr: any[] = [];
  totalSectores2: Sector[] = [];
  lista_estadolec: any[] = [];

  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: Sector[] | null = null; // '%' = todos
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

  // ---- UI ----
  filtrosVisible = false;
  sidebarOpen = true;
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

  baseLayers = [
    {
      id: "osm",
      label: "OSM",
      iconUrl: "assets/images/img-georeferencia/capa-icon.gif",
    },
    {
      id: "satelital",
      label: "Satelital",
      iconUrl: "assets/images/img-georeferencia/satellital-icon.gif",
    },
  ];

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

  // ---- Popup ----
  imagenesPopup: any[] = [];
  cargandoImagenes = false;
  datosClientePopup: any = null;
  ref: DynamicDialogRef | undefined;

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
  ) {}

  ngOnInit(): void {
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
  }

  ngAfterViewInit(): void {
    this.crearMapa();
    this.initClick();
    // el layout de la toolbar puede cambiar el alto del contenedor tras el primer render
    setTimeout(() => this.map.updateSize(), 300);
  }

  ngOnDestroy(): void {
    this.map?.setTarget(undefined);
    this.ref?.close();
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
        this.selectedSector = def ? [def] : [];
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

  /** Construye el filtro a partir del estado actual de la pantalla. */
  private construirFiltro(): FiltroLecturas {
    return {
      codsuc: this.selectedSucursal.codsuc,
      codsede: this._codsede ?? "%",
      codsector: this.selectedSector?.length
        ? this.selectedSector.some((s) => s.codsector === "%")
          ? "%"
          : this.selectedSector.map((s) => s.codsector).join(",")
        : "%",
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

    this.ejecutarBusqueda(this.construirFiltro(), (registros) => {
      this.resultadoBusquedaJson = registros;
      this.actualizarCapasComerciales();
    });
  }

  /** Petición compartida entre "Buscar" y la búsqueda por código de cliente. */
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
    this.selectedSector = def ? [def] : [];
    this.selectedEstados = [];
    this.consumoini = 0;
    this.consumofin = 0;
    this.selectedTipoPromedio = TIPOS_PROMEDIO[0]; // consistente con el default inicial
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

    // Cada capa vectorial de puntos/líneas se llena con la misma receta:
    // registro → feature (o null si no hay coordenada) → addFeatures.
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
    this.acomAguaLayer.getSource()!.addFeatures(lineas("agua", "acomagua"));
    this.acomDesagueLayer
      .getSource()!
      .addFeatures(lineas("desague", "acomdesague"));

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
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;
    this.totalLecturas = 0;
    this.totalSinCoordenadas = 0;
  }

  /** Fuerza re-render de todas las capas vectoriales (p.ej. al cambiar selección). */
  private refrescarCapasVector(): void {
    this.capasVector.forEach((capa) => capa?.changed());
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
    this.sectoresComercialesLayer = this.crearWms(
      GEOSERVER_CAPAS.sectoresComerciales,
      false,
    );
    this.callesLayer = this.crearWms(GEOSERVER_CAPAS.calles, false);

    const zoomActual = () => this.map?.getView().getZoom() ?? 14;

    //capa de secuencia de lectura (WMS)
    this.secuenciaLecturaLayer = new TileLayer({
  visible: false,
  source: new TileWMS({
    url: "http://167.88.36.54:8085/geoserver/eps_yurimaguas/wms",
    params: {
      LAYERS: "eps_yurimaguas:secuencia_ruta_lectura",
      TILED: false,
    },
    serverType: "geoserver",
    transition: 0,
  }),
});
  //capa de sectorcomercial (WMS)
    this.sectoresComercialesLayer = new TileLayer({
  visible: false,
  source: new TileWMS({
    url: "http://167.88.36.54:8085/geoserver/eps_yurimaguas/wms",
    params: {
      LAYERS: "eps_yurimaguas:yurimaguas_sig_sectores_comerciales",
      TILED: false,
    },
    serverType: "geoserver",
    transition: 0,
  }),
});
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
          color: COLOR_FICHA_ALC,
          zoom: zoomActual(),
          seleccionado: f === this.featureSeleccionado,
          etiqueta: f.get("codcliente") || f.get("nroSuministro"),
          ...RADIOS_FICHA,
        });
      },
    });

    // La resolución llega como 2º parámetro de la style function en cada render:
    // así la extensión de líneas cortas siempre usa la resolución vigente.
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
          COLOR_FICHA_ALC,
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
      target: "map",
<<<<<<< HEAD
      layers: [base, this.lotesLayer, this.fichaAlcLayer, this.cajaAguaLayer, this.lecturasLayer,this.secuenciaLecturaLayer,],
=======
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
>>>>>>> b8173999d2f532e30c8b19bc01459d7600dae8ab
      view: new View({
        projection: PROYECCION_MAPA,
        center: VISTA_INICIAL.centro,
        zoom: VISTA_INICIAL.zoom,
      }),
    });
  }

  /** Determina el tipo de popup a mostrar según la capa clickeada. */
  private tipoPopupDeCapa(capa: BaseLayer | null): TipoPopup {
    if (capa === this.cajaAguaLayer || capa === this.acomAguaLayer)
      return "agua";
    if (capa === this.fichaAlcLayer || capa === this.acomDesagueLayer)
      return "alcantarillado";
    return "lectura";
  }

  /** Punto único de selección: click en el mapa y buscador reutilizan esto. */
  private seleccionarFeature(feature: Feature, tipo: TipoPopup): void {
    this.tipoPopup = tipo;
    this.featureSeleccionado = feature;
    this.refrescarCapasVector();
    this.lecturaSeleccionada = feature.getProperties() as RegistroLectura;
    this.cargarDatosPopup(this.lecturaSeleccionada);
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      let clickedLayer: BaseLayer | null = null;
      const feature = this.map.forEachFeatureAtPixel(
        evt.pixel,
        (f, layer) => {
          clickedLayer = layer;
          return f;
        },
        { hitTolerance: 5 },
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

  /** Cambia la capa WMS de lotes según los sectores. */
  seleccionarSectores(sectores: Sector[]): void {
    if (!sectores || sectores.length === 0) return;
    const isTodos = sectores.some((s) => s.codsector === "%");
    const source = this.lotesLayer.getSource() as TileWMS;

    if (isTodos) {
      source.updateParams({ LAYERS: GEOSERVER_CAPAS.lotes });
    } else {
      const layers = sectores
        .map((s) => GEOSERVER_CAPAS.lotesPorSector(s.codsector.slice(-2)))
        .join(",");
      source.updateParams({ LAYERS: layers });
    }
    source.refresh();
  }

  // ============================================================
  //llama al modulo de consulta
  // ============================================================

  verMasInformacion(codcliente: string | undefined): void {
    if (!codcliente) return;

    this.ref = this.dialogService.open(ConsultaUsuarioComponent, {
      header: "Consulta General de Usuario",
      width: "90%",
      height: "95%",
      baseZIndex: 10000,
      maximizable: true,
      data: {
        codcliente,
        codsuc:
          this.selectedSucursal?.codsuc ||
          this.lecturaSeleccionada?.codsuc ||
          this.datosClientePopup?.codsuc,
        operacion: "Vektors",
      },
    });
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

  private cargarDatosPopup(lectura: RegistroLectura): void {
    this.imagenesPopup = [];
    this.datosClientePopup = null;
    this.cargandoImagenes = true;
    const codsuc = lectura.codsuc || this.selectedSucursal?.codsuc || "002";
    const codcliente = lectura.codcliente;

    const hoy = new Date();
    const fechaFinal = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    const fechaInicial = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    forkJoin({
      imagenes: this.controlImgService
        .read_x_tipolistar({
          codsuc,
          codcliente,
          fecha_inicial: formatDate(fechaInicial),
          fecha_final: formatDate(fechaFinal),
          tipoarchivo: "IMG",
          tiporecepcion: TIPOS_RECEPCION_IMG,
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
                  }))
              : [];
        },
        error: () => (this.cargandoImagenes = false),
      });
  }

  // ============================================================
  // BUSCADOR POR CÓDIGO
  // ============================================================

  /** Busca un codcliente en los features ya cargados en el mapa. */
  buscarPorCodCliente(): void {
    const query = String(this.searchCodCliente || "").trim();
    if (!query) {
      this.reiniciarBusqueda();
      return;
    }

    this.refrescarCapasVector();

    // Primero, si ya tenemos datos cargados, buscamos ahí
    const capas: { layer: VectorLayer<VectorSource>; tipo: TipoPopup }[] = [
      { layer: this.lecturasLayer, tipo: "lectura" },
      { layer: this.cajaAguaLayer, tipo: "agua" },
      { layer: this.fichaAlcLayer, tipo: "alcantarillado" },
      { layer: this.acomAguaLayer, tipo: "agua" },
      { layer: this.acomDesagueLayer, tipo: "alcantarillado" },
    ];

    let foundFeatureLocally = false;
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
        foundFeatureLocally = true;
        this.seleccionarFeature(feature, tipo);
        this.activarCapasPorDefectoBusqueda();

        // Si lo encontró localmente y queremos aislarlo, necesitamos filtrar la lista
        if (!this.isBusquedaClienteActiva) {
          this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
          this.isBusquedaClienteActiva = true;
        }

        // Aislamos el usuario encontrado
        const userFeature = this.resultadoBusquedaOriginalJson?.find(
          (r: any) =>
            String(r.codcliente || r.nroSuministro || "").trim() === query,
        );
        if (userFeature) {
          this.resultadoBusquedaJson = [userFeature];
          this.actualizarCapasComerciales(false);

          setTimeout(() => {
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
          }, 100);
        }
        return;
      }
    }

    // Si no se encontró localmente, buscar en el backend sin importar el sector
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

          // Reemplazamos la lista con SOLO el usuario buscado
          this.resultadoBusquedaJson = registros;

          this.searchCodCliente = "";
          this.actualizarCapasComerciales(false);

          setTimeout(() => {
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
          }, 100);
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

  /** Evento global: buscar un codcliente consultando al backend. */
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

          setTimeout(() => {
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
          }, 100);
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
  // (candidato a extraerse como <app-lightbox-imagenes> reutilizable)
  // ============================================================

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

  @HostListener("document:keydown", ["$event"])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (!this.imagenAbierta) return;
    if (event.key === "ArrowRight") this.siguienteImagen();
    else if (event.key === "ArrowLeft") this.anteriorImagen();
    else if (event.key === "Escape") this.cerrarImagenCompleta();
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

  // ============================================================
  // OTROS
  // ============================================================

  abrirStreetView(coordX: unknown, coordY: unknown): void {
    const x = Number(coordX);
    const y = Number(coordY);

    if (!x || !y || (x === 0 && y === 0)) {
      this.avisar(
        "warn",
        "Aviso",
        "No hay coordenadas válidas para abrir Street View.",
      );
      return;
    }

    // Si los valores exceden rangos WGS84 asumimos UTM 18S y convertimos.
    let [lng, lat] = [x, y];
    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
      [lng, lat] = transform([x, y], PROYECCION_UTM_18S, "EPSG:4326");
    }

    window.open(
      `https://www.google.com/maps?layer=c&cbll=${lat},${lng}`,
      "_blank",
    );
  }

  private avisar(
    severity: "success" | "info" | "warn" | "error",
    summary: string,
    detail: string,
  ): void {
    this.messageService.add({ severity, summary, detail });
  }
}
