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

import { CapaConsultable, ConsultaCapasGisService, GisConfigService } from '../../core/gis';
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

type TipoPopup = "lectura" | "agua" | "alcantarillado";

@Component({
  selector: 'app-main-georeferencia',
  templateUrl: './main-georeferencia.component.html',
  styleUrl: './main-georeferencia.component.scss',
  standalone: true,
  imports: [CapasSidebarComponent, PanelesMapaGisComponent, CommonModule, FormsModule, DropdownModule, ButtonModule, InputTextModule, ToastModule],
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
  searchSuministro = '';
  searchDniRuc = '';
  searchNombre = '';
  cargando = false;
  isBusquedaActiva = false;
  
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
      if (res && res.length > 0) this.selectedSucursal = res[0];
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
  }

  setBaseLayer(id: string): void {
    this.baseActive = this.baseActive === id ? null : id;
    this.osmLayer?.setVisible(this.baseActive === "osm");
    this.satelitalLayer?.setVisible(this.baseActive === "satelital");
  }

  toggleLayer(layer: { id: string; active: boolean }): void {
    layer.active = !layer.active;
    this.registroCapas[layer.id]?.setVisible(layer.active);
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
    const capasActivar = ["caja_agua", "ficha_alc", "acometida", "acc_alc"];
    this.commercialLayers.forEach((c) => {
      if (capasActivar.includes(c.id) && !c.active) {
        c.active = true;
        this.registroCapas[c.id]?.setVisible(true);
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
    this.actualizarCapasComerciales(false);
  }

  private guardarResultadoOriginal(): void {
    if (this.isBusquedaActiva) return;
    this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
    this.isBusquedaActiva = true;
  }

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

  private codigoDe(registro: Record<string, unknown>): string {
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
    const coordenada = extraerCoordenada(registro, ORIGENES_COORDENADA.usuario);
    if (coordenada) {
      this.map
        ?.getView()
        .animate({ center: coordenada, zoom: 17, duration: 600 });
    }
  }

  abrirBusqueda(): void {
    this.mostrarSearchPanel = true;
    this.searchSuministro = "";
    this.searchDniRuc = "";
    this.searchNombre = "";
    this.refrescarCapasVector();
  }

  cerrarBusqueda(): void {
    this.mostrarSearchPanel = false;
    this.reiniciarBusqueda();
  }

  reiniciarBusqueda(): void {
    this.searchSuministro = "";
    this.searchDniRuc = "";
    this.searchNombre = "";
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

    if (!valor) {
      const nomCampo = op === 1 ? "el Nro. de Suministro" : (op === 2 ? "el DNI o RUC" : "los Apellidos y nombres");
      this.avisar("warn", "Campo vacío", `Por favor ingrese ${nomCampo} para buscar.`);
      return;
    }
    
    if (!this.selectedSucursal || !this.selectedAnio || !this.selectedMes) {
      this.avisar("warn", "Filtros incompletos", "Por favor espere a que carguen los filtros o seleccione sucursal, año y mes.");
      return;
    }

    this.cargando = true;
    this.limpiarCapas();

    this.consultarCliente(valor, op).subscribe({
      next: (registros) => {
        this.cargando = false;
        if (!registros || registros.length === 0) {
          const criterio = op === 1 
            ? "código de suministro" 
            : (op === 2 ? "DNI o RUC" : "nombre o razón social");
          this.avisar("warn", "Aviso", `No se encontró ningún registro con ese ${criterio}.`);
          return;
        }

        this.mostrarSoloRegistros(registros);

        const codigo = this.codigoDe(registros[0]);
        const punto = this.buscarPuntoPorCodigo(this.lecturasLayer, codigo);
        if (punto) {
          this.seleccionarFeature(punto, "lectura");
          this.activarCapasPorDefectoBusqueda();
          this.acercarAPunto(punto);
          this.controladorGis?.marcarPredio(codigo);
        } else {
          this.mostrarPopupSinPunto(registros[0]);
        }

        if (registros.length > 1) {
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
            this.lecturaSeleccionada = {
              ...catastroData,
              ...this.lecturaSeleccionada,
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

  abrirStreetView(x: unknown, y: unknown): void {
    const lonLat = coordenadaLonLat(x, y, this.gis.proyeccionUtm);
    if (!lonLat) {
      this.avisar("warn", "Aviso", "No hay coordenadas válidas para abrir Street View.");
      return;
    }
    abrirGoogleStreetView(lonLat);
  }

  private consultarCliente(valor: string, op: number = 1): Observable<any[]> {
    if (!this.micromedicionService.urlAdministracion || this.micromedicionService.urlAdministracion.includes('undefined')) {
      this.micromedicionService.urlAdministracion = 'https://167.88.36.54:8889/vektors/backend/api-georeferencia/v1/vektors-medicion/';
    }
    return this.micromedicionService
      .buscarLecturasPorSuministro({
        op: op,
        codsuc: this.selectedSucursal?.codsuc || '001',
        anio: this.selectedAnio || '2026',
        mes: this.selectedMes || '01',
        valor: valor,
        nroSuministro: op === 1 && !isNaN(Number(valor)) ? Number(valor) : null,
      } as any)
      .pipe(
        map((respuesta) => {
          const datos = respuesta?.data;
          if (!datos) return [];
          return Array.isArray(datos) ? datos : [datos];
        }),
        catchError(() => of([])),
        switchMap((registros) => {
          if (registros.length === 0 && op === 1 && !isNaN(Number(valor))) {
            return this.consultarClienteCatastro(valor);
          }
          return of(registros);
        }),
        takeUntilDestroyed(this.destroyRef),
      );
  }

  private consultarClienteCatastro(codigo: string): Observable<any[]> {
    return this.catastroService
      .buscarClienteCatastro({
        codsuc: this.selectedSucursal.codsuc,
        codcliente: Number(codigo)
      })
      .pipe(
        map((respuesta) => {
          const datos = respuesta.data;
          if (!datos) return [];
          return Array.isArray(datos) ? datos : [datos];
        }),
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
