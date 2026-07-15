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
import { forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";

import OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import LayerGroup from "ol/layer/Group";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import TileWMS from "ol/source/TileWMS";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Style, Circle as CircleStyle, Fill, Stroke } from "ol/style";

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
export type OrigenCoordenada = "usuario" | "predio" | "agua" | "desague";

interface ConfigOrigenCoordenada {
  lonField: string;
  latField: string;
  proyeccion: string; // proyección de origen de los datos
}

const PROYECCION_MAPA = "EPSG:4326";

const ORIGENES_COORDENADA: Record<OrigenCoordenada, ConfigOrigenCoordenada> = {
  usuario: { lonField: "lon",        latField: "lat",        proyeccion: "EPSG:4326" },
  predio:  { lonField: "lonpredio",  latField: "latpredio",  proyeccion: "EPSG:4326" },
  agua:    { lonField: "lonagua",    latField: "latagua",    proyeccion: "EPSG:4326" },
  desague: { lonField: "londesague", latField: "latdesague", proyeccion: "EPSG:4326" },
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
  ],
  templateUrl: "./controldigitacion.component.html",
  styleUrl: "./controldigitacion.component.scss",
  providers: [DatePipe, ValidacionSistemaService, MessageService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ControldigitacionComponent implements OnInit, AfterViewInit, OnDestroy {
    private readonly destroyRef = inject(DestroyRef);

  map!: OlMap;
  lecturasLayer!: VectorLayer<VectorSource>;
  lotesLayer!: TileLayer<TileWMS>;

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
  consumofin: number | null = 99999;

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
  sidebarOpen = true;
  baseActive: string | null = "osm";

  baseLayers = [
    { id: "osm", label: "OSM", iconUrl: "assets/images/img-georeferencia/capa-icon.gif" },
    { id: "satelital", label: "Satelital", iconUrl: "assets/images/img-georeferencia/satellital-icon.gif" },
  ];

  commercialLayers = [
    { id: "usuarios", label: "Usuarios", active: true },
    { id: "caja_agua", label: "Caja Ficha Agua", active: false },
    { id: "acometida", label: "Acometida de Agua", active: false },
    { id: "ficha_alc", label: "Ficha Alcantarillado", active: false },
    { id: "acc_alc", label: "Acometida de Alcantarillado", active: false },
    { id: "ruta_lectura", label: "Ruta Lectura", active: false },
    { id: "ruta_reparto", label: "Ruta Reparto", active: false },
    { id: "sec_lectura", label: "Secuencia Lectura", active: false },
    { id: "sec_reparto", label: "Secuencia Reparto", active: false },
    { id: "lotes", label: "Lotes", active: false },
    { id: "manzanas", label: "Manzanas", active: false },
    { id: "sectores", label: "Sectores Comerciales", active: false },
    { id: "calles", label: "Calles", active: false },
  ];

  cargando = false;
  totalLecturas = 0;
  totalSinCoordenadas = 0;
  lecturaSeleccionada: any = null;
  mostrarLeyenda = true;
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

  onCicloChange(): void {
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
          .subscribe((data) => (this.listaSucursalesxusr = data));
      });
  }

  onSucursalChange(): void {
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
        this.selectedSector = sectores[0];
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
          this.pintarPuntos(data.data || [], "usuario");
        },
        error: () => {
          this.cargando = false;
          this.limpiarCapa();
          this.avisar("error", "Aviso de usuario", "Ocurrió un error al cargar las lecturas");
        },
      });
  }

  limpiar(): void {
    this.selectedSector = this.totalSectores2?.[0] || null;
    this.selectedEstados = [];
    this.consumoini = 0;
    this.consumofin = 99999;
    this.selectedTipoPromedio = null;
    if (this.fechaCiclos) {
      this.selectedAnio = this.fechaCiclos.year;
      this.selectedMes = this.fechaCiclos.month;
    }
    this.limpiarCapa();
  }

  // ============================================================
  // PINTADO DE PUNTOS (genérico y escalable)
  // ============================================================

  private pintarPuntos(registros: any[], origen: OrigenCoordenada): void {
    const source = this.lecturasLayer.getSource()!;
    source.clear();
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;

    const config = ORIGENES_COORDENADA[origen];

    const features = registros
      .map((r) => this.crearFeature(r, config))
      .filter((f): f is Feature => f !== null);

    this.totalLecturas = registros.length;
    this.totalSinCoordenadas = registros.length - features.length;

    if (features.length === 0) {
      this.avisar("info", "Aviso", "No se encontraron coordenadas");
      return;
    }

    source.addFeatures(features);
    this.map.getView().fit(source.getExtent(), {
      duration: 800,
      maxZoom: 18,
      padding: [60, 60, 60, 60],
    });
    this.avisar("success", "Proceso completado", `${features.length} lecturas en el mapa`);
  }

  /**
   * Crea el feature de un registro a partir de su lon/lat.
   * Devuelve null si el registro no tiene coordenadas válidas
   * (nulas, no numéricas o el par 0,0).
   */
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

    const feature = new Feature({ geometry: new Point(coordenada) });
    feature.setProperties(registro);
    return feature;
  }

  private limpiarCapa(): void {
    this.lecturasLayer?.getSource()?.clear();
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;
    this.totalLecturas = 0;
    this.totalSinCoordenadas = 0;
  }

  // ============================================================
  // MAPA
  // ============================================================

  private crearMapa(): void {
    const base = new LayerGroup({
      layers: [new TileLayer({ source: new OSM(), visible: true })],
    });

    this.lotesLayer = new TileLayer({
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

    this.lecturasLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => this.estiloLectura(feature),
    });

    this.map = new OlMap({
      target: "map",
      layers: [base, this.lotesLayer, this.lecturasLayer],
      view: new View({
        projection: PROYECCION_MAPA,
        center: [-76.1223, -5.9018], // Yurimaguas
        zoom: 14,
      }),
    });
  }

  private estiloLectura(feature: any): Style {
    const estado = feature.get("estadolectura");
    let color = "#22c55e"; // 000 normal → verde
    if (estado === "008") color = "#ef4444"; // atípico → rojo
    else if (estado === "003" || estado === "999") color = "#f97316"; // sin registro → naranja
    else if (estado !== "000") color = "#3b82f6"; // observados → azul

    const isSelected = feature === this.featureSeleccionado;

    return new Style({
      image: new CircleStyle({
        radius: isSelected ? 9 : 6,
        fill: new Fill({ color }),
        stroke: new Stroke({
          color: isSelected ? "#000000" : "#ffffff",
          width: isSelected ? 2.5 : 1.5,
        }),
      }),
    });
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      const feature = this.map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        hitTolerance: 5,
      }) as Feature | undefined;

      if (feature) {
        this.featureSeleccionado = feature;
        this.lecturasLayer.changed();
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
  }

  toggleCommercialLayer(layer: any): void {
    layer.active = !layer.active;
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

  cerrarPopup(): void {
    this.lecturaSeleccionada = null;
    this.featureSeleccionado = null;
    this.lecturasLayer?.changed();
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
  // UTILITARIOS
  // ============================================================

  private avisar(severity: "success" | "info" | "warn" | "error", summary: string, detail: string): void {
    this.messageService.add({ severity, summary, detail });
  }
}