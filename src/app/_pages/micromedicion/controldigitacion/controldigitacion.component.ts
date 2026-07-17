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
import { transform } from "ol/proj";
import { extend } from "ol/extent";
import { forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { ConsultaUsuarioComponent } from '@mf-consulta/_pages/consulta-usuario/consulta-usuario.component';

import OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import LayerGroup from "ol/layer/Group";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import TileWMS from "ol/source/TileWMS";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { Style, Circle as CircleStyle, Fill, Stroke, Text, RegularShape } from "ol/style";

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
export type OrigenCoordenada = "usuario" | "predio" | "agua" | "desague" | "acomagua" | "acomdesague";

interface ConfigOrigenCoordenada {
  lonField: string;
  latField: string;
  proyeccion: string; // proyección de origen de los datos
}

const PROYECCION_MAPA = "EPSG:4326";

const ORIGENES_COORDENADA: Record<OrigenCoordenada, ConfigOrigenCoordenada> = {
  usuario: { lonField: "lon", latField: "lat", proyeccion: "EPSG:4326" },
  predio: { lonField: "lonpredio", latField: "latpredio", proyeccion: "EPSG:4326" },
  agua: { lonField: "lonagua", latField: "latagua", proyeccion: "EPSG:4326" },
  desague: { lonField: "londesague", latField: "latdesague", proyeccion: "EPSG:4326" },
  acomagua: { lonField: "lonacometidaagua", latField: "latacometidaagua", proyeccion: "EPSG:4326"},
  acomdesague: {lonField: "lonacometidadesague", latField: "latacometidadesague", proyeccion: "EPSG:4326"}
};

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
  providers: [DatePipe, ValidacionSistemaService, MessageService, DialogService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ControldigitacionComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);

  map!: OlMap;
  lecturasLayer!: VectorLayer<VectorSource>;
  cajaAguaLayer!: VectorLayer<VectorSource>;
  fichaAlcLayer!: VectorLayer<VectorSource>;
  lotesLayer!: TileLayer<TileWMS>;
  sectoresComercialesLayer!: TileLayer<TileWMS>;
  callesLayer!: TileLayer<TileWMS>;
  acomAguaLayer!: VectorLayer<VectorSource>;
  acomDesagueLayer!: VectorLayer<VectorSource>;
  osmLayer!: TileLayer<any>;
  satelitalLayer!: TileLayer<any>;
  tipoPopup: 'lectura' | 'agua' | 'alcantarillado' = 'lectura';

  _codsede: string | null;
  _codemp: string | null;

  dataCiclos: any[] = [];
  fechaCiclos: any;
  listaSucursalesxusr: any[] = [];
  totalSectores2: any[] = [];
  lista_estadolec: any[] = [];

  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: any = null; // '%' = todos
  selectedEstados: string[] = [];
  selectedAnio = "";
  selectedMes = "";
  consumoini: number | null = 0;
  consumofin: number | null = 0;
  resultadoBusquedaJson: any = null;

  listaYear: { anio: string }[] = [];
  listaMeses = [
    { mes: "ENERO", numero: "01" },
    { mes: "FEBRERO", numero: "02" },
    { mes: "MARZO", numero: "03" },
    { mes: "ABRIL", numero: "04" },
    { mes: "MAYO", numero: "05" },
    { mes: "JUNIO", numero: "06" },
    { mes: "JULIO", numero: "07" },
    { mes: "AGOSTO", numero: "08" },
    { mes: "SETIEMBRE", numero: "09" },
    { mes: "OCTUBRE", numero: "10" },
    { mes: "NOVIEMBRE", numero: "11" },
    { mes: "DICIEMBRE", numero: "12" },
  ];

  // OJO: ASIGNADO y PROMEDIADO tenían ambos codigo "1" en la versión
  // anterior. Confirmar con backend el código real de PROMEDIADO.
  tipopromedio = [
    { descripcion: "MEDIDO", codigo: "0" },
    { descripcion: "ASIGNADO", codigo: "1" },
    { descripcion: "PROMEDIADO", codigo: "2" },
  ];

  filtrosVisible = false;

  private styleCache: { [key: string]: Style | Style[] } = {};
  sidebarOpen = true;
  baseActive: string | null = "osm";

  baseLayers = [
    { id: "osm", label: "OSM", iconUrl: "assets/images/img-georeferencia/capa-icon.gif" },
    { id: "satelital", label: "Satelital", iconUrl: "assets/images/img-georeferencia/satellital-icon.gif" },
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

  cargando = false;
  totalLecturas = 0;
  totalSinCoordenadas = 0;
  lecturaSeleccionada: any = null;
  mostrarLeyenda = true;
  mostrarSearchPanel = false;
  searchCodCliente = '';
  selectedTipoPromedio: any = null;
  featureSeleccionado: Feature | null = null;

  imagenesPopup: any[] = [];
  cargandoImagenes = false;
  datosClientePopup: any = null;
  imagenAbierta: string | null = null;
  imagenAbiertaIndex = -1;
  imagenZoom = 1;
  imagenRotacion = 0;
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  imgOffsetX = 0;
  imgOffsetY = 0;

  private readonly TIPOS_RECEPCION_IMG = [
    { tipo: "000" }, { tipo: "050" }, { tipo: "046" }, { tipo: "045" },
    { tipo: "044" }, { tipo: "043" }, { tipo: "042" }, { tipo: "041" },
    { tipo: "040" }, { tipo: "039" }, { tipo: "038" }, { tipo: "037" },
    { tipo: "004" }, { tipo: "003" },
  ];

  constructor(
    private aperturaservices: AperturaMicromedicionService,
    private seguridadService: SucursalesService,
    private sectoresService: SectoresCicloService,
    private consultaService: ConsulGenericService,
    private micromedicionService: MicromedicionService,
    private controlImgService: ControlImgService,
    private clientesService: ClientesService,
    private messageService: MessageService,
    private dialogService: DialogService
  ) {
    this._codsede = sessionStorage.getItem("codsede");
    this._codemp = sessionStorage.getItem("codemp");

    const currentYear = new Date().getFullYear();
    for (let i = 0; i <= 5; i++) {
      this.listaYear.push({ anio: (currentYear - i).toString() });
    }
    this.selectedTipoPromedio = this.tipopromedio[0]; // default: MEDIDO
  }

  // ============================================================
  // CICLO DE VIDA
  // ============================================================

  ngOnInit(): void {
    this.aperturaservices
      .getCiclos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        if (response.status === "SUCCESS") {
          this.dataCiclos = response.data;
          if (this.dataCiclos && this.dataCiclos.length > 0) {
            this.selectedCiclo = this.dataCiclos[0];
            this.onCicloChange(true);
          }
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
    // Libera el mapa y sus listeners internos de OpenLayers.
    // Las suscripciones RxJS ya las cierra takeUntilDestroyed.
    this.map?.setTarget(undefined);
  }

  // ============================================================
  // FILTROS
  // ============================================================

  toggleFiltros(): void {
    this.filtrosVisible = !this.filtrosVisible;
  }

  onCicloChange(autoLoad: boolean = false): void {
    this.selectedSucursal = null;
    this.selectedSector = null;
    this.limpiarCapa();
    if (!this.selectedCiclo) return;

    this.aperturaservices
      .getfechaCiclos(this.selectedCiclo.codciclo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        this.fechaCiclos = response.data;
        this.selectedAnio = this.fechaCiclos.year;
        this.selectedMes = this.fechaCiclos.month;

        this.seguridadService
          .drop_sucursales_x_ciclo(this.selectedCiclo.codciclo)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((data) => {
            this.listaSucursalesxusr = data;
            if (autoLoad === true && this.listaSucursalesxusr && this.listaSucursalesxusr.length > 0) {
              this.selectedSucursal = this.listaSucursalesxusr[0];
              this.onSucursalChange(true);
            }
          });
      });
  }

  onSucursalChange(autoLoad: boolean = false): void {
    this.selectedSector = null;
    if (!this.selectedSucursal) return;

    this.sectoresService
      .drop_sectores_x_ciclo(this.selectedSucursal.codsuc, this.selectedCiclo.codciclo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        const sectores = [
          {
            codemp: null,
            codsuc: null,
            codsector: "%",
            descripcion: "TODOS",
            estareg: null,
          },
          ...data,
        ];
        this.totalSectores2 = sectores;

        const defaultSector = sectores.find(s => s.codsector === '01' || s.codsector === '1') || sectores[1] || sectores[0];
        this.selectedSector = defaultSector;
        this.consumoini = 0;
        this.consumofin = 0;

        if (autoLoad === true) {
          // this.avisar("info", "Búsqueda por defecto", `Se cargó por defecto el Sector ${this.selectedSector.codsector} y Consumo 0 a 0`);
          // this.procesar();
        }
      });
  }

  procesar(): void {
    if (!this.selectedCiclo || !this.selectedSucursal || !this.selectedAnio || !this.selectedMes) {
      this.avisar("warn", "Aviso de usuario", "Debe seleccionar Ciclo, Sucursal, Año y Mes");
      return;
    }
    if (this.consumoini != null && this.consumofin != null && this.consumoini > this.consumofin) {
      this.avisar("warn", "Aviso de usuario", "El consumo inicial no puede ser mayor al final");
      return;
    }

    const filtro: FiltroLecturas = {
      codsuc: this.selectedSucursal.codsuc,
      codsede: this._codsede ? this._codsede : "%",
      codsector: this.selectedSector?.codsector || "%",
      codciclo: this.selectedCiclo.codciclo,
      anio: this.selectedAnio,
      mes: this.selectedMes,
      estadolectura: (this.selectedEstados || []).join(","),
      consumoini: this.consumoini,
      consumofin: this.consumofin,
      tipopromedio: this.selectedTipoPromedio?.codigo ?? "",
    };

    this.cargando = true;

    this.micromedicionService
      .listarLecturas(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.cargando = false;
          this.filtrosVisible = false;
          this.resultadoBusquedaJson = data.data || [];
          this.actualizarCapasComerciales();
        },
        error: () => {
          this.cargando = false;
          this.limpiarCapa();
          this.avisar("error", "Aviso de usuario", "Ocurrió un error al cargar las lecturas");
        },
      });
  }

  limpiar(): void {
    this.selectedSector = this.totalSectores2?.find(s => s.codsector === '01' || s.codsector === '1') || this.totalSectores2?.[1] || this.totalSectores2?.[0] || null;
    this.selectedEstados = [];
    this.consumoini = 0;
    this.consumofin = 0;
    this.selectedTipoPromedio = null;
    this.resultadoBusquedaJson = null;
    if (this.fechaCiclos) {
      this.selectedAnio = this.fechaCiclos.year;
      this.selectedMes = this.fechaCiclos.month;
    }
    this.limpiarCapa();
  }

  // ============================================================
  // PINTADO DE PUNTOS (genérico y escalable)
  // ============================================================

  private actualizarCapasComerciales(fitBounds: boolean = true): void {
    const sourceUsuarios = this.lecturasLayer.getSource()!;
    const sourceCajaAgua = this.cajaAguaLayer.getSource()!;
    const sourceAcomAgua = this.acomAguaLayer.getSource()!;
    const sourceAcomDesague = this.acomDesagueLayer.getSource()!;

    this.styleCache = {};

    sourceUsuarios.clear();
    sourceCajaAgua.clear();
    sourceAcomAgua.clear();
    sourceAcomDesague.clear();
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;

    const registros = this.resultadoBusquedaJson || [];
    if (registros.length === 0) return;

    const featuresUsr = registros
      .map(r => this.crearFeature(r, ORIGENES_COORDENADA["usuario"]))
      .filter((f): f is Feature => f !== null);
    sourceUsuarios.addFeatures(featuresUsr);
    const totalFeatUsr = featuresUsr.length;

    const featuresAgua = registros
      .map(r => this.crearFeature(r, ORIGENES_COORDENADA["agua"]))
      .filter((f): f is Feature => f !== null);
    sourceCajaAgua.addFeatures(featuresAgua);

    const featuresAlc = registros
      .map(r => this.crearFeature(r, ORIGENES_COORDENADA["desague"]))
      .filter((f): f is Feature => f !== null);
    const sourceFichaAlc = this.fichaAlcLayer.getSource() as VectorSource;
    sourceFichaAlc.clear();
    sourceFichaAlc.addFeatures(featuresAlc);

    const lineasAcomAgua = registros
      .map(r => this.crearLineaFeature(r, ORIGENES_COORDENADA["agua"], ORIGENES_COORDENADA["acomagua"]))
      .filter((f): f is Feature => f !== null);

    sourceAcomAgua.addFeatures(lineasAcomAgua);

    const lineasAcomDesague = registros
      .map(r => this.crearLineaFeature(r, ORIGENES_COORDENADA["desague"], ORIGENES_COORDENADA["acomdesague"]))
      .filter((f): f is Feature => f !== null);

    sourceAcomDesague.addFeatures(lineasAcomDesague);

    this.totalLecturas = registros.length;
    this.totalSinCoordenadas = registros.length - totalFeatUsr;

    const featUsrLen = sourceUsuarios.getFeatures().length;
    const featAguaLen = sourceCajaAgua.getFeatures().length;

    if (featUsrLen === 0 && featAguaLen === 0) {
      this.avisar("info", "Aviso", "No se encontraron coordenadas para los registros");
      return;
    }

    let extent: any = null;
    if (featUsrLen > 0) {
      extent = sourceUsuarios.getExtent();
    }
    if (featAguaLen > 0) {
      const ext2 = sourceCajaAgua.getExtent();
      if (extent) {
        extent = extend(extent, ext2);
      } else {
        extent = ext2;
      }
    }

    if (extent && fitBounds) {
      this.map.getView().fit(extent, {
        duration: 800,
        maxZoom: 18,
        padding: [60, 60, 60, 60],
      });
    }
    this.avisar("success", "Proceso completado", `Lecturas cargadas en el mapa`);
  }

  private crearFeature(registro: any, config: ConfigOrigenCoordenada): Feature | null {
    const lon = Number(registro[config.lonField]);
    const lat = Number(registro[config.latField]);

    const invalida =
      registro[config.lonField] == null ||
      registro[config.latField] == null ||
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      (lon === 0 && lat === 0);

    if (invalida) return null;

    let coordenada: number[] = [lon, lat];
    if (config.proyeccion !== PROYECCION_MAPA) {
      coordenada = transform(coordenada, config.proyeccion, PROYECCION_MAPA);
    }

    const feature = new Feature({
      ...registro,
      geometry: new Point(coordenada)
    });
    return feature;
  }

  private crearLineaFeature(registro: any, config1: ConfigOrigenCoordenada, config2: ConfigOrigenCoordenada): Feature | null {
    const lon1 = Number(registro[config1.lonField]);
    const lat1 = Number(registro[config1.latField]);
    const lon2 = Number(registro[config2.lonField]);
    const lat2 = Number(registro[config2.latField]);

    const invalida =
      registro[config1.lonField] == null || registro[config1.latField] == null ||
      registro[config2.lonField] == null || registro[config2.latField] == null ||
      !Number.isFinite(lon1) || !Number.isFinite(lat1) ||
      !Number.isFinite(lon2) || !Number.isFinite(lat2) ||
      (lon1 === 0 && lat1 === 0) || (lon2 === 0 && lat2 === 0);

    if (invalida) return null;

    const R = 6371e3; // metres
    const f1 = lat1 * Math.PI/180;
    const f2 = lat2 * Math.PI/180;
    const df = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(df/2) * Math.sin(df/2) +
              Math.cos(f1) * Math.cos(f2) *
              Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    if (distance > 50) return null;

    let coord1: number[] = [lon1, lat1];
    if (config1.proyeccion !== PROYECCION_MAPA) {
      coord1 = transform(coord1, config1.proyeccion, PROYECCION_MAPA);
    }

    let coord2: number[] = [lon2, lat2];
    if (config2.proyeccion !== PROYECCION_MAPA) {
      coord2 = transform(coord2, config2.proyeccion, PROYECCION_MAPA);
    }

    const feature = new Feature({
      ...registro,
      esLinea: true,
      geometry: new LineString([coord1, coord2])
    });
    return feature;
  }

  private limpiarCapa(): void {
    if (this.lecturasLayer) {
      const source = this.lecturasLayer.getSource() as VectorSource;
      source.clear();
    }
    if (this.cajaAguaLayer) {
      const source = this.cajaAguaLayer.getSource() as VectorSource;
      source.clear();
    }
    if (this.fichaAlcLayer) {
      const source = this.fichaAlcLayer.getSource() as VectorSource;
      source.clear();
    }
    if (this.acomAguaLayer) {
      const source = this.acomAguaLayer.getSource() as VectorSource;
      source.clear();
    }
    if (this.acomDesagueLayer) {
      const source = this.acomDesagueLayer.getSource() as VectorSource;
      source.clear();
    }
    this.totalLecturas = 0;
    this.totalSinCoordenadas = 0;
  }

  // ============================================================
  // MAPA
  // ============================================================

  private crearMapa(): void {
    this.osmLayer = new TileLayer({ source: new OSM(), visible: this.baseActive === 'osm' });
    this.satelitalLayer = new TileLayer({
      source: new XYZ({
        url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
      }),
      visible: this.baseActive === 'satelital'
    });

    const base = new LayerGroup({
      layers: [this.osmLayer, this.satelitalLayer],
    });

    this.lotesLayer = new TileLayer({
      visible: true,
      source: new TileWMS({
        url: "http://167.88.36.54:8085/geoserver/eps_yurimaguas/wms",
        params: {
          LAYERS: "eps_yurimaguas:yurimaguas_sig_lotes",
          TILED: false,
        },
        serverType: "geoserver",
        transition: 0,
      }),
    });

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

    this.callesLayer = new TileLayer({
      visible: false,
      source: new TileWMS({
        url: "http://167.88.36.54:8085/geoserver/eps_yurimaguas/wms",
        params: {
          LAYERS: "eps_yurimaguas:yurimaguas_sig_calles",
          TILED: false,
        },
        serverType: "geoserver",
        transition: 0,
      }),
    });

    this.lecturasLayer = new VectorLayer({
      source: new VectorSource(),
      visible: true,
      style: (feature, resolution) => this.estiloLectura(feature, resolution),
    });

    this.cajaAguaLayer = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: (feature, resolution) => this.estiloCajaAgua(feature, resolution),
    });

    this.fichaAlcLayer = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: (feature, resolution) => this.estiloFichaAlc(feature, resolution),
    });

    this.acomAguaLayer = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: (feature, resolution) => this.estiloAcomAgua(feature, resolution),
    });

    this.acomDesagueLayer = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: (feature, resolution) => this.estiloAcomDesague(feature, resolution),
    });

    this.map = new OlMap({
      target: "map",
      layers: [base, this.sectoresComercialesLayer, this.callesLayer, this.lotesLayer, this.acomAguaLayer, this.acomDesagueLayer, this.fichaAlcLayer, this.cajaAguaLayer, this.lecturasLayer],
      view: new View({
        projection: PROYECCION_MAPA,
        center: [-76.1223, -5.9018], // Yurimaguas
        zoom: 18,
      }),
    });
  }

  private estiloLectura(feature: any, resolution?: number): Style {
    const estado = feature.get("estadolectura");
    let color = "#22c55e"; // 000 normal → verde
    if (estado === "008") color = "#ef4444"; // atípico → rojo
    else if (estado === "003" || estado === "999") color = "#f97316"; // sin registro → naranja
    else if (estado !== "000") color = "#3b82f6"; // observados → azul

    const isSelected = feature === this.featureSeleccionado;

    let showText = isSelected;
    let zoom = 14;
    if (this.map) {
      zoom = this.map.getView().getZoom() || 14;
      if (!showText && zoom >= 17) {
        showText = true;
      }
    }

    let radius = isSelected ? 9 : 6;
    let strokeColor = isSelected ? "#000000" : (zoom < 16 ? "#333333" : "#ffffff");
    let strokeWidth = isSelected ? 2.5 : (zoom < 16 ? 0.8 : 1.5);

    if (!isSelected) {
      if (zoom < 14) radius = 3;
      else if (zoom < 16) radius = 4;
      else if (zoom < 18) radius = 6;
      else radius = 7;
    }

    const codcliente = feature.get("codcliente") || "";
    const cacheKey = showText 
      ? `lec_${color}_${radius}_${strokeColor}_${strokeWidth}_${codcliente}`
      : `lec_${color}_${radius}_${strokeColor}_${strokeWidth}`;

    if (this.styleCache[cacheKey]) {
      return this.styleCache[cacheKey] as Style;
    }

    const styleParams: any = {
      image: new CircleStyle({
        radius: radius,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
      }),
    };

    if (showText && codcliente) {
      styleParams.text = new Text({
        text: String(codcliente),
        font: 'bold 11px Arial',
        fill: new Fill({ color: '#000000' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 }),
        offsetY: -12,
      });
    }

    const style = new Style(styleParams);
    this.styleCache[cacheKey] = style;
    return style;
  }

  private estiloCajaAgua(feature: any, resolution?: number): Style {
    const isSelected = feature === this.featureSeleccionado;

    let showText = isSelected;
    let zoom = 14;
    if (this.map) {
      zoom = this.map.getView().getZoom() || 14;
      if (!showText && zoom >= 17) {
        showText = true;
      }
    }

    let radius = isSelected ? 11 : 8;
    let strokeColor = isSelected ? "#000000" : (zoom < 16 ? "#333333" : "#ffffff");
    let strokeWidth = isSelected ? 2.5 : (zoom < 16 ? 0.8 : 1.5);

    if (!isSelected) {
      if (zoom < 14) radius = 4;
      else if (zoom < 16) radius = 6;
      else if (zoom < 18) radius = 8;
      else radius = 9;
    }

    const codcliente = feature.get("codcliente") || "";
    const cacheKey = showText 
      ? `caja_${radius}_${strokeColor}_${strokeWidth}_${codcliente}`
      : `caja_${radius}_${strokeColor}_${strokeWidth}`;

    if (this.styleCache[cacheKey]) {
      return this.styleCache[cacheKey] as Style;
    }

    const styleParams: any = {
      image: new RegularShape({
        fill: new Fill({ color: '#00bfff' }), // celeste
        stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
        points: 4,
        radius: radius,
        angle: Math.PI / 4,
      }),
    };

    if (showText && codcliente) {
      styleParams.text = new Text({
        text: String(codcliente),
        font: 'bold 11px Arial',
        fill: new Fill({ color: '#000000' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 }),
        offsetY: -15,
      });
    }

    const style = new Style(styleParams);
    this.styleCache[cacheKey] = style;
    return style;
  }

  private estiloFichaAlc(feature: any, resolution?: number): Style {
    const isSelected = feature === this.featureSeleccionado;

    let showText = isSelected;
    let zoom = 14;
    if (this.map) {
      zoom = this.map.getView().getZoom() || 14;
      if (!showText && zoom >= 17) {
        showText = true;
      }
    }

    let radius = isSelected ? 11 : 8;
    let strokeColor = isSelected ? "#000000" : (zoom < 16 ? "#333333" : "#ffffff");
    let strokeWidth = isSelected ? 2.5 : (zoom < 16 ? 0.8 : 1.5);

    if (!isSelected) {
      if (zoom < 14) radius = 4;
      else if (zoom < 16) radius = 6;
      else if (zoom < 18) radius = 8;
      else radius = 9;
    }

    const color = '#8b4513'; // marron
    const codcliente = feature.get("codcliente") || "";
    const cacheKey = showText 
      ? `alc_${radius}_${strokeColor}_${strokeWidth}_${codcliente}`
      : `alc_${radius}_${strokeColor}_${strokeWidth}`;

    if (this.styleCache[cacheKey]) {
      return this.styleCache[cacheKey] as Style;
    }

    const styleParams: any = {
      image: new RegularShape({
        fill: new Fill({ color }),
        stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
        points: 4,
        radius: radius,
        angle: Math.PI / 4,
      }),
    };

    if (showText && codcliente) {
      styleParams.text = new Text({
        text: String(codcliente),
        font: 'bold 11px Arial',
        fill: new Fill({ color: '#000000' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 }),
        offsetY: -15,
      });
    }

    const style = new Style(styleParams);
    this.styleCache[cacheKey] = style;
    return style;
  }

  private estiloAcomAgua(feature: any, resolution?: number): Style | Style[] {
    const isSelected = feature === this.featureSeleccionado;
    const color = '#00bfff'; // mismo color de la ficha de agua
    const outlineColor = '#ffffff'; // outline
    const innerWidth = isSelected ? 5 : 3;
    const outerWidth = innerWidth + 3;

    const zoomInt = this.map ? Math.floor(this.map.getView().getZoom() || 14) : 14;
    const currentRes = this.map ? this.map.getView().getResolution() : resolution;
    const cacheKey = `line_acomagua_${innerWidth}_${zoomInt}`;

    if (this.styleCache[cacheKey]) {
      return this.styleCache[cacheKey];
    }

    const geometryFn = function(f: any) {
      const geom = f.getGeometry();
      if (geom && geom.getType() === 'LineString' && currentRes) {
        const coords = geom.getCoordinates();
        if (coords.length === 2) {
          const p1 = coords[0];
          const p2 = coords[1];
          const dx = p2[0] - p1[0];
          const dy = p2[1] - p1[1];
          const mapLen = Math.sqrt(dx * dx + dy * dy);
          if (mapLen > 0) {
            const pxLen = mapLen / currentRes;
            if (pxLen < 25) {
              const scale = 25 / pxLen;
              return new LineString([p1, [p1[0] + dx * scale, p1[1] + dy * scale]]);
            }
          }
        }
      }
      return geom;
    };

    const style = [
      new Style({
        stroke: new Stroke({
          color: outlineColor,
          width: outerWidth,
        }),
        zIndex: 10,
        geometry: geometryFn
      }),
      new Style({
        stroke: new Stroke({
          color: color,
          width: innerWidth,
        }),
        zIndex: 11,
        geometry: geometryFn
      })
    ];

    this.styleCache[cacheKey] = style;
    return style;
  }

  private estiloAcomDesague(feature: any, resolution?: number): Style | Style[] {
    const isSelected = feature === this.featureSeleccionado;
    const color = '#8b4513'; // mismo color de la ficha alcantarillado
    const outlineColor = '#ffffff'; // outline
    const innerWidth = isSelected ? 5 : 3;
    const outerWidth = innerWidth + 3;

    const zoomInt = this.map ? Math.floor(this.map.getView().getZoom() || 14) : 14;
    const currentRes = this.map ? this.map.getView().getResolution() : resolution;
    const cacheKey = `line_acomdesague_${innerWidth}_${zoomInt}`;

    if (this.styleCache[cacheKey]) {
      return this.styleCache[cacheKey];
    }

    const geometryFn = function(f: any) {
      const geom = f.getGeometry();
      if (geom && geom.getType() === 'LineString' && currentRes) {
        const coords = geom.getCoordinates();
        if (coords.length === 2) {
          const p1 = coords[0];
          const p2 = coords[1];
          const dx = p2[0] - p1[0];
          const dy = p2[1] - p1[1];
          const mapLen = Math.sqrt(dx * dx + dy * dy);
          if (mapLen > 0) {
            const pxLen = mapLen / currentRes;
            if (pxLen < 25) {
              const scale = 25 / pxLen;
              return new LineString([p1, [p1[0] + dx * scale, p1[1] + dy * scale]]);
            }
          }
        }
      }
      return geom;
    };

    const style = [
      new Style({
        stroke: new Stroke({
          color: outlineColor,
          width: outerWidth,
        }),
        zIndex: 10,
        geometry: geometryFn
      }),
      new Style({
        stroke: new Stroke({
          color: color,
          width: innerWidth,
        }),
        zIndex: 11,
        geometry: geometryFn
      })
    ];

    this.styleCache[cacheKey] = style;
    return style;
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      let clickedLayer: any = null;
      const feature = this.map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
        clickedLayer = layer;
        return f;
      }, {
        hitTolerance: 5,
      }) as Feature | undefined;

      if (feature) {
        if (clickedLayer === this.cajaAguaLayer) {
          this.tipoPopup = 'agua';
        } else if (clickedLayer === this.fichaAlcLayer) {
          this.tipoPopup = 'alcantarillado';
        } else if (clickedLayer === this.acomAguaLayer) {
          this.tipoPopup = 'agua';
        } else if (clickedLayer === this.acomDesagueLayer) {
          this.tipoPopup = 'alcantarillado';
        } else {
          this.tipoPopup = 'lectura';
        }

        this.featureSeleccionado = feature;
        this.lecturasLayer.changed();
        this.cajaAguaLayer.changed();
        this.fichaAlcLayer.changed();
        this.acomAguaLayer.changed();
        this.acomDesagueLayer.changed();
        this.lecturaSeleccionada = feature.getProperties();
        this.cargarDatosPopup(this.lecturaSeleccionada);
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
    if (this.osmLayer) this.osmLayer.setVisible(this.baseActive === 'osm');
    if (this.satelitalLayer) this.satelitalLayer.setVisible(this.baseActive === 'satelital');
  }

  toggleCommercialLayer(layer: any): void {
    layer.active = !layer.active;
    if (layer.id === 'lotes') {
      this.lotesLayer.setVisible(layer.active);
    } else if (layer.id === 'usuarios') {
      this.lecturasLayer.setVisible(layer.active);
    } else if (layer.id === 'caja_agua') {
      this.cajaAguaLayer.setVisible(layer.active);
    } else if (layer.id === 'acometida') {
      this.acomAguaLayer.setVisible(layer.active);
    } else if (layer.id === 'ficha_alc') {
      this.fichaAlcLayer.setVisible(layer.active);
    } else if (layer.id === 'acc_alc') {
      this.acomDesagueLayer.setVisible(layer.active);
    } else if (layer.id === 'sectores') {
      this.sectoresComercialesLayer.setVisible(layer.active);
    } else if (layer.id === 'calles') {
      this.callesLayer.setVisible(layer.active);
    }
  }

  /** Cambia la capa WMS de lotes según el sector ('001' -> '01'). */
  seleccionarSector(codigo: string): void {
    if (!codigo || codigo === "%") return;

    const sufijo = codigo.slice(-2);
    const source = this.lotesLayer.getSource() as TileWMS;

    source.updateParams({
      LAYERS: `eps_yurimaguas:yurimaguas_sig_lotes_sector_${sufijo}`,
    });
    source.refresh();
  }

  // ============================================================
  // POPUP DE USUARIO
  // ============================================================

  ref: DynamicDialogRef | undefined;

  verMasInformacion(codcliente: any) {
    if (!codcliente) return;
    
    const datos = {
      codcliente: codcliente,
      codsuc: this.selectedSucursal?.codsuc || this.lecturaSeleccionada?.codsuc || this.datosClientePopup?.codsuc,
      operacion: "vizualizar",
    };

    this.ref = this.dialogService.open(ConsultaUsuarioComponent, {
      header: "Consulta General de Usuario",
      width: "90%",
      height: "95%",
      baseZIndex: 10000,
      maximizable: true,
      data: datos,
      contentStyle: {
        overflow: "auto",
        background: "#f4f4f9", // better background
        color: "#000000",
      },
      styleClass: "custom-dialog-instalacion",
    });
  }

  cerrarPopup(): void {
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;
    this.lecturasLayer?.changed();
    this.cajaAguaLayer?.changed();
    this.fichaAlcLayer?.changed();
    this.acomAguaLayer?.changed();
    this.acomDesagueLayer?.changed();
  }

  getDescripcionEstadoLectura(codigo: string): string {
    if (!codigo) return "-";
    const estado = this.lista_estadolec.find((e) => e.codigo === codigo);
    return estado ? estado.descripcion : codigo;
  }

  private cargarDatosPopup(lectura: any): void {
    this.imagenesPopup = [];
    this.datosClientePopup = null;
    this.cargandoImagenes = true;

    const codsuc = lectura.codsuc || this.selectedSucursal?.codsuc || "002";
    const codcliente = lectura.codcliente;

    const hoy = new Date();
    const fechaFinal = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    const fechaInicial = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);

    const pad = (n: number) => String(n).padStart(2, "0");
    const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const payloadImg = {
      codsuc,
      codcliente,
      fecha_inicial: formatDate(fechaInicial),
      fecha_final: formatDate(fechaFinal),
      tipoarchivo: "IMG",
      tiporecepcion: this.TIPOS_RECEPCION_IMG,
    };

    forkJoin({
      imagenes: this.controlImgService
        .read_x_tipolistar(payloadImg)
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

          if (imagenes?.mensaje === "EXITO" && imagenes?.data?.length > 0) {
            this.imagenesPopup = imagenes.data
              .filter((e: any) => !e.tiporecepcionimages?.includes("FIRMA"))
              .map((e: any) => ({
                ...e,
                src: e.img64?.startsWith("data:") ? e.img64 : "data:image/jpeg;base64," + e.img64,
              }));
          } else {
            this.imagenesPopup = [];
          }
        },
        error: () => (this.cargandoImagenes = false),
      });
  }

  // ============================================================
  // BUSCADOR POR CODIGO
  // ============================================================

  buscarPorCodCliente(): void {
    if (!this.searchCodCliente) return;

    const query = String(this.searchCodCliente).trim();
    const layers = [
      { layer: this.lecturasLayer, type: 'lectura' },
      { layer: this.cajaAguaLayer, type: 'agua' },
      { layer: this.fichaAlcLayer, type: 'alcantarillado' },
      { layer: this.acomAguaLayer, type: 'agua' },
      { layer: this.acomDesagueLayer, type: 'alcantarillado' }
    ];

    let foundFeature: Feature | null = null;
    let foundType: string = 'lectura';

    for (const { layer, type } of layers) {
      if (!layer) continue;
      const features = (layer.getSource() as VectorSource).getFeatures();
      for (const feat of features) {
        const codcliente = String(feat.get('codcliente'));
        if (codcliente === query) {
          foundFeature = feat as Feature;
          foundType = type;
          break;
        }
      }
      if (foundFeature) break;
    }

    if (foundFeature) {
      this.tipoPopup = foundType as 'lectura' | 'agua' | 'alcantarillado';
      this.featureSeleccionado = foundFeature;
      this.lecturasLayer.changed();
      this.cajaAguaLayer.changed();
      this.fichaAlcLayer.changed();
      this.acomAguaLayer.changed();
      this.acomDesagueLayer.changed();
      this.lecturaSeleccionada = foundFeature.getProperties();
      this.cargarDatosPopup(this.lecturaSeleccionada);

      const geom = foundFeature.getGeometry() as any;
      if (geom) {
        this.map.getView().animate({
          center: geom.getCoordinates(),
          zoom: 21,
          duration: 800
        });
      }
      this.mostrarSearchPanel = false;
    } else {
      this.avisar('warn', 'Aviso', 'No se encontró un usuario con ese código en el mapa actual.');
    }
  }

  // ============================================================
  // LIGHTBOX DE IMÁGENES
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
    this.abrirImagenCompleta((this.imagenAbiertaIndex + 1) % this.imagenesPopup.length);
  }

  anteriorImagen(event?: Event): void {
    event?.stopPropagation();
    if (this.imagenesPopup.length === 0) return;
    this.abrirImagenCompleta(
      (this.imagenAbiertaIndex - 1 + this.imagenesPopup.length) % this.imagenesPopup.length,
    );
  }

  @HostListener("document:keydown", ["$event"])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (!this.imagenAbierta) return;
    if (event.key === "ArrowRight") this.siguienteImagen();
    else if (event.key === "ArrowLeft") this.anteriorImagen();
    else if (event.key === "Escape") this.cerrarImagenCompleta();
  }

  @HostListener("window:buscar-codcliente", ["$event"])
  onBuscarCodCliente(event: any): void {
    const codcliente = event.detail.codcliente;
    if (!codcliente) return;

    if (!this.selectedCiclo || !this.selectedSucursal || !this.selectedAnio || !this.selectedMes) {
      this.avisar("warn", "Aviso de usuario", "Debe seleccionar Ciclo, Sucursal, Año y Mes antes de realizar la búsqueda");
      return;
    }

    const filtro: FiltroLecturas = {
      codsuc: this.selectedSucursal.codsuc,
      codsede: this._codsede ? this._codsede : "%",
      codsector: this.selectedSector?.codsector || "%",
      codciclo: this.selectedCiclo.codciclo,
      anio: this.selectedAnio,
      mes: this.selectedMes,
      estadolectura: (this.selectedEstados || []).join(","),
      consumoini: this.consumoini,
      consumofin: this.consumofin,
      tipopromedio: this.selectedTipoPromedio?.codigo ?? "",
      codcliente: codcliente,
    };

    this.cargando = true;

    this.micromedicionService
      .listarLecturas(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.cargando = false;
          this.filtrosVisible = false;

          const query = codcliente.trim();
          const rawData = data.data || [];

          // Filtrado en front-end por si acaso
          const filteredData = query
            ? rawData.filter((r: any) =>
              String(r.codcliente || "").toLowerCase().includes(query.toLowerCase())
            )
            : rawData;

          this.resultadoBusquedaJson = filteredData;
          this.actualizarCapasComerciales();

          if (filteredData.length > 0) {
            const firstMatch = filteredData[0];
            this.lecturaSeleccionada = firstMatch;
            this.cargarDatosPopup(firstMatch);

            // Centrar mapa
            const config = ORIGENES_COORDENADA["usuario"];
            const lon = Number(firstMatch[config.lonField]);
            const lat = Number(firstMatch[config.latField]);
            if (lon && lat && !(lon === 0 && lat === 0)) {
              let coordenada = [lon, lat];
              if (config.proyeccion !== PROYECCION_MAPA) {
                coordenada = transform(coordenada, config.proyeccion, PROYECCION_MAPA);
              }
              this.map.getView().setCenter(coordenada);
              this.map.getView().setZoom(17);
            }
          } else {
            this.avisar("info", "Aviso", "No se encontró ningún registro para el Código de Cliente");
          }
        },
        error: () => {
          this.cargando = false;
          this.limpiarCapa();
          this.resultadoBusquedaJson = null;
          this.avisar("error", "Aviso de usuario", "Ocurrió un error al buscar el Código de Cliente");
        },
      });
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

  abrirStreetView(coordX: any, coordY: any): void {
    const x = Number(coordX);
    const y = Number(coordY);

    if (!x || !y || (x === 0 && y === 0)) {
      this.avisar("warn", "Aviso", "No hay coordenadas válidas para abrir Street View.");
      return;
    }

    let lngWGS84 = x;
    let latWGS84 = y;

    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
      const coordsWGS84 = transform(
        [x, y], 
        'EPSG:32718', 
        'EPSG:4326' 
      );
      lngWGS84 = coordsWGS84[0];
      latWGS84 = coordsWGS84[1];
    }

    const url = `https://www.google.com/maps?layer=c&cbll=${latWGS84},${lngWGS84}`;
    window.open(url, '_blank');
  }

  private avisar(severity: "success" | "info" | "warn" | "error", summary: string, detail: string): void {
    this.messageService.add({ severity, summary, detail });
  }
}