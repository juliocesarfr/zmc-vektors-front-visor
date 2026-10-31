import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { of, Subscription } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { ButtonModule } from "primeng/button";
import { CalendarModule } from "primeng/calendar";
import { DropdownModule } from "primeng/dropdown";
import { InputTextModule } from "primeng/inputtext";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";

import OlMap from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { circular } from "ol/geom/Polygon";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import BaseLayer from "ol/layer/Base";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import VectorSource from "ol/source/Vector";
import Zoom from "ol/control/Zoom";
import { createEmpty, extend, isEmpty } from "ol/extent";
import { transform } from "ol/proj";
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from "ol/style";

import { RecaudacionService } from "@host/_servicios/vektors/recaudacion.service";
import { SedeOperacionalService } from "@host/_servicios/seguridad/sede-operacional.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { ExcelService } from "@host/_servicios/reportes/excel.service";
import { CarService } from "@host/_servicios/administracion/car.service";
import { car as RegistroCar } from "@host/_models/administracion/car";
import { PagoClienteCar } from "@host/_models/vektors/Recaudacion/CoberturaCar";

import { CapaConsultable, ConsultaCapasGisService, GisConfigService, WGS84 } from "../../../core/gis";
import { volverAlMainGeoreferencia } from "../../../shared/utils/navegacion.utils";
import { ORIGENES_COORDENADA } from "../../../shared/constantes/coordenadas";
import { observarTamanoMapa } from "../../../shared/mapa/observar-tamano-mapa";
import { MapEstilosFactory, RADIOS_LECTURA } from "../../../shared/mapa/mapa-estilos";
import { estaUsandoHerramientas } from "../../../shared/mapa/herramientas-medicion";
import { MARCA_CAPA_RESALTADO } from "../../../shared/mapa/interaccion-gis";
import { ControladorMapaGis } from "../../../shared/mapa/controlador-mapa-gis";
import { ZOOM_PREDIO } from "../../../shared/mapa/predio-buscado";
import { CAPAS_BASE_UI, crearCapaOsm, crearCapaSatelital, crearCapaWms } from "../../../shared/mapa/capas";
import { coordenadaLonLat, abrirGoogleStreetView } from "../../../shared/mapa/street-view";
import { abrirConsultaUsuario } from "../../../shared/dialogos/consulta-usuario.dialog";
import { ColumnaListado, FilaListado, descargarListadoExcel } from "../../../shared/utils/listado-excel";
import { CapasSidebarComponent, CapaSwitchUi } from "../../../shared/components/capas-sidebar/capas-sidebar.component";
import { PanelesMapaGisComponent } from "../../../shared/components/paneles-mapa-gis/paneles-mapa-gis.component";
import {
  EntradaLeyenda,
  GrupoLeyenda,
  LeyendaGruposComponent,
} from "../../../shared/components/leyenda-grupos/leyenda-grupos.component";
import {
  CarEnMapa,
  ClienteCobertura,
  CoberturaCalculada,
  FRACCION_ALCANCE,
  ResumenCar,
  calcularCobertura,
  textoDistancia,
} from "./cobertura-x-car.reglas";

const TODOS = "ALL";

/** Columnas de la tabla y del Excel de los clientes del área dibujada y de los que no tienen coordenadas. */
const COLUMNAS_CLIENTES: ColumnaListado[] = [
  { campo: "codcliente", titulo: "Cód. cliente", anchoExcel: 12 },
  { campo: "propietario", titulo: "Titular", anchoExcel: 35 },
  { campo: "direccion", titulo: "Dirección", anchoExcel: 35 },
  { campo: "carPrincipal", titulo: "CAR donde paga", anchoExcel: 30 },
  { campo: "nropagos", titulo: "Pagos", anchoExcel: 8 },
  { campo: "imptotal", titulo: "Monto S/", anchoExcel: 12 },
  { campo: "ultimodiapago", titulo: "Último pago", anchoExcel: 12 },
  { campo: "distancia", titulo: "Distancia al CAR", anchoExcel: 14 },
];

const COLUMNAS_RESUMEN: ColumnaListado[] = [
  { campo: "car", titulo: "CAR", anchoExcel: 8 },
  { campo: "descripcion", titulo: "Centro autorizado", anchoExcel: 34 },
  { campo: "direccion", titulo: "Dirección", anchoExcel: 32 },
  { campo: "clientes", titulo: "Clientes", anchoExcel: 10 },
  { campo: "pagos", titulo: "Pagos", anchoExcel: 10 },
  { campo: "monto", titulo: "Monto S/", anchoExcel: 12 },
  { campo: "mediana", titulo: "Distancia mediana", anchoExcel: 14 },
  { campo: "alcance", titulo: "Alcance 80 %", anchoExcel: 12 },
  { campo: "cerca", titulo: "Hasta 1 km", anchoExcel: 10 },
  { campo: "sinCoordenadas", titulo: "Sin coord.", anchoExcel: 10 },
];

@Component({
  selector: "app-cobertura-x-car",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    CalendarModule,
    DropdownModule,
    InputTextModule,
    ToastModule,
    CapasSidebarComponent,
    PanelesMapaGisComponent,
    LeyendaGruposComponent,
  ],
  templateUrl: "./cobertura-x-car.component.html",
  styleUrl: "./cobertura-x-car.component.scss",
  providers: [MessageService, DialogService],
})
export class CoberturaXCarComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly gis = inject(GisConfigService);
  private readonly consultaCapasGis = inject(ConsultaCapasGisService);
  private readonly recaudacionService = inject(RecaudacionService);
  private readonly carService = inject(CarService);
  private readonly sedeOperacionalService = inject(SedeOperacionalService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly excelService = inject(ExcelService);
  private readonly messageService = inject(MessageService);
  private readonly dialogService = inject(DialogService);
  private readonly estilos = new MapEstilosFactory();

  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;
  @ViewChild("mapContainer", { static: false }) private mapContainer!: ElementRef<HTMLDivElement>;

  controladorGis?: ControladorMapaGis;
  map!: OlMap;
  private detenerObservadorMapa?: () => void;
  private peticionCobertura?: Subscription;
  /** Todos los CAR de la empresa, con su ubicación; se piden una vez y se filtran por la sede elegida. */
  private registrosCar: RegistroCar[] = [];
  ref: DynamicDialogRef | undefined;

  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;
  lotesLayer!: TileLayer<TileWMS>;
  sectoresComercialesLayer!: TileLayer<TileWMS>;
  manzanasLayer!: TileLayer<TileWMS>;
  callesLayer!: TileLayer<TileWMS>;
  carsLayer!: VectorLayer<VectorSource>;
  clientesLayer!: VectorLayer<VectorSource>;
  alcanceLayer!: VectorLayer<VectorSource>;
  lineasLayer!: VectorLayer<VectorSource>;
  private registroCapas: Record<string, BaseLayer> = {};

  readonly baseLayers = CAPAS_BASE_UI;
  baseActive: string | null = "osm";
  commercialLayers: CapaSwitchUi[] = [
    { id: "cars", label: "Centros de recaudación (CAR)", active: true, simbolo: { forma: "rombo", color: "#e53935" } },
    { id: "clientes", label: "Clientes que pagaron", active: true, simbolo: { forma: "punto", color: "#1e88e5" } },
    { id: "alcance", label: "Alcance 80 % por CAR", active: true, simbolo: { forma: "area", color: "#00e5ff" } },
    { id: "lineas", label: "Líneas cliente → CAR", active: true, simbolo: { forma: "linea", color: "#9575cd" } },
    { id: "lotes", label: "Lotes", active: false, simbolo: { forma: "area", color: "#cbd5e1" } },
    { id: "sectores", label: "Sectores Comerciales", active: false, simbolo: { forma: "area", color: "#a78bfa" } },
    { id: "manzanas", label: "Manzanas", active: false, simbolo: { forma: "area", color: "#aaaaaa" } },
    { id: "calles", label: "Calles", active: false, simbolo: { forma: "linea", color: "#cbd5e1" } },
  ];

  filtrosVisible = false;
  cargando = false;

  listaSedes: { codsede: string; nombre: string }[] = [];
  listaSucursales: { codsuc: string; nombre: string }[] = [];
  listaCars: { car: string; descripcion: string }[] = [];
  selectedSede = TODOS;
  selectedSucursal = TODOS;
  selectedCar = TODOS;
  fechaInicial = this.primerDiaDelMes();
  fechaFinal = this.ultimoDiaDelMes();

  cobertura: CoberturaCalculada | null = null;
  resumenes: ResumenCar[] = [];
  entradasLeyenda: EntradaLeyenda[] = [];
  mostrarLeyenda = true;
  /** CAR elegido en la leyenda, la tabla o el mapa: se ven solo sus clientes, su alcance y sus líneas. `null` = todos. */
  carFiltrado: string | null = null;
  mostrarPanelResumen = true;
  private panelEstabaAbierto = false;

  clienteSeleccionado: ClienteCobertura | null = null;
  private featureSeleccionado: Feature | null = null;

  mostrarSearchPanel = false;
  searchCodCliente = "";

  readonly textoDistancia = textoDistancia;
  readonly porcentajeAlcance = Math.round(FRACCION_ALCANCE * 100);

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);
    this.crearMapa();
    this.cargarSedes();
    this.cargarCars();
  }

  ngAfterViewInit(): void {
    this.capasSidebar?.conectarMapa(this.map);
    requestAnimationFrame(() => {
      const elemento = this.mapContainer?.nativeElement;
      if (!elemento) return;
      this.map.setTarget(elemento);
      this.map.updateSize();
      this.detenerObservadorMapa = observarTamanoMapa(this.map, elemento);
    });
  }

  ngOnDestroy(): void {
    this.detenerObservadorMapa?.();
    this.controladorGis?.destruir();
    this.map?.setTarget(undefined);
    this.ref?.close();
  }

  volverAlMain(): void {
    volverAlMainGeoreferencia(this.router);
  }

  // FILTROS

  private primerDiaDelMes(): Date {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  }

  private ultimoDiaDelMes(): Date {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  }

  get hayRangoDeFechasValido(): boolean {
    return !!this.fechaInicial && !!this.fechaFinal && this.fechaInicial <= this.fechaFinal;
  }

  private cargarSedes(): void {
    this.sedeOperacionalService
      .obtener_x_estareg()
      .pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((sedes) => {
        this.listaSedes = [
          { codsede: TODOS, nombre: "TODAS LAS SEDES" },
          ...(sedes || []).map((sede) => ({ codsede: String(sede.codsede).trim(), nombre: sede.nombre })),
        ];
        this.onSedeChange();
      });
  }

  onSedeChange(): void {
    this.selectedSucursal = TODOS;
    this.selectedCar = TODOS;
    const sucursales$ = this.selectedSede === TODOS
      ? this.sucursalesService.obtener_x_estareg().pipe(map((sucursales: any[]) => sucursales || []))
      : this.sedeOperacionalService.visualizar_sucursales_x_sede(this.selectedSede).pipe(map((respuesta) => respuesta?.data || []));
    sucursales$
      .pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((sucursales: any[]) => {
        const propias = sucursales.map((sucursal) => ({ codsuc: String(sucursal.codsuc).trim(), nombre: sucursal.nombre }));
        this.listaSucursales = [{ codsuc: TODOS, nombre: "TODAS" }, ...propias];
        this.selectedSucursal = propias[0]?.codsuc ?? TODOS;
      });
    this.armarListaCars();
  }

  /** El mismo listado de Administración › CAR (select * from car): trae latitud y longitud. */
  private cargarCars(): void {
    this.carService
      .listarCar()
      .pipe(catchError(() => of([] as RegistroCar[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((registros) => {
        this.registrosCar = registros || [];
        this.armarListaCars();
      });
  }

  private carsDeLaSede(): RegistroCar[] {
    return this.registrosCar.filter((registro) =>
      this.selectedSede === TODOS || String(registro.codsede ?? "").trim() === this.selectedSede);
  }

  private armarListaCars(): void {
    // estareg llega como 1/0 o true/false según el driver.
    const activos = this.carsDeLaSede().filter((registro) => Number(registro.estareg) === 1);
    // Con todas las sedes, un código puede ser locales distintos: el filtro va por código y muestra todos sus nombres.
    const codigos = new Map<string, Set<string>>();
    activos.forEach((registro) => {
      const codigo = String(registro.car).trim();
      const nombres = codigos.get(codigo) ?? new Set<string>();
      nombres.add(String(registro.descripcion ?? "").trim());
      codigos.set(codigo, nombres);
    });
    this.listaCars = [
      { car: TODOS, descripcion: "TODOS" },
      ...Array.from(codigos, ([codigo, nombres]) => ({ car: codigo, descripcion: `${codigo} · ${[...nombres].join(" / ")}` })),
    ];
    if (!codigos.has(this.selectedCar)) this.selectedCar = TODOS;
  }

  toggleFiltros(): void {
    this.filtrosVisible = !this.filtrosVisible;
  }

  nombreSede(): string {
    return this.listaSedes.find((sede) => sede.codsede === this.selectedSede)?.nombre ?? "TODAS LAS SEDES";
  }

  nombreSucursal(): string {
    return this.listaSucursales.find((sucursal) => sucursal.codsuc === this.selectedSucursal)?.nombre ?? "TODAS";
  }

  nombreCar(): string {
    return this.listaCars.find((car) => car.car === this.selectedCar)?.descripcion ?? "TODOS";
  }

  private aTextoFecha(fecha: Date): string {
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${fecha.getFullYear()}-${mes}-${dia}`;
  }

  procesar(): void {
    if (!this.hayRangoDeFechasValido) {
      this.avisar("warn", "Rango de fechas", "La fecha desde no puede ser mayor que la fecha hasta.");
      return;
    }
    const filtro = {
      codsede: this.selectedSede,
      codsuc: this.selectedSucursal,
      car: this.selectedCar,
      fechaini: this.aTextoFecha(this.fechaInicial),
      fechafin: this.aTextoFecha(this.fechaFinal),
    };

    this.peticionCobertura?.unsubscribe();
    this.cargando = true;
    this.peticionCobertura = this.recaudacionService
      .listarPagosPorCar(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.cargando = false;
          if (!respuesta.success) {
            this.limpiarMapa();
            this.avisar("error", "Error", respuesta.mensaje?.trim() || "Ocurrió un error al consultar los pagos por CAR.");
            return;
          }
          this.filtrosVisible = false;
          this.mostrarCobertura(respuesta.data || []);
        },
        error: () => {
          this.cargando = false;
          this.limpiarMapa();
          this.avisar("error", "Error", "Ocurrió un error al consultar los pagos por CAR.");
        },
      });
  }

  limpiar(): void {
    this.selectedSede = TODOS;
    this.fechaInicial = this.primerDiaDelMes();
    this.fechaFinal = this.ultimoDiaDelMes();
    this.onSedeChange();
    this.limpiarMapa();
  }

  // COBERTURA

  private mostrarCobertura(pagos: PagoClienteCar[]): void {
    this.estilos.limpiar();
    this.limpiarMapa();
    if (pagos.length === 0) {
      this.avisar("info", "Resultados", "No hay pagos en el rango y los filtros elegidos.");
      return;
    }
    const nombresSede = new Map(this.listaSedes.map((sede) => [sede.codsede, sede.nombre]));
    const carsActivos = this.carsDeLaSede().filter((registro) => Number(registro.estareg) === 1);
    this.cobertura = calcularCobertura(pagos, carsActivos, nombresSede);
    // Con un CAR elegido en el filtro no se muestran los demás locales, que saldrían con cero clientes.
    const carConsultado = this.selectedCar;
    this.resumenes = carConsultado === TODOS
      ? this.cobertura.resumenes
      : this.cobertura.resumenes.filter((resumen) => resumen.car.car === carConsultado);
    this.entradasLeyenda = this.armarLeyenda(this.resumenes, this.cobertura.clientes.length);
    this.pintarCars();
    this.pintarClientes();
    this.pintarAlcance();
    this.encuadrarTodo();

    const carsSinLocal = this.resumenes.filter((resumen) => !resumen.car.ubicacion && resumen.clientes > 0).length;
    this.avisar(
      "success",
      "Proceso completado",
      `${this.cobertura.totales.clientes.toLocaleString("es-PE")} clientes en ${this.resumenes.length} CAR`
        + (carsSinLocal ? `; ${carsSinLocal} sin local en el mapa (bancos, caja o CAR sin coordenadas).` : "."),
    );
  }

  private armarLeyenda(resumenes: ResumenCar[], totalClientes: number): EntradaLeyenda[] {
    const total = totalClientes || 1;
    return resumenes
      .filter((resumen) => resumen.clientes > 0)
      .map((resumen) => ({
        grupo: this.grupoDeCar(resumen.car),
        cantidad: resumen.clientes,
        porcentaje: Math.round((resumen.clientes / total) * 100),
      }));
  }

  private grupoDeCar(car: CarEnMapa): GrupoLeyenda {
    return {
      clave: car.clave,
      etiqueta: `${car.car} · ${car.descripcion}`,
      detalle: car.ubicacion ? car.direccion : "Sin local en el mapa",
      color: car.color,
      rayado: !car.ubicacion,
    };
  }

  private aCoordenadaMapa(ubicacion: [number, number]): number[] {
    return transform(ubicacion, WGS84, this.gis.proyeccionMapa);
  }

  private pintarCars(): void {
    const features = this.resumenes
      .filter((resumen) => resumen.car.ubicacion)
      .map((resumen) => new Feature({
        geometry: new Point(this.aCoordenadaMapa(resumen.car.ubicacion!)),
        _claveCar: resumen.car.clave,
        _tipo: "car",
      }));
    this.carsLayer.getSource()!.addFeatures(features);
  }

  private pintarClientes(): void {
    const features = (this.cobertura?.clientes ?? [])
      .filter((cliente) => cliente.ubicacion)
      .map((cliente) => new Feature({
        geometry: new Point(this.aCoordenadaMapa(cliente.ubicacion!)),
        codcliente: cliente.codcliente,
        _claveCliente: cliente.clave,
        _claveCar: cliente.claveCar,
        _tipo: "cliente",
      }));
    this.clientesLayer.getSource()!.addFeatures(features);
  }

  /** Círculo con el radio donde vive el 80 % de los clientes del CAR, medido sobre la Tierra y no en grados. */
  private pintarAlcance(): void {
    const features = this.resumenes
      .filter((resumen) => resumen.car.ubicacion && resumen.alcance && resumen.alcance > 0)
      .map((resumen) => {
        const circulo = circular(resumen.car.ubicacion!, resumen.alcance!, 72);
        circulo.transform(WGS84, this.gis.proyeccionMapa);
        return new Feature({ geometry: circulo, _claveCar: resumen.car.clave });
      });
    this.alcanceLayer.getSource()!.addFeatures(features);
  }

  private pintarLineas(): void {
    const fuente = this.lineasLayer.getSource()!;
    fuente.clear();
    const car = this.carFiltrado ? this.cobertura?.cars.get(this.carFiltrado) : null;
    if (!car?.ubicacion) return;
    const destino = this.aCoordenadaMapa(car.ubicacion);
    const features = (this.cobertura?.clientes ?? [])
      .filter((cliente) => cliente.claveCar === car.clave && cliente.ubicacion)
      .map((cliente) => new Feature({ geometry: new LineString([this.aCoordenadaMapa(cliente.ubicacion!), destino]) }));
    fuente.addFeatures(features);
  }

  private limpiarMapa(): void {
    [this.carsLayer, this.clientesLayer, this.alcanceLayer, this.lineasLayer].forEach((capa) => capa?.getSource()?.clear());
    this.controladorGis?.descartarListado();
    this.controladorGis?.quitarPredio();
    this.cobertura = null;
    this.resumenes = [];
    this.entradasLeyenda = [];
    this.carFiltrado = null;
    this.cerrarPopup();
  }

  private encuadrarTodo(): void {
    const extension = createEmpty();
    [this.clientesLayer, this.carsLayer].forEach((capa) => {
      const fuente = capa.getSource()!;
      if (fuente.getFeatures().length) extend(extension, fuente.getExtent());
    });
    if (!isEmpty(extension)) this.controladorGis?.encuadrarEnZonaLibre(extension);
  }

  get resumenElegido(): ResumenCar | null {
    return this.carFiltrado ? this.resumenes.find((resumen) => resumen.car.clave === this.carFiltrado) ?? null : null;
  }

  /** Clic en la leyenda, la tabla o el marcador: muestra solo ese CAR; otro clic vuelve a todos. */
  filtrarPorCar(clave: string): void {
    this.carFiltrado = this.carFiltrado === clave ? null : clave;
    if (this.carFiltrado && this.clienteSeleccionado && this.clienteSeleccionado.claveCar !== this.carFiltrado) {
      this.cerrarPopup();
    }
    this.pintarLineas();
    this.refrescarCapas();

    if (!this.carFiltrado) {
      this.encuadrarTodo();
      return;
    }
    const extension = createEmpty();
    this.clientesLayer.getSource()!.getFeatures()
      .filter((feature) => feature.get("_claveCar") === this.carFiltrado)
      .forEach((feature) => extend(extension, feature.getGeometry()!.getExtent()));
    const car = this.cobertura?.cars.get(this.carFiltrado);
    if (car?.ubicacion) extend(extension, new Point(this.aCoordenadaMapa(car.ubicacion)).getExtent());
    if (!isEmpty(extension)) this.controladorGis?.encuadrarEnZonaLibre(extension);
  }

  verTodosLosCars(): void {
    if (this.carFiltrado) this.filtrarPorCar(this.carFiltrado);
  }

  fondoCar(resumen: ResumenCar): string {
    return resumen.car.ubicacion
      ? resumen.car.color
      : `repeating-linear-gradient(135deg, ${resumen.car.color} 0 3px, #1f2937 3px 5px)`;
  }

  nombreCarDe(clave: string | undefined): string {
    const car = clave ? this.cobertura?.cars.get(clave) : null;
    return car ? `${car.car} · ${car.descripcion}` : "-";
  }

  // MAPA

  private crearMapa(): void {
    this.osmLayer = crearCapaOsm(this.baseActive === "osm");
    this.satelitalLayer = crearCapaSatelital(this.baseActive === "satelital");
    this.lotesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("lotes"), false);
    this.sectoresComercialesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("sectoresComerciales"), false);
    this.manzanasLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("manzanas"), false);
    this.callesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("calles"), false);

    const zoomActual = () => this.map?.getView().getZoom() ?? 14;

    this.alcanceLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const clave = feature.get("_claveCar");
        if (this.carFiltrado && clave !== this.carFiltrado) return undefined;
        const color = this.cobertura?.cars.get(clave)?.color ?? "#00e5ff";
        const elegido = this.carFiltrado === clave;
        return new Style({
          fill: new Fill({ color: this.conTransparencia(color, elegido ? 0.12 : 0.05) }),
          stroke: new Stroke({ color, width: elegido ? 2 : 1.2, lineDash: elegido ? [8, 5] : [4, 4] }),
        });
      },
    });

    this.lineasLayer = new VectorLayer({
      source: new VectorSource(),
      style: () => {
        const color = (this.carFiltrado && this.cobertura?.cars.get(this.carFiltrado)?.color) || "#9575cd";
        return new Style({ stroke: new Stroke({ color: this.conTransparencia(color, 0.55), width: 1 }) });
      },
    });

    this.clientesLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const clave = feature.get("_claveCar");
        if (this.carFiltrado && clave !== this.carFiltrado) return undefined;
        return this.estilos.punto({
          forma: "circulo",
          color: this.cobertura?.cars.get(clave)?.color ?? "#90a4ae",
          zoom: zoomActual(),
          seleccionado: feature === this.featureSeleccionado,
          etiqueta: feature.get("codcliente"),
          ...RADIOS_LECTURA,
        });
      },
    });

    this.carsLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 10,
      style: (feature) => {
        const car = this.cobertura?.cars.get(feature.get("_claveCar"));
        if (!car) return undefined;
        const elegido = this.carFiltrado === car.clave;
        const apagado = !!this.carFiltrado && !elegido;
        return new Style({
          image: new CircleStyle({
            radius: elegido ? 15 : 11,
            fill: new Fill({ color: apagado ? this.conTransparencia(car.color, 0.45) : car.color }),
            stroke: new Stroke({ color: elegido ? "#00e5ff" : "#ffffff", width: elegido ? 3 : 2 }),
          }),
          text: new Text({
            text: car.car,
            font: `800 ${elegido ? 12 : 10}px "Segoe UI", Arial, sans-serif`,
            fill: new Fill({ color: "#ffffff" }),
          }),
          zIndex: elegido ? 2 : 1,
        });
      },
    });

    this.registroCapas = {
      cars: this.carsLayer,
      clientes: this.clientesLayer,
      alcance: this.alcanceLayer,
      lineas: this.lineasLayer,
      lotes: this.lotesLayer,
      sectores: this.sectoresComercialesLayer,
      manzanas: this.manzanasLayer,
      calles: this.callesLayer,
    };

    this.map = new OlMap({
      layers: [
        this.osmLayer,
        this.satelitalLayer,
        this.manzanasLayer,
        this.lotesLayer,
        this.sectoresComercialesLayer,
        this.callesLayer,
        this.alcanceLayer,
        this.lineasLayer,
        this.clientesLayer,
        this.carsLayer,
      ],
      view: new View({
        projection: this.gis.proyeccionMapa,
        center: this.gis.vista.centro,
        zoom: this.gis.vista.zoom,
      }),
      controls: [new Zoom()],
    });

    this.controladorGis = new ControladorMapaGis(this.map, {
      consulta: this.consultaCapasGis,
      gis: this.gis,
      capasComerciales: () => this.capasComercialesConsultables(),
      capasTecnicas: () => this.capasSidebar?.capasTecnicasConsultables() ?? [],
      avisar: (detalle) => this.avisar("info", "Aviso", detalle),
      listado: {
        columnas: COLUMNAS_CLIENTES,
        tituloReporte: "COBERTURA POR CAR",
        nombreArchivo: "cobertura_car_area_",
        origen: ORIGENES_COORDENADA.usuario,
        registros: () => (this.cobertura?.clientes ?? []).map((cliente) => this.aRegistroListado(cliente)),
        aFila: (registro) => registro as FilaListado,
        subcabecera: () => this.subcabeceraReporte(),
        excelService: this.excelService,
      },
    });

    this.map.on("singleclick", (evento) => {
      if (estaUsandoHerramientas(this.map)) return;
      const feature = this.map.forEachFeatureAtPixel(evento.pixel, (encontrado) => encontrado, {
        hitTolerance: 5,
        layerFilter: (capa) => (capa === this.carsLayer || capa === this.clientesLayer) && !capa.get(MARCA_CAPA_RESALTADO),
      }) as Feature | undefined;

      if (feature?.get("_tipo") === "car") {
        this.filtrarPorCar(feature.get("_claveCar"));
      } else if (feature?.get("_tipo") === "cliente") {
        this.seleccionarCliente(feature);
      } else {
        this.cerrarPopup();
        this.controladorGis?.consultarPunto(evento.coordinate);
      }
    });
  }

  private conTransparencia(colorHex: string, opacidad: number): string {
    const valor = parseInt(colorHex.slice(1), 16);
    return `rgba(${(valor >> 16) & 255}, ${(valor >> 8) & 255}, ${valor & 255}, ${opacidad})`;
  }

  private capasComercialesConsultables(): CapaConsultable[] {
    return [
      { rol: "lotes", capa: this.lotesLayer },
      { rol: "calles", capa: this.callesLayer },
      { rol: "manzanas", capa: this.manzanasLayer },
      { rol: "sectoresComerciales", capa: this.sectoresComercialesLayer },
    ];
  }

  private refrescarCapas(): void {
    [this.carsLayer, this.clientesLayer, this.alcanceLayer, this.lineasLayer].forEach((capa) => capa?.changed());
  }

  setBaseLayer(id: string): void {
    this.baseActive = id;
    this.osmLayer.setVisible(id === "osm");
    this.satelitalLayer.setVisible(id === "satelital");
  }

  toggleCommercialLayer(capa: CapaSwitchUi): void {
    capa.active = !capa.active;
    this.registroCapas[capa.id]?.setVisible(capa.active);
  }

  onSidebarToggle(): void {
    setTimeout(() => this.map?.updateSize(), 300);
  }

  // FICHA DEL CLIENTE

  // La ficha ocupa el lado derecho: el resumen se oculta mientras está abierta y vuelve al cerrarla.
  private seleccionarCliente(feature: Feature): void {
    const cliente = this.cobertura?.clientes.find((registro) => registro.clave === feature.get("_claveCliente"));
    if (!cliente) return;
    this.controladorGis?.cerrarPopupGis();
    this.featureSeleccionado = feature;
    this.clienteSeleccionado = cliente;
    if (this.mostrarPanelResumen) {
      this.panelEstabaAbierto = true;
      this.mostrarPanelResumen = false;
    }
    this.refrescarCapas();
  }

  cerrarPopup(): void {
    this.clienteSeleccionado = null;
    this.featureSeleccionado = null;
    this.refrescarCapas();
    if (this.panelEstabaAbierto) {
      this.mostrarPanelResumen = true;
      this.panelEstabaAbierto = false;
    }
  }

  abrirStreetView(): void {
    const ubicacion = this.clienteSeleccionado?.ubicacion;
    const lonLat = ubicacion ? coordenadaLonLat(ubicacion[0], ubicacion[1], this.gis.proyeccionUtm) : null;
    if (!lonLat) {
      this.avisar("warn", "Aviso", "No hay coordenadas válidas para abrir Street View.");
      return;
    }
    abrirGoogleStreetView(lonLat);
  }

  verMasInformacion(): void {
    const cliente = this.clienteSeleccionado;
    if (!cliente) return;
    abrirConsultaUsuario(this.dialogService, String(cliente.codcliente), cliente.codsuc)
      .then((referencia) => (this.ref = referencia));
  }

  // BÚSQUEDA

  abrirBusqueda(): void {
    this.mostrarSearchPanel = true;
    this.searchCodCliente = "";
  }

  cerrarBusqueda(): void {
    this.mostrarSearchPanel = false;
    this.searchCodCliente = "";
    this.controladorGis?.quitarPredio();
  }

  /** Busca entre los clientes que pagaron en el rango: los demás no son parte de la cobertura. */
  buscarPorCodCliente(): void {
    const codigo = String(this.searchCodCliente || "").trim();
    if (!codigo) return;
    const cliente = this.cobertura?.clientes.find((registro) => String(registro.codcliente) === codigo);
    if (!cliente) {
      this.avisar("warn", "Aviso", `El cliente ${codigo} no tiene pagos en el rango y los filtros elegidos.`);
      return;
    }
    if (this.carFiltrado && this.carFiltrado !== cliente.claveCar) this.filtrarPorCar(this.carFiltrado);
    const feature = this.clientesLayer.getSource()!.getFeatures().find((punto) => punto.get("_claveCliente") === cliente.clave);
    if (!feature) {
      this.avisar("warn", "Sin ubicación", `El cliente ${codigo} pagó en ${this.nombreCarDe(cliente.claveCar)}, pero no tiene coordenadas.`);
      return;
    }
    this.mostrarSearchPanel = false;
    this.seleccionarCliente(feature);
    const centro = (feature.getGeometry() as Point).getCoordinates();
    this.map.getView().animate({ center: centro, zoom: ZOOM_PREDIO, duration: 800 });
    this.controladorGis?.marcarPredio(codigo, centro);
  }

  // LISTADOS Y EXCEL

  private aRegistroListado(cliente: ClienteCobertura): Record<string, unknown> {
    return {
      codcliente: cliente.codcliente,
      codsuc: cliente.codsuc,
      propietario: cliente.propietario,
      direccion: cliente.direccion,
      carPrincipal: this.nombreCarDe(cliente.claveCar),
      nropagos: cliente.nropagos,
      imptotal: Math.round(cliente.imptotal * 100) / 100,
      ultimodiapago: cliente.ultimodiapago,
      distancia: textoDistancia(cliente.distanciaMetros),
      lon: cliente.ubicacion?.[0] ?? null,
      lat: cliente.ubicacion?.[1] ?? null,
    };
  }

  private subcabeceraReporte(): string[] {
    return [
      `Sede: ${this.nombreSede()}`,
      `Sucursal: ${this.nombreSucursal()}`,
      `Día de pago: ${this.fechaInicial.toLocaleDateString("es-PE")} al ${this.fechaFinal.toLocaleDateString("es-PE")}`,
    ];
  }

  ubicarFilaEnMapa(fila: FilaListado): void {
    const codigo = String(fila["codcliente"] ?? "").trim();
    const feature = this.clientesLayer.getSource()!.getFeatures().find((punto) => String(punto.get("codcliente")) === codigo);
    if (!feature) {
      this.avisar("warn", "Aviso", `El cliente ${codigo} no tiene coordenadas para ubicarlo.`);
      return;
    }
    this.seleccionarCliente(feature);
    this.controladorGis?.encuadrarEnZonaLibre(feature.getGeometry()!.getExtent());
  }

  async descargarExcelResumen(): Promise<void> {
    if (this.resumenes.length === 0) return;
    await descargarListadoExcel(this.excelService, {
      titulo: "COBERTURA POR CAR",
      subcabecera: this.subcabeceraReporte(),
      nombreArchivo: "cobertura_por_car_",
      columnas: COLUMNAS_RESUMEN,
      filas: this.resumenes.map((resumen) => ({
        car: resumen.car.car,
        descripcion: resumen.car.descripcion,
        direccion: resumen.car.ubicacion ? resumen.car.direccion : "Sin local en el mapa",
        clientes: resumen.clientes,
        pagos: resumen.pagos,
        monto: Math.round(resumen.monto * 100) / 100,
        mediana: textoDistancia(resumen.mediana),
        alcance: textoDistancia(resumen.alcance),
        cerca: resumen.fraccionCerca == null ? "-" : `${Math.round(resumen.fraccionCerca * 100)} %`,
        sinCoordenadas: resumen.sinCoordenadas,
      })),
    });
  }

  async descargarSinCoordenadas(): Promise<void> {
    if (!this.cobertura?.totales.sinCoordenadas) return;
    const cantidad = await (this.controladorGis?.descargarSinCoordenadas() ?? Promise.resolve(0));
    if (cantidad > 0) this.avisar("success", "Excel descargado", `${cantidad} clientes sin coordenadas.`);
  }

  private avisar(severity: string, summary: string, detail: string): void {
    this.messageService.add({ severity, summary, detail });
  }
}
