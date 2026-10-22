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
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { volverAlMainGeoreferencia } from "../../../shared/utils/navegacion.utils";
import { ButtonModule } from "primeng/button";
import { ToastModule } from "primeng/toast";
import { DropdownModule } from "primeng/dropdown";
import { InputTextModule } from "primeng/inputtext";
import { SelectButtonModule } from "primeng/selectbutton";
import { MessageService } from "primeng/api";
import { CatastroService } from "@host/_servicios/vektors/catastro.service";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { SectoresCicloService } from "@host/_servicios/seguridad/sectores-ciclo.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { of, Subject, Subscription } from "rxjs";
import { catchError, takeUntil } from "rxjs/operators";

import OlMap from "ol/Map";
import TileLayer from "ol/layer/Tile";
import BaseLayer from "ol/layer/Base";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import View from "ol/View";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import { containsCoordinate, createEmpty, extend, Extent, isEmpty } from "ol/extent";
import { transform } from "ol/proj";
import Zoom from "ol/control/Zoom";
import { Fill, Stroke, Style } from "ol/style";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";

import { ORIGENES_COORDENADA } from "../../../shared/constantes/coordenadas";
import { LISTA_MESES } from "../../../shared/constantes/lecturas";
import {
  CapaConsultable,
  ConsultaCapasGisService,
  DescargaShapeGisService,
  GisConfigService,
  WGS84,
} from "../../../core/gis";
import { observarTamanoMapa } from "../../../shared/mapa/observar-tamano-mapa";
import {
  MapEstilosFactory,
  RADIOS_LECTURA,
} from "../../../shared/mapa/mapa-estilos";
import { estaUsandoHerramientas } from "../../../shared/mapa/herramientas-medicion";
import { MARCA_CAPA_RESALTADO } from "../../../shared/mapa/interaccion-gis";
import { ControladorMapaGis } from "../../../shared/mapa/controlador-mapa-gis";
import { PanelesMapaGisComponent } from "../../../shared/components/paneles-mapa-gis/paneles-mapa-gis.component";
import { ColumnaListado, FilaListado } from "../../../shared/utils/listado-excel";
import { CapaShape, ColumnaShape } from "../../../shared/utils/shapefile";
import { ExcelService } from "@host/_servicios/reportes/excel.service";
import { crearFeaturePunto, extraerCoordenada } from "../../../shared/mapa/geo.utils";
import {
  FiltroModificacionesCatastralesRequest,
  TipoModificacionCatastral,
} from "@host/_models/vektors/Catastro/FiltroModificacionesCatastralesRequest";
import { CapasSidebarComponent } from "../../../shared/components/capas-sidebar/capas-sidebar.component";
import { crearCapaWms, crearCapaOsm, crearCapaSatelital, CAPAS_BASE_UI } from "../../../shared/mapa/capas";
import { coordenadaLonLat, abrirGoogleStreetView } from "../../../shared/mapa/street-view";
import { abrirConsultaUsuario } from "../../../shared/dialogos/consulta-usuario.dialog";
import { abrirVistaPreviaShape } from "../../../shared/dialogos/vista-previa-shape.dialog";
import { ClaseModificacion, clasificarModificacion } from "./clasificacion-modificaciones";
import {
  contarPorGrupo,
  EntradaLeyenda,
  LeyendaGruposComponent,
} from "../../../shared/components/leyenda-grupos/leyenda-grupos.component";

interface TipoModificacionUI {
  codigo: TipoModificacionCatastral;
  descripcion: string;
  color: string;
  icono: string;
}

const TIPOS_MODIFICACION: TipoModificacionUI[] = [
  { codigo: "catetar", descripcion: "Cambio de categoría", color: "#8b5cf6", icono: "pi pi-wallet" },
  { codigo: "unidades", descripcion: "Unidades de uso", color: "#f59e0b", icono: "pi pi-th-large" },
  { codigo: "propietario", descripcion: "Cambio de nombre", color: "#ec4899", icono: "pi pi-user-edit" },
];

const CANTIDAD_ANIOS = 6;

// Relleno del lote semitransparente: debajo se siguen viendo las calles y el número del lote.
const OPACIDAD_RELLENO_LOTE = 0.45;

function colorConOpacidad(colorHexadecimal: string, opacidad: number): string {
  const valor = parseInt(colorHexadecimal.replace("#", ""), 16);
  return `rgba(${(valor >> 16) & 255}, ${(valor >> 8) & 255}, ${valor & 255}, ${opacidad})`;
}

const COLUMNAS_TABLA_MODIFICACIONES: ColumnaListado[] = [
  { campo: "codcliente", titulo: "Cód. cliente", anchoExcel: 12 },
  { campo: "codiusua", titulo: "Cód. antiguo", anchoExcel: 12 },
  { campo: "propietario", titulo: "Titular", anchoExcel: 35 },
  { campo: "direccion", titulo: "Dirección", anchoExcel: 35 },
  { campo: "codsector", titulo: "Sector", anchoExcel: 8 },
  { campo: "valoractual", titulo: "Valor anterior", anchoExcel: 25 },
  { campo: "valorultimo", titulo: "Valor último", anchoExcel: 25 },
  { campo: "observacion", titulo: "Observación", anchoExcel: 35 },
  { campo: "fechacontrol", titulo: "Fecha", anchoExcel: 18 },
  { campo: "creador", titulo: "Usuario", anchoExcel: 15 },
];

const COLUMNA_PORCENTAJE_USO: ColumnaListado = { campo: "uso", titulo: "Porcentaje último", anchoExcel: 25 };

// Los nombres de columna de un .dbf no pasan de 10 caracteres.
const COLUMNAS_SHAPE_MODIFICACIONES: ColumnaShape[] = [
  { nombre: "codcliente", campo: "codcliente" },
  { nombre: "cod_antig", campo: "codiusua" },
  { nombre: "titular", campo: "propietario" },
  { nombre: "direccion", campo: "direccion" },
  { nombre: "sector", campo: "codsector" },
  { nombre: "tipo", campo: "tipoModificacion" },
  { nombre: "val_ant", campo: "valoractual" },
  { nombre: "val_ult", campo: "valorultimo" },
  { nombre: "uso", campo: "uso" },
  { nombre: "observ", campo: "observacion" },
  { nombre: "fecha", campo: "fechacontrol" },
  { nombre: "usuario", campo: "creador" },
];

@Component({
  selector: "app-modificaciones-catastrales",
  standalone: true,
  imports: [
    CapasSidebarComponent,
    PanelesMapaGisComponent,
    CommonModule,
    FormsModule,
    ButtonModule,
    ToastModule,
    DropdownModule,
    InputTextModule,
    SelectButtonModule,
    LeyendaGruposComponent,
  ],
  templateUrl: "./modificaciones-catastrales.component.html",
  styleUrl: "./modificaciones-catastrales.component.scss",
  providers: [MessageService, DialogService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ModificacionesCatastralesComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private readonly destroyRef = inject(DestroyRef);

  private readonly cicloCambiado = new Subject<void>();
  private readonly sucursalCambiada = new Subject<void>();
  private readonly gis = inject(GisConfigService);
  private readonly consultaCapasGis = inject(ConsultaCapasGisService);
  private readonly descargaShapeGis = inject(DescargaShapeGisService);
  private readonly excelService = inject(ExcelService);
  private readonly router = inject(Router);
  controladorGis?: ControladorMapaGis;
  private readonly estilos = new MapEstilosFactory();

  volverAlMain(): void {
    volverAlMainGeoreferencia(this.router);
  }
  private detenerObservadorMapa?: () => void;

  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;
  @ViewChild("mapContainer", { static: false })
  private mapContainer!: ElementRef<HTMLDivElement>;

  map!: OlMap;
  modificacionesLayer!: VectorLayer<VectorSource>;
  lotesModificadosLayer!: VectorLayer<VectorSource>;
  lotesLayer!: TileLayer<TileWMS>;
  sectoresComercialesLayer!: TileLayer<TileWMS>;
  callesLayer!: TileLayer<TileWMS>;
  manzanasLayer!: TileLayer<TileWMS>;
  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;

  private registroCapas: Record<string, BaseLayer> = {};
  private capasVector: VectorLayer<VectorSource>[] = [];

  filtrosVisible = false;
  baseActive: string | null = "osm";
  cargando = false;
  descargandoShape = false;

  resultadoBusquedaJson: any[] = [];
  totalModificaciones = 0;
  totalClientes = 0;
  totalSinCoordenadas = 0;

  readonly tiposModificacion = TIPOS_MODIFICACION;
  readonly meses = LISTA_MESES;
  readonly anios = Array.from({ length: CANTIDAD_ANIOS }, (_, indice) => String(new Date().getFullYear() - indice));

  dataCiclos: any[] = [];
  listaSucursales: any[] = [];
  listaSectores: any[] = [];

  selectedTipo: TipoModificacionCatastral = "catetar";
  /** Tipo con el que se cargó lo que está en el mapa: el filtro puede cambiar sin volver a buscar. */
  tipoCargado: TipoModificacionUI = TIPOS_MODIFICACION[0];

  entradasLeyenda: EntradaLeyenda[] = [];
  /** Grupo elegido en la leyenda: el mapa muestra solo ese y lo encuadra. `null` = todos. */
  claseFiltrada: string | null = null;
  mostrarLeyenda = true;
  cargandoLotes = false;
  private busquedaLotes?: Subscription;
  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: any = null;
  selectedAnio = String(new Date().getFullYear());
  selectedMes = String(new Date().getMonth() + 1).padStart(2, "0");

  mostrarSearchPanel = false;
  searchCodCliente = "";
  isBusquedaClienteActiva = false;
  resultadoBusquedaOriginalJson: any[] | undefined = undefined;

  /** Todas las modificaciones del cliente elegido en el mapa (un cliente puede tener varias). */
  modificacionesSeleccionadas: any[] = [];
  featureSeleccionado: Feature | null = null;
  ref: DynamicDialogRef | undefined;

  readonly baseLayers = CAPAS_BASE_UI;

  commercialLayers = [
    { id: "modificaciones", label: "Modificaciones", active: true },
    { id: "lotesModificados", label: "Lotes modificados", active: true },
    { id: "lotes", label: "Lotes", active: true },
    { id: "sectores", label: "Sectores Comerciales", active: false },
    { id: "manzanas", label: "Manzanas", active: false },
    { id: "calles", label: "Calles", active: false },
  ];

  constructor(
    private catastroService: CatastroService,
    private consulGenericService: ConsulGenericService,
    private sucursalesService: SucursalesService,
    private sectoresCicloService: SectoresCicloService,
    private messageService: MessageService,
    private dialogService: DialogService,
  ) {}

  get clienteSeleccionado(): any {
    return this.modificacionesSeleccionadas[0] ?? null;
  }

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);
    this.crearMapa();

    this.consulGenericService
      .getconsultaService("CCO", "ALL", "ALL", "ALL")
      .pipe(catchError(() => of<any[]>([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((ciclos) => {
        this.dataCiclos = [{ codigo: "ALL", descripcion: "TODOS", codemp: "ALL", estareg: 1 }, ...ciclos];
        this.selectedCiclo = this.dataCiclos[1] || this.dataCiclos[0];
        this.onCicloChange();
      });
  }

  onCicloChange(): void {
    this.cicloCambiado.next();
    this.sucursalCambiada.next();
    this.selectedSucursal = null;
    this.selectedSector = null;
    this.listaSucursales = [];
    this.listaSectores = [];
    if (!this.selectedCiclo) return;

    this.sucursalesService
      .drop_sucursales_x_ciclo(this.selectedCiclo.codigo)
      .pipe(takeUntil(this.cicloCambiado), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.listaSucursales = data || [];
          if (this.listaSucursales.length > 0) {
            this.selectedSucursal = this.listaSucursales[0];
            this.onSucursalChange();
          }
        },
        error: (err) => {
          console.error("Error al cargar sucursales:", err);
          this.listaSucursales = [];
        },
      });
  }

  onSucursalChange(): void {
    this.sucursalCambiada.next();
    this.selectedSector = null;
    this.listaSectores = [];
    if (!this.selectedSucursal) return;

    if (this.selectedSucursal.codsuc === "ALL" || this.selectedCiclo.codigo === "ALL") {
      this.listaSectores = [{ codsector: "ALL", descripcion: "TODOS" }];
      this.selectedSector = this.listaSectores[0];
      return;
    }

    this.sectoresCicloService
      .drop_sectores_x_ciclo(this.selectedSucursal.codsuc, this.selectedCiclo.codigo)
      .pipe(takeUntil(this.sucursalCambiada), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.listaSectores = [{ codsector: "ALL", descripcion: "TODOS" }, ...(data || [])];
          this.selectedSector = this.listaSectores[0];
        },
        error: (err) => {
          console.error("Error al cargar sectores:", err);
          this.listaSectores = [{ codsector: "ALL", descripcion: "TODOS" }];
          this.selectedSector = this.listaSectores[0];
        },
      });
  }

  tipoDe(codigo: string | undefined): TipoModificacionUI {
    return TIPOS_MODIFICACION.find((tipo) => tipo.codigo === codigo) ?? TIPOS_MODIFICACION[0];
  }

  getDescMes(): string {
    return LISTA_MESES.find((mes) => mes.numero === this.selectedMes)?.mes ?? this.selectedMes;
  }

  private filtroActual(): FiltroModificacionesCatastralesRequest {
    const toNull = (valor: any) => (!valor || valor === "ALL" ? null : valor);
    return {
      codsuc: toNull(this.selectedSucursal?.codsuc),
      codsector: toNull(this.selectedSector?.codsector),
      anio: this.selectedAnio,
      mes: this.selectedMes,
      campo: this.selectedTipo,
    };
  }

  procesar(): void {
    if (!this.selectedSucursal || !this.selectedAnio || !this.selectedMes || !this.selectedTipo) {
      this.avisar("warn", "Aviso de usuario", "Debe seleccionar tipo de modificación, sucursal, año y mes");
      return;
    }

    this.cargando = true;
    const filtro = this.filtroActual();

    this.catastroService
      .listarModificacionesCatastrales(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          this.filtrosVisible = false;
          this.tipoCargado = this.tipoDe(filtro.campo);
          if (!response.success) {
            this.resultadoBusquedaJson = [];
            this.limpiarCapas();
            this.avisar("error", "Error", this.mensajeDeError(response.mensaje));
            return;
          }
          if (response.data && response.data.length > 0) {
            this.resultadoBusquedaJson = response.data;
            this.actualizarCapasComerciales();
          } else {
            this.resultadoBusquedaJson = [];
            this.limpiarCapas();
            this.avisar("info", "Resultados", `No hay modificaciones de tipo "${this.tipoCargado.descripcion}" en el periodo`);
          }
        },
        error: (err) => {
          console.error("Error al cargar modificaciones catastrales:", err);
          this.cargando = false;
          this.limpiarCapas();
          this.resultadoBusquedaJson = [];
          this.avisar("error", "Error", "Ocurrió un error al cargar las modificaciones catastrales");
        },
      });
  }

  limpiar(): void {
    this.selectedTipo = "catetar";
    this.selectedCiclo = this.dataCiclos[1] || this.dataCiclos[0];
    this.onCicloChange();
    this.limpiarCapas();
    this.resultadoBusquedaJson = [];
  }

  private actualizarCapasComerciales(fitBounds = true): void {
    this.estilos.limpiar();
    this.limpiarCapas();

    const registros = this.resultadoBusquedaJson || [];
    this.totalModificaciones = registros.length;
    this.totalClientes = new Set(registros.map((registro) => registro.codcliente)).size;
    if (registros.length === 0) return;

    // Un punto por cliente con el color de su último cambio; el popup muestra todos los del periodo.
    const ultimaPorCliente = new Map<unknown, any>();
    registros.forEach((registro) => ultimaPorCliente.set(registro.codcliente, registro));
    const clasePorCliente = new Map<unknown, ClaseModificacion>();
    ultimaPorCliente.forEach((registro, codcliente) =>
      clasePorCliente.set(codcliente, clasificarModificacion(this.tipoCargado.codigo, registro)),
    );

    const puntos = Array.from(ultimaPorCliente.values())
      .map((registro) => {
        const punto = crearFeaturePunto(registro, ORIGENES_COORDENADA.usuario);
        punto?.set("_clase", clasePorCliente.get(registro.codcliente));
        return punto;
      })
      .filter((feature): feature is Feature => feature !== null);
    this.modificacionesLayer.getSource()!.addFeatures(puntos);

    this.totalSinCoordenadas = this.totalClientes - puntos.length;
    this.armarLeyenda(clasePorCliente);
    this.pintarLotes(clasePorCliente);

    this.ajustarVista(fitBounds);
  }

  private armarLeyenda(clasePorCliente: Map<unknown, ClaseModificacion>): void {
    this.entradasLeyenda = contarPorGrupo(Array.from(clasePorCliente.values()));
  }

  /** Trae del GIS el polígono del lote de cada cliente y lo pinta con el color de su clase. */
  private pintarLotes(clasePorCliente: Map<unknown, ClaseModificacion>): void {
    this.busquedaLotes?.unsubscribe();
    const codigos = Array.from(clasePorCliente.keys(), (codigo) => String(codigo));
    if (codigos.length === 0) return;

    this.cargandoLotes = true;
    this.busquedaLotes = this.consultaCapasGis
      .buscarPrediosDeClientes(codigos, this.gis.proyeccionMapa)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lotes) => {
        this.cargandoLotes = false;
        const features: Feature[] = [];
        clasePorCliente.forEach((clase, codcliente) => {
          const geometria = lotes.get(String(codcliente));
          if (geometria) features.push(new Feature({ geometry: geometria, codcliente, _clase: clase }));
        });
        this.lotesModificadosLayer.getSource()!.addFeatures(features);
      });
  }

  /** Como los estados de Seguimiento de programa: clic filtra y lleva al grupo, otro clic vuelve a todos. */
  filtrarPorClase(clave: string): void {
    this.claseFiltrada = this.claseFiltrada === clave ? null : clave;
    if (this.claseSeleccionada && this.claseFiltrada && this.claseSeleccionada.clave !== this.claseFiltrada) {
      this.cerrarPopup();
    }
    this.refrescarCapasVector();
    this.encuadrarClaseFiltrada();
  }

  private encuadrarClaseFiltrada(): void {
    const extension = createEmpty();
    [this.lotesModificadosLayer, this.modificacionesLayer].forEach((capa) =>
      capa.getSource()!.getFeatures().forEach((feature) => {
        const clase = feature.get("_clase") as ClaseModificacion | undefined;
        if (clase && (!this.claseFiltrada || clase.clave === this.claseFiltrada)) {
          extend(extension, feature.getGeometry()!.getExtent());
        }
      }),
    );
    if (isEmpty(extension)) return;
    this.map.getView().fit(extension, { duration: 700, maxZoom: 19, padding: [120, 120, 120, 340] });
  }

  get claseSeleccionada(): ClaseModificacion | null {
    return (this.featureSeleccionado?.get("_clase") as ClaseModificacion | undefined) ?? null;
  }

  private ajustarVista(fitBounds: boolean): void {
    const origenModificaciones = this.modificacionesLayer.getSource()!;

    if (origenModificaciones.getFeatures().length === 0) {
      this.avisar("info", "Aviso", "No se encontraron coordenadas para los clientes modificados");
      return;
    }

    if (fitBounds) {
      this.map
        .getView()
        .fit(origenModificaciones.getExtent(), { duration: 800, maxZoom: 18, padding: [60, 60, 60, 60] });
    }
    this.avisar("success", "Proceso completado", "Modificaciones cargadas en el mapa");
  }

  private limpiarCapas(): void {
    this.busquedaLotes?.unsubscribe();
    this.cargandoLotes = false;
    this.entradasLeyenda = [];
    this.claseFiltrada = null;
    this.capasVector.forEach((capa) => capa?.getSource()?.clear());
    this.controladorGis?.descartarListado();
    this.modificacionesSeleccionadas = [];
    this.totalModificaciones = 0;
    this.totalClientes = 0;
    this.totalSinCoordenadas = 0;
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

  toggleFiltros(): void {
    this.filtrosVisible = !this.filtrosVisible;
  }

  abrirBusqueda(): void {
    this.mostrarSearchPanel = true;
    this.searchCodCliente = "";
  }

  cerrarBusqueda(): void {
    this.mostrarSearchPanel = false;
    this.reiniciarBusqueda();
  }

  reiniciarBusqueda(): void {
    this.searchCodCliente = "";
    this.controladorGis?.quitarPredio();
    if (this.isBusquedaClienteActiva) {
      this.isBusquedaClienteActiva = false;
      if (this.resultadoBusquedaOriginalJson !== undefined) {
        this.resultadoBusquedaJson = this.resultadoBusquedaOriginalJson;
        this.resultadoBusquedaOriginalJson = undefined;
      }
      this.actualizarCapasComerciales();
    }
  }

  buscarPorCodCliente(): void {
    const codigo = String(this.searchCodCliente || "").trim();
    if (!codigo) {
      this.reiniciarBusqueda();
      return;
    }

    const registrosCargados = (this.resultadoBusquedaOriginalJson ?? this.resultadoBusquedaJson).filter(
      (registro: any) => String(registro.codcliente ?? "").trim() === codigo,
    );
    if (registrosCargados.length > 0) {
      this.mostrarSoloCliente(registrosCargados, codigo);
      return;
    }

    if (!this.selectedSucursal) return;

    this.cargando = true;
    const filtro = this.filtroActual();
    this.catastroService
      .buscarModificacionesCatastrales({ ...filtro, codcliente: Number(codigo) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          if (!response.success) {
            this.avisar("error", "Error", this.mensajeDeError(response.mensaje));
            return;
          }
          if (response.data && response.data.length > 0) {
            this.tipoCargado = this.tipoDe(filtro.campo);
            this.searchCodCliente = "";
            this.mostrarSoloCliente(response.data, codigo);
          } else {
            this.avisar("warn", "Aviso", `El cliente ${codigo} no tiene modificaciones de este tipo en el periodo.`);
          }
        },
        error: () => {
          this.cargando = false;
          this.avisar("error", "Error", "Ocurrió un error al buscar el cliente.");
        },
      });
  }

  /** Deja en el mapa solo ese cliente, recordando el resultado anterior para poder volver. */
  private mostrarSoloCliente(registros: any[], codigo: string): void {
    if (!this.isBusquedaClienteActiva) {
      this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
      this.isBusquedaClienteActiva = true;
    }
    this.resultadoBusquedaJson = registros;
    this.actualizarCapasComerciales(false);

    const coordenada = extraerCoordenada(registros[0], ORIGENES_COORDENADA.usuario);
    if (coordenada) {
      this.map.getView().animate({ center: coordenada, zoom: 21, duration: 700 });
    }
    const punto = this.buscarPunto(codigo);
    if (punto) this.seleccionarFeature(punto);
    this.controladorGis?.marcarPredio(codigo);
  }

  private buscarPunto(codigo: string): Feature | undefined {
    return this.modificacionesLayer
      ?.getSource()
      ?.getFeatures()
      .find((feature) => String(feature.get("codcliente") ?? "").trim() === codigo);
  }

  // MAPA

  private crearMapa(): void {
    this.osmLayer = crearCapaOsm(this.baseActive === "osm");
    this.satelitalLayer = crearCapaSatelital(this.baseActive === "satelital");

    this.lotesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("lotes"), true);
    this.sectoresComercialesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("sectoresComerciales"), false);
    this.callesLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("calles"), false);
    this.manzanasLayer = crearCapaWms(this.gis.urlWms(), this.gis.capa("manzanas"), false);

    const zoomActual = () => this.map?.getView().getZoom() ?? 14;

    const claseVisible = (feature: { get: (clave: string) => unknown }) => {
      const clase = feature.get("_clase") as ClaseModificacion | undefined;
      return clase && (!this.claseFiltrada || clase.clave === this.claseFiltrada) ? clase : null;
    };

    this.modificacionesLayer = new VectorLayer({
      source: new VectorSource(),
      visible: true,
      zIndex: 20,
      style: (feature) => {
        const clase = claseVisible(feature);
        if (!clase) return undefined;
        return this.estilos.punto({
          forma: "circulo",
          color: clase.color,
          zoom: zoomActual(),
          seleccionado: feature === this.featureSeleccionado,
          etiqueta: feature.get("codcliente"),
          ...RADIOS_LECTURA,
        });
      },
    });

    this.lotesModificadosLayer = new VectorLayer({
      source: new VectorSource(),
      visible: true,
      zIndex: 10,
      style: (feature) => {
        const clase = claseVisible(feature);
        if (!clase) return undefined;
        const seleccionado = feature.get("codcliente") === this.featureSeleccionado?.get("codcliente");
        return [
          new Style({ stroke: new Stroke({ color: "rgba(255, 255, 255, 0.9)", width: seleccionado ? 6 : 3 }) }),
          new Style({
            fill: new Fill({ color: colorConOpacidad(clase.color, seleccionado ? 0.7 : OPACIDAD_RELLENO_LOTE) }),
            stroke: new Stroke({ color: clase.color, width: seleccionado ? 3 : 1.5 }),
          }),
        ];
      },
    });

    this.capasVector = [this.modificacionesLayer, this.lotesModificadosLayer];

    this.registroCapas = {
      modificaciones: this.modificacionesLayer,
      lotesModificados: this.lotesModificadosLayer,
      lotes: this.lotesLayer,
      sectores: this.sectoresComercialesLayer,
      calles: this.callesLayer,
      manzanas: this.manzanasLayer,
    };

    this.map = new OlMap({
      layers: [
        this.osmLayer,
        this.satelitalLayer,
        this.manzanasLayer,
        this.lotesLayer,
        this.sectoresComercialesLayer,
        this.callesLayer,
        this.lotesModificadosLayer,
        this.modificacionesLayer,
      ],
      view: new View({
        projection: this.gis.proyeccionMapa,
        center: this.gis.vista.centro,
        zoom: this.gis.vista.zoom,
      }),
      controls: [new Zoom()],
    });

    // El controlador lee las columnas al abrir cada listado: el getter sigue al tipo cargado.
    const pantalla = this;
    this.controladorGis = new ControladorMapaGis(this.map, {
      consulta: this.consultaCapasGis,
      gis: this.gis,
      capasComerciales: () => this.capasComercialesConsultables(),
      capasTecnicas: () => this.capasSidebar?.capasTecnicasConsultables() ?? [],
      avisar: (detalle) => this.avisar("info", "Aviso", detalle),
      listado: {
        get columnas() {
          return pantalla.columnasTabla();
        },
        tituloReporte: "MODIFICACIONES CATASTRALES",
        nombreArchivo: "modificaciones_catastrales_area_",
        origen: ORIGENES_COORDENADA.usuario,
        registros: () => this.resultadoBusquedaJson ?? [],
        aFila: (registro) => this.aFilaTabla(registro),
        subcabecera: () => [
          `Tipo: ${this.tipoCargado.descripcion}`,
          `Periodo: ${this.getDescMes()} ${this.selectedAnio}`,
          `Sucursal: ${this.selectedSucursal?.nombre ?? "-"}`,
          `Sector: ${this.selectedSector?.descripcion ?? "-"}`,
        ],
        excelService: this.excelService,
      },
    });

    this.initClick();
  }

  // La columna de porcentaje solo tiene datos en unidades de uso.
  private columnasTabla(): ColumnaListado[] {
    if (this.tipoCargado.codigo !== "unidades") return COLUMNAS_TABLA_MODIFICACIONES;
    return [
      ...COLUMNAS_TABLA_MODIFICACIONES.slice(0, 7),
      COLUMNA_PORCENTAJE_USO,
      ...COLUMNAS_TABLA_MODIFICACIONES.slice(7),
    ];
  }

  private capasComercialesConsultables(): CapaConsultable[] {
    return [
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

  toggleCommercialLayer(opcionCapa: any): void {
    opcionCapa.active = !opcionCapa.active;
    this.registroCapas[opcionCapa.id]?.setVisible(opcionCapa.active);
  }

  onSidebarToggle(): void {
    setTimeout(() => this.map?.updateSize(), 300);
  }

  private initClick(): void {
    this.map.on("singleclick", (evento) => {
      if (estaUsandoHerramientas(this.map)) return;
      const feature = this.map.forEachFeatureAtPixel(evento.pixel, (f) => f, {
        hitTolerance: 5,
        layerFilter: (capa: any) => !capa.get("isDrawLayer") && !capa.get(MARCA_CAPA_RESALTADO),
      }) as Feature | undefined;

      if (feature) {
        this.seleccionarFeature(feature);
      } else {
        this.cerrarPopup();
        this.controladorGis?.consultarPunto(evento.coordinate);
      }
    });
  }

  private aFilaTabla(registro: Record<string, unknown>): FilaListado {
    return { ...registro, tipoModificacion: this.tipoCargado.descripcion };
  }

  ubicarFilaEnMapa(fila: FilaListado): void {
    const codigo = String(fila["codcliente"] ?? "").trim();
    const punto = this.buscarPunto(codigo);
    if (!punto) {
      this.avisar("warn", "Aviso", `El cliente ${codigo} no tiene coordenadas para ubicarlo.`);
      return;
    }
    this.seleccionarFeature(punto);
    this.controladorGis?.encuadrarEnZonaLibre(punto.getGeometry()!.getExtent());
  }

  // Los dos popups ocupan el mismo lugar: abrir el del cliente cierra el de GIS.
  private seleccionarFeature(feature: Feature): void {
    this.controladorGis?.cerrarPopupGis();
    this.featureSeleccionado = feature;
    this.refrescarCapasVector();
    const codigo = feature.get("codcliente");
    this.modificacionesSeleccionadas = (this.resultadoBusquedaJson ?? []).filter(
      (registro) => registro.codcliente === codigo,
    );
  }

  cerrarPopup(): void {
    this.modificacionesSeleccionadas = [];
    this.featureSeleccionado = null;
    this.refrescarCapasVector();
  }

  private refrescarCapasVector(): void {
    this.modificacionesLayer?.changed();
    this.lotesModificadosLayer?.changed();
  }

  abrirStreetView(x: unknown, y: unknown): void {
    const lonLat = coordenadaLonLat(x, y, this.gis.proyeccionUtm);
    if (!lonLat) {
      this.avisar("warn", "Aviso", "No hay coordenadas válidas para abrir Street View.");
      return;
    }
    abrirGoogleStreetView(lonLat);
  }

  verMasInformacion(codcliente: string | undefined): void {
    if (!codcliente) return;
    abrirConsultaUsuario(
      this.dialogService,
      codcliente,
      this.clienteSeleccionado?.codsuc || this.selectedSucursal?.codsuc,
    ).then((referencia) => (this.ref = referencia));
  }

  // SHAPE

  /** Muestra lo que tendrá el shape y descarga solo si el usuario confirma. */
  descargarShape(): void {
    if (this.descargandoShape) return;
    const extension = this.map.getView().calculateExtent(this.map.getSize());
    const capasGis = [
      ...this.capasComercialesConsultables(),
      ...(this.capasSidebar?.capasTecnicasConsultables() ?? []),
    ];
    const capasLocales = this.capasLocalesParaShape(extension);
    const nombreArchivo = `modificaciones_${this.tipoCargado.codigo}_${this.selectedAnio}${this.selectedMes}`;

    this.ref = abrirVistaPreviaShape(this.dialogService, {
      nombreArchivo,
      capasLocales,
      capasGis: this.descargaShapeGis.etiquetasCapasGis(capasGis),
    });
    this.ref.onClose
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmado) => {
        if (confirmado) this.ejecutarDescargaShape(capasGis, capasLocales, extension, nombreArchivo);
      });
  }

  private async ejecutarDescargaShape(
    capasGis: CapaConsultable[],
    capasLocales: CapaShape[],
    extension: Extent,
    nombreArchivo: string,
  ): Promise<void> {
    this.descargandoShape = true;
    try {
      const { capas } = await this.descargaShapeGis.descargar({ capasGis, capasLocales, extension, nombreArchivo });
      if (capas.length === 0) {
        this.avisar("warn", "Sin datos", "Encienda al menos una capa con elementos en la zona que se ve.");
      } else {
        this.avisar("success", "Shape descargado", `Capas: ${capas.join(", ")}.`);
      }
    } catch (error) {
      this.avisar(
        "error",
        "No se pudo descargar",
        error instanceof Error ? error.message : "GeoServer no respondió. Intente de nuevo.",
      );
    } finally {
      this.descargandoShape = false;
    }
  }

  // Una fila por modificación (no por punto): un cliente con dos cambios sale dos veces en el .dbf.
  private capasLocalesParaShape(extension: Extent): CapaShape[] {
    const aLonLat = (coordenada: number[]) => transform(coordenada, this.gis.proyeccionMapa, WGS84);
    const registros = this.modificacionesLayer.getVisible() ? this.resultadoBusquedaJson ?? [] : [];
    return [
      {
        nombre: `modificaciones_${this.tipoCargado.codigo}`,
        tipo: "punto",
        columnas: COLUMNAS_SHAPE_MODIFICACIONES,
        elementos: registros.flatMap((registro) => {
          const coordenada = extraerCoordenada(registro, ORIGENES_COORDENADA.usuario);
          if (!coordenada || !containsCoordinate(extension, coordenada)) return [];
          return [{ coordenadas: [aLonLat(coordenada)], atributos: this.aFilaTabla(registro) }];
        }),
      },
    ];
  }

  // El backend responde 200 con success=false y el detalle en mensaje (p. ej. error SQL de la base GIS).
  private mensajeDeError(mensaje: string | undefined): string {
    return mensaje?.trim() || "Ocurrió un error al consultar las modificaciones catastrales";
  }

  /** Clic en la tarjeta "Sin Coord.": Excel de los clientes cargados que no se pintan en el mapa. */
  async descargarSinCoordenadas(): Promise<void> {
    if (this.totalSinCoordenadas === 0) return;
    const cantidad = await (this.controladorGis?.descargarSinCoordenadas() ?? Promise.resolve(0));
    if (cantidad === 0) {
      this.avisar("info", "Aviso", "Todos los registros cargados tienen coordenadas.");
    } else {
      this.avisar("success", "Excel descargado", `${cantidad} registros sin coordenadas.`);
    }
  }

  private avisar(severity: string, summary: string, detail: string): void {
    this.messageService.add({ severity, summary, detail });
  }
}
