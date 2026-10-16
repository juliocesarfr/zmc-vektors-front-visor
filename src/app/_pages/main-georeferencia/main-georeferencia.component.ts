import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  DestroyRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DropdownModule } from 'primeng/dropdown';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import LayerGroup from 'ol/layer/Group';
import BaseLayer from 'ol/layer/Base';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import TileWMS from 'ol/source/TileWMS';
import Feature, { FeatureLike } from 'ol/Feature';
import Point from 'ol/geom/Point';
import { extend, getCenter } from 'ol/extent';
import { transform } from 'ol/proj';

import { CapaConsultable, ConsultaCapasGisService, GisConfigService } from '../../core/gis';
import { WGS84 } from '../../core/gis/gis-proyeccion';
import { ControladorMapaGis } from '../../shared/mapa/controlador-mapa-gis';
import { MARCA_CAPA_RESALTADO } from '../../shared/mapa/interaccion-gis';
import { PanelesMapaGisComponent } from '../../shared/components/paneles-mapa-gis/paneles-mapa-gis.component';
import { FormaPunto, MapEstilosFactory, RADIOS_LECTURA, RADIOS_FICHA } from '../../shared/mapa/mapa-estilos';
import { colorPorEstadoLectura, COLOR_FICHA_AGUA, COLOR_FICHA_ALCANTARILLADO } from '../../shared/constantes/colores-mapa';
import { observarTamanoMapa } from '../../shared/mapa/observar-tamano-mapa';
import { CapasSidebarComponent } from '../../shared/components/capas-sidebar/capas-sidebar.component';
import { CAPAS_BASE_UI, crearCapaOsm, crearCapaSatelital, crearCapaWms } from '../../shared/mapa/capas';
import { MicromedicionService } from '@host/_servicios/vektors/micromedicion.service';
import { SucursalesService } from '@host/_servicios/seguridad/sucursales.service';
import { FactArchService } from '@host/_servicios/facturacion/fact-arch.service';
import { DISTANCIA_MAX_ACOMETIDA_M, ORIGENES_COORDENADA } from '../../shared/constantes/coordenadas';
import { LISTA_MESES, TIPOS_RECEPCION_FOTOS_LECTURA } from '../../shared/constantes/lecturas';
import { coordenadaLonLat, abrirGoogleStreetView } from '../../shared/mapa/street-view';
import { RegistroLectura } from '@host/_models/vektors/RegistroLectura';
import { abrirConsultaUsuario } from '../../shared/dialogos/consulta-usuario.dialog';
import { formatoFechaCorta, rangoFotosRecientes } from '../../shared/utils/fechas.utils';
import { ControlImgService } from '@host/_servicios/procesar-img/control-img.service';
import { ClientesService } from '@host/_servicios/catastro/clientes.service';
import { CatastroService } from '@host/_servicios/vektors/catastro.service';
import { crearFeaturePunto, crearFeatureLinea, extraerCoordenada } from '../../shared/mapa/geo.utils';
import { estaUsandoHerramientas } from '../../shared/mapa/herramientas-medicion';
import { ZOOM_PREDIO } from '../../shared/mapa/predio-buscado';
import { BusquedaAvanzadaClientesComponent } from '../../shared/components/busqueda-avanzada-clientes/busqueda-avanzada-clientes.component';
import { BusquedaAvanzadaClientesService } from '../../../../../host/src/app/_servicios/vektors/busqueda-avanzada-clientes.service';
import { BusquedaAvanzadaClientesRequest, BusquedaAvanzadaClienteResponse } from '../../../../../host/src/app/_models/vektors/busqueda-avanzada-clientes.models';

type TipoPopup = "lectura" | "agua" | "alcantarillado";

@Component({
  selector: 'app-main-georeferencia',
  templateUrl: './main-georeferencia.component.html',
  styleUrl: './main-georeferencia.component.scss',
  standalone: true,
  imports: [
    CapasSidebarComponent,
    PanelesMapaGisComponent,
    BusquedaAvanzadaClientesComponent,
    CommonModule,
    FormsModule,
    DropdownModule,
    ButtonModule,
    InputTextModule,
    ToastModule,
    DialogModule
  ],
  providers: [MessageService, DialogService]
})
export class MainGeoreferenciaComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapa') private mapaEl!: ElementRef<HTMLDivElement>;
  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;

  readonly gis = inject(GisConfigService);
  private readonly consultaCapasGis = inject(ConsultaCapasGisService);
  controladorGis?: ControladorMapaGis;
  private readonly destroyRef = inject(DestroyRef);
  private readonly estilos = new MapEstilosFactory();
  private readonly micromedicionService = inject(MicromedicionService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly factArchService = inject(FactArchService);
  private readonly messageService = inject(MessageService);
  private readonly controlImgService = inject(ControlImgService);
  private readonly clientesService = inject(ClientesService);
  private readonly dialogService = inject(DialogService);
  private readonly catastroService = inject(CatastroService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly busquedaAvanzadaService = inject(BusquedaAvanzadaClientesService);

  readonly baseLayers = CAPAS_BASE_UI;
  baseActive: string | null = 'osm';

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

  map?: OlMap;
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
  private detenerObservadorMapa?: () => void;

  tipoPopup: TipoPopup = "lectura";
  featureSeleccionado: Feature | null = null;
  resultadoBusquedaJson: RegistroLectura[] | null = null;
  resultadoBusquedaOriginalJson: RegistroLectura[] | null | undefined = undefined;
  totalLecturas = 0;
  totalSinCoordenadas = 0;

  mostrarSearchPanel = false;
  buscadorEstabaAbierto = false;
  searchSuministro = '';
  searchDniRuc = '';
  searchNombre = '';
  searchCatastral = '';
  cargando = false;
  isBusquedaActiva = false;
  mostrarBusquedaAvanzadaModal = false;

  // Pestañas del Buscador Adaptativo
  tabActivaBuscador: string = 'usuario';
  
  // Tab Calles
  searchNombreCalle: string = '';
  
  // Tab Manzana
  searchSector: string = '';
  searchManzana: string = '';
  searchLote: string = '';
  
  // Tab Caja Agua / Acant
  searchMedidor: string = '';
  
  // Resultados encontrados en tabs
  resultadosTab: any[] = [];
  
  // Paginación y filtro rápido para Tab Calles
  filtroTextoCalle: string = '';
  paginaCalleActual: number = 1;
  pageSizeCalle: number = 8;
  resultadosCalleFiltrados: any[] = [];
  
  cargandoFiltros = false;
  sinResultadosFiltros = false;
  
  // Tab Categoria Usuario (Tarifas)
  tarifasFiltro = [
    { label: 'COMERCIAL', dot: '#ef4444', checked: false },
    { label: 'DOMESTICO SUBSIDIO', dot: '#0ea5e9', checked: false },
    { label: 'INDUSTRIAL', dot: '#eab308', checked: false },
    { label: 'DOMESTICO', dot: '#22c55e', checked: false },
    { label: 'ESTATAL', dot: '#a855f7', checked: false },
    { label: 'SOCIAL', dot: '#00e5ff', checked: false },
  ];

  // Tab Tipo Usuario
  tiposUsuarioFiltro = [
    { label: 'REAL', dot: '#22c55e', checked: false },
    { label: 'POTENCIAL', dot: '#0ea5e9', checked: false },
    { label: 'FACTIBLE', dot: '#eab308', checked: false },
    { label: 'ANULADO', dot: '#f97316', checked: false },
  ];

  // Tab Diam. Conex.
  diametrosFiltro = [
    { label: '1/2"', dot: '#00e5ff', checked: false },
    { label: '3/4"', dot: '#0ea5e9', checked: false },
    { label: '1"', dot: '#22c55e', checked: false },
    { label: '1 1/2"', dot: '#eab308', checked: false },
    { label: '2"', dot: '#f97316', checked: false },
    { label: 'OTROS', dot: '#a855f7', checked: false },
  ];

  // Tab Est. Conexión (Agua y Desagüe)
  estadosAguaFiltro = [
    { label: 'OPE. CON SERV. ACT', dot: '#22c55e', checked: false },
    { label: 'OPE. SIN SERV. SOLI.', dot: '#eab308', checked: false },
    { label: 'CORTADO', dot: '#ef4444', checked: false },
    { label: 'CLAUSURADO', dot: '#f97316', checked: false },
    { label: 'LEVANTADO', dot: '#94a3b8', checked: false },
  ];

  estadosDesagueFiltro = [
    { label: 'ACTIVA', dot: '#22c55e', checked: false },
    { label: 'HABILITADA CON CAJA DE ALCANTARILLADO', dot: '#a855f7', checked: false },
    { label: 'SIN CONEXION', dot: '#eab308', checked: false },
    { label: 'ANULADA', dot: '#ef4444', checked: false },
  ];
  
  listaSucursales: any[] = [];
  selectedSucursal: any = null;
  listaYear: {anio: string}[] = [];
  selectedAnio: string = '';
  listaMeses = LISTA_MESES;
  selectedMes: string = '';
  
  lecturaSeleccionada: any = null;
  datosClientePopup: any = null;
  imagenesPopup: any[] = [];
  cargandoImagenes = false;
  indiceFotoAbierta = -1;
  ref: DynamicDialogRef | undefined;
  listaEstadosLectura: any[] = [];

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);
    this.cargarSucursales();
    this.cargarCombosEstaticos();

    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      if (params['codcliente']) {
        this.searchSuministro = params['codcliente'];
        
        const interval = setInterval(() => {
          if (this.selectedSucursal && this.selectedAnio && this.selectedMes) {
            clearInterval(interval);
            this.buscarPorOpcion(1);
          }
        }, 100);
      }
    });
  }

  private cargarSucursales(): void {
    this.sucursalesService.obtener_x_estareg().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(res => {
      this.listaSucursales = res;
      if (res && res.length > 0) {
        this.selectedSucursal = res[0];
        if (this.isCapaUsuariosActiva() && this.map) {
          this.cargarUsuariosCapa(false);
        }
      }
    });
  }

  private cargarCombosEstaticos(): void {
    const currentYear = new Date().getFullYear();
    for (let i = currentYear + 1; i >= 2020; i--) {
      this.listaYear.push({ anio: i.toString() });
    }
    
    this.factArchService.recuperar_ultimo_periodo_comercial('001').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(response => {
      const aniomes = response?.aniomes || '202609';
      const anio = aniomes.substring(0, 4);
      const mes = aniomes.substring(4, 6);
      if (!this.listaYear.find(a => a.anio === anio)) {
        this.listaYear.unshift({ anio: anio });
      }
      this.selectedAnio = anio;
      this.selectedMes = mes;
    });
  }

  ngAfterViewInit(): void {
    this.crearMapa();
    this.capasSidebar?.conectarMapa(this.map!);

    this.controladorGis = new ControladorMapaGis(this.map!, {
      consulta: this.consultaCapasGis,
      gis: this.gis,
      capasComerciales: () => this.capasComercialesConsultables(),
      capasTecnicas: () => this.capasSidebar?.capasTecnicasConsultables() ?? [],
      avisar: (detalle) => this.avisar('info', 'Aviso', detalle),
    });

    this.initClick();

    this.detenerObservadorMapa = observarTamanoMapa(
      this.map!,
      this.mapaEl.nativeElement,
    );

    if (this.isCapaUsuariosActiva() && this.selectedSucursal) {
      this.cargarUsuariosCapa(false);
    }
  }

  ngOnDestroy(): void {
    this.detenerObservadorMapa?.();
    this.controladorGis?.destruir();
    this.map?.setTarget(undefined);
  }

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
      (f) => this.obtenerColorPunto(f),
    );
    this.cajaAguaLayer = this.crearCapaPuntos(
      { forma: "rombo", radios: RADIOS_FICHA, visible: false },
      (f) => this.obtenerColorAgua(f),
    );
    this.fichaAlcLayer = this.crearCapaPuntos(
      { forma: "rombo", radios: RADIOS_FICHA, visible: false },
      (f) => this.obtenerColorDesague(f),
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
      target: this.mapaEl.nativeElement,
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

  private crearCapaPuntos(
    opciones: {
      forma: FormaPunto;
      radios: typeof RADIOS_LECTURA;
      visible: boolean;
    },
    colorDe: (punto: FeatureLike) => string | null,
  ): VectorLayer<VectorSource> {
    return new VectorLayer({
      source: new VectorSource(),
      visible: opciones.visible,
      style: (punto) => {
        const color = colorDe(punto);
        if (!color) return null as any;
        return this.estilos.punto({
          forma: opciones.forma,
          color: color,
          zoom: this.map?.getView().getZoom() ?? 14,
          seleccionado: punto === this.featureSeleccionado,
          etiqueta: punto.get("codcliente") || punto.get("nroSuministro"),
          ...opciones.radios,
        });
      },
    });
  }

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

  private initClick(): void {
    this.map?.on("singleclick", (evt) => {
      if (estaUsandoHerramientas(this.map!)) return;
      let clickedLayer: BaseLayer | null = null;
      const feature = this.map!.forEachFeatureAtPixel(
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

  private seleccionarFeature(feature: Feature, tipo: TipoPopup): void {
    this.controladorGis?.cerrarPopupGis();
    this.tipoPopup = tipo;
    this.featureSeleccionado = feature;
    this.refrescarCapasVector();
    this.lecturaSeleccionada = feature.getProperties() as RegistroLectura;
    this.cargarDatosPopup(this.lecturaSeleccionada);

    if (this.mostrarSearchPanel) {
      this.buscadorEstabaAbierto = true;
      this.mostrarSearchPanel = false;
    }
  }

  setBaseLayer(id: string): void {
    this.baseActive = this.baseActive === id ? null : id;
    this.osmLayer?.setVisible(this.baseActive === "osm");
    this.satelitalLayer?.setVisible(this.baseActive === "satelital");
  }

  toggleLayer(layer: { id: string; active: boolean }): void {
    layer.active = !layer.active;
    this.registroCapas[layer.id]?.setVisible(layer.active);

    if (layer.id === "usuarios" && layer.active) {
      const src = this.lecturasLayer?.getSource();
      if (!src || src.getFeatures().length === 0 || this.isBusquedaActiva) {
        this.cargarUsuariosCapa(true);
      }
    }
  }

  isCapaUsuariosActiva(): boolean {
    const layer = this.commercialLayers?.find((l) => l.id === "usuarios");
    return !!(layer && layer.active);
  }

  onSucursalChange(): void {
    if (this.isCapaUsuariosActiva()) {
      this.cargarUsuariosCapa(true);
    }
  }

  cargarUsuariosCapa(fitBounds = true): void {
    const codsuc = this.selectedSucursal?.codsuc || '001';
    this.cargando = true;
    this.isBusquedaActiva = false;
    this.resultadoBusquedaOriginalJson = undefined;

    this.busquedaAvanzadaService.buscarClientesAvanzada({
      codsuc: codsuc,
      inicio: 1,
      nropagina: 2500
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (resp) => {
        this.cargando = false;
        const clientes = resp?.data || [];
        if (clientes.length > 0) {
          this.mostrarSoloRegistros(clientes as any);
          if (fitBounds) {
            this.acercarARegistros(clientes as any);
          }
          this.avisar("success", "Capa Usuarios", `Se cargaron ${clientes.length} usuarios en el mapa.`);
        } else {
          this.avisar("warn", "Aviso", "No se encontraron usuarios para la sucursal seleccionada.");
        }
      },
      error: (err) => {
        this.cargando = false;
        console.error("Error al cargar usuarios de la capa:", err);
        this.avisar("error", "Error", "Ocurrió un error al cargar los usuarios.");
      }
    });
  }

  private capasComercialesConsultables(): CapaConsultable[] {
    return [
      { rol: "rutaLectura", capa: this.rutaLecturaLayer },
      { rol: "lotes", capa: this.lotesLayer },
      { rol: "calles", capa: this.callesLayer },
      { rol: "sectoresComerciales", capa: this.sectoresComercialesLayer },
    ];
  }

  activarCapasPorDefectoBusqueda(): void {
    const capasActivar = ["usuarios", "lotes", "caja_agua", "ficha_alc", "acometida", "acc_alc"];
    this.commercialLayers.forEach((c) => {
      if (capasActivar.includes(c.id)) {
        c.active = true;
        this.registroCapas[c.id]?.setVisible(true);
      }
    });
  }

  /**
   * Desactiva las capas de detalle secundario y mantiene activas únicamente las capas permitidas
   * (por defecto: 'usuarios' y 'lotes').
   */
  desactivarCapasSecundarias(capasPermitidas: string[] = ['usuarios', 'lotes']): void {
    this.commercialLayers.forEach((c) => {
      const debeEstarActiva = capasPermitidas.includes(c.id);
      if (c.active !== debeEstarActiva) {
        c.active = debeEstarActiva;
        this.registroCapas[c.id]?.setVisible(debeEstarActiva);
      }
    });
  }

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
    const srcUsuarios = this.lecturasLayer?.getSource();
    const srcCajaAgua = this.cajaAguaLayer?.getSource();
    if (!srcUsuarios || !srcCajaAgua) return;

    if (
      srcUsuarios.getFeatures().length === 0 &&
      srcCajaAgua.getFeatures().length === 0
    ) {
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
        ?.getView()
        .fit(extent, { duration: 800, maxZoom: 18, padding: [60, 60, 60, 60] });
    }
  }

  private limpiarCapas(): void {
    this.capasVector.forEach((capa) => capa?.getSource()?.clear());
    this.controladorGis?.quitarPredio();
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;
    this.totalLecturas = 0;
    this.totalSinCoordenadas = 0;
  }

  private refrescarCapasVector(): void {
    this.capasVector.forEach((capa) => capa?.changed());
  }

  private mostrarSoloRegistros(registros: RegistroLectura[]): void {
    this.guardarResultadoOriginal();
    this.resultadoBusquedaJson = registros;
    this.actualizarCapasComerciales(true);
    this.acercarARegistros(registros);
  }

  private guardarResultadoOriginal(): void {
    if (this.isBusquedaActiva) return;
    this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
    this.isBusquedaActiva = true;
  }

  private mostrarPopupSinPunto(registro: RegistroLectura, activarDetalles: boolean = false): void {
    this.controladorGis?.cerrarPopupGis();
    this.lecturaSeleccionada = registro;
    this.cargarDatosPopup(registro);
    if (activarDetalles) {
      this.activarCapasPorDefectoBusqueda();
    }
    this.centrarEnUsuario(registro);
    this.controladorGis?.marcarPredio(this.codigoDe(registro));

    if (this.mostrarSearchPanel) {
      this.buscadorEstabaAbierto = true;
      this.mostrarSearchPanel = false;
    }
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

  private codigoDe(registro: any): string {
    if (!registro) return "";
    return String(
      registro["codcliente"] || registro["nroSuministro"] || "",
    ).trim();
  }

  private acercarAPunto(punto: Feature): void {
    const geometria = punto.getGeometry();
    if (!geometria) return;
    this.map?.getView().animate({
      center: getCenter(geometria.getExtent()),
      zoom: ZOOM_PREDIO,
      duration: 800,
    });
  }

  private centrarEnUsuario(registro: RegistroLectura): void {
    const coordenada = extraerCoordenada(registro, ORIGENES_COORDENADA.usuario)
                    ?? extraerCoordenada(registro, ORIGENES_COORDENADA.agua)
                    ?? extraerCoordenada(registro, ORIGENES_COORDENADA.predio);
    if (coordenada) {
      this.map
        ?.getView()
        .animate({ center: coordenada, zoom: 18, duration: 600 });
    }
  }

  private acercarARegistros(registros: any[]): void {
    if (!registros || registros.length === 0) return;

    // 1. Extraer coordenadas válidas de los registros
    const coords: [number, number][] = [];
    for (const r of registros) {
      const c = extraerCoordenada(r, ORIGENES_COORDENADA.usuario)
             ?? extraerCoordenada(r, ORIGENES_COORDENADA.agua)
             ?? extraerCoordenada(r, ORIGENES_COORDENADA.predio)
             ?? extraerCoordenada(r, ORIGENES_COORDENADA.desague);
      if (c && isFinite(c[0]) && isFinite(c[1]) && (c[0] !== 0 || c[1] !== 0)) {
        coords.push(c);
      }
    }

    let extent: number[] | null = null;
    if (coords.length > 0) {
      let minX = coords[0][0], minY = coords[0][1], maxX = coords[0][0], maxY = coords[0][1];
      for (const [x, y] of coords) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      extent = [minX, minY, maxX, maxY];
    } else {
      const srcUsr = this.lecturasLayer?.getSource();
      const srcCaja = this.cajaAguaLayer?.getSource();
      if (srcUsr && srcUsr.getFeatures().length > 0) extent = srcUsr.getExtent();
      if (srcCaja && srcCaja.getFeatures().length > 0) {
        extent = extent ? extend(extent, srcCaja.getExtent()) : srcCaja.getExtent();
      }
    }

    if (!extent || !isFinite(extent[0])) return;

    const diffX = Math.abs(extent[2] - extent[0]);
    const diffY = Math.abs(extent[3] - extent[1]);
    if (diffX < 0.0001 && diffY < 0.0001) {
      this.map?.getView().animate({
        center: [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2],
        zoom: 18,
        duration: 800
      });
    } else {
      this.map?.getView().fit(extent, {
        duration: 800,
        maxZoom: 18,
        padding: [80, 80, 80, 80]
      });
    }
  }

  abrirBusqueda(): void {
    this.mostrarSearchPanel = true;
    this.tabActivaBuscador = 'usuario';
    this.searchSuministro = "";
    this.searchDniRuc = "";
    this.searchNombre = "";
    this.searchCatastral = "";
    this.refrescarCapasVector();
  }

  toggleBusqueda(): void {
    this.mostrarSearchPanel = !this.mostrarSearchPanel;
    if (this.mostrarSearchPanel) {
      if (this.lecturaSeleccionada) {
        this.lecturaSeleccionada = null;
        this.featureSeleccionado = null;
        this.datosClientePopup = null;
        this.imagenesPopup = [];
      }
      this.buscadorEstabaAbierto = false;
      this.refrescarCapasVector();
    }
  }

  abrirBusquedaAvanzada(): void {
    this.mostrarBusquedaAvanzadaModal = true;
  }

  onClienteAvanzadoSeleccionado(cliente: any): void {
    this.mostrarBusquedaAvanzadaModal = false;
    this.mostrarSearchPanel = true;
    if (cliente?.codcliente) {
      this.searchSuministro = String(cliente.codcliente);
      this.buscarPorOpcion(1);
    }
  }

  setTabBuscador(tab: string): void {
    this.tabActivaBuscador = tab;
    this.resultadosTab = [];

    // Al cambiar de pestaña/filtro se desactivan las capas secundarias y solo se mantienen usuarios y lotes
    if (tab === 'calles') {
      this.desactivarCapasSecundarias(['usuarios', 'lotes', 'calles']);
    } else {
      this.desactivarCapasSecundarias(['usuarios', 'lotes']);
    }

    if (!this.resultadoBusquedaJson || this.resultadoBusquedaJson.length === 0) {
      if (['categoria_usuario', 'tipo_usuario', 'diam_conex', 'est_conexion'].includes(tab)) {
        this.cargarMuestraClientesParaFiltro();
      }
    } else {
      this.refrescarCapasVector();
    }
  }

  activarCapaPorId(id: string): void {
    const layer = this.commercialLayers.find((c) => c.id === id);
    if (layer && !layer.active) {
      layer.active = true;
      this.registroCapas[id]?.setVisible(true);
    }
  }

  buscarPorCalle(): void {
    const calle = this.searchNombreCalle.trim();
    if (!calle) {
      this.avisar("warn", "Campo vacío", "Por favor ingrese el nombre de la calle.");
      return;
    }
    this.cargando = true;
    this.busquedaAvanzadaService.buscarClientesAvanzada({
      codsuc: this.selectedSucursal?.codsuc || 'ALL',
      codcalle: calle,
      inicio: 1,
      nropagina: 300
    }).subscribe({
      next: (resp) => {
        this.cargando = false;
        const clientes = resp?.data || [];
        this.resultadosTab = clientes;
        this.filtroTextoCalle = '';
        this.paginaCalleActual = 1;
        this.resultadosCalleFiltrados = [...clientes];
        if (clientes.length > 0) {
          this.desactivarCapasSecundarias(['usuarios', 'lotes', 'calles']);
          this.mostrarSoloRegistros(clientes as any);
          this.avisar("success", "Calle", `Se encontraron ${clientes.length} usuarios en "${calle}".`);
        } else {
          this.avisar("warn", "Sin resultados", `No se encontraron usuarios en la calle "${calle}".`);
        }
      },
      error: () => {
        this.cargando = false;
        this.avisar("error", "Error", "Ocurrió un error al buscar por calle.");
      }
    });
  }

  filtrarResultadosCalle(): void {
    const txt = this.filtroTextoCalle.trim().toUpperCase();
    if (!txt) {
      this.resultadosCalleFiltrados = [...this.resultadosTab];
    } else {
      this.resultadosCalleFiltrados = this.resultadosTab.filter((c: any) => {
        const sum = String(c.codcliente || '').toUpperCase();
        const prop = String(c.propietario || '').toUpperCase();
        const nro = String(c.nrocalle || '').toUpperCase();
        const mza = String(c.codmza || '').toUpperCase();
        const lote = String(c.nrolote || '').toUpperCase();
        return sum.includes(txt) || prop.includes(txt) || nro.includes(txt) || mza.includes(txt) || lote.includes(txt);
      });
    }
    this.paginaCalleActual = 1;
  }

  getClientesCallePaginados(): any[] {
    const inicio = (this.paginaCalleActual - 1) * this.pageSizeCalle;
    return this.resultadosCalleFiltrados.slice(inicio, inicio + this.pageSizeCalle);
  }

  get totalPaginasCalle(): number {
    return Math.ceil(this.resultadosCalleFiltrados.length / this.pageSizeCalle) || 1;
  }

  cambiarPaginaCalle(delta: number): void {
    const nueva = this.paginaCalleActual + delta;
    if (nueva >= 1 && nueva <= this.totalPaginasCalle) {
      this.paginaCalleActual = nueva;
    }
  }

  buscarPorManzana(): void {
    if (!this.searchSector && !this.searchManzana && !this.searchLote) {
      this.avisar("warn", "Campos vacíos", "Por favor ingrese al menos el Sector, Manzana o Lote.");
      return;
    }
    this.cargando = true;
    this.busquedaAvanzadaService.buscarClientesAvanzada({
      codsuc: this.selectedSucursal?.codsuc || 'ALL',
      codsector: this.searchSector.trim() || 'ALL',
      codmza: this.searchManzana.trim() || 'ALL',
      nrolote: this.searchLote.trim() || 'ALL',
      inicio: 1,
      nropagina: 100
    }).subscribe({
      next: (resp) => {
        this.cargando = false;
        const clientes = resp?.data || [];
        this.resultadosTab = clientes;
        if (clientes.length > 0) {
          this.desactivarCapasSecundarias(['usuarios', 'lotes']);
          this.mostrarSoloRegistros(clientes as any);
          this.avisar("success", "Manzana", `Se encontraron ${clientes.length} usuarios.`);
        } else {
          this.avisar("warn", "Sin resultados", "No se encontraron usuarios en la manzana/sector indicado.");
        }
      },
      error: () => {
        this.cargando = false;
        this.avisar("error", "Error", "Ocurrió un error al buscar por manzana.");
      }
    });
  }

  buscarPorCajaAgua(): void {
    const med = this.searchMedidor.trim();
    if (!med) {
      this.avisar("warn", "Campo vacío", "Por favor ingrese el número de medidor o ficha.");
      return;
    }
    this.cargando = true;
    this.busquedaAvanzadaService.buscarClientesAvanzada({
      codsuc: this.selectedSucursal?.codsuc || 'ALL',
      nromedidor: med,
      inicio: 1,
      nropagina: 100
    }).subscribe({
      next: (resp) => {
        this.cargando = false;
        const clientes = resp?.data || [];
        this.resultadosTab = clientes;
        if (clientes.length > 0) {
          this.desactivarCapasSecundarias(['usuarios', 'lotes', 'caja_agua', 'ficha_alc']);
          this.mostrarSoloRegistros(clientes as any);
          if (clientes.length === 1) {
            this.mostrarSearchPanel = false;
            const primer = clientes[0];
            const codigo = this.codigoDe(primer);
            const punto = this.buscarPuntoPorCodigo(this.lecturasLayer, codigo);
            if (punto) {
              this.seleccionarFeature(punto, "lectura");
              this.acercarAPunto(punto);
              this.controladorGis?.marcarPredio(codigo);
            } else {
              this.mostrarPopupSinPunto(primer as any, false);
            }
          }
          this.avisar("success", "Caja Agua/Alc.", `Se encontraron ${clientes.length} registros asociados.`);
        } else {
          this.avisar("warn", "Sin resultados", `No se encontraron registros con medidor "${med}".`);
        }
      },
      error: () => {
        this.cargando = false;
        this.avisar("error", "Error", "Ocurrió un error al buscar por medidor.");
      }
    });
  }

  seleccionarResultadoTab(r: any): void {
    this.buscadorEstabaAbierto = true;
    this.mostrarSearchPanel = false;
    const codigo = this.codigoDe(r);
    this.searchSuministro = codigo;
    const punto = this.buscarPuntoPorCodigo(this.lecturasLayer, codigo);
    if (punto) {
      this.seleccionarFeature(punto, "lectura");
      this.acercarAPunto(punto);
      this.controladorGis?.marcarPredio(codigo);
    } else {
      this.mostrarPopupSinPunto(r, false);
    }
  }

  limpiarFiltrosTarifa(): void {
    this.tarifasFiltro.forEach(t => t.checked = false);
    this.aplicarFiltrosCapas();
  }

  limpiarFiltrosTipo(): void {
    this.tiposUsuarioFiltro.forEach(t => t.checked = false);
    this.aplicarFiltrosCapas();
  }

  limpiarFiltrosDiametro(): void {
    this.diametrosFiltro.forEach(d => d.checked = false);
    this.aplicarFiltrosCapas();
  }

  limpiarFiltrosAgua(): void {
    this.estadosAguaFiltro.forEach(e => e.checked = false);
    this.aplicarFiltrosCapas();
  }

  limpiarFiltrosDesague(): void {
    this.estadosDesagueFiltro.forEach(e => e.checked = false);
    this.aplicarFiltrosCapas();
  }

  private cargarMuestraClientesParaFiltro(): void {
    this.cargandoFiltros = true;
    this.sinResultadosFiltros = false;
    this.busquedaAvanzadaService.buscarClientesAvanzada({
      codsuc: this.selectedSucursal?.codsuc || 'ALL',
      inicio: 1,
      nropagina: 1000
    }).subscribe({
      next: (resp) => {
        this.cargandoFiltros = false;
        const clientes = resp?.data || [];
        if (clientes.length > 0) {
          this.mostrarSoloRegistros(clientes as any);
          this.aplicarFiltrosCapas();
        } else {
          this.sinResultadosFiltros = true;
          this.avisar("warn", "Sin datos", "No se encontraron registros de clientes para filtrar.");
        }
      },
      error: () => {
        this.cargandoFiltros = false;
        this.sinResultadosFiltros = true;
        this.avisar("error", "Error", "Ocurrió un error al cargar los puntos de clientes.");
      }
    });
  }

  private obtenerColorPunto(punto: FeatureLike): string | null {
    const tarifasSeleccionadas = this.tarifasFiltro.filter(t => t.checked).map(t => t.label.toUpperCase());
    const tiposSeleccionados = this.tiposUsuarioFiltro.filter(t => t.checked).map(t => t.label.toUpperCase());
    const diamsSeleccionados = this.diametrosFiltro.filter(d => d.checked).map(d => d.label.toUpperCase());
    const estadosAguaSeleccionados = this.estadosAguaFiltro.filter(e => e.checked).map(e => e.label.toUpperCase());
    const estadosDesagueSeleccionados = this.estadosDesagueFiltro.filter(e => e.checked).map(e => e.label.toUpperCase());

    const cat = String(punto.get("nomtar") || punto.get("catetar") || punto.get("tarifas") || punto.get("descatetar") || "").toUpperCase();
    const tipo = String(punto.get("tipousuario") || punto.get("destipousuario") || punto.get("tiposervicio") || "").toUpperCase();
    const estServ = String(punto.get("estadoservicio") || punto.get("descripcionestservicio") || punto.get("desestadoservicio") || "").toUpperCase();
    const diam = String(punto.get("desdiametro_a") || punto.get("desdiametro_d") || punto.get("diametro") || "").toUpperCase();
    const estA = String(punto.get("desestadoservicio") || punto.get("descripcionestservicio") || punto.get("estadoservicio") || punto.get("estado_agua") || "").toUpperCase();
    const estD = String(punto.get("desestado_desague") || punto.get("estado_desague") || punto.get("estadoservicio_d") || punto.get("destiposervicio") || punto.get("tiposervicio") || "").toUpperCase();

    // 1. Filtrado si hay tarifas seleccionadas
    if (tarifasSeleccionadas.length > 0) {
      const coincide = tarifasSeleccionadas.some(t => {
        if (t === 'COMERCIAL') return cat.includes('COM') || cat === '002' || cat === '02' || cat === '2';
        if (t === 'DOMESTICO SUBSIDIO') return cat.includes('SUBSID') || cat === '006' || cat === '06' || cat === '6';
        if (t === 'INDUSTRIAL') return cat.includes('IND') || cat === '003' || cat === '03' || cat === '3';
        if (t === 'DOMESTICO') return (cat.includes('DOM') || cat === '001' || cat === '01' || cat === '1') && !cat.includes('SUBSID');
        if (t === 'ESTATAL') return cat.includes('EST') || cat === '004' || cat === '04' || cat === '4';
        if (t === 'SOCIAL') return cat.includes('SOC') || cat === '005' || cat === '05' || cat === '5';
        return cat.includes(t);
      });
      if (!coincide) return null;
    }

    // 2. Filtrado por Tipo de usuario
    if (tiposSeleccionados.length > 0) {
      const coincideTipo = tiposSeleccionados.some(t => {
        if (t === 'REAL') return tipo.includes('REAL') || tipo.includes('ACT') || tipo === '001' || tipo === '01' || tipo === '1' || estServ.includes('ACT') || estServ === '001' || (!tipo && !estServ.includes('CORT') && !estServ.includes('CLAUS'));
        if (t === 'POTENCIAL') return tipo.includes('POTEN') || tipo === '002' || tipo === '02' || tipo === '2';
        if (t === 'FACTIBLE') return tipo.includes('FACT') || tipo === '003' || tipo === '03' || tipo === '3';
        if (t === 'ANULADO') return tipo.includes('ANUL') || tipo === '004' || tipo === '04' || tipo === '4' || estServ.includes('ANUL');
        return tipo.includes(t);
      });
      if (!coincideTipo) return null;
    }

    // 3. Filtrado por Diámetro
    if (diamsSeleccionados.length > 0) {
      const coincideDiam = diamsSeleccionados.some(d => diam.includes(d));
      if (!coincideDiam) return null;
    }

    // 4. Filtrado por Estado Agua
    if (estadosAguaSeleccionados.length > 0) {
      const coincideAgua = estadosAguaSeleccionados.some(e => {
        if (e.includes('SERV. ACT')) return estA.includes('ACT') || estA === '001' || estA === '000' || estA === '01';
        if (e.includes('SIN SERV. SOLI')) return estA.includes('SOLI') || estA === '002' || estA === '02';
        if (e === 'CORTADO') return estA.includes('CORT') || estA === '003' || estA === '03';
        if (e === 'CLAUSURADO') return estA.includes('CLAUS') || estA === '004' || estA === '04';
        if (e === 'LEVANTADO') return estA.includes('LEVANT') || estA === '005' || estA === '05';
        return estA.includes(e);
      });
      if (!coincideAgua) return null;
    }

    // 5. Filtrado por Estado Desagüe
    if (estadosDesagueSeleccionados.length > 0) {
      const coincideDesague = estadosDesagueSeleccionados.some(e => {
        if (e === 'ACTIVA') return estD.includes('ACT') || estD === '001' || estD === '000' || estD === '01';
        if (e.includes('HABILITADA')) return estD.includes('HABILIT') || estD.includes('CAJA') || estD.includes('ALC');
        if (e.includes('SIN CONEXION')) return estD.includes('SIN') || estD === '002' || estD === '02';
        if (e === 'ANULADA') return estD.includes('ANUL') || estD === '004' || estD === '04';
        return estD.includes(e);
      });
      if (!coincideDesague) return null;
    }

    // 6. Coloreado según pestaña activa
    if (this.tabActivaBuscador === 'categoria_usuario') {
      if (cat.includes('COM') || cat === '002' || cat === '02') return '#ef4444'; // Rojo Comercial
      if (cat.includes('SUBSID') || cat === '006' || cat === '06') return '#0ea5e9'; // Celeste Doméstico Subsidio
      if (cat.includes('IND') || cat === '003' || cat === '03') return '#eab308'; // Amarillo Industrial
      if (cat.includes('DOM') || cat === '001' || cat === '01') return '#22c55e'; // Verde Doméstico
      if (cat.includes('EST') || cat === '004' || cat === '04') return '#a855f7'; // Morado Estatal
      if (cat.includes('SOC') || cat === '005' || cat === '05') return '#00e5ff'; // Cyan Social
      return '#22c55e';
    }

    if (this.tabActivaBuscador === 'tipo_usuario') {
      if (tipo.includes('REAL') || tipo === '001' || estServ.includes('ACT') || estServ === '001') return '#22c55e'; // Verde Real
      if (tipo.includes('POTEN') || tipo === '002') return '#0ea5e9'; // Azul Potencial
      if (tipo.includes('FACT') || tipo === '003') return '#eab308'; // Amarillo Factible
      if (tipo.includes('ANUL') || tipo === '004' || estServ.includes('ANUL')) return '#f97316'; // Naranja Anulado
      return '#22c55e';
    }

    if (this.tabActivaBuscador === 'est_conexion') {
      if (estA.includes('ACT') || estA === '001' || estA === '000') return '#22c55e';
      if (estA.includes('SOLI') || estA === '002') return '#eab308';
      if (estA.includes('CORT') || estA === '003') return '#ef4444';
      if (estA.includes('CLAUS') || estA === '004') return '#f97316';
      if (estA.includes('LEVANT') || estA === '005') return '#94a3b8';
      return '#22c55e';
    }

    return colorPorEstadoLectura(punto.get("estadolectura"));
  }

  private obtenerColorAgua(punto: FeatureLike): string | null {
    const estadosAguaSeleccionados = this.estadosAguaFiltro.filter(e => e.checked).map(e => e.label.toUpperCase());
    const est = String(punto.get("desestadoservicio") || punto.get("descripcionestservicio") || punto.get("estadoservicio") || punto.get("estado_agua") || "").toUpperCase();

    if (estadosAguaSeleccionados.length > 0) {
      const coincide = estadosAguaSeleccionados.some(e => {
        if (e.includes('SERV. ACT')) return est.includes('ACT') || est === '001' || est === '000' || est === '01';
        if (e.includes('SIN SERV. SOLI')) return est.includes('SOLI') || est === '002' || est === '02';
        if (e === 'CORTADO') return est.includes('CORT') || est === '003' || est === '03';
        if (e === 'CLAUSURADO') return est.includes('CLAUS') || est === '004' || est === '04';
        if (e === 'LEVANTADO') return est.includes('LEVANT') || est === '005' || est === '05';
        return est.includes(e);
      });
      if (!coincide) return null;
    }

    if (est.includes('ACT') || est === '001' || est === '000') return '#22c55e';
    if (est.includes('SOLI') || est === '002') return '#eab308';
    if (est.includes('CORT') || est === '003') return '#ef4444';
    if (est.includes('CLAUS') || est === '004') return '#f97316';
    if (est.includes('LEVANT') || est === '005') return '#94a3b8';
    return COLOR_FICHA_AGUA;
  }

  private obtenerColorDesague(punto: FeatureLike): string | null {
    const estadosDesagueSeleccionados = this.estadosDesagueFiltro.filter(e => e.checked).map(e => e.label.toUpperCase());
    const est = String(punto.get("desestado_desague") || punto.get("estado_desague") || punto.get("estadoservicio_d") || punto.get("destiposervicio") || punto.get("tiposervicio") || "").toUpperCase();

    if (estadosDesagueSeleccionados.length > 0) {
      const coincide = estadosDesagueSeleccionados.some(e => {
        if (e === 'ACTIVA') return est.includes('ACT') || est === '001' || est === '000' || est === '01';
        if (e.includes('HABILITADA')) return est.includes('HABILIT') || est.includes('CAJA') || est.includes('ALC');
        if (e.includes('SIN CONEXION')) return est.includes('SIN') || est === '002' || est === '02';
        if (e === 'ANULADA') return est.includes('ANUL') || est === '004' || est === '04';
        return est.includes(e);
      });
      if (!coincide) return null;
    }

    if (est.includes('HABILIT') || est.includes('CAJA')) return '#a855f7';
    if (est.includes('SIN')) return '#eab308';
    if (est.includes('ANUL')) return '#ef4444';
    return '#22c55e';
  }

  aplicarFiltrosCapas(): void {
    const hayFiltrosTarifas = this.tarifasFiltro.some(t => t.checked);
    const hayFiltrosTipos = this.tiposUsuarioFiltro.some(t => t.checked);
    const hayFiltrosDiams = this.diametrosFiltro.some(d => d.checked);
    const hayFiltrosAgua = this.estadosAguaFiltro.some(e => e.checked);
    const hayFiltrosDesague = this.estadosDesagueFiltro.some(e => e.checked);

    const hayFiltros = hayFiltrosTarifas || hayFiltrosTipos || hayFiltrosDiams || hayFiltrosAgua || hayFiltrosDesague;

    if (!hayFiltros) {
      this.cargandoFiltros = false;
      this.sinResultadosFiltros = false;
      if (this.resultadoBusquedaOriginalJson !== undefined) {
        this.resultadoBusquedaJson = this.resultadoBusquedaOriginalJson;
      }
      this.resultadosTab = this.resultadoBusquedaJson || [];
      this.desactivarCapasSecundarias(['usuarios', 'lotes']);
      this.refrescarCapasVector();
      return;
    }

    this.cargandoFiltros = true;
    this.sinResultadosFiltros = false;
    this.desactivarCapasSecundarias(['usuarios', 'lotes']);
    this.guardarResultadoOriginal();
    const base = this.resultadoBusquedaOriginalJson || this.resultadoBusquedaJson || [];

    if (base.length === 0) {
      this.cargarMuestraClientesParaFiltro();
      return;
    }

    setTimeout(() => {
      this.resultadosTab = base.filter((r: any) => {
        let f1 = true, f2 = true, f3 = true, f4 = true, f5 = true;
        const cat = String(r.nomtar || r.catetar || r.tarifas || r.descatetar || '').toUpperCase();
        const tipo = String(r.tipousuario || r.destipousuario || r.tiposervicio || '').toUpperCase();
        const estServ = String(r.estadoservicio || r.descripcionestservicio || r.desestadoservicio || '').toUpperCase();
        const diam = String(r.desdiametro_a || r.desdiametro_d || r.diametro || '').toUpperCase();
        const estA = String(r.desestadoservicio || r.descripcionestservicio || r.estadoservicio || r.estado_agua || '').toUpperCase();
        const estD = String(r.desestado_desague || r.estado_desague || r.estadoservicio_d || r.destiposervicio || r.tiposervicio || '').toUpperCase();

        if (hayFiltrosTarifas) {
          f1 = this.tarifasFiltro.filter(t => t.checked).some(t => {
            if (t.label === 'COMERCIAL') return cat.includes('COM') || cat === '002' || cat === '02' || cat === '2';
            if (t.label === 'DOMESTICO SUBSIDIO') return cat.includes('SUBSID') || cat === '006' || cat === '06' || cat === '6';
            if (t.label === 'INDUSTRIAL') return cat.includes('IND') || cat === '003' || cat === '03' || cat === '3';
            if (t.label === 'DOMESTICO') return (cat.includes('DOM') || cat === '001' || cat === '01' || cat === '1') && !cat.includes('SUBSID');
            if (t.label === 'ESTATAL') return cat.includes('EST') || cat === '004' || cat === '04' || cat === '4';
            if (t.label === 'SOCIAL') return cat.includes('SOC') || cat === '005' || cat === '05' || cat === '5';
            return cat.includes(t.label);
          });
        }

        if (hayFiltrosTipos) {
          f2 = this.tiposUsuarioFiltro.filter(t => t.checked).some(t => {
            if (t.label === 'REAL') return tipo.includes('REAL') || tipo.includes('ACT') || tipo === '001' || tipo === '01' || tipo === '1' || estServ.includes('ACT') || estServ === '001' || (!tipo && !estServ.includes('CORT') && !estServ.includes('CLAUS'));
            if (t.label === 'POTENCIAL') return tipo.includes('POTEN') || tipo === '002' || tipo === '02' || tipo === '2';
            if (t.label === 'FACTIBLE') return tipo.includes('FACT') || tipo === '003' || tipo === '03' || tipo === '3';
            if (t.label === 'ANULADO') return tipo.includes('ANUL') || tipo === '004' || tipo === '04' || tipo === '4' || estServ.includes('ANUL');
            return tipo.includes(t.label);
          });
        }

        if (hayFiltrosDiams) {
          f3 = this.diametrosFiltro.filter(d => d.checked).some(d => diam.includes(d.label.toUpperCase()));
        }

        if (hayFiltrosAgua) {
          f4 = this.estadosAguaFiltro.filter(e => e.checked).some(e => {
            if (e.label.includes('SERV. ACT')) return estA.includes('ACT') || estA === '001' || estA === '000' || estA === '01';
            if (e.label.includes('SIN SERV. SOLI')) return estA.includes('SOLI') || estA === '002' || estA === '02';
            if (e.label === 'CORTADO') return estA.includes('CORT') || estA === '003' || estA === '03';
            if (e.label === 'CLAUSURADO') return estA.includes('CLAUS') || estA === '004' || estA === '04';
            if (e.label === 'LEVANTADO') return estA.includes('LEVANT') || estA === '005' || estA === '05';
            return estA.includes(e.label);
          });
        }

        if (hayFiltrosDesague) {
          f5 = this.estadosDesagueFiltro.filter(e => e.checked).some(e => {
            if (e.label === 'ACTIVA') return estD.includes('ACT') || estD === '001' || estD === '000' || estD === '01';
            if (e.label.includes('HABILITADA')) return estD.includes('HABILIT') || estD.includes('CAJA') || estD.includes('ALC');
            if (e.label.includes('SIN CONEXION')) return estD.includes('SIN') || estD === '002' || estD === '02';
            if (e.label === 'ANULADA') return estD.includes('ANUL') || estD === '004' || estD === '04';
            return estD.includes(e.label);
          });
        }

        return f1 && f2 && f3 && f4 && f5;
      });

      this.refrescarCapasVector();
      this.cargandoFiltros = false;

      if (this.resultadosTab.length === 0) {
        this.sinResultadosFiltros = true;
        this.avisar("warn", "Sin resultados", "No se encontraron usuarios con los filtros seleccionados.");
      } else {
        this.sinResultadosFiltros = false;
        this.acercarARegistros(this.resultadosTab);
        this.avisar("info", "Filtro activo", `Se muestran ${this.resultadosTab.length} cliente(s) en el mapa.`);
      }
    }, 60);
  }

  cerrarBusqueda(): void {
    this.buscadorEstabaAbierto = false;
    this.mostrarSearchPanel = false;
    this.reiniciarBusqueda();
  }

  reiniciarBusqueda(): void {
    this.buscadorEstabaAbierto = false;
    this.searchSuministro = "";
    this.searchDniRuc = "";
    this.searchNombre = "";
    this.searchCatastral = "";
    this.searchNombreCalle = "";
    this.filtroTextoCalle = "";
    this.paginaCalleActual = 1;
    this.resultadosCalleFiltrados = [];
    this.searchSector = "";
    this.searchManzana = "";
    this.searchLote = "";
    this.searchMedidor = "";
    this.resultadosTab = [];
    this.cerrarPopup();
    this.controladorGis?.quitarPredio();
    if (this.isBusquedaActiva) {
      this.isBusquedaActiva = false;
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
    this.limpiarURL();
  }

  buscarPorOpcion(op: number): void {
    let valor = "";
    if (op === 1) valor = String(this.searchSuministro || "").trim();
    else if (op === 2) valor = String(this.searchDniRuc || "").trim();
    else if (op === 3) valor = String(this.searchNombre || "").trim().toUpperCase();
    else if (op === 4) valor = String(this.searchCatastral || "").trim();

    if (!valor) {
      const nomCampo = op === 1 
        ? "el Nro. de Suministro" 
        : (op === 2 ? "el DNI o RUC" : (op === 3 ? "los Apellidos y nombres" : "el Nro. Catastral"));
      this.avisar("warn", "Campo vacío", `Por favor ingrese ${nomCampo} para buscar.`);
      return;
    }
    
    this.cargando = true;
    this.limpiarCapas();

    this.consultarCliente(valor, op).subscribe({
      next: (registros) => {
        this.cargando = false;
        this.resultadosTab = registros || [];
        if (!registros || registros.length === 0) {
          const criterio = op === 1 
            ? "código de suministro" 
            : (op === 2 ? "DNI o RUC" : (op === 3 ? "nombre o razón social" : "código catastral"));
          this.avisar("warn", "Aviso", `No se encontró ningún registro con ese ${criterio}.`);
          return;
        }

        if (op === 1) {
          // Nro. Suministro: Búsqueda específica de un predio donde sí se activan las capas de detalle
          const exacto = registros.find((r) => String(r.codcliente || '').trim() === valor) || registros[0];
          registros = [exacto];
          this.resultadosTab = registros;
          this.mostrarSearchPanel = false;
          this.activarCapasPorDefectoBusqueda();
          this.mostrarSoloRegistros(registros as any);

          const codigo = this.codigoDe(exacto);
          const punto = this.buscarPuntoPorCodigo(this.lecturasLayer, codigo);
          if (punto) {
            this.seleccionarFeature(punto, "lectura");
            this.acercarAPunto(punto);
            this.controladorGis?.marcarPredio(codigo);
          } else {
            this.mostrarPopupSinPunto(exacto as any, true);
          }
          return;
        }

        if (op === 4) {
          // Nro. Catastral: Predio único pero para otros filtros se desactivan las capas secundarias, manteniendo solo usuarios y lotes
          const exacto = registros.find((r) => {
            const cat = String(r.codcatastral || '').trim().replace(/[-\s]/g, '');
            const busq = valor.replace(/[-\s]/g, '');
            return cat.toLowerCase() === busq.toLowerCase();
          }) || registros[0];

          registros = [exacto];
          this.resultadosTab = registros;
          this.mostrarSearchPanel = false;
          this.desactivarCapasSecundarias(['usuarios', 'lotes']);
          this.mostrarSoloRegistros(registros as any);

          const codigo = this.codigoDe(exacto);
          const punto = this.buscarPuntoPorCodigo(this.lecturasLayer, codigo);
          if (punto) {
            this.seleccionarFeature(punto, "lectura");
            this.acercarAPunto(punto);
            this.controladorGis?.marcarPredio(codigo);
          } else {
            this.mostrarPopupSinPunto(exacto as any, false);
          }
          return;
        }

        // Para cualquier otro filtro (op === 2 DNI/RUC, op === 3 Nombre, etc.):
        // Desactivar capas secundarias y mantener únicamente usuarios y lotes
        this.desactivarCapasSecundarias(['usuarios', 'lotes']);
        this.mostrarSoloRegistros(registros as any);

        if (registros.length === 1) {
          this.mostrarSearchPanel = false;
          const codigo = this.codigoDe(registros[0]);
          const punto = this.buscarPuntoPorCodigo(this.lecturasLayer, codigo);
          if (punto) {
            this.seleccionarFeature(punto, "lectura");
            this.acercarAPunto(punto);
            this.controladorGis?.marcarPredio(codigo);
          } else {
            this.mostrarPopupSinPunto(registros[0] as any, false);
          }
        } else {
          this.mostrarSearchPanel = true;
          this.avisar("success", "Resultados", `Se encontraron ${registros.length} registros asociados.`);
        }
      },
      error: (err) => {
        this.cargando = false;
        if (err?.status === 401 || err?.status === 403) {
          this.avisar("error", "Acceso Denegado", "No tienes permisos para consultar las rutas de Vektors.");
        } else if (err?.status === 404) {
          this.avisar("error", "No Encontrado", "El servicio de Vektors no se encuentra disponible.");
        } else {
          this.avisar("error", "Error", "Ocurrió un error al cargar los datos del cliente.");
        }
      }
    });
  }

  cerrarPopup(): void {
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;
    this.refrescarCapasVector();
    this.datosClientePopup = null;
    this.imagenesPopup = [];
    this.limpiarURL();

    if (this.buscadorEstabaAbierto) {
      this.mostrarSearchPanel = true;
      this.buscadorEstabaAbierto = false;
    }
  }

  getDescripcionEstadoLectura(codigo: string): string {
    if (!codigo) return "-";
    return codigo;
  }

  private situacionMedidor(): string {
    return String(this.datosClientePopup?._medidor?.situacionmed ?? "").trim();
  }

  getEtiquetaMovimientoMedidor(): string {
    switch (this.situacionMedidor()) {
      case "2": return "F. Retiro";
      case "3": return "F. Reinstalación";
      default: return "F. Instalación";
    }
  }

  getFechaMovimientoMedidor(): string {
    const medidor: any = this.datosClientePopup?._medidor;
    switch (this.situacionMedidor()) {
      case "2": return formatoFechaCorta(medidor?.fecharetiro);
      case "3": return formatoFechaCorta(medidor?.fechareinst);
      default: return formatoFechaCorta(medidor?.fechainst || medidor?.fechainsmed);
    }
  }

  verMasInformacion(codcliente: string | undefined): void {
    if (!codcliente) return;
    this.ref = abrirConsultaUsuario(
      this.dialogService,
      codcliente,
      this.selectedSucursal?.codsuc || this.lecturaSeleccionada?.codsuc || this.datosClientePopup?.codsuc || "002"
    );
  }

  private cargarDatosPopup(lectura: RegistroLectura): void {
    this.imagenesPopup = [];
    this.datosClientePopup = null;
    this.cargandoImagenes = true;
    const codsuc = lectura.codsuc || this.selectedSucursal?.codsuc || "002";
    const codcliente = lectura.codcliente;

    if (!this.catastroService.urlAdministracion || this.catastroService.urlAdministracion.includes('undefined')) {
      this.catastroService.urlAdministracion = 'https://167.88.36.54:8889/vektors/backend/api-georeferencia/v1/vektors-catastro/';
    }

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
      catastro: this.catastroService
        .buscarClienteCatastro({
          codsuc: codsuc,
          codcliente: Number(codcliente),
        })
        .pipe(catchError(() => of({ data: [] } as any))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ imagenes, cliente, catastro }) => {
          this.cargandoImagenes = false;

          let catastroData: any = null;
          if (catastro?.data) {
            catastroData = Array.isArray(catastro.data) ? catastro.data[0] : catastro.data;
          }

          if (cliente) {
            this.datosClientePopup = {
              ...(cliente.clie || {}),
              ...(catastroData || {}),
              _predio: cliente.pred || {},
              _medidor: cliente.medidor_cliente || {},
              _conexionAgua: cliente.conx_agua || {},
              _conexionDesague: cliente.conx_desague || {},
              _calidad: cliente.calidad || {},
            };
          } else if (catastroData) {
            this.datosClientePopup = {
              ...catastroData,
              _predio: {},
              _medidor: {},
              _conexionAgua: {},
              _conexionDesague: {},
              _calidad: {},
            };
          }

          if (catastroData) {
            const lonVal = catastroData.longitud || catastroData.lon || this.lecturaSeleccionada.longitud || this.lecturaSeleccionada.lon || this.lecturaSeleccionada.lonpredio;
            const latVal = catastroData.latitud || catastroData.lat || this.lecturaSeleccionada.latitud || this.lecturaSeleccionada.lat || this.lecturaSeleccionada.latpredio;
            this.lecturaSeleccionada = {
              ...catastroData,
              ...this.lecturaSeleccionada,
              longitud: lonVal,
              latitud: latVal,
              lon: lonVal,
              lat: latVal,
              mesesdeuda: catastroData.mesesdeuda ?? this.lecturaSeleccionada.mesesdeuda,
              impmestotal: catastroData.impmestotal ?? this.lecturaSeleccionada.impmestotal,
              impdeudatotal: catastroData.impdeudatotal ?? this.lecturaSeleccionada.impdeudatotal,
              impintereses: catastroData.impintereses ?? this.lecturaSeleccionada.impintereses,
              impsaldorefin: catastroData.impsaldorefin ?? this.lecturaSeleccionada.impsaldorefin,
              telefono: catastroData.telefono || this.lecturaSeleccionada.telefono,
              email: catastroData.email || this.lecturaSeleccionada.email,
              inquilino: catastroData.inquilino || this.lecturaSeleccionada.inquilino,
              ruc: catastroData.ruc || this.lecturaSeleccionada.ruc,
              desdiametro_a: catastroData.desdiametro_a || this.lecturaSeleccionada.desdiametro_a,
              desdiametro_d: catastroData.desdiametro_d || this.lecturaSeleccionada.desdiametro_d,
              estadovma: catastroData.estadovma ?? this.lecturaSeleccionada.estadovma,
              unidaddom: catastroData.unidaddom ?? this.lecturaSeleccionada.unidaddom,
              unidadcom: catastroData.unidadcom ?? this.lecturaSeleccionada.unidadcom,
              unidadind: catastroData.unidadind ?? this.lecturaSeleccionada.unidadind,
              fechacontrato: catastroData.fechacontrato || this.lecturaSeleccionada.fechacontrato,
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
        error: () => {
          this.cargandoImagenes = false;
        },
      });
  }

  abrirStreetView(x?: unknown, y?: unknown): void {
    let finalX: any = x;
    let finalY: any = y;

    const esValido = (v: any) => v != null && v !== "" && !isNaN(Number(v)) && Number(v) !== 0;

    // 1. Si no se recibieron valores válidos, buscar en lecturaSeleccionada y datosClientePopup
    if (!esValido(finalX) || !esValido(finalY)) {
      const ls: any = this.lecturaSeleccionada || {};
      const dp: any = this.datosClientePopup || {};
      const pred: any = dp._predio || {};

      finalX = [ls.lon, ls.longitud, ls.lonpredio, ls.coord_x, ls.x,
                dp.lon, dp.longitud, dp.lonpredio, dp.coord_x, dp.x,
                pred.lonpredio, pred.lon, pred.coord_x, pred.x].find(esValido);

      finalY = [ls.lat, ls.latitud, ls.latpredio, ls.coord_y, ls.y,
                dp.lat, dp.latitud, dp.latpredio, dp.coord_y, dp.y,
                pred.latpredio, pred.lat, pred.coord_y, pred.y].find(esValido);
    }

    // 2. Extraer mediante utilitario de coordenadas
    if ((!esValido(finalX) || !esValido(finalY)) && this.lecturaSeleccionada) {
      const coordExtraida = extraerCoordenada(this.lecturaSeleccionada as any, ORIGENES_COORDENADA.usuario)
        ?? extraerCoordenada(this.lecturaSeleccionada as any, ORIGENES_COORDENADA.predio);
      if (coordExtraida) {
        finalX = coordExtraida[0];
        finalY = coordExtraida[1];
      }
    }

    // 3. Extraer desde datosClientePopup
    if ((!esValido(finalX) || !esValido(finalY)) && this.datosClientePopup) {
      const coordExtraida = extraerCoordenada(this.datosClientePopup as any, ORIGENES_COORDENADA.usuario)
        ?? extraerCoordenada(this.datosClientePopup as any, ORIGENES_COORDENADA.predio);
      if (coordExtraida) {
        finalX = coordExtraida[0];
        finalY = coordExtraida[1];
      }
    }

    // 4. Buscar geometría desde featureSeleccionado
    if ((!esValido(finalX) || !esValido(finalY)) && this.featureSeleccionado) {
      const geom = this.featureSeleccionado.getGeometry();
      if (geom && typeof (geom as any).getCoordinates === 'function') {
        const coords = (geom as any).getCoordinates();
        if (Array.isArray(coords) && coords.length >= 2) {
          finalX = coords[0];
          finalY = coords[1];
        }
      }
    }

    // 5. Buscar feature en la capa lecturas por código de cliente
    if ((!esValido(finalX) || !esValido(finalY)) && this.lecturaSeleccionada) {
      const cod = this.codigoDe(this.lecturaSeleccionada);
      if (cod) {
        const punto = this.buscarPuntoPorCodigo(this.lecturasLayer, cod);
        if (punto) {
          const geom = punto.getGeometry();
          if (geom && typeof (geom as any).getCoordinates === 'function') {
            const coords = (geom as any).getCoordinates();
            if (Array.isArray(coords) && coords.length >= 2) {
              finalX = coords[0];
              finalY = coords[1];
            }
          }
        }
      }
    }

    if (!esValido(finalX) || !esValido(finalY)) {
      this.avisar("warn", "Aviso", "No hay coordenadas válidas para abrir Street View.");
      return;
    }

    let lonLat: [number, number] | null = null;
    const numX = Number(finalX);
    const numY = Number(finalY);

    // Si viene en Web Mercator (EPSG:3857, valores absolutos > 2,000,000)
    if (Math.abs(numX) > 2000000 || Math.abs(numY) > 2000000) {
      lonLat = transform([numX, numY], 'EPSG:3857', WGS84) as [number, number];
    } else {
      lonLat = coordenadaLonLat(numX, numY, this.gis.proyeccionUtm);
    }

    if (!lonLat) {
      this.avisar("warn", "Aviso", "No hay coordenadas válidas para abrir Street View.");
      return;
    }

    // Inversión salvaguarda: si viene latitud en X y longitud en Y para Perú
    // En Perú: Latitud aprox [-19, 0], Longitud aprox [-82, -68]
    if (Math.abs(lonLat[0]) <= 25 && Math.abs(lonLat[1]) > 60) {
      lonLat = [lonLat[1], lonLat[0]];
    }

    abrirGoogleStreetView(lonLat);
  }

  private consultarCliente(valor: string, op: number = 1): Observable<any[]> {
    const codsuc = this.selectedSucursal?.codsuc || 'ALL';
    const filtro: BusquedaAvanzadaClientesRequest = {
      codsuc: codsuc,
      inicio: 1,
      nropagina: (op === 1 || op === 4) ? 5 : 100,
    };

    if (op === 1) {
      filtro.codcliente = valor.trim();
    } else if (op === 2) {
      filtro.nrodocumento = valor.trim();
    } else if (op === 3) {
      filtro.propietario = valor.trim().toUpperCase();
      filtro.letrainicio = 0;
    } else if (op === 4) {
      filtro.codcatastral = valor.trim().replace(/[-\s]/g, '') || valor.trim();
    }

    return this.busquedaAvanzadaService.buscarClientesAvanzada(filtro).pipe(
      map((resp) => resp?.data || []),
      catchError(() => of([])),
      takeUntilDestroyed(this.destroyRef),
    );
  }

  private avisar(severity: "success" | "info" | "warn" | "error", summary: string, detail: string): void {
    this.messageService.add({ severity, summary, detail });
  }

  private limpiarURL(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { codcliente: null },
      queryParamsHandling: 'merge'
    });
  }
}
