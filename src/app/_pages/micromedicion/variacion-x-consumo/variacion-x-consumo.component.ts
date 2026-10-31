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
import { forkJoin, of, Subject, Subscription } from "rxjs";
import { catchError, takeUntil } from "rxjs/operators";
import { ButtonModule } from "primeng/button";
import { DropdownModule } from "primeng/dropdown";
import { InputNumberModule } from "primeng/inputnumber";
import { MultiSelectModule } from "primeng/multiselect";
import { InputTextModule } from "primeng/inputtext";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";

import OlMap from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import BaseLayer from "ol/layer/Base";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import VectorSource from "ol/source/Vector";
import Zoom from "ol/control/Zoom";
import { createEmpty, extend, isEmpty } from "ol/extent";

import { AperturaMicromedicionService } from "@host/_servicios/micromedicion/apertura-micromedicion.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { SectoresCicloService } from "@host/_servicios/seguridad/sectores-ciclo.service";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { MicromedicionService } from "@host/_servicios/vektors/micromedicion.service";
import { ControlImgService } from "@host/_servicios/procesar-img/control-img.service";
import { ClientesService } from "@host/_servicios/catastro/clientes.service";
import { ExcelService } from "@host/_servicios/reportes/excel.service";
import { SectorCiclo } from "@host/_models/vektors/SectorCiclo";
import { FiltroVariacionConsumo, VariacionConsumo } from "@host/_models/vektors/VariacionConsumo";

import { CapaConsultable, ConsultaCapasGisService, GisConfigService } from "../../../core/gis";
import { volverAlMainGeoreferencia } from "../../../shared/utils/navegacion.utils";
import { ORIGENES_COORDENADA } from "../../../shared/constantes/coordenadas";
import { LISTA_MESES, SECTOR_TODOS, TIPOS_PROMEDIO, TIPOS_RECEPCION_FOTOS_LECTURA } from "../../../shared/constantes/lecturas";
import { formatoFechaCorta, rangoFotosRecientes } from "../../../shared/utils/fechas.utils";
import { VisorImagenesComponent } from "../../../shared/components/visor-imagenes/visor-imagenes.component";
import { observarTamanoMapa } from "../../../shared/mapa/observar-tamano-mapa";
import { MapEstilosFactory, RADIOS_LECTURA } from "../../../shared/mapa/mapa-estilos";
import { estaUsandoHerramientas } from "../../../shared/mapa/herramientas-medicion";
import { MARCA_CAPA_RESALTADO } from "../../../shared/mapa/interaccion-gis";
import { ControladorMapaGis } from "../../../shared/mapa/controlador-mapa-gis";
import { ZOOM_PREDIO } from "../../../shared/mapa/predio-buscado";
import { crearFeaturePunto } from "../../../shared/mapa/geo.utils";
import { CAPAS_BASE_UI, crearCapaOsm, crearCapaSatelital, crearCapaWms } from "../../../shared/mapa/capas";
import { coordenadaLonLat, abrirGoogleStreetView } from "../../../shared/mapa/street-view";
import { abrirConsultaUsuario } from "../../../shared/dialogos/consulta-usuario.dialog";
import { ColumnaListado, FilaListado, descargarListadoExcel, direccionDe } from "../../../shared/utils/listado-excel";
import { CapasSidebarComponent, CapaSwitchUi } from "../../../shared/components/capas-sidebar/capas-sidebar.component";
import { PanelesMapaGisComponent } from "../../../shared/components/paneles-mapa-gis/paneles-mapa-gis.component";
import {
  EntradaLeyenda,
  LeyendaGruposComponent,
  fondoMuestra,
} from "../../../shared/components/leyenda-grupos/leyenda-grupos.component";
import {
  GRUPO_BAJO,
  GRUPO_IGUAL,
  GRUPO_SIN_COMPARAR,
  GRUPO_SUBIO,
  GRUPOS_VARIACION,
  ResultadoVariacion,
  clasificarVariacion,
  textoVariacion,
} from "./variacion-x-consumo.reglas";

const TODOS = "ALL";

const COLUMNAS_VARIACION: ColumnaListado[] = [
  { campo: "codcliente", titulo: "Cód. cliente", anchoExcel: 12 },
  { campo: "propietario", titulo: "Titular", anchoExcel: 35 },
  { campo: "direccion", titulo: "Dirección", anchoExcel: 35 },
  { campo: "codsector", titulo: "Sector", anchoExcel: 8 },
  { campo: "nromed", titulo: "Medidor", anchoExcel: 15 },
  { campo: "consumo1", titulo: "Consumo periodo 1", anchoExcel: 12 },
  { campo: "consumo2", titulo: "Consumo periodo 2", anchoExcel: 12 },
  { campo: "diferencia", titulo: "Diferencia m³", anchoExcel: 12 },
  { campo: "porcentaje", titulo: "Variación %", anchoExcel: 11 },
  { campo: "variacion", titulo: "Resultado", anchoExcel: 13 },
  { campo: "estado1", titulo: "Estado lectura periodo 1", anchoExcel: 26 },
  { campo: "estado2", titulo: "Estado lectura periodo 2", anchoExcel: 26 },
];

@Component({
  selector: "app-variacion-x-consumo",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DropdownModule,
    InputNumberModule,
    InputTextModule,
    MultiSelectModule,
    ToastModule,
    VisorImagenesComponent,
    CapasSidebarComponent,
    PanelesMapaGisComponent,
    LeyendaGruposComponent,
  ],
  templateUrl: "./variacion-x-consumo.component.html",
  styleUrl: "./variacion-x-consumo.component.scss",
  providers: [MessageService, DialogService],
})
export class VariacionXConsumoComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly gis = inject(GisConfigService);
  private readonly consultaCapasGis = inject(ConsultaCapasGisService);
  private readonly aperturaService = inject(AperturaMicromedicionService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly sectoresService = inject(SectoresCicloService);
  private readonly consultaService = inject(ConsulGenericService);
  private readonly micromedicionService = inject(MicromedicionService);
  private readonly controlImgService = inject(ControlImgService);
  private readonly clientesService = inject(ClientesService);
  private readonly excelService = inject(ExcelService);
  private readonly messageService = inject(MessageService);
  private readonly dialogService = inject(DialogService);
  private readonly estilos = new MapEstilosFactory();
  private readonly cicloCambiado = new Subject<void>();
  private readonly sucursalCambiada = new Subject<void>();

  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;
  @ViewChild("mapContainer", { static: false }) private mapContainer!: ElementRef<HTMLDivElement>;

  controladorGis?: ControladorMapaGis;
  map!: OlMap;
  private detenerObservadorMapa?: () => void;
  private peticionVariacion?: Subscription;
  ref: DynamicDialogRef | undefined;

  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;
  lotesLayer!: TileLayer<TileWMS>;
  sectoresComercialesLayer!: TileLayer<TileWMS>;
  manzanasLayer!: TileLayer<TileWMS>;
  callesLayer!: TileLayer<TileWMS>;
  rutaLecturaLayer!: TileLayer<TileWMS>;
  clientesLayer!: VectorLayer<VectorSource>;
  private registroCapas: Record<string, BaseLayer> = {};

  readonly baseLayers = CAPAS_BASE_UI;
  baseActive: string | null = "osm";
  commercialLayers: CapaSwitchUi[] = [
    { id: "usuarios", label: "Usuarios", active: true, simbolo: { forma: "punto", color: GRUPO_SUBIO.color } },
    { id: "lotes", label: "Lotes", active: true, simbolo: { forma: "area", color: "#cbd5e1" } },
    { id: "sectores", label: "Sectores Comerciales", active: false, simbolo: { forma: "area", color: "#a78bfa" } },
    { id: "manzanas", label: "Manzanas", active: false, simbolo: { forma: "area", color: "#aaaaaa" } },
    { id: "calles", label: "Calles", active: false, simbolo: { forma: "linea", color: "#cbd5e1" } },
    { id: "rutaLectura", label: "Ruta de Lectura", active: false, simbolo: { forma: "linea", color: "#cba029" } },
  ];

  // FILTROS
  readonly listaMeses = LISTA_MESES;
  readonly listaAnios: { anio: string }[] = Array.from({ length: 6 }, (_, indice) => ({
    anio: String(new Date().getFullYear() - indice),
  }));
  filtrosVisible = false;
  cargando = false;
  /** Se marcan en rojo los campos obligatorios recién al intentar buscar. */
  intentoBuscar = false;

  readonly tiposPromedio = TIPOS_PROMEDIO;
  dataCiclos: any[] = [];
  listaSucursales: any[] = [];
  listaSectores: SectorCiclo[] = [];
  listaEstadosLectura: { codigo: string; descripcion: string }[] = [];
  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: SectorCiclo | null = null;
  anio = "";
  mes1 = "";
  mes2 = "";
  // Estos cuatro son los filtros de control de digitación y se aplican a la lectura del mes 2.
  selectedEstados: string[] = [];
  selectedTipoPromedio: (typeof TIPOS_PROMEDIO)[number] | null = TIPOS_PROMEDIO[0];
  consumoInicial: number | null = null;
  consumoFinal: number | null = null;

  // RESULTADO
  registros: VariacionConsumo[] = [];
  private resultados = new Map<number, ResultadoVariacion>();
  entradasLeyenda: EntradaLeyenda[] = [];
  conteo: Record<string, number> = {};
  totalSinCoordenadas = 0;
  grupoFiltrado: string | null = null;
  mostrarLeyenda = true;
  /** Periodos de la última consulta: los filtros pueden cambiar sin volver a buscar. */
  periodoConsultado = { periodo1: "", periodo2: "" };

  clienteSeleccionado: VariacionConsumo | null = null;
  private featureSeleccionado: Feature | null = null;
  private peticionPopup?: Subscription;
  datosClientePopup: any = null;
  imagenesPopup: any[] = [];
  cargandoImagenes = false;
  /** Foto abierta en el visor; -1 = cerrado. */
  indiceFotoAbierta = -1;
  mostrarSearchPanel = false;
  searchCodCliente = "";

  readonly grupos = GRUPOS_VARIACION;
  readonly fondoMuestra = fondoMuestra;

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);
    this.ponerPeriodosPorDefecto();
    this.crearMapa();

    this.aperturaService
      .getCiclos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((respuesta) => {
        if (respuesta.status === "SUCCESS" && respuesta.data?.length > 0) {
          this.dataCiclos = respuesta.data;
          this.selectedCiclo = this.dataCiclos[0];
          this.onCicloChange(true);
        }
      });

    this.consultaService
      .getconsultaService("TEL", "ALL", "ALL", "ALL")
      .pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((estados) => (this.listaEstadosLectura = estados || []));
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

  toggleFiltros(): void {
    this.filtrosVisible = !this.filtrosVisible;
  }

  /** Por defecto el año actual, el mes anterior contra el mes actual; en enero, enero contra febrero. */
  private ponerPeriodosPorDefecto(): void {
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    this.anio = String(hoy.getFullYear());
    this.mes1 = String(mesActual === 1 ? 1 : mesActual - 1).padStart(2, "0");
    this.mes2 = String(mesActual === 1 ? 2 : mesActual).padStart(2, "0");
  }

  onCicloChange(cargarPrimeraSucursal = false): void {
    this.cicloCambiado.next();
    this.sucursalCambiada.next();
    this.selectedSucursal = null;
    this.selectedSector = null;
    this.listaSucursales = [];
    this.listaSectores = [];
    if (!this.selectedCiclo) return;

    this.sucursalesService
      .drop_sucursales_x_ciclo(this.selectedCiclo.codciclo)
      .pipe(takeUntil(this.cicloCambiado), takeUntilDestroyed(this.destroyRef))
      .subscribe((sucursales) => {
        this.listaSucursales = sucursales || [];
        if (cargarPrimeraSucursal && this.listaSucursales.length > 0) {
          this.selectedSucursal = this.listaSucursales[0];
          this.onSucursalChange();
        }
      });
  }

  onSucursalChange(): void {
    this.sucursalCambiada.next();
    this.selectedSector = null;
    if (!this.selectedSucursal) return;

    this.sectoresService
      .drop_sectores_x_ciclo(this.selectedSucursal.codsuc, this.selectedCiclo.codciclo)
      .pipe(takeUntil(this.sucursalCambiada), takeUntilDestroyed(this.destroyRef))
      .subscribe((sectores) => {
        this.listaSectores = [SECTOR_TODOS, ...(sectores || [])];
        this.selectedSector = SECTOR_TODOS;
      });
  }

  get esMismoMes(): boolean {
    return !!this.mes1 && this.mes1 === this.mes2;
  }

  get hayRangoDeConsumoInvalido(): boolean {
    return this.consumoInicial != null && this.consumoFinal != null && this.consumoInicial > this.consumoFinal;
  }

  /** Para pintar en rojo el campo obligatorio vacío después de intentar buscar. */
  faltaCampo(valor: unknown): boolean {
    return this.intentoBuscar && !valor;
  }

  nombreMes(numero: string): string {
    return this.listaMeses.find((mes) => mes.numero === numero)?.mes ?? numero;
  }

  procesar(): void {
    this.intentoBuscar = true;
    if (!this.selectedCiclo || !this.selectedSucursal || !this.anio || !this.mes1 || !this.mes2) {
      this.avisar("warn", "Faltan datos", "Complete los campos marcados en rojo.");
      return;
    }
    if (this.esMismoMes) {
      this.avisar("warn", "Meses", "Elija dos meses distintos para comparar.");
      return;
    }
    if (this.hayRangoDeConsumoInvalido) {
      this.avisar("warn", "Consumo", "El consumo inicial no puede ser mayor al final.");
      return;
    }

    const filtro: FiltroVariacionConsumo = {
      codciclo: this.selectedCiclo.codciclo,
      codsuc: this.selectedSucursal.codsuc,
      // Igual que en control de digitación: la sede de la lectura es la sucursal.
      codsede: this.selectedSucursal.codsuc ?? TODOS,
      codsector: !this.selectedSector || this.selectedSector.codsector === SECTOR_TODOS.codsector ? TODOS : this.selectedSector.codsector,
      anio: this.anio,
      mes1: this.mes1,
      mes2: this.mes2,
      estadolectura: (this.selectedEstados || []).join(","),
      consumoini: this.consumoInicial,
      consumofin: this.consumoFinal,
      tipopromedio: this.selectedTipoPromedio?.codigo ?? "",
    };

    this.peticionVariacion?.unsubscribe();
    this.cargando = true;
    this.peticionVariacion = this.micromedicionService
      .listarVariacionConsumo(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.cargando = false;
          if (!respuesta.success) {
            this.limpiarMapa();
            this.avisar("error", "Error", respuesta.mensaje?.trim() || "Ocurrió un error al consultar la variación de consumo.");
            return;
          }
          this.filtrosVisible = false;
          this.intentoBuscar = false;
          this.periodoConsultado = {
            periodo1: `${this.nombreMes(this.mes1)} ${this.anio}`,
            periodo2: `${this.nombreMes(this.mes2)} ${this.anio}`,
          };
          this.mostrarVariacion(respuesta.data || []);
        },
        error: () => {
          this.cargando = false;
          this.limpiarMapa();
          this.avisar("error", "Error", "Ocurrió un error al consultar la variación de consumo.");
        },
      });
  }

  limpiar(): void {
    this.selectedSector = SECTOR_TODOS;
    this.selectedEstados = [];
    this.selectedTipoPromedio = TIPOS_PROMEDIO[0];
    this.consumoInicial = null;
    this.consumoFinal = null;
    this.intentoBuscar = false;
    this.ponerPeriodosPorDefecto();
    this.limpiarMapa();
  }

  // VARIACIÓN

  private mostrarVariacion(registros: VariacionConsumo[]): void {
    this.limpiarMapa();
    if (registros.length === 0) {
      this.avisar("info", "Resultados", "No hay lecturas para los periodos y filtros elegidos.");
      return;
    }
    this.registros = registros;
    this.clasificar();

    const puntos = registros
      .map((registro) => {
        // Solo la coordenada del usuario, como el resto de pantallas y el Excel de "Sin coord.".
        const punto = crearFeaturePunto(registro as unknown as Record<string, unknown>, ORIGENES_COORDENADA.usuario);
        punto?.set("_tipo", "cliente");
        return punto;
      })
      .filter((punto): punto is Feature => punto !== null);
    this.clientesLayer.getSource()!.addFeatures(puntos);
    this.totalSinCoordenadas = registros.length - puntos.length;
    this.encuadrar();

    this.avisar(
      "success",
      "Proceso completado",
      `Subió ${this.conteo[GRUPO_SUBIO.clave] ?? 0} · Igual ${this.conteo[GRUPO_IGUAL.clave] ?? 0} · Bajó ${this.conteo[GRUPO_BAJO.clave] ?? 0}`,
    );
  }

  private clasificar(): void {
    this.resultados = new Map(this.registros.map((registro) => [registro.codcliente, clasificarVariacion(registro)]));
    const total = this.registros.length || 1;
    this.conteo = {};
    this.resultados.forEach((resultado) => {
      this.conteo[resultado.grupo.clave] = (this.conteo[resultado.grupo.clave] ?? 0) + 1;
    });
    this.entradasLeyenda = GRUPOS_VARIACION
      .filter((grupo) => this.conteo[grupo.clave])
      .map((grupo) => ({ grupo, cantidad: this.conteo[grupo.clave], porcentaje: Math.round((this.conteo[grupo.clave] / total) * 100) }));
    if (this.grupoFiltrado && !this.conteo[this.grupoFiltrado]) this.grupoFiltrado = null;
    this.estilos.limpiar();
    this.clientesLayer?.changed();
  }

  resultadoDe(registro: VariacionConsumo | null): ResultadoVariacion | null {
    return registro ? this.resultados.get(registro.codcliente) ?? null : null;
  }

  textoResultado(registro: VariacionConsumo | null): string {
    const resultado = this.resultadoDe(registro);
    return resultado ? textoVariacion(resultado) : "-";
  }

  descripcionEstado(codigo: string | null | undefined): string {
    if (!codigo) return "-";
    const estado = this.listaEstadosLectura.find((item) => String(item.codigo).trim() === String(codigo).trim());
    return estado ? `${codigo} · ${estado.descripcion}` : codigo;
  }

  /** Clic en la leyenda o en una tarjeta: muestra solo ese grupo y lo encuadra; otro clic vuelve a todos. */
  filtrarPorGrupo(clave: string): void {
    this.grupoFiltrado = this.grupoFiltrado === clave ? null : clave;
    const grupoSeleccionado = this.resultadoDe(this.clienteSeleccionado)?.grupo;
    if (this.grupoFiltrado && grupoSeleccionado && grupoSeleccionado.clave !== this.grupoFiltrado) this.cerrarPopup();
    this.clientesLayer.changed();
    this.encuadrar();
  }

  private registrosVisibles(): VariacionConsumo[] {
    return this.grupoFiltrado
      ? this.registros.filter((registro) => this.resultadoDe(registro)?.grupo.clave === this.grupoFiltrado)
      : this.registros;
  }

  private encuadrar(): void {
    const extension = createEmpty();
    this.clientesLayer.getSource()!.getFeatures().forEach((punto) => {
      const grupo = this.resultados.get(punto.get("codcliente"))?.grupo;
      if (!this.grupoFiltrado || grupo?.clave === this.grupoFiltrado) extend(extension, punto.getGeometry()!.getExtent());
    });
    if (!isEmpty(extension)) this.controladorGis?.encuadrarEnZonaLibre(extension);
  }

  private limpiarMapa(): void {
    this.clientesLayer?.getSource()?.clear();
    this.controladorGis?.descartarListado();
    this.controladorGis?.quitarPredio();
    this.registros = [];
    this.resultados.clear();
    this.entradasLeyenda = [];
    this.conteo = {};
    this.totalSinCoordenadas = 0;
    this.grupoFiltrado = null;
    this.cerrarPopup();
  }

  // MAPA

  private crearMapa(): void {
    this.osmLayer = crearCapaOsm(this.baseActive === "osm");
    this.satelitalLayer = crearCapaSatelital(this.baseActive === "satelital");
    this.lotesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("lotes"), true);
    this.sectoresComercialesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("sectoresComerciales"), false);
    this.manzanasLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("manzanas"), false);
    this.callesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("calles"), false);
    this.rutaLecturaLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("rutaLectura"), false);

    this.clientesLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const grupo = this.resultados.get(feature.get("codcliente"))?.grupo ?? GRUPO_SIN_COMPARAR;
        if (this.grupoFiltrado && grupo.clave !== this.grupoFiltrado) return undefined;
        return this.estilos.punto({
          forma: "circulo",
          color: grupo.color,
          zoom: this.map?.getView().getZoom() ?? 14,
          seleccionado: feature === this.featureSeleccionado,
          etiqueta: feature.get("codcliente"),
          ...RADIOS_LECTURA,
        });
      },
    });

    this.registroCapas = {
      usuarios: this.clientesLayer,
      lotes: this.lotesLayer,
      sectores: this.sectoresComercialesLayer,
      manzanas: this.manzanasLayer,
      calles: this.callesLayer,
      rutaLectura: this.rutaLecturaLayer,
    };

    this.map = new OlMap({
      layers: [
        this.osmLayer,
        this.satelitalLayer,
        this.sectoresComercialesLayer,
        this.manzanasLayer,
        this.lotesLayer,
        this.callesLayer,
        this.rutaLecturaLayer,
        this.clientesLayer,
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
        columnas: COLUMNAS_VARIACION,
        tituloReporte: "VARIACIÓN DE CONSUMO",
        nombreArchivo: "variacion_consumo_area_",
        origen: ORIGENES_COORDENADA.usuario,
        registros: () => this.registrosVisibles() as unknown as Record<string, unknown>[],
        aFila: (registro) => this.aFila(registro as unknown as VariacionConsumo),
        subcabecera: () => this.subcabeceraReporte(),
        excelService: this.excelService,
      },
    });

    this.map.on("singleclick", (evento) => {
      if (estaUsandoHerramientas(this.map)) return;
      const feature = this.map.forEachFeatureAtPixel(evento.pixel, (encontrado) => encontrado, {
        hitTolerance: 5,
        layerFilter: (capa) => capa === this.clientesLayer && !capa.get(MARCA_CAPA_RESALTADO),
      }) as Feature | undefined;

      if (feature) {
        this.seleccionarCliente(feature);
      } else {
        this.cerrarPopup();
        this.controladorGis?.consultarPunto(evento.coordinate);
      }
    });
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

  // Los dos popups ocupan el mismo lugar: abrir el del cliente cierra el de GIS.
  private seleccionarCliente(feature: Feature): void {
    const codigo = feature.get("codcliente");
    this.controladorGis?.cerrarPopupGis();
    this.featureSeleccionado = feature;
    this.clienteSeleccionado = this.registros.find((registro) => registro.codcliente === codigo) ?? null;
    this.clientesLayer.changed();
    if (this.clienteSeleccionado) this.cargarDatosPopup(this.clienteSeleccionado);
  }

  cerrarPopup(): void {
    this.peticionPopup?.unsubscribe();
    this.clienteSeleccionado = null;
    this.featureSeleccionado = null;
    this.datosClientePopup = null;
    this.imagenesPopup = [];
    this.cargandoImagenes = false;
    this.clientesLayer?.changed();
  }

  /** La misma ficha de control de digitación: datos de la ficha catastral y fotos de la lectura. */
  private cargarDatosPopup(registro: VariacionConsumo): void {
    // Si se elige otro cliente antes de que responda el anterior, sus datos no deben llegar a la ficha nueva.
    this.peticionPopup?.unsubscribe();
    this.imagenesPopup = [];
    this.datosClientePopup = null;
    this.cargandoImagenes = true;
    const codsuc = registro.codsuc || this.selectedSucursal?.codsuc;
    const codcliente = registro.codcliente;

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
            };
          }
          this.imagenesPopup =
            imagenes?.mensaje === "EXITO" && imagenes?.data?.length > 0
              ? imagenes.data
                  .filter((imagen: any) => !imagen.tiporecepcionimages?.includes("FIRMA"))
                  .map((imagen: any) => ({
                    ...imagen,
                    src: imagen.img64?.startsWith("data:") ? imagen.img64 : "data:image/jpeg;base64," + imagen.img64,
                  }))
              : [];
        },
        error: () => (this.cargandoImagenes = false),
      });
  }

  // `situacionmed` llega como string: "1" instalado, "2" retirado, "3" reinstalado.
  etiquetaMovimientoMedidor(): string {
    switch (this.situacionMedidor()) {
      case "2": return "F. Retiro";
      case "3": return "F. Reinstalación";
      default: return "F. Instalación";
    }
  }

  // En "instalado" `fechainst` llega siempre null: la fecha real está en `fechainsmed`.
  fechaMovimientoMedidor(): string {
    const medidor: any = this.datosClientePopup?._medidor;
    switch (this.situacionMedidor()) {
      case "2": return formatoFechaCorta(medidor?.fecharetiro);
      case "3": return formatoFechaCorta(medidor?.fechareinst);
      default: return formatoFechaCorta(medidor?.fechainst || medidor?.fechainsmed);
    }
  }

  private situacionMedidor(): string {
    return String(this.datosClientePopup?._medidor?.situacionmed ?? "").trim();
  }

  direccionCliente(registro: VariacionConsumo): string {
    return direccionDe(registro as unknown as Record<string, unknown>) || "-";
  }

  abrirStreetView(): void {
    const registro = this.clienteSeleccionado;
    const lonLat = registro ? coordenadaLonLat(registro.lon, registro.lat, this.gis.proyeccionUtm) : null;
    if (!lonLat) {
      this.avisar("warn", "Aviso", "No hay coordenadas válidas para abrir Street View.");
      return;
    }
    abrirGoogleStreetView(lonLat);
  }

  verMasInformacion(): void {
    const registro = this.clienteSeleccionado;
    if (!registro) return;
    abrirConsultaUsuario(this.dialogService, String(registro.codcliente), registro.codsuc)
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

  buscarPorCodCliente(): void {
    const codigo = String(this.searchCodCliente || "").trim();
    if (!codigo) return;
    const registro = this.registros.find((item) => String(item.codcliente) === codigo);
    if (!registro) {
      this.avisar("warn", "Aviso", `El cliente ${codigo} no tiene lectura en los periodos y filtros elegidos.`);
      return;
    }
    const grupo = this.resultadoDe(registro)?.grupo;
    if (this.grupoFiltrado && grupo?.clave !== this.grupoFiltrado) this.filtrarPorGrupo(this.grupoFiltrado);
    const feature = this.clientesLayer.getSource()!.getFeatures().find((punto) => String(punto.get("codcliente")) === codigo);
    if (!feature) {
      this.clienteSeleccionado = registro;
      this.cargarDatosPopup(registro);
      this.avisar("warn", "Sin ubicación", `El cliente ${codigo} no tiene coordenadas: solo se muestra su ficha.`);
      return;
    }
    this.mostrarSearchPanel = false;
    this.seleccionarCliente(feature);
    const centro = (feature.getGeometry() as Point).getCoordinates();
    this.map.getView().animate({ center: centro, zoom: ZOOM_PREDIO, duration: 800 });
    this.controladorGis?.marcarPredio(codigo, centro);
  }

  // LISTADOS Y EXCEL

  private aFila(registro: VariacionConsumo): FilaListado {
    const resultado = this.resultadoDe(registro);
    return {
      ...registro,
      direccion: this.direccionCliente(registro),
      diferencia: resultado?.diferencia ?? "",
      porcentaje: resultado?.porcentaje == null ? "" : Math.round(resultado.porcentaje),
      variacion: resultado?.grupo.etiqueta ?? "",
      estado1: this.descripcionEstado(registro.estadolectura1),
      estado2: this.descripcionEstado(registro.estadolectura2),
    };
  }

  private subcabeceraReporte(): string[] {
    return [
      `Ciclo: ${this.selectedCiclo?.descripcion ?? "-"}`,
      `Sucursal: ${this.selectedSucursal?.nombre ?? "-"}`,
      `Sector: ${this.selectedSector?.descripcion ?? "-"}`,
      `Periodo 1: ${this.periodoConsultado.periodo1} · Periodo 2: ${this.periodoConsultado.periodo2}`,
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

  async descargarExcel(): Promise<void> {
    const registros = this.registrosVisibles();
    if (registros.length === 0) return;
    await descargarListadoExcel(this.excelService, {
      titulo: "VARIACIÓN DE CONSUMO",
      subcabecera: this.subcabeceraReporte(),
      nombreArchivo: "variacion_consumo_",
      columnas: COLUMNAS_VARIACION,
      filas: registros.map((registro) => this.aFila(registro)),
    });
  }

  async descargarSinCoordenadas(): Promise<void> {
    if (this.totalSinCoordenadas === 0) return;
    const cantidad = await (this.controladorGis?.descargarSinCoordenadas() ?? Promise.resolve(0));
    if (cantidad > 0) this.avisar("success", "Excel descargado", `${cantidad} clientes sin coordenadas.`);
  }

  private avisar(severity: string, summary: string, detail: string): void {
    this.messageService.add({ severity, summary, detail });
  }
}
