import {
  Component,
  AfterViewInit,
  OnInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  ViewChild,
  ElementRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
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
import { getCenter } from "ol/extent";

import { MessageService } from "primeng/api";
import { FormsModule } from "@angular/forms";
import { DropdownModule } from "primeng/dropdown";
import { ButtonModule } from "primeng/button";
import { ToastModule } from "primeng/toast";
import { TagModule } from "primeng/tag";
import { TableModule } from "primeng/table";
import { InputTextModule } from "primeng/inputtext";

import { AperturaMicromedicionService } from "@host/_servicios/micromedicion/apertura-micromedicion.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { SectoresCicloService } from "@host/_servicios/seguridad/sectores-ciclo.service";
import { MicromedicionService } from "@host/_servicios/vektors/micromedicion.service";
import { Filtroresumenxinspector } from "@host/_models/vektors/Filtroresumenxinspector";
import { Filtrodetalletomalectura_xinspector } from "@host/_models/vektors/Filtrodetalletomalectura_xinspector";

import {
  PROYECCION_MAPA,
  ORIGENES_COORDENADA,
  ConfigOrigenCoordenada,
  COLORES_SEGUIMIENTO_LECTURA,
  LISTA_MESES,
  Sector,
  SECTOR_TODOS,
} from "../../../config/Controldigitacion.config";
import { fromCircle } from 'ol/geom/Polygon';
import {
  extraerCoordenada,
  distanciaHaversineMetros,
  crearFeaturePunto,
  crearFeatureLinea,
} from "../.././../util/Geo.utils";
import {
  MapEstilosFactory,
  RADIOS_LECTURA,
  RADIOS_FICHA,
} from "../../../util/Mapaestilos.factory";
import { GisConfigService } from "../../../core/gis";
import { observarTamanoMapa } from "../../../util/Mapinit.util";

// ============================================================
// Config propia de este módulo
// ============================================================

/** Coordenada donde el inspector registró la toma (viene como string del backend). */
const ORIGEN_TOMA_INSPECTOR: ConfigOrigenCoordenada = {
  lonField: "longitud",
  latField: "latitud",
  proyeccion: "EPSG:4326",
};

/**
 * Umbral en metros entre el predio y el punto de toma a partir del cual la
 * lectura se considera "tomada lejos" (posible lectura sin visitar el predio).
 * TODO: confirmar el valor con el área comercial.
 */
const DISTANCIA_SOSPECHOSA_M = 30;

/**
 * Más allá de esta distancia, la coordenada de toma es casi seguro un GPS por
 * defecto/erróneo (no una toma real lejana). No se dibuja la toma ni la línea
 * para no ensuciar el mapa con trazos que lo cruzan; el registro se cuenta
 * como sospechoso. TODO: confirmar el valor con campo.
 */
const DISTANCIA_MAX_TOMA_VALIDA_M = 1000;

interface Inspector {
  codinspector: string;
  names: string;
  [key: string]: unknown;
}

/** Fila del resumen, según usp_vektors_resumentomalectura_xinspectores. */
interface ResumenInspector {
  codinspector: string;
  inspector: string;
  asignados: number;
  enviados: number;
  pendientes: number;
  avance: number;
}

interface RegistroDetalle {
  codcliente?: string;
  codsuc?: string;
  estadolectura?: string;
  latitud?: string;
  longitud?: string;
  web?: number | string;
  recibido?: number | string;
  [key: string]: unknown;
}

/**
 * Misma regla del SP de resumen: una lectura está TOMADA (enviada) cuando
 * web = 1 y recibido = 1. La presencia de coordenada de toma NO define el
 * estado; solo sirve para ubicar el punto GPS y medir la distancia al predio.
 */
function esLecturaTomada(registro: RegistroDetalle): boolean {
  return Number(registro.web) === 1 && Number(registro.recibido) === 1;
}

@Component({
  selector: "app-seguimiento-de-lectura-xinspector",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DropdownModule,
    ButtonModule,
    ToastModule,
    TagModule,
    TableModule,
    InputTextModule,
  ],
  templateUrl: "./seguimiento-de-lectura-xinspector.component.html",
  styleUrl: "./seguimiento-de-lectura-xinspector.component.scss",
  providers: [MessageService, DialogService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SeguimientoDeLecturaXinspectorComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private readonly destroyRef = inject(DestroyRef);
  /** GeoServer y capas de la EPS logueada; ya resueltos por `gisConfigResolver`. */
  private readonly gis = inject(GisConfigService);
  private readonly estilos = new MapEstilosFactory();
  private detenerObservadorMapa?: () => void;

  /** Paleta centralizada (config). Expuesta al template para leyenda/tarjetas. */
  readonly COLORES = COLORES_SEGUIMIENTO_LECTURA;

  /** Referencia directa al <div #mapContainer> real montado por Angular. */
  @ViewChild("mapContainer", { static: true })
  private mapContainer!: ElementRef<HTMLDivElement>;

  // ---- Mapa y capas ----
  map!: OlMap;
  usuariosLayer!: VectorLayer<VectorSource>;
  tomasLayer!: VectorLayer<VectorSource>;
  lineasLayer!: VectorLayer<VectorSource>;
  lotesLayer!: TileLayer<TileWMS>;
  sectoresComercialesLayer!: TileLayer<TileWMS>;
  callesLayer!: TileLayer<TileWMS>;
  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;
  private capasVector: VectorLayer<VectorSource>[] = [];
  private registroCapas: Record<string, BaseLayer> = {};

  // ---- Sesión ----
  private readonly _codsede = sessionStorage.getItem("codsede");

  // ---- Filtros ----
  dataCiclos: any[] = [];
  fechaCiclos: any;
  listaSucursalesxusr: any[] = [];
  totalSectores2: Sector[] = [];
  inspectoresxSector: Inspector[] = [];

  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: Sector | null = null;
  selectedInspector: Inspector | null = null;
  selectedAnio = "";
  selectedMes = "";

  readonly listaMeses = LISTA_MESES;
  readonly listaYear: { anio: string }[] = Array.from(
    { length: 6 },
    (_, i) => ({
      anio: String(new Date().getFullYear() - i),
    }),
  );

  // ---- Resultados ----
  resumenInspectores: ResumenInspector[] = [];

  // ---- Estadísticas del detalle pintado ----
  totalRegistros = 0;
  totalTomadas = 0;
  totalSinToma = 0;
  totalSospechosas = 0;
  totalLejos = 0;

  filtrosVisible = true;
  sidebarOpen = true;
  cargando = false;
  mostrarLeyenda = true;
  mostrarResumen = true;
  mostrarSearchPanel = false;
  searchCodCliente = "";
  registroSeleccionado: RegistroDetalle | null = null;
  featureSeleccionado: Feature | null = null;
  baseActive: string | null = "osm";
  ref: DynamicDialogRef | undefined;

  baseLayers = [
    {
      id: "osm",
      label: "OSM",
      iconUrl: "assets/images/img-georeferencia/capa-osm-icon.gif",
    },
    {
      id: "satelital",
      label: "Satelital",
      iconUrl: "assets/images/img-georeferencia/satellital-icon.gif",
    },
  ];

  commercialLayers = [
    { id: "usuarios", label: "Usuarios", active: true },
    { id: "tomas", label: "Puntos de Toma", active: true },
    { id: "lineas", label: "Líneas Usuario → Toma", active: true },
    { id: "lotes", label: "Lotes", active: true },
    { id: "sectores", label: "Sectores Comerciales", active: false },
    { id: "calles", label: "Calles", active: false },
  ];

  constructor(
    private aperturaservices: AperturaMicromedicionService,
    private seguridadService: SucursalesService,
    private sectoresService: SectoresCicloService,
    private micromedicionService: MicromedicionService,
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
  }

  ngAfterViewInit(): void {
    this.crearMapa();
    this.initClick();
    // Engancha el mapa al div REAL (no por id string). En microfrontend el
    // elemento montado al navegar no siempre coincide con getElementById("map").
    // requestAnimationFrame asegura que el layout del MF ya esté aplicado.
    requestAnimationFrame(() => {
      this.map.setTarget(this.mapContainer.nativeElement);
      this.map.updateSize();
      MapEstilosFactory.setupAdvancedMapTools(this.map, (geometry) => {
        if (geometry && geometry.getType() === 'Circle') {
          this.contarElementosEnRadio(geometry);
        }
      });
      this.detenerObservadorMapa = observarTamanoMapa(
        this.map,
        this.mapContainer.nativeElement,
      );
    });
  }

  ngOnDestroy(): void {
    this.detenerObservadorMapa?.();
    this.map?.setTarget(undefined);
    this.ref?.close();
  }

  private contarElementosEnRadio(circleGeom: any): void {
    const polygon = fromCircle(circleGeom);
    const extent = polygon.getExtent();
    let count = 0;

    if (this.usuariosLayer) {
      const source = this.usuariosLayer.getSource();
      if (source) {
        source.forEachFeatureIntersectingExtent(extent, (feature) => {
          const geom = feature.getGeometry();
          if (geom && polygon.intersectsCoordinate((geom as any).getCoordinates())) {
            count++;
          }
        });
      }
    }

    this.messageService.add({
      severity: 'info',
      summary: 'Selección de Radio',
      detail: `Se encontraron ${count} usuarios en el área seleccionada.`
    });
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
    this.selectedInspector = null;
    this.inspectoresxSector = [];
    this.limpiarResultados();
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

  /** Sectores e inspectores dependen ambos de codsuc: se piden en paralelo. */
  onSucursalChange(): void {
    this.selectedSector = null;
    this.selectedInspector = null;
    this.inspectoresxSector = [];
    if (!this.selectedSucursal) return;

    forkJoin({
      sectores: this.sectoresService
        .drop_sectores_x_ciclo(
          this.selectedSucursal.codsuc,
          this.selectedCiclo.codciclo,
        )
        .pipe(catchError(() => of([]))),
      inspectores: this.aperturaservices
        .getInspectores(this.selectedSucursal.codsuc)
        .pipe(catchError(() => of({ data: [] }))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ sectores, inspectores }) => {
        this.totalSectores2 = [SECTOR_TODOS, ...sectores];
        this.selectedSector = this.totalSectores2[0];
        this.inspectoresxSector = inspectores?.data || [];
      });
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

  private filtroBase(): Filtroresumenxinspector {
    return {
      codciclo: this.selectedCiclo.codciclo,
      codsuc: this.selectedSucursal.codsuc,
      codsector: this.selectedSector?.codsector || "%",
      anio: this.selectedAnio,
      mes: this.selectedMes,
    };
  }

  // ============================================================
  // BÚSQUEDA: resumen (todos los inspectores) + detalle (uno)
  // ============================================================

  procesar(): void {
    if (!this.filtrosBasicosValidos()) return;
    if (!this.selectedInspector) {
      this.avisar("warn", "Aviso de usuario", "Seleccione un inspector");
      return;
    }

    this.cargando = true;
    this.limpiarResultados();

    const base = this.filtroBase();
    const filtroDetalle: Filtrodetalletomalectura_xinspector = {
      ...base,
      codinspector: this.selectedInspector.codinspector,
    };

    forkJoin({
      resumen: this.micromedicionService
        .resumentomalectura_xinspectore(base)
        .pipe(catchError(() => of({ data: [] }))),
      detalle: this.micromedicionService
        .detalletomalectura_xinspector(filtroDetalle)
        .pipe(catchError(() => of({ data: [] }))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ resumen, detalle }) => {
          this.cargando = false;
          this.filtrosVisible = false;

          const dataResumen = resumen?.data;
          this.resumenInspectores = Array.isArray(dataResumen)
            ? dataResumen
            : dataResumen
              ? [dataResumen]
              : [];

          const dataDetalle = detalle?.data;
          const registros: RegistroDetalle[] = Array.isArray(dataDetalle)
            ? dataDetalle
            : dataDetalle
              ? [dataDetalle as RegistroDetalle]
              : [];

          this.pintarDetalle(registros);
        },
        error: () => {
          this.cargando = false;
          this.avisar(
            "error",
            "Aviso de usuario",
            "Ocurrió un error al cargar el seguimiento",
          );
        },
      });
  }

  /**
   * Clic en una fila del resumen: selecciona ese inspector y recarga su detalle.
   * Es el flujo natural de un supervisor recorriendo inspector por inspector.
   */
  seleccionarInspectorDesdeResumen(fila: ResumenInspector): void {
    const inspector = this.inspectoresxSector.find(
      (i) => i.codinspector === fila.codinspector,
    );
    if (!inspector) {
      this.avisar(
        "warn",
        "Aviso",
        "El inspector no está disponible en la lista actual",
      );
      return;
    }
    this.selectedInspector = inspector;
    this.procesar();
  }

  private pintarDetalle(registros: RegistroDetalle[]): void {
    const srcUsuarios = this.usuariosLayer.getSource()!;
    const srcTomas = this.tomasLayer.getSource()!;
    const srcLineas = this.lineasLayer.getSource()!;

    // Una misma coordenada de toma repetida en muchos registros casi siempre es
    // un valor por defecto (el GPS no capturó y quedó un punto fijo), no tomas
    // reales lejanas. Se cuenta la frecuencia para descartarlas.
    const frecuencia = new Map<string, number>();
    for (const r of registros) {
      const c = extraerCoordenada(r, ORIGEN_TOMA_INSPECTOR);
      if (!c) continue;
      const clave = `${c[0].toFixed(5)},${c[1].toFixed(5)}`;
      frecuencia.set(clave, (frecuencia.get(clave) ?? 0) + 1);
    }

    for (const registro of registros) {
      this.agregarRegistroAlMapa(
        registro,
        srcUsuarios,
        srcTomas,
        srcLineas,
        frecuencia,
      );
    }
    if (this.totalRegistros === 0) {
      this.avisar(
        "info",
        "Aviso",
        "No se encontraron lecturas para el inspector seleccionado",
      );
      return;
    }

    const extent =
      srcUsuarios.getFeatures().length > 0
        ? srcUsuarios.getExtent()
        : srcTomas.getFeatures().length > 0
          ? srcTomas.getExtent()
          : null;

    if (extent) {
      this.map
        .getView()
        .fit(extent, { duration: 800, maxZoom: 18, padding: [60, 60, 60, 60] });
    }
    this.avisar(
      "success",
      "Proceso completado",
      "Seguimiento cargado en el mapa",
    );
  }

  /**
   * Por cada registro:
   * - Punto del USUARIO: verde si la lectura fue enviada (web=1 y recibido=1),
   *   rojo si está pendiente. Misma regla que el SP de resumen.
   * - Punto de TOMA del inspector, si registró coordenada GPS válida.
   * - Línea usuario→toma con la distancia; roja si supera el umbral.
   * Los puntos de toma dudosos (coordenada repetida o demasiado lejana) NO se
   * dibujan: solo se cuentan, para no llenar el mapa de trazos falsos.
   */
  private agregarRegistroAlMapa(
    registro: RegistroDetalle,
    srcUsuarios: VectorSource,
    srcTomas: VectorSource,
    srcLineas: VectorSource,
    frecuencia: Map<string, number>,
  ): void {
    const coordUsuario = extraerCoordenada(
      registro,
      ORIGENES_COORDENADA.usuario,
    );
    const coordToma = extraerCoordenada(registro, ORIGEN_TOMA_INSPECTOR);

    const tomada = esLecturaTomada(registro);
    const distancia =
      coordUsuario && coordToma
        ? distanciaHaversineMetros(
            coordUsuario[0],
            coordUsuario[1],
            coordToma[0],
            coordToma[1],
          )
        : null;

    // Coordenada de toma dudosa: se repite en 3+ registros (GPS por defecto) o
    // está a más de DISTANCIA_MAX_TOMA_VALIDA_M (basura que cruza el mapa).
    const claveToma = coordToma
      ? `${coordToma[0].toFixed(5)},${coordToma[1].toFixed(5)}`
      : null;
    const repetida = claveToma ? (frecuencia.get(claveToma) ?? 0) >= 3 : false;
    const demasiadoLejos =
      distancia !== null && distancia > DISTANCIA_MAX_TOMA_VALIDA_M;
    const sospechosa = repetida || demasiadoLejos;

    // "Lejos" real: pasa el umbral operativo pero NO es una coordenada dudosa.
    const lejos =
      !sospechosa && distancia !== null && distancia > DISTANCIA_SOSPECHOSA_M;

    const props = {
      _codinspector: this.selectedInspector?.codinspector,
      _tomada: tomada,
      _distanciaM: distancia,
      _lejos: lejos,
      _sospechosa: sospechosa,
    };

    // Estadísticas
    this.totalRegistros++;
    if (tomada) this.totalTomadas++;
    else this.totalSinToma++;
    if (sospechosa) this.totalSospechosas++;
    else if (lejos) this.totalLejos++;

    // Punto del usuario: SIEMPRE (reutiliza crearFeaturePunto).
    const fUsuario = crearFeaturePunto(registro, ORIGENES_COORDENADA.usuario);
    if (fUsuario) {
      fUsuario.setProperties({ ...props, _esToma: false });
      srcUsuarios.addFeature(fUsuario);
    }

    // Punto de toma y línea: solo si la coordenada de toma NO es dudosa.
    if (!sospechosa) {
      const fToma = crearFeaturePunto(registro, ORIGEN_TOMA_INSPECTOR);
      if (fToma) {
        fToma.setProperties({ ...props, _esToma: true });
        srcTomas.addFeature(fToma);
      }

      // Tope alto: aquí SÍ queremos las líneas largas (para marcarlas rojas);
      // el descarte de basura ya lo hizo el guard de "sospechosa" de arriba.
      const fLinea = crearFeatureLinea(
        registro,
        ORIGENES_COORDENADA.usuario,
        ORIGEN_TOMA_INSPECTOR,
        Number.MAX_SAFE_INTEGER,
      );
      if (fLinea) {
        fLinea.setProperties(props);
        srcLineas.addFeature(fLinea);
      }
    }
  }

  limpiarResultados(): void {
    this.estilos.limpiar();
    this.capasVector.forEach((capa) => capa?.getSource()?.clear());
    this.resumenInspectores = [];
    this.totalRegistros = 0;
    this.totalTomadas = 0;
    this.totalSinToma = 0;
    this.totalSospechosas = 0;
    this.totalLejos = 0;
    this.registroSeleccionado = null;
    this.featureSeleccionado = null;
  }

  // ============================================================
  // MAPA
  // ============================================================

  private crearWms(layer: string, visible: boolean): TileLayer<TileWMS> {
    return new TileLayer({
      visible,
      source: new TileWMS({
        url: this.gis.urlWms(),
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

    this.lotesLayer = this.crearWms(this.gis.capa("lotes"), true);
    this.sectoresComercialesLayer = this.crearWms(
      this.gis.capa("sectoresComerciales"),
      false,
    );
    this.callesLayer = this.crearWms(this.gis.capa("calles"), false);

    const zoomActual = () => this.map?.getView().getZoom() ?? 14;

    // Punto del usuario/predio: círculo, color según tomada/pendiente (paleta config).
    this.usuariosLayer = new VectorLayer({
      source: new VectorSource(),
      style: (f) =>
        this.estilos.punto({
          forma: "circulo",
          color: f.get("_tomada") ? this.COLORES.tomada : this.COLORES.sinToma,
          zoom: zoomActual(),
          seleccionado: f === this.featureSeleccionado,
          etiqueta: f.get("codcliente"),
          ...RADIOS_LECTURA,
        }),
    });

    // Punto GPS de toma del inspector: rombo azul (paleta config).
    this.tomasLayer = new VectorLayer({
      source: new VectorSource(),
      style: (f) =>
        this.estilos.punto({
          forma: "rombo",
          color: this.COLORES.puntoToma,
          zoom: zoomActual(),
          seleccionado: f === this.featureSeleccionado,
          etiqueta: undefined, // el codcliente ya lo etiqueta el punto de usuario
          ...RADIOS_FICHA,
        }),
    });

    // Línea usuario→toma: gris dentro del umbral, roja si el inspector tomó lejos.
    this.lineasLayer = new VectorLayer({
      source: new VectorSource(),
      style: (f, resolution) =>
        this.estilos.lineaAcometida(
          f.get("_lejos") ? this.COLORES.lineaLejos : this.COLORES.lineaOk,
          f === this.featureSeleccionado,
          resolution,
        ),
    });

    this.capasVector = [this.usuariosLayer, this.tomasLayer, this.lineasLayer];

    this.registroCapas = {
      usuarios: this.usuariosLayer,
      tomas: this.tomasLayer,
      lineas: this.lineasLayer,
      lotes: this.lotesLayer,
      sectores: this.sectoresComercialesLayer,
      calles: this.callesLayer,
    };

    this.map = new OlMap({
      // NO se pasa target aquí: en un microfrontend, resolver el id "map" por
      // string durante la construcción engancha un div equivocado o inexistente.
      // Se engancha más abajo con setTarget sobre la referencia real del @ViewChild.
      layers: [
        new LayerGroup({ layers: [this.osmLayer, this.satelitalLayer] }),
        this.sectoresComercialesLayer,
        this.callesLayer,
        this.lotesLayer,
        this.lineasLayer,
        this.tomasLayer,
        this.usuariosLayer,
      ],
      view: new View({
        projection: PROYECCION_MAPA,
        center: this.gis.vista.centro,
        zoom: this.gis.vista.zoom,
      }),
    });
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      const feature = this.map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        hitTolerance: 5,
        layerFilter: (layer: any) => !layer.get('isDrawLayer')
      }) as Feature | undefined;

      if (feature) {
        this.seleccionarFeature(feature);
      } else {
        this.cerrarPopup();
      }
    });
  }

  /** Punto único de selección: click en el mapa y buscador reutilizan esto. */
  private seleccionarFeature(feature: Feature): void {
    this.featureSeleccionado = feature;
    this.registroSeleccionado = feature.getProperties() as RegistroDetalle;
    this.capasVector.forEach((capa) => capa.changed());
  }

  cerrarPopup(): void {
    this.registroSeleccionado = null;
    this.featureSeleccionado = null;
    this.capasVector.forEach((capa) => capa.changed());
  }

  abrirStreetView(lon: any, lat: any) {
    if (lat && lon) {
      window.open(
        `https://www.google.com/maps?layer=c&cbll=${lat},${lon}`,
        "_blank"
      );
    } else {
      this.avisar("warn", "Aviso", "Coordenadas no disponibles para este predio");
    }
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

  // ============================================================
  // BUSCADOR POR CÓDIGO DE CLIENTE (dentro de lo cargado en el mapa)
  // ============================================================

  abrirBusqueda(): void {
    this.mostrarSearchPanel = true;
    this.searchCodCliente = "";
  }

  buscarPorCodCliente(): void {
    const query = String(this.searchCodCliente || "").trim();
    if (!query) return;

    // Se busca solo en la capa de usuarios: es la que siempre tiene codcliente
    // y su punto es el ancla lógica del registro (la toma cuelga de él).
    const feature = this.usuariosLayer
      ?.getSource()
      ?.getFeatures()
      .find((f) => String(f.get("codcliente") || "").trim() === query);

    if (!feature) {
      this.avisar(
        "warn",
        "Aviso",
        "No se encontró el usuario en el detalle cargado. Verifique el inspector y sector seleccionados.",
      );
      return;
    }

    this.seleccionarFeature(feature);
    const geom = feature.getGeometry();
    if (geom) {
      this.map.getView().animate({
        center: getCenter(geom.getExtent()),
        zoom: 20,
        duration: 800,
      });
    }
    this.mostrarSearchPanel = false;
  }

  // ============================================================
  // CONSULTA GENERAL DE USUARIO
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
          this.selectedSucursal?.codsuc || this.registroSeleccionado?.codsuc,
        operacion: "Vektors",
      },
    });
  }

  // ============================================================
  // HELPERS DE VISTA
  // ============================================================

  nombreInspector(codinspector: string | undefined): string {
    if (!codinspector) return "-";
    const insp = this.inspectoresxSector.find(
      (i) => i.codinspector === codinspector,
    );
    return insp ? `(${insp.codinspector}) ${insp.names}` : codinspector;
  }

  formatoDistancia(metros: number | null | undefined): string {
    if (metros == null) return "-";
    return metros >= 1000
      ? `${(metros / 1000).toFixed(2)} km`
      : `${metros.toFixed(0)} m`;
  }

  centrarEnSeleccion(): void {
    const geom = this.featureSeleccionado?.getGeometry();
    if (!geom) return;
    this.map.getView().animate({
      center: getCenter(geom.getExtent()),
      zoom: 20,
      duration: 600,
    });
  }

  private avisar(
    severity: "success" | "info" | "warn" | "error",
    summary: string,
    detail: string,
  ): void {
    this.messageService.add({ severity, summary, detail });
  }
}