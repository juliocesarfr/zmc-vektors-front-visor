import {
  Component,
  AfterViewInit,
  OnInit,
  CUSTOM_ELEMENTS_SCHEMA,
  HostListener,
} from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { transform } from "ol/proj";
import { environment } from "projects/environments/environment";
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
import Overlay from "ol/Overlay";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Style, Circle as CircleStyle, Fill, Stroke } from "ol/style";

import { MessageService } from "primeng/api";
import { AperturaMicromedicionService } from "@host/_servicios/micromedicion/apertura-micromedicion.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { SectoresCicloService } from "@host/_servicios/seguridad/sectores-ciclo.service";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { MicromedicionService } from "@host/_servicios/vektors/micromedicion.service";
import { FiltroLecturas } from "@host/_models/vektors/FiltroLecturas";
import { ValidacionSistemaService } from "@host/_servicios/validar/validacion-sistema.service";
import { FormsModule } from "@angular/forms";
import { DropdownModule } from "primeng/dropdown";
import { ButtonModule } from "primeng/button";
import { MultiSelectModule } from "primeng/multiselect";
import { InputNumberModule } from "primeng/inputnumber";
import { ToastModule } from "primeng/toast";
import { TagModule } from "primeng/tag";

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
export class ControldigitacionComponent implements OnInit, AfterViewInit {
  map!: OlMap;
  lecturasLayer!: VectorLayer<VectorSource>;
  lotesLayer!: TileLayer<TileWMS>;

  //==================================
  // FILTROS
  //==================================
  _codsede: any;
  _codemp: any;

  dataCiclos: any[] = [];
  fechaCiclos: any;
  listaSucursalesxusr: any[] = [];
  totalSectores2: any[] = [];
  lista_estadolec: any[] = [];

  selectedCiclo: any = null; // objeto ciclo
  selectedSucursal: any = null; // objeto sucursal
  selectedSector: any = null; // objeto sector ('%' = todos)
  selectedEstados: string[] = [];
  selectedAnio: string = "";
  selectedMes: string = "";
  consumoini: number | null = 0;
  consumofin: number | null = 99999;

  listaYear: any[] = [];
  listaMeses: any[] = [
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
  tipopromedio: any[] = [
    { descripcion: "MEDIDO", codigo: "0" },
    { descripcion: "ASIGNADO", codigo: "1" },
    { descripcion: "PROMEDIADO", codigo: "1" },
  ];
  //sidebar capas
  // Variables de estado para el sidebar
  sidebarOpen: boolean = true;
  baseActive: string | null = "osm";

  // Datos de las capas
  baseLayers = [
    { id: "osm", label: "OSM", icon: "◉" },
    { id: "satelital", label: "Satelital", icon: "⊡" },
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

  // Métodos de interacción
  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  setBaseLayer(id: string) {
    this.baseActive = this.baseActive === id ? null : id;
  }

  toggleCommercialLayer(layer: any) {
    layer.active = !layer.active;
  }

  //==================================
  // ESTADO UI / RESUMEN
  //==================================
  cargando = false;
  totalLecturas = 0;
  totalSinCoordenadas = 0;
  lecturaSeleccionada: any = null;
  mostrarLeyenda = true;
  selectedTipoPromedio: any = null;
  private coordenadasGeoServer = new Map<number, number[]>(); // codernadas geoserver

  // ==================================
  // IMÁGENES DEL POPUP
  // ==================================
  imagenesPopup: any[] = [];
  cargandoImagenes = false;
  datosClientePopup: any = null;
  imagenAbierta: string | null = null; // lightbox
  imagenAbiertaIndex = -1;
  imagenZoom = 1;                       // zoom del lightbox

  private readonly TIPOS_RECEPCION_IMG = [
    { tipo: "000" }, { tipo: "050" }, { tipo: "046" }, { tipo: "045" },
    { tipo: "044" }, { tipo: "043" }, { tipo: "042" }, { tipo: "041" },
    { tipo: "040" }, { tipo: "039" }, { tipo: "038" }, { tipo: "037" },
    { tipo: "004" }, { tipo: "003" },
  ];

  private cargarCoordenadasGeoServer(): Promise<void> {
    const url =
      "http://167.88.36.54:8085/geoserver/eps_yurimaguas/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=eps_yurimaguas:usuarios_xy&outputFormat=application/json";

    return new Promise((resolve, reject) => {
      console.log(url);

      this.http.get<any>(url).subscribe({
        next: (geojson) => {
          console.log(geojson);

          this.coordenadasGeoServer.clear();
          console.log("========== CARGANDO COORDENADAS ==========");

          geojson.features.forEach((f: any) => {
            console.log("Total coordenadas:", this.coordenadasGeoServer.size);
            console.log("Tamaño del Map:", this.coordenadasGeoServer.size);
            //console.log("Coordenada 130687:", this.coordenadasGeoServer.get(130687));

            const suministro = Number(f.properties.SUMINISTRO);

            if (!suministro) return;

            this.coordenadasGeoServer.set(suministro, f.geometry.coordinates);
          });

          console.log("Coordenadas cargadas:", geojson.features.length);

          resolve();
        },

        error: (error) => {
          console.error("ERROR GEOSERVER:", error);

          reject(error);
        },
      });
    });
  } // fin de constructor para traer  cordenadas de geoserver

  constructor(
    private aperturaservices: AperturaMicromedicionService,
    private seguridadService: SucursalesService,
    private sectoresService: SectoresCicloService,
    private consultaService: ConsulGenericService,
    private micromedicionService: MicromedicionService,
    private messageService: MessageService,
    private http: HttpClient,
  ) {
    this._codsede = sessionStorage.getItem("codsede");
    this._codemp = sessionStorage.getItem("codemp");
    const currentYear = new Date().getFullYear();
    for (let i = 0; i <= 5; i++) {
      this.listaYear.push({ anio: (currentYear - i).toString() });
    }
    this.selectedTipoPromedio = this.tipopromedio[0]; // default: MEDIDO
  }

  ngOnInit(): void {
    this.aperturaservices.getCiclos().subscribe((response) => {
      if (response.status === "SUCCESS") {
        this.dataCiclos = response.data;
      }
    });
    this.consultaService
      .getconsultaService("TEL", "ALL", "ALL", "ALL")
      .subscribe((data) => {
        this.lista_estadolec = data;
      });
  }

  ngAfterViewInit(): void {
    this.crearMapa();
    this.initClick();
    this.cargarCoordenadasGeoServer(); // para cordenadas geoserver
    // el layout de la toolbar puede cambiar el alto del contenedor tras el primer render
    setTimeout(() => this.map.updateSize(), 300);
  }
  //// crear mapa

  //==================================
  // CASCADA DE FILTROS
  //==================================
  onCicloChange(): void {
    this.selectedSucursal = null;
    this.selectedSector = null;
    this.limpiarCapa();
    if (!this.selectedCiclo) return;

    this.aperturaservices
      .getfechaCiclos(this.selectedCiclo.codciclo)
      .subscribe((response) => {
        this.fechaCiclos = response.data;
        this.selectedAnio = this.fechaCiclos.year;
        this.selectedMes = this.fechaCiclos.month;
        this.seguridadService
          .drop_sucursales_x_ciclo(this.selectedCiclo.codciclo)
          .subscribe({
            next: (data) => {
              this.listaSucursalesxusr = data;
            },
          });
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
      .subscribe({
        next: (data) => {
          let sectores = data;
          sectores.unshift({
            codemp: null,
            codsuc: null,
            codsector: "%",
            descripcion: "TODOS",
            estareg: null,
          });
          this.totalSectores2 = sectores;
          this.selectedSector = sectores[0]; // TODOS por defecto
        },
      });
  }

  //==================================
  // PROCESAR → API → PUNTOS EN MAPA
  //==================================
  procesar(): void {
    if (
      !this.selectedCiclo ||
      !this.selectedSucursal ||
      !this.selectedAnio ||
      !this.selectedMes
    ) {
      this.messageService.add({
        severity: "warn",
        summary: "Aviso de usuario",
        detail: "Debe seleccionar Ciclo, Sucursal, Año y Mes",
      });
      return;
    }
    if (
      this.consumoini != null &&
      this.consumofin != null &&
      this.consumoini > this.consumofin
    ) {
      this.messageService.add({
        severity: "warn",
        summary: "Aviso de usuario",
        detail: "El consumo inicial no puede ser mayor al final",
      });
      return;
    }

    const filtro: FiltroLecturas = {
      codsuc: this.selectedSucursal.codsuc,
      codsede: this._codsede,
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

    this.cargarCoordenadasGeoServer()
      .then(() => {
        // para cordenadas geoserver

        this.micromedicionService.listarLecturas(filtro).subscribe({
          next: (data) => {
            this.cargando = false;

            console.log("API:", data.data);

            this.pintarLecturas(data.data || []);
          },

          error: () => {
            this.cargando = false;

            this.limpiarCapa();

            this.messageService.add({
              severity: "error",
              summary: "Aviso de usuario",
              detail: "Ocurrió un error al cargar las lecturas",
            });
          },
        });
      })
      .catch(() => {
        this.cargando = false;

        this.messageService.add({
          severity: "error",
          summary: "GeoServer",
          detail: "No se pudieron cargar las coordenadas",
        });
      }); // fin de cargar coordenadas geoserver
  }

  private pintarLecturas(lecturas: any[]): void {
    const source = this.lecturasLayer.getSource()!;

    source.clear();

    this.lecturaSeleccionada = null;

    this.totalLecturas = lecturas.length;
    this.totalSinCoordenadas = 0;

    const features: Feature[] = [];

    lecturas.forEach((l) => {
      const suministro = Number(l.codcliente);

      const coordenada = this.coordenadasGeoServer.get(suministro);

      console.log(
        "Suministro:",
        suministro,
        "Existe:",
        this.coordenadasGeoServer.has(suministro),
      );

      if (!coordenada) {
        this.totalSinCoordenadas++;
        return;
      }

      const punto = transform(coordenada, "EPSG:32718", "EPSG:4326");
      console.log("UTM:", coordenada);
      console.log("Transformado:", punto);

      const feature = new Feature({
        geometry: new Point(punto),
      });

      feature.setProperties(l);

      features.push(feature);
    });

    source.addFeatures(features);

    if (features.length > 0) {
      const extent = source.getExtent();
      if (extent) {
        this.map.getView().fit(extent, {
          duration: 800,
          maxZoom: 18,
          padding: [60, 60, 60, 60],
        });
      }
      this.messageService.add({
        severity: "success",
        summary: "Proceso completado",
        detail: `${features.length} lecturas en el mapa`,
      });
    } else {
      this.messageService.add({
        severity: "info",
        summary: "Aviso",
        detail: "No se encontraron coordenadas",
      });
    }
  }

  limpiar(): void {
    this.selectedSector = this.totalSectores2?.[0] || null;
    this.selectedEstados = [];
    this.consumoini = 0;
    this.consumofin = 99999;
    this.selectedTipoPromedio = null; // nuevo
    if (this.fechaCiclos) {
      this.selectedAnio = this.fechaCiclos.year;
      this.selectedMes = this.fechaCiclos.month;
    }
    this.limpiarCapa();
  }

  private limpiarCapa(): void {
    this.lecturasLayer?.getSource()?.clear();
    this.lecturaSeleccionada = null;
    this.totalLecturas = 0;
    this.totalSinCoordenadas = 0;
  }

  //==================================
  // MAPA
  //==================================
  private crearMapa(): void {
    const base = new LayerGroup({
      layers: [new TileLayer({ source: new OSM(), visible: true })],
    });
    //==== capa de lotes (WMS) ====
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
        projection: "EPSG:4326",
        center: [-76.1223, -5.9018], // ---Yurimaguas)
        zoom: 14,
      }),
    });
  }

  private estiloLectura(feature: any): Style {
    const estado = feature.get("estadolectura");
    let color = "#22c55e"; // 000 normal → verde
    if (estado === "008")
      color = "#ef4444"; // atípico → rojo
    else if (estado === "003" || estado === "999")
      color = "#f97316"; // sin registro → naranja
    else if (estado !== "000") color = "#3b82f6"; // observados → azul

    return new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
      }),
    });
  }

  //==================================
  // POPUP
  //==================================
  cerrarPopup(): void {
    this.lecturaSeleccionada = null;
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      const feature = this.map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        hitTolerance: 5,
      });
      if (feature) {
        this.lecturaSeleccionada = feature.getProperties();
        this.cargarDatosPopup(this.lecturaSeleccionada);
      } else {
        this.cerrarPopup();
      }
    });
  }

  // ==================================
  // LIGHTBOX
  // ==================================
  abrirImagenCompleta(index: number): void {
    if (index >= 0 && index < this.imagenesPopup.length) {
      this.imagenAbiertaIndex = index;
      this.imagenAbierta = this.imagenesPopup[index].src;
      this.imagenZoom = 1;
    }
  }

  cerrarImagenCompleta(): void {
    this.imagenAbierta = null;
    this.imagenAbiertaIndex = -1;
    this.imagenZoom = 1;
  }

  getDescripcionEstadoLectura(codigo: string): string {
    if (!codigo) return '-';
    const estado = this.lista_estadolec.find(e => e.codigo === codigo);
    return estado ? estado.descripcion : codigo;
  }

  siguienteImagen(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.imagenesPopup.length === 0) return;
    const nextIndex = (this.imagenAbiertaIndex + 1) % this.imagenesPopup.length;
    this.abrirImagenCompleta(nextIndex);
  }

  anteriorImagen(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.imagenesPopup.length === 0) return;
    const prevIndex = (this.imagenAbiertaIndex - 1 + this.imagenesPopup.length) % this.imagenesPopup.length;
    this.abrirImagenCompleta(prevIndex);
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (!this.imagenAbierta) return;
    if (event.key === 'ArrowRight') {
      this.siguienteImagen();
    } else if (event.key === 'ArrowLeft') {
      this.anteriorImagen();
    } else if (event.key === 'Escape') {
      this.cerrarImagenCompleta();
    }
  }

  zoomIn(): void  { this.imagenZoom = Math.min(this.imagenZoom + 0.25, 5); }
  zoomOut(): void { this.imagenZoom = Math.max(this.imagenZoom - 0.25, 0.25); }
  resetZoom(): void { this.imagenZoom = 1; }

  onWheelZoom(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    this.imagenZoom = Math.min(Math.max(this.imagenZoom + delta, 0.25), 5);
  }

  // ==================================
  // CARGA DE DATOS DEL POPUP
  // ==================================
  private cargarDatosPopup(lectura: any): void {
    this.imagenesPopup = [];
    this.datosClientePopup = null;
    this.cargandoImagenes = true;

    const codsuc = lectura.codsuc || this.selectedSucursal?.codsuc || '002';
    const codcliente = lectura.codcliente;

    // Calcular rango de últimos 2 meses
    const hoy = new Date();
    const fechaFinal = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    const fechaInicial = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);

    const pad = (n: number) => String(n).padStart(2, '0');
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const payloadImg = {
      codsuc,
      codcliente,
      fecha_inicial: formatDate(fechaInicial),
      fecha_final: formatDate(fechaFinal),
      tipoarchivo: 'IMG',
      tiporecepcion: this.TIPOS_RECEPCION_IMG,
    };

    const urlImg = `${environment.HOST_API_EXTERNA}ftp/generico/download/read_x_tipo`;
    const urlCliente = `${environment.HOST_API_CATASTRO}clientes/obtiene-datos-ficha-catastral/${codsuc}/${codcliente}`;

    forkJoin({
      imagenes: this.http.post<any>(urlImg, payloadImg).pipe(catchError(() => of({ mensaje: 'ERROR', data: [] }))),
      cliente: this.http.get<any>(urlCliente).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ imagenes, cliente }) => {
        this.cargandoImagenes = false;

        if (cliente) {
          const clie = cliente.clie || cliente.clientes || {};
          this.datosClientePopup = {
            ...clie,
            _predio:       cliente.pred        || cliente.predio        || {},
            _medidor:      cliente.medidor_cliente || cliente.medidor   || {},
            _conexionAgua: cliente.conx_agua   || cliente.conexion_agua || {},
            _calidad:      cliente.calidad     || {},
          };
        }

        if (imagenes?.mensaje === 'EXITO' && imagenes?.data?.length > 0) {
          this.imagenesPopup = imagenes.data
            .filter((e: any) => {
              if (e.tiporecepcionimages) {
                return !e.tiporecepcionimages.includes('FIRMA');
              }
              return true;
            })
            .map((e: any) => ({
              ...e,
              src: e.img64?.startsWith('data:')
                ? e.img64
                : 'data:image/jpeg;base64,' + e.img64,
            }));
        } else {
          this.imagenesPopup = [];
        }
      },
      error: () => {
        this.cargandoImagenes = false;
      },
    });
  }
}
