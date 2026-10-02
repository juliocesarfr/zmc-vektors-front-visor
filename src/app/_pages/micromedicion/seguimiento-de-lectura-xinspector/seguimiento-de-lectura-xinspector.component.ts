import {
  Component,
  AfterViewInit,
  OnInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
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
import LineString from "ol/geom/LineString";
import { getCenter } from "ol/extent";

import { MessageService } from "primeng/api";
import { FormsModule } from "@angular/forms";
import { DropdownModule } from "primeng/dropdown";
import { ButtonModule } from "primeng/button";
import { ToastModule } from "primeng/toast";
import { TableModule } from "primeng/table";
import { InputTextModule } from "primeng/inputtext";

import { AperturaMicromedicionService } from "@host/_servicios/micromedicion/apertura-micromedicion.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { SectoresCicloService } from "@host/_servicios/seguridad/sectores-ciclo.service";
import { MicromedicionService } from "@host/_servicios/vektors/micromedicion.service";
import { Filtroresumenxinspector } from "@host/_models/vektors/Filtroresumenxinspector";
import { Filtrodetalletomalectura_xinspector } from "@host/_models/vektors/Filtrodetalletomalectura_xinspector";

import { ORIGENES_COORDENADA, ConfigOrigenCoordenada } from "../../../shared/constantes/coordenadas";
import { COLORES_SEGUIMIENTO_LECTURA } from "../../../shared/constantes/colores-mapa";
import { LISTA_MESES } from "../../../shared/constantes/lecturas";
import { Sector, SECTOR_TODOS } from "../../../shared/modelos/sector.model";
import { ROTULO_ENVIVO_MS } from "../../../shared/mapa/destello-lecturas";
import { extraerCoordenada, distanciaHaversineMetros, crearFeaturePunto, crearFeatureLinea, contarPuntosEnCirculo } from "../../../shared/mapa/geo.utils";
import {
  MapEstilosFactory,
  RADIOS_LECTURA,
  RADIOS_FICHA,
} from "../../../shared/mapa/mapa-estilos";
import { agregarHerramientasMapa } from "../../../shared/mapa/herramientas-medicion";
import { DestelloLecturas } from "../../../shared/mapa/destello-lecturas";
import { GisConfigService, WGS84 } from "../../../core/gis";
import {
  ContextoTiempoReal,
  LecturaEnVivo,
  LecturasEnVivoService,
} from "../../../core/tiempo-real";
import { observarTamanoMapa } from "../../../shared/mapa/observar-tamano-mapa";
import { CapasSidebarComponent } from "../../../shared/components/capas-sidebar/capas-sidebar.component";
import { crearCapaWms, crearCapaOsm, crearCapaSatelital, CAPAS_BASE_UI } from "../../../shared/mapa/capas";
import { coordenadaLonLat, abrirGoogleStreetView } from "../../../shared/mapa/street-view";
import { abrirConsultaUsuario } from "../../../shared/dialogos/consulta-usuario.dialog";
import type Circle from "ol/geom/Circle";

const ORIGEN_TOMA_INSPECTOR: ConfigOrigenCoordenada = {
  lonField: "longitud",
  latField: "latitud",
  proyeccion: WGS84,
};

// Metros predio→toma desde los que la lectura cuenta como "tomada lejos". TODO: confirmar con el área comercial.
const DISTANCIA_SOSPECHOSA_M = 30;

// Más allá de esto la coordenada es un GPS erróneo: no se dibuja y cuenta como sospechosa. TODO: confirmar con campo.
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

// Igual que el SP de resumen: TOMADA = web 1 y recibido 1; la coordenada no define el estado.
function esLecturaTomada(registro: RegistroDetalle): boolean {
  return Number(registro.web) === 1 && Number(registro.recibido) === 1;
}

@Component({
  selector: "app-seguimiento-de-lectura-xinspector",
  standalone: true,
  imports: [
    CapasSidebarComponent,
    CommonModule,
    FormsModule,
    DropdownModule,
    ButtonModule,
    ToastModule,
    TableModule,
    InputTextModule,
  ],
  templateUrl: "./seguimiento-de-lectura-xinspector.component.html",
  styleUrl: "./seguimiento-de-lectura-xinspector.component.scss",
  providers: [
    MessageService,
    DialogService,
    // Al destruirse se da de baja del socket sin cerrarlo para las demás pantallas.
    LecturasEnVivoService,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SeguimientoDeLecturaXinspectorComponent
  implements OnInit, AfterViewInit, OnDestroy
{
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

  readonly COLORES = COLORES_SEGUIMIENTO_LECTURA;

  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;
  @ViewChild("mapContainer", { static: true })
  private mapContainer!: ElementRef<HTMLDivElement>;

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

  resumenInspectores: ResumenInspector[] = [];

  totalRegistros = 0;
  totalTomadas = 0;
  totalSinToma = 0;
  totalSospechosas = 0;
  totalLejos = 0;

  filtrosVisible = true;
  cargando = false;
  mostrarLeyenda = true;
  mostrarResumen = true;
  mostrarSearchPanel = false;
  searchCodCliente = "";
  registroSeleccionado: RegistroDetalle | null = null;
  featureSeleccionado: Feature | null = null;
  baseActive: string | null = "osm";
  ref: DynamicDialogRef | undefined;

  readonly baseLayers = CAPAS_BASE_UI;

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

    this.iniciarTiempoReal();
  }

  ngAfterViewInit(): void {
    this.crearMapa();
    this.capasSidebar?.conectarMapa(this.map);
    this.initClick();

    requestAnimationFrame(() => {
      this.map.setTarget(this.mapContainer.nativeElement);
      this.map.updateSize();
      agregarHerramientasMapa(this.map, (geometry) => {
        if (geometry && geometry.getType() === 'Circle') {
          this.contarElementosEnRadio(geometry);
        }
      });
      this.detenerObservadorMapa = observarTamanoMapa(
        this.map,
        this.mapContainer.nativeElement,
      );

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

  private aplicarLecturaEnVivo(lectura: LecturaEnVivo): void {
    const feature = this.usuariosLayer
      ?.getSource()
      ?.getFeatures()
      .find(
        (f) => String(f.get("codcliente") ?? "").trim() === lectura.codcliente,
      );

    if (!feature) return;

    // Solo la primera vez: una corrección de la misma lectura no vuelve a sumar.
    const yaEstabaTomada = feature.get("_tomada") === true;

    if (lectura.tomada && !yaEstabaTomada) {
      feature.set("_tomada", true);
      this.totalTomadas++;
      this.totalSinToma = Math.max(0, this.totalSinToma - 1);
      this.actualizarAvanceResumen(lectura.codinspector);
    }

    if (lectura.estadolectura) {
      feature.set("estadolectura", lectura.estadolectura);
    }
    if (lectura.codinspector) {
      feature.set("_codinspector", lectura.codinspector);
    }

    this.totalEnVivo++;
    this.mostrarRotulo(lectura);

    const coordToma = this.agregarPuntoTomaEnVivo(lectura, feature);

    // El destello va sobre el punto GPS real si lo hay; si no, sobre el predio.
    const geomUsuario = feature.getGeometry();
    const coordenada =
      coordToma ??
      (geomUsuario?.getType() === "Point"
        ? (geomUsuario as Point).getCoordinates()
        : null);

    if (coordenada) {
      this.destellos?.mostrar(lectura.codcliente, coordenada, {
        color: lectura.tomada ? this.COLORES.tomada : this.COLORES.sinToma,
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

  private agregarPuntoTomaEnVivo(
    lectura: LecturaEnVivo,
    featureUsuario: Feature,
  ): number[] | null {
    if (!lectura.latitud || !lectura.longitud) return null;

    const coordToma = extraerCoordenada(
      { latitud: lectura.latitud, longitud: lectura.longitud },
      ORIGEN_TOMA_INSPECTOR,
    );
    if (!coordToma) return null;

    const geomUsuario = featureUsuario.getGeometry();
    const coordUsuario =
      geomUsuario?.getType() === "Point"
        ? (geomUsuario as Point).getCoordinates()
        : null;

    const distancia =
      coordUsuario && coordToma
        ? distanciaHaversineMetros(
            coordUsuario[0],
            coordUsuario[1],
            coordToma[0],
            coordToma[1],
          )
        : null;

    const sospechosa =
      distancia !== null && distancia > DISTANCIA_MAX_TOMA_VALIDA_M;
    const lejos =
      !sospechosa && distancia !== null && distancia > DISTANCIA_SOSPECHOSA_M;

    this.totalLejos = Math.max(
      0,
      this.totalLejos - (featureUsuario.get("_lejos") === true ? 1 : 0) + (lejos ? 1 : 0),
    );
    this.totalSospechosas = Math.max(
      0,
      this.totalSospechosas -
        (featureUsuario.get("_sospechosa") === true ? 1 : 0) +
        (sospechosa ? 1 : 0),
    );

    const props = {
      codcliente: lectura.codcliente,
      _codinspector: lectura.codinspector,
      _tomada: lectura.tomada,
      _distanciaM: distancia,
      _lejos: lejos,
      _sospechosa: sospechosa,
    };

    featureUsuario.set("_lejos", lejos);
    featureUsuario.set("_sospechosa", sospechosa);
    featureUsuario.set("_distanciaM", distancia);

    this.quitarPorCliente(this.tomasLayer, lectura.codcliente);
    this.quitarPorCliente(this.lineasLayer, lectura.codcliente);

    if (sospechosa) return null;

    const fToma = new Feature({ geometry: new Point(coordToma) });
    fToma.setProperties({ ...props, _esToma: true });
    this.tomasLayer.getSource()!.addFeature(fToma);

    if (coordUsuario) {
      const fLinea = new Feature({
        geometry: new LineString([coordUsuario, coordToma]),
      });
      fLinea.setProperties(props);
      this.lineasLayer.getSource()!.addFeature(fLinea);
    }

    return coordToma;
  }

  private quitarPorCliente(
    capa: VectorLayer<VectorSource>,
    codcliente: string,
  ): void {
    const source = capa?.getSource();
    if (!source) return;

    source
      .getFeatures()
      .filter((f) => String(f.get("codcliente") ?? "").trim() === codcliente)
      .forEach((f) => source.removeFeature(f));
  }

  private actualizarAvanceResumen(codinspector?: string): void {
    if (!codinspector) return;
    const fila = this.resumenInspectores.find(
      (r) => String(r.codinspector).trim() === codinspector.trim(),
    );
    if (!fila) return;

    fila.enviados = (fila.enviados ?? 0) + 1;
    fila.pendientes = Math.max(0, (fila.pendientes ?? 0) - 1);
    fila.avance = fila.asignados
      ? Math.round((fila.enviados / fila.asignados) * 100)
      : 0;
  }

  private contarElementosEnRadio(circulo: Circle): void {
    const total = contarPuntosEnCirculo(this.usuariosLayer?.getSource(), circulo);
    this.messageService.add({
      severity: "info",
      summary: "Selección de Radio",
      detail: `Se encontraron ${total} usuarios en el área seleccionada.`,
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

    this.enVivo.actualizarContexto(this.contextoTiempoReal());

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

    const claveToma = coordToma
      ? `${coordToma[0].toFixed(5)},${coordToma[1].toFixed(5)}`
      : null;
    const repetida = claveToma ? (frecuencia.get(claveToma) ?? 0) >= 3 : false;
    const demasiadoLejos =
      distancia !== null && distancia > DISTANCIA_MAX_TOMA_VALIDA_M;
    const sospechosa = repetida || demasiadoLejos;

    const lejos =
      !sospechosa && distancia !== null && distancia > DISTANCIA_SOSPECHOSA_M;

    const props = {
      _codinspector: this.selectedInspector?.codinspector,
      _tomada: tomada,
      _distanciaM: distancia,
      _lejos: lejos,
      _sospechosa: sospechosa,
    };

    this.totalRegistros++;
    if (tomada) this.totalTomadas++;
    else this.totalSinToma++;
    if (sospechosa) this.totalSospechosas++;
    else if (lejos) this.totalLejos++;

    const fUsuario = crearFeaturePunto(registro, ORIGENES_COORDENADA.usuario);
    if (fUsuario) {
      fUsuario.setProperties({ ...props, _esToma: false });
      srcUsuarios.addFeature(fUsuario);
    }

    if (!sospechosa) {
      const fToma = crearFeaturePunto(registro, ORIGEN_TOMA_INSPECTOR);
      if (fToma) {
        fToma.setProperties({ ...props, _esToma: true });
        srcTomas.addFeature(fToma);
      }

      // Tope alto a propósito: las líneas largas se marcan en rojo; la basura ya se descartó arriba.
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
    this.destellos?.limpiar();
    this.resumenInspectores = [];
    this.totalRegistros = 0;
    this.totalTomadas = 0;
    this.totalSinToma = 0;
    this.totalSospechosas = 0;
    this.totalLejos = 0;
    this.totalEnVivo = 0;
    this.ultimaEnVivo = null;
    clearTimeout(this.timeoutRotulo);
    this.registroSeleccionado = null;
    this.featureSeleccionado = null;
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

    this.tomasLayer = new VectorLayer({
      source: new VectorSource(),
      style: (f) =>
        this.estilos.punto({
          forma: "rombo",
          color: this.COLORES.puntoToma,
          zoom: zoomActual(),
          seleccionado: f === this.featureSeleccionado,
          etiqueta: undefined,
          ...RADIOS_FICHA,
        }),
    });

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
      // Sin target aquí: en el microfrontend el id "map" engancha otro div. Se asigna más abajo.
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
        projection: this.gis.proyeccionMapa,
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

  abrirStreetView(x: unknown, y: unknown): void {
    const lonLat = coordenadaLonLat(x, y, this.gis.proyeccionUtm);
    if (!lonLat) {
      this.avisar("warn", "Aviso", "Coordenadas no disponibles para este predio");
      return;
    }
    abrirGoogleStreetView(lonLat);
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
    this.ref = abrirConsultaUsuario(
      this.dialogService,
      codcliente,
      this.selectedSucursal?.codsuc || this.registroSeleccionado?.codsuc,
    );
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