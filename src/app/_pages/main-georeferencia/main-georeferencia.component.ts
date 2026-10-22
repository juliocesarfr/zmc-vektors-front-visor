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
import { forkJoin, of, Observable, Subscription, TimeoutError } from 'rxjs';
import { catchError, finalize, map, timeout } from 'rxjs/operators';
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
import { colorPorEstadoLectura, COLORES_LECTURA, COLOR_FICHA_AGUA, COLOR_FICHA_ALCANTARILLADO } from '../../shared/constantes/colores-mapa';
import { observarTamanoMapa } from '../../shared/mapa/observar-tamano-mapa';
import { CapasSidebarComponent, CapaSwitchUi } from '../../shared/components/capas-sidebar/capas-sidebar.component';
import { CAPAS_BASE_UI, crearCapaOsm, crearCapaSatelital, crearCapaWms } from '../../shared/mapa/capas';
import { MicromedicionService } from '@host/_servicios/vektors/micromedicion.service';
import { SucursalesService } from '@host/_servicios/seguridad/sucursales.service';
import { DISTANCIA_MAX_ACOMETIDA_M, ORIGENES_COORDENADA } from '../../shared/constantes/coordenadas';
import { TIPOS_RECEPCION_FOTOS_LECTURA } from '../../shared/constantes/lecturas';
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
import { ColumnaListado, FilaListado, direccionDe } from '../../shared/utils/listado-excel';
import { ExcelService } from '@host/_servicios/reportes/excel.service';
import { CallesService } from '@host/_servicios/catastro/calles.service';
import { TipodocidentService } from '@host/_servicios/catastro/tipodocident.service';
import { Calles } from '@host/_models/catastro/calles';
import { TipoDocIdent } from '@host/_models/catastro/tipodocident';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { BusquedaAvanzadaClientesComponent } from '../../shared/components/busqueda-avanzada-clientes/busqueda-avanzada-clientes.component';
import { BusquedaAvanzadaClientesService } from '../../../../../host/src/app/_servicios/vektors/busqueda-avanzada-clientes.service';
import { BusquedaAvanzadaClientesRequest, BusquedaAvanzadaClienteResponse } from '../../../../../host/src/app/_models/vektors/busqueda-avanzada-clientes.models';

type TipoPopup = "lectura" | "agua" | "alcantarillado";

/** Columnas de la tabla y del Excel de los clientes que caen en el área dibujada. */
const COLUMNAS_LISTADO_AREA: ColumnaListado[] = [
  { campo: "codcliente", titulo: "Cód. cliente", anchoExcel: 12 },
  { campo: "propietario", titulo: "Titular", anchoExcel: 35 },
  { campo: "direccion", titulo: "Dirección", anchoExcel: 35 },
  { campo: "codsector", titulo: "Sector", anchoExcel: 8 },
  { campo: "codmza", titulo: "Mza", anchoExcel: 8 },
  { campo: "nrolote", titulo: "Lote", anchoExcel: 8 },
  { campo: "nromed", titulo: "Medidor", anchoExcel: 15 },
  { campo: "descatetar", titulo: "Categoría", anchoExcel: 22 },
  { campo: "tipoactividad", titulo: "Actividad", anchoExcel: 22 },
];

/** Capas que quedan encendidas al buscar: el resto se apaga para que se vea solo el cliente y su lote. */
const CAPAS_DE_BUSQUEDA = ["usuarios", "lotes"];
// Sin respuesta en este tiempo se avisa y se libera la pantalla en vez de quedarse cargando.
const MS_ESPERA_SERVIDOR = 40000;
// Es el valor por defecto del backend (usp_vektors_busqueda_avanzada_clientes): en la práctica, sin tope.
const SIN_TOPE_DE_REGISTROS = 99999;

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
    AutoCompleteModule,
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
  private readonly messageService = inject(MessageService);
  private readonly controlImgService = inject(ControlImgService);
  private readonly clientesService = inject(ClientesService);
  private readonly dialogService = inject(DialogService);
  private readonly catastroService = inject(CatastroService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly busquedaAvanzadaService = inject(BusquedaAvanzadaClientesService);
  private readonly excelService = inject(ExcelService);
  private readonly callesService = inject(CallesService);
  private readonly tipodocidentService = inject(TipodocidentService);

  readonly baseLayers = CAPAS_BASE_UI;
  baseActive: string | null = 'osm';

  commercialLayers: CapaSwitchUi[] = [
    { id: "usuarios", label: "Usuarios", active: false, simbolo: { forma: "punto", color: COLORES_LECTURA.normal } },
    { id: "lotes", label: "Lotes", active: false, simbolo: { forma: "area", color: "#cbd5e1" } },
    { id: "caja_agua", label: "Ficha Agua", active: false, simbolo: { forma: "rombo", color: COLOR_FICHA_AGUA } },
    { id: "acometida", label: "Acometida de Agua", active: false, simbolo: { forma: "linea", color: COLOR_FICHA_AGUA } },
    { id: "ficha_alc", label: "Ficha Alcantarillado", active: false, simbolo: { forma: "rombo", color: COLOR_FICHA_ALCANTARILLADO } },
    { id: "acc_alc", label: "Acometida de Alcantarillado", active: false, simbolo: { forma: "linea", color: COLOR_FICHA_ALCANTARILLADO } },
    { id: "sectores", label: "Sectores Comerciales", active: false, simbolo: { forma: "area", color: "#a78bfa" } },
    { id: "manzanas", label: "Manzanas", active: false, simbolo: { forma: "area", color: "#aaaaaa" } },
    { id: "calles", label: "Calles", active: false, simbolo: { forma: "linea", color: "#cbd5e1" } },
    { id: "rutaLectura", label: "Ruta de Lectura", active: false, simbolo: { forma: "linea", color: "#cba029" } },
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
  manzanasLayer!: TileLayer<TileWMS>;
  rutaLecturaLayer!: TileLayer<TileWMS>;
  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;

  private registroCapas: Record<string, BaseLayer> = {};
  private capasVector: VectorLayer<VectorSource>[] = [];
  private detenerObservadorMapa?: () => void;

  tipoPopup: TipoPopup = "lectura";
  featureSeleccionado: Feature | null = null;
  resultadoBusquedaJson: RegistroLectura[] | null = null;
  /** Todos los usuarios de la sucursal: es lo que vuelve a verse al limpiar una búsqueda. */
  // Una sola petición del mapa a la vez: si llega tarde una anterior, no pisa el resultado de la última.
  private peticionMapa?: Subscription;
  private peticionPopup?: Subscription;
  /** Código que llegó por la URL y se busca cuando el mapa y las sucursales están listos. */
  private codigoPendiente: string | null = null;
  private sucursalesListas = false;
  mensajeCarga = '';
  /** El cliente de la ficha no tiene coordenadas: la ficha lo avisa y el mapa no señala ningún lugar. */
  sinUbicacion = false;
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
  
  // Tab Manzana
  searchSector: string = '';
  searchManzana: string = '';
  searchLote: string = '';
  
  // Tab Caja Agua / Acant
  searchMedidor: string = '';
  
  // Resultados encontrados en tabs
  resultadosTab: any[] = [];
  
  /** Filtra la tabla de resultados por código, titular, dirección, manzana o lote. */
  filtroResultados = '';

  tiposDocumento: TipoDocIdent[] = [];
  tipoDocumentoElegido: string | null = null;
  /** Calles de la sucursal: primero se elige la calle y luego se buscan sus clientes. */
  private callesSucursal: Calles[] = [];
  private codsucCalles: string | null = null;
  callesSugeridas: Calles[] = [];
  calleElegida: Calles | null = null;
  listaSucursales: any[] = [];
  selectedSucursal: any = null;
  filtrosVisible = false;
  
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
    this.cargarTiposDocumento();

    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((parametros) => {
      const codigo = String(parametros['codcliente'] ?? '').trim();
      if (!codigo) return;
      this.codigoPendiente = codigo;
      this.buscarCodigoPendiente();
    });
  }

  private cargarSucursales(): void {
    this.sucursalesService.obtener_x_estareg().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (sucursales) => {
        this.listaSucursales = sucursales || [];
        this.selectedSucursal = this.listaSucursales[0] ?? null;
        this.sucursalesListas = true;
        this.cargarDatosIniciales();
      },
      error: () => {
        this.sucursalesListas = true;
        this.avisar("error", "Sucursales", "No se pudieron cargar las sucursales; se busca en todas.");
        this.cargarDatosIniciales();
      },
    });
  }

  /**
   * El mapa abre limpio, con las capas apagadas: no se cargan los usuarios de la sucursal.
   * Solo si se llega desde Consulta de Usuario con un código, se busca y se muestra ese cliente.
   */
  private cargarDatosIniciales(): void {
    if (!this.map || !this.sucursalesListas) return;
    this.buscarCodigoPendiente();
  }

  private buscarCodigoPendiente(): void {
    if (!this.codigoPendiente || !this.map || !this.sucursalesListas) return;
    this.searchSuministro = this.codigoPendiente;
    this.codigoPendiente = null;
    this.buscarPorOpcion(1);
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
      listado: {
        columnas: COLUMNAS_LISTADO_AREA,
        tituloReporte: "GEORREFERENCIA",
        nombreArchivo: "georreferencia_area_",
        origen: ORIGENES_COORDENADA.usuario,
        registros: () => (this.resultadoBusquedaJson ?? []) as unknown as Record<string, unknown>[],
        aFila: (registro) => ({ ...registro, direccion: direccionDe(registro) }),
        subcabecera: () => [`Sucursal: ${this.selectedSucursal?.nombre ?? "-"}`],
        excelService: this.excelService,
      },
    });

    this.initClick();

    this.detenerObservadorMapa = observarTamanoMapa(
      this.map!,
      this.mapaEl.nativeElement,
    );

    // En el siguiente ciclo: cambiar `cargando` dentro de ngAfterViewInit da NG0100.
    setTimeout(() => this.cargarDatosIniciales());
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
      false,
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
    this.manzanasLayer = crearCapaWms(
      this.gis.urlWms(),
      this.gis.capa("manzanas"),
      false,
    );
    this.rutaLecturaLayer = crearCapaWms(
      this.gis.urlWms(),
      this.gis.capa("rutaLectura"),
      false,
    );

    this.lecturasLayer = this.crearCapaPuntos(
      { forma: "circulo", radios: RADIOS_LECTURA, visible: false },
      (punto) => colorPorEstadoLectura(punto.get("estadolectura")),
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
      manzanas: this.manzanasLayer,
      rutaLectura: this.rutaLecturaLayer,
    };

    this.map = new OlMap({
      target: this.mapaEl.nativeElement,
      layers: [
        new LayerGroup({ layers: [this.osmLayer, this.satelitalLayer] }),
        this.sectoresComercialesLayer,
        this.manzanasLayer,
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
    this.sinUbicacion = false;
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
    this.baseActive = id;
    this.osmLayer?.setVisible(id === "osm");
    this.satelitalLayer?.setVisible(id === "satelital");
  }

  toggleLayer(layer: { id: string; active: boolean }): void {
    layer.active = !layer.active;
    // Solo muestra u oculta lo que ya está en el mapa: los usuarios llegan por una búsqueda, nunca al prender la capa.
    this.registroCapas[layer.id]?.setVisible(layer.active);
  }

  isCapaUsuariosActiva(): boolean {
    const layer = this.commercialLayers?.find((l) => l.id === "usuarios");
    return !!(layer && layer.active);
  }

  onSucursalChange(): void {
    this.codsucCalles = null;
    if (this.tabActivaBuscador === 'calles') this.cargarCallesSucursal();
    this.reiniciarBusqueda();
  }

  private pedirClientes(filtro: BusquedaAvanzadaClientesRequest): Observable<RegistroLectura[]> {
    return this.busquedaAvanzadaService.buscarClientesAvanzada(filtro).pipe(
      timeout(MS_ESPERA_SERVIDOR),
      map((respuesta) => (respuesta?.data || []) as unknown as RegistroLectura[]),
    );
  }

  /** Cancela la petición anterior del mapa, muestra la carga y la quita siempre al terminar, con o sin error. */
  private ejecutarPeticionMapa(
    peticion: Observable<RegistroLectura[]>,
    mensaje: string,
    alResponder: (registros: RegistroLectura[]) => void,
    mensajeError: string,
  ): void {
    this.peticionMapa?.unsubscribe();
    this.mensajeCarga = mensaje;
    this.cargando = true;
    this.peticionMapa = peticion
      .pipe(
        finalize(() => (this.cargando = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: alResponder,
        error: (error) => this.avisarErrorPeticion(error, mensajeError),
      });
  }

  private avisarErrorPeticion(error: any, mensajeError: string): void {
    if (error instanceof TimeoutError) {
      this.avisar("error", "Sin respuesta", "El servidor tardó demasiado en responder. Intente de nuevo.");
    } else if (error?.status === 401 || error?.status === 403) {
      this.avisar("error", "Acceso denegado", "No tiene permisos para consultar los clientes.");
    } else if (error?.status === 404) {
      this.avisar("error", "No encontrado", "El servicio de clientes no está disponible.");
    } else {
      this.avisar("error", "Error", mensajeError);
    }
  }

  private capasComercialesConsultables(): CapaConsultable[] {
    return [
      { rol: "rutaLectura", capa: this.rutaLecturaLayer },
      { rol: "lotes", capa: this.lotesLayer },
      { rol: "calles", capa: this.callesLayer },
      { rol: "manzanas", capa: this.manzanasLayer },
      { rol: "sectoresComerciales", capa: this.sectoresComercialesLayer },
    ];
  }

  /** Deja encendidas solo las capas permitidas (por defecto usuarios y lotes) y apaga las técnicas. */
  desactivarCapasSecundarias(capasPermitidas: string[] = CAPAS_DE_BUSQUEDA): void {
    this.commercialLayers.forEach((c) => {
      const debeEstarActiva = capasPermitidas.includes(c.id);
      if (c.active !== debeEstarActiva) {
        c.active = debeEstarActiva;
        this.registroCapas[c.id]?.setVisible(debeEstarActiva);
      }
    });
    this.capasSidebar?.apagarTecnicas();
  }

  /** Antes de cada búsqueda: sin ficha abierta, sin lote marcado y solo las capas de búsqueda. */
  private prepararNuevaBusqueda(capasVisibles: string[] = CAPAS_DE_BUSQUEDA): void {
    this.buscadorEstabaAbierto = false;
    this.cerrarPopup();
    this.controladorGis?.cerrarPopupGis();
    this.controladorGis?.quitarPredio();
    this.controladorGis?.quitarCalle();
    this.desactivarCapasSecundarias(capasVisibles);
  }

  private ubicarCliente(registro: RegistroLectura): void {
    const codigo = this.codigoDe(registro);
    this.searchSuministro = codigo;
    const punto = this.buscarPuntoPorCodigo(this.lecturasLayer, codigo);
    if (punto) {
      this.seleccionarFeature(punto, "lectura");
      this.acercarAPunto(punto);
    } else {
      this.mostrarPopupSinPunto(registro);
    }
    const geometriaPunto = punto?.getGeometry();
    const coordenada = geometriaPunto instanceof Point
      ? geometriaPunto.getCoordinates()
      : extraerCoordenada(registro, ORIGENES_COORDENADA.usuario)
        ?? extraerCoordenada(registro, ORIGENES_COORDENADA.agua)
        ?? extraerCoordenada(registro, ORIGENES_COORDENADA.predio);
    this.sinUbicacion = !coordenada;
    if (!coordenada) {
      // Si el mapa se quedara donde estaba, parecería que la ficha es de ese lugar.
      this.map?.getView().animate({ center: this.gis.vista.centro, zoom: this.gis.vista.zoom - 3, duration: 600 });
      this.avisar("warn", "Sin ubicación", `El cliente ${codigo} no tiene coordenadas registradas: solo se muestra su ficha.`);
    }
    this.controladorGis?.marcarPredio(codigo, coordenada ?? undefined);
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
    this.peticionPopup?.unsubscribe();
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;
    this.datosClientePopup = null;
    this.totalLecturas = 0;
    this.totalSinCoordenadas = 0;
  }

  private refrescarCapasVector(): void {
    this.capasVector.forEach((capa) => capa?.changed());
  }

  private mostrarRegistros(registros: RegistroLectura[], encuadrar: boolean): void {
    this.resultadoBusquedaJson = registros;
    this.actualizarCapasComerciales(false);
    if (encuadrar) this.acercarARegistros(registros);
  }

  private mostrarPopupSinPunto(registro: RegistroLectura): void {
    this.controladorGis?.cerrarPopupGis();
    this.lecturaSeleccionada = registro;
    this.cargarDatosPopup(registro);
    this.centrarEnUsuario(registro);

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
    } else if (this.controladorGis) {
      // Deja libres el panel de capas, la ficha y la tabla, y acerca hasta reconocer las manzanas.
      this.controladorGis.encuadrarEnZonaLibre(extent);
    } else {
      this.map?.getView().fit(extent, { duration: 800, maxZoom: 19, padding: [80, 80, 80, 80] });
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
    this.filtroResultados = '';
    if (tab === 'calles') this.cargarCallesSucursal();
  }

  /** Tabla de resultados filtrada con el texto que escribe el usuario; muestra todos, sin páginas. */
  get resultadosFiltrados(): RegistroLectura[] {
    const texto = this.filtroResultados.trim().toUpperCase();
    if (!texto) return this.resultadosTab;
    return this.resultadosTab.filter((registro: any) =>
      [registro.codcliente, registro.propietario, registro.descripcioncalle, registro.nrocalle, registro.codmza, registro.nrolote]
        .some((valor) => String(valor ?? '').toUpperCase().includes(texto)),
    );
  }

  private cargarTiposDocumento(): void {
    this.tipodocidentService.drop().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (tipos) => (this.tiposDocumento = tipos || []),
      error: () => (this.tiposDocumento = []),
    });
  }

  private cargarCallesSucursal(): void {
    const codsuc = this.selectedSucursal?.codsuc;
    if (!codsuc || codsuc === this.codsucCalles) return;
    this.callesService.drop_x_sucursales(codsuc).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (calles) => {
        this.callesSucursal = calles || [];
        this.codsucCalles = codsuc;
      },
      error: () => this.avisar("error", "Calles", "No se pudieron cargar las calles de la sucursal."),
    });
  }

  /** Igual que en Consulta de Usuario: sugiere las calles que empiezan con lo escrito. */
  sugerirCalles(evento: { query: string }): void {
    const texto = (evento.query || '').trim().toLowerCase();
    this.callesSugeridas = this.callesSucursal.filter((calle) =>
      String(calle.descripcioncalle ?? '').toLowerCase().startsWith(texto),
    );
  }

  buscarPorCalle(): void {
    const calle = this.calleElegida?.descripcioncalle?.trim();
    if (!calle) {
      this.avisar("warn", "Calle", "Elija primero una calle de la lista.");
      return;
    }
    this.buscarClientes(
      { codcalle: calle },
      'Buscando clientes de la calle...',
      `No se encontraron clientes en la calle "${calle}".`,
      [...CAPAS_DE_BUSQUEDA, 'calles'],
    );
  }

  buscarPorOpcion(op: number): void {
    if (op === 1) {
      const codigo = String(this.searchSuministro || '').trim();
      if (!codigo) return this.avisar("warn", "Campo vacío", "Ingrese el Nro. de Suministro.");
      this.buscarClientes({ codcliente: codigo }, 'Buscando el cliente...', "No se encontró ningún cliente con ese suministro.");
      return;
    }
    if (op === 2) {
      const numero = String(this.searchDniRuc || '').trim();
      if (!this.tipoDocumentoElegido) return this.avisar("warn", "Tipo de documento", "Elija primero el tipo de documento.");
      if (!numero) return this.avisar("warn", "Campo vacío", "Ingrese el número de documento.");
      this.buscarClientes(
        { tipodocident: this.tipoDocumentoElegido, nrodocumento: numero },
        'Buscando el documento...',
        "No se encontró ningún cliente con ese documento.",
      );
      return;
    }
    const nombre = String(this.searchNombre || '').trim().toUpperCase();
    if (!nombre) return this.avisar("warn", "Campo vacío", "Ingrese los apellidos y nombres.");
    this.buscarClientes({ propietario: nombre, letrainicio: 0 }, 'Buscando por nombre...', "No se encontró ningún cliente con ese nombre.");
  }

  /**
   * Todas las búsquedas llenan la tabla con todo lo que devuelve el servidor (sin páginas ni tope);
   * el mapa no se llena: solo muestra al cliente que el usuario elige. Con un único resultado se elige solo.
   */
  private buscarClientes(
    filtro: BusquedaAvanzadaClientesRequest,
    mensaje: string,
    mensajeSinResultados: string,
    capasVisibles: string[] = CAPAS_DE_BUSQUEDA,
  ): void {
    this.prepararNuevaBusqueda(capasVisibles);
    this.resultadosTab = [];
    this.filtroResultados = '';
    this.ejecutarPeticionMapa(
      this.pedirClientes({ codsuc: this.selectedSucursal?.codsuc || 'ALL', inicio: 0, nropagina: SIN_TOPE_DE_REGISTROS, ...filtro }),
      mensaje,
      (clientes) => {
        this.resultadosTab = clientes;
        if (clientes.length === 0) {
          this.avisar("warn", "Sin resultados", mensajeSinResultados);
        } else if (clientes.length === 1) {
          this.elegirResultado(clientes[0]);
        }
      },
      "Ocurrió un error al buscar los clientes.",
    );
  }

  /** Como antes: pone en el mapa todos los clientes de la tabla (los filtrados, si hay filtro) y la tabla sigue abierta. */
  agregarTodoAlMapa(): void {
    const registros = this.resultadosFiltrados;
    if (registros.length === 0) return;
    this.cerrarPopup();
    this.controladorGis?.quitarPredio();
    this.isBusquedaActiva = true;
    const nombreCalle = this.tabActivaBuscador === 'calles' ? this.calleElegida?.descripcioncalle : undefined;
    if (nombreCalle) {
      // Como en GIS Loreto: se pinta la calle y el mapa se acerca a ella; si GeoServer no la tiene, a los clientes.
      this.mostrarRegistros(registros, false);
      this.controladorGis?.marcarCalle(nombreCalle, () => this.acercarARegistros(registros));
    } else {
      this.mostrarRegistros(registros, true);
    }
    this.avisar("success", "Mapa", `Se agregaron ${registros.length} clientes al mapa.`
      + (this.totalSinCoordenadas > 0 ? ` ${this.totalSinCoordenadas} no tienen coordenadas.` : ''));
  }

  /** El usuario eligió un cliente de la tabla: el mapa muestra solo ese, con su ficha y su lote marcado. */
  elegirResultado(registro: RegistroLectura): void {
    this.controladorGis?.quitarCalle();
    this.isBusquedaActiva = true;
    this.mostrarRegistros([registro], false);
    this.buscadorEstabaAbierto = this.resultadosTab.length > 1;
    this.mostrarSearchPanel = false;
    this.ubicarCliente(registro);
  }

  activarCapaPorId(id: string): void {
    const layer = this.commercialLayers.find((c) => c.id === id);
    if (layer && !layer.active) {
      layer.active = true;
      this.registroCapas[id]?.setVisible(true);
    }
  }

  buscarPorManzana(): void {
    if (!this.searchSector && !this.searchManzana && !this.searchLote) {
      this.avisar("warn", "Campos vacíos", "Por favor ingrese al menos el Sector, Manzana o Lote.");
      return;
    }
    this.buscarClientes(
      {
        codsector: this.searchSector.trim() || 'ALL',
        codmza: this.searchManzana.trim() || 'ALL',
        nrolote: this.searchLote.trim() || 'ALL',
      },
      'Buscando la manzana...',
      "No se encontraron clientes en la manzana o lote indicado.",
    );
  }

  buscarPorCajaAgua(): void {
    const med = this.searchMedidor.trim();
    if (!med) {
      this.avisar("warn", "Campo vacío", "Por favor ingrese el número de medidor o ficha.");
      return;
    }
    this.buscarClientes(
      { nromedidor: med },
      'Buscando el medidor...',
      `No se encontraron clientes con medidor "${med}".`,
      [...CAPAS_DE_BUSQUEDA, 'caja_agua', 'ficha_alc'],
    );
  }

  /** Clic en una fila de la tabla del área dibujada. */
  ubicarFilaEnMapa(fila: FilaListado): void {
    this.ubicarCliente(fila as unknown as RegistroLectura);
  }


  cerrarBusqueda(): void {
    this.buscadorEstabaAbierto = false;
    this.mostrarSearchPanel = false;
    this.reiniciarBusqueda();
  }

  /** Vuelve al estado inicial: sin búsqueda ni ficha, con todas las capas apagadas. */
  reiniciarBusqueda(): void {
    this.buscadorEstabaAbierto = false;
    this.peticionMapa?.unsubscribe();
    this.searchSuministro = "";
    this.searchDniRuc = "";
    this.searchNombre = "";
    this.searchCatastral = "";
    this.calleElegida = null;
    this.tipoDocumentoElegido = null;
    this.filtroResultados = "";
    this.searchSector = "";
    this.searchManzana = "";
    this.searchLote = "";
    this.searchMedidor = "";
    this.resultadosTab = [];
    this.cerrarPopup();
    this.controladorGis?.cerrarPopupGis();
    this.controladorGis?.quitarPredio();
    this.controladorGis?.quitarCalle();
    // Vuelve a como abre la pantalla: capas apagadas y sin pedir los usuarios de la sucursal.
    this.desactivarCapasSecundarias([]);
    this.isBusquedaActiva = false;
    this.mostrarRegistros([], false);
    this.limpiarURL();
  }

  cerrarPopup(): void {
    this.peticionPopup?.unsubscribe();
    this.sinUbicacion = false;
    this.cargandoImagenes = false;
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
    abrirConsultaUsuario(
      this.dialogService,
      codcliente,
      this.selectedSucursal?.codsuc || this.lecturaSeleccionada?.codsuc || this.datosClientePopup?.codsuc || "002"
    ).then((referencia) => (this.ref = referencia));
  }

  private cargarDatosPopup(lectura: RegistroLectura): void {
    // Si se elige otro cliente antes de que responda el anterior, sus datos no deben llegar a la ficha nueva.
    this.peticionPopup?.unsubscribe();
    this.imagenesPopup = [];
    this.datosClientePopup = null;
    this.cargandoImagenes = true;
    const codsuc = lectura.codsuc || this.selectedSucursal?.codsuc || "002";
    const codcliente = lectura.codcliente;

    if (!this.catastroService.urlAdministracion || this.catastroService.urlAdministracion.includes('undefined')) {
      this.catastroService.urlAdministracion = 'https://167.88.36.54:8889/vektors/backend/api-georeferencia/v1/vektors-catastro/';
    }

    this.peticionPopup = forkJoin({
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
          if (!this.lecturaSeleccionada) return;

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
