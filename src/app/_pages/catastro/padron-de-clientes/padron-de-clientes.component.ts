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
import { ButtonModule } from "primeng/button";
import { ToastModule } from "primeng/toast";
import { DropdownModule } from "primeng/dropdown";
import { InputTextModule } from "primeng/inputtext";
import { MessageService } from "primeng/api";
import { CatastroService } from "@host/_servicios/vektors/catastro.service";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { SectoresCicloService } from "@host/_servicios/seguridad/sectores-ciclo.service";
import { TarifasService } from "@host/_servicios/catastro/tarifas.service";
import { UrbamaeService } from "@host/_servicios/catastro/urbamae.service";
import { TipousuarioService } from "@host/_servicios/catastro/tipousuario.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";

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
import { getCenter } from "ol/extent";
import Zoom from "ol/control/Zoom";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";

import { ORIGENES_COORDENADA } from "../../../shared/constantes/coordenadas";
import { GisConfigService } from "../../../core/gis";
import { observarTamanoMapa } from "../../../shared/mapa/observar-tamano-mapa";
import {
  MapEstilosFactory,
  RADIOS_LECTURA,
} from "../../../shared/mapa/mapa-estilos";
import { agregarHerramientasMapa } from "../../../shared/mapa/herramientas-medicion";
import { crearFeaturePunto, extraerCoordenada, contarPuntosEnCirculo } from "../../../shared/mapa/geo.utils";
import { FiltroPadronClientesTipoActividadRequest } from "@host/_models/vektors/Catastro/FiltroPadronClientesTipoActividadRequest";
import { CapasSidebarComponent } from "../../../shared/components/capas-sidebar/capas-sidebar.component";
import { crearCapaWms, crearCapaOsm, crearCapaSatelital, CAPAS_BASE_UI } from "../../../shared/mapa/capas";
import { coordenadaLonLat, abrirGoogleStreetView } from "../../../shared/mapa/street-view";
import { abrirConsultaUsuario } from "../../../shared/dialogos/consulta-usuario.dialog";
import type Circle from "ol/geom/Circle";

@Component({
  selector: "app-padron-de-clientes",
  standalone: true,
  imports: [
    CapasSidebarComponent,
    CommonModule,
    FormsModule,
    ButtonModule,
    ToastModule,
    DropdownModule,
    InputTextModule,
  ],
  templateUrl: "./padron-de-clientes.component.html",
  styleUrl: "./padron-de-clientes.component.scss",
  providers: [MessageService, DialogService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PadronDeClientesComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private readonly destroyRef = inject(DestroyRef);
  private readonly gis = inject(GisConfigService);
  private readonly estilos = new MapEstilosFactory();
  private detenerObservadorMapa?: () => void;

  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;
  @ViewChild("mapContainer", { static: false })
  private mapContainer!: ElementRef<HTMLDivElement>;

  map!: OlMap;
  usuariosLayer!: VectorLayer<VectorSource>;
  lotesLayer!: TileLayer<TileWMS>;
  sectoresComercialesLayer!: TileLayer<TileWMS>;
  callesLayer!: TileLayer<TileWMS>;
  osmLayer!: TileLayer<OSM>;
  satelitalLayer!: TileLayer<XYZ>;

  private registroCapas: Record<string, BaseLayer> = {};
  private capasVector: VectorLayer<VectorSource>[] = [];

  filtrosVisible = false;
  baseActive: string | null = "osm";
  cargando = false;

  resultadoBusquedaJson: any[] = [];
  totalClientes = 0;
  totalSinCoordenadas = 0;

  dataCiclos: any[] = [];
  listaSucursales: any[] = [];
  listaSectores: any[] = [];
  listaEstadoServicio: any[] = [];
  listaTipoServicio: any[] = [];
  listaTarifas: any[] = [];
  listaUrbanizaciones: any[] = [];
  listaActividades: any[] = [];
  listaTipoUsuario: any[] = [];

  selectedCiclo: any = null;
  selectedSucursal: any = null;
  selectedSector: any = null;
  selectedEstadoServicio: any = null;
  selectedTipoServicio: any = null;
  selectedTarifa: any = null;
  selectedUrbanizacion: any = null;
  selectedActividad: any = null;
  selectedTipoUsuario: any = null;

  mostrarSearchPanel = false;
  searchCodCliente = "";
  isBusquedaClienteActiva = false;
  resultadoBusquedaOriginalJson: any[] | undefined = undefined;

  clienteSeleccionado: any = null;
  featureSeleccionado: Feature | null = null;
  ref: DynamicDialogRef | undefined;

  readonly baseLayers = CAPAS_BASE_UI;

  commercialLayers = [
    { id: "usuarios", label: "Usuarios", active: true },
    { id: "lotes", label: "Lotes", active: true },
    { id: "sectores", label: "Sectores Comerciales", active: false },
    { id: "calles", label: "Calles", active: false },
  ];

  constructor(
    private catastroService: CatastroService,
    private consulGenericService: ConsulGenericService,
    private sucursalesService: SucursalesService,
    private sectoresCicloService: SectoresCicloService,
    private tarifasService: TarifasService,
    private urbamaeService: UrbamaeService,
    private tipoUsuarioService: TipousuarioService,
    private messageService: MessageService,
    private dialogService: DialogService,
  ) {}

  ngOnInit(): void {
    this.commercialLayers = this.gis.soloCapasPublicadas(this.commercialLayers);

    forkJoin({
      ciclos: this.consulGenericService
        .getconsultaService("CCO", "ALL", "ALL", "ALL")
        .pipe(catchError(() => of<any[]>([]))),
      estadoServicio: this.consulGenericService
        .getconsultaService("TES", "ALL", "ALL", "ALL")
        .pipe(catchError(() => of<any[]>([]))),
      tipoServicio: this.consulGenericService
        .getconsultaService("TSE", "ALL", "ALL", "ALL")
        .pipe(catchError(() => of<any[]>([]))),
      actividades: this.consulGenericService
        .getconsultaService("TAC", "ALL", "ALL", "ALL")
        .pipe(catchError(() => of<any[]>([]))),
      tipoUsuario: this.tipoUsuarioService
        .drop()
        .pipe(catchError(() => of<any[]>([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({
          ciclos,
          estadoServicio,
          tipoServicio,
          actividades,
          tipoUsuario,
        }) => {
          this.dataCiclos = [
            { codigo: "ALL", descripcion: "TODOS", codemp: "ALL", estareg: 1 },
            ...ciclos,
          ];
          if (this.dataCiclos.length > 0) {
            this.selectedCiclo = this.dataCiclos[1] || this.dataCiclos[0];
            this.onCicloChange();
          }

          this.listaEstadoServicio = [
            { codigo: "ALL", descripcion: "TODOS" },
            ...estadoServicio,
          ];
          this.selectedEstadoServicio = "ALL";

          this.listaTipoServicio = [
            { codigo: "ALL", descripcion: "TODOS" },
            ...tipoServicio,
          ];
          this.selectedTipoServicio = "ALL";

          this.listaActividades = [
            { codigo: "ALL", descripcion: "TODOS" },
            ...actividades,
          ];
          this.selectedActividad = "ALL";

          this.listaTipoUsuario = [
            { tipousuario: "ALL", descripcion: "TODOS" },
            ...(tipoUsuario || []),
          ];
          this.selectedTipoUsuario = "ALL";
        },
        error: (err) => {
          console.error("Error cargando catálogos iniciales:", err);
          this.avisar(
            "error",
            "Error",
            "Error al cargar catálogos iniciales. Revisa tu conexión.",
          );
        },
      });
  }

  onCicloChange(): void {
    this.selectedSucursal = null;
    this.selectedSector = null;
    this.listaSucursales = [];
    this.listaSectores = [];
    this.listaTarifas = [];
    this.listaUrbanizaciones = [];
    if (!this.selectedCiclo) return;

    this.sucursalesService
      .drop_sucursales_x_ciclo(this.selectedCiclo.codigo)
      .pipe(takeUntilDestroyed(this.destroyRef))
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
    this.selectedSector = null;
    this.selectedTarifa = null;
    this.selectedUrbanizacion = null;
    this.listaSectores = [];
    this.listaTarifas = [];
    this.listaUrbanizaciones = [];

    if (!this.selectedSucursal) return;

    const sucursalCode = this.selectedSucursal.codsuc;

    this.tarifasService
      .drop(sucursalCode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          const uniqueData = (data || []).filter(
            (item: any, index: number, self: any[]) =>
              index === self.findIndex((t) => t.nomtar === item.nomtar),
          );
          this.listaTarifas = [
            { catetar: "ALL", nomtar: "TODOS", codigo: "ALL" },
            ...uniqueData,
          ];
          this.selectedTarifa = "ALL";
        },
        error: (err) => console.error("Error al cargar tarifas:", err),
      });

    if (
      this.selectedSucursal.codsuc === "ALL" ||
      this.selectedCiclo.codigo === "ALL"
    ) {
      this.listaSectores = [{ codsector: "ALL", descripcion: "TODOS" }];
      this.selectedSector = this.listaSectores[0];
      return;
    }

    this.sectoresCicloService
      .drop_sectores_x_ciclo(
        this.selectedSucursal.codsuc,
        this.selectedCiclo.codigo,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.listaSectores = [
            { codsector: "ALL", descripcion: "TODOS" },
            ...(data || []),
          ];
          this.selectedSector = this.listaSectores[0];
        },
        error: (err) => {
          console.error("Error al cargar sectores:", err);
          this.listaSectores = [{ codsector: "ALL", descripcion: "TODOS" }];
          this.selectedSector = this.listaSectores[0];
        },
      });

    this.urbamaeService
      .drop_x_sucursales(this.selectedSucursal.codsuc)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.listaUrbanizaciones = [
            { codurbaso: "ALL", descripcionurba: "TODOS" },
            ...(data || []),
          ];
          this.selectedUrbanizacion = "ALL";
        },
        error: (err) => console.error("Error al cargar urbanizaciones:", err),
      });
  }

  getDescEstadoServicio(): string {
    return (
      this.listaEstadoServicio?.find(
        (e) => e.codigo === this.selectedEstadoServicio,
      )?.descripcion ?? "TODOS"
    );
  }

  getDescTipoUsuario(): string {
    return (
      this.listaTipoUsuario?.find(
        (e) => e.tipousuario === this.selectedTipoUsuario,
      )?.descripcion ?? "TODOS"
    );
  }

  getDescTipoServicio(): string {
    return (
      this.listaTipoServicio?.find(
        (e) => e.codigo === this.selectedTipoServicio,
      )?.descripcion ?? "TODOS"
    );
  }

  getDescTarifa(): string {
    return (
      this.listaTarifas?.find((e) => e.catetar === this.selectedTarifa)
        ?.nomtar ?? "TODOS"
    );
  }

  getTarifaName(catetar: string): string {
    if (!catetar) return "";
    const tarifa = this.listaTarifas?.find((t) => t.catetar === catetar);
    return tarifa ? tarifa.nomtar : "";
  }

  getDescUrbanizacion(): string {
    return (
      this.listaUrbanizaciones?.find(
        (e) => e.codurbaso === this.selectedUrbanizacion,
      )?.descripcionurba ?? "TODOS"
    );
  }

  getDescActividad(): string {
    return (
      this.listaActividades?.find((e) => e.codigo === this.selectedActividad)
        ?.descripcion ?? "TODOS"
    );
  }

  procesar(): void {
    if (!this.selectedCiclo || !this.selectedSucursal) {
      this.avisar(
        "warn",
        "Aviso de usuario",
        "Debe seleccionar Ciclo y Sucursal",
      );
      return;
    }

    this.cargando = true;
    const toNull = (val: any, key?: string) =>
      !val || val === "ALL" ? null : val;

    const filtro: FiltroPadronClientesTipoActividadRequest = {
      codciclo: toNull(this.selectedCiclo.codigo),
      codsuc: toNull(this.selectedSucursal.codsuc),
      codsector: toNull(this.selectedSector?.codsector),
      estservicio: toNull(this.selectedEstadoServicio),
      tiposervicio: toNull(this.selectedTipoServicio),
      catetar: toNull(this.selectedTarifa),
      urbani: toNull(this.selectedUrbanizacion),
      tipousuario: toNull(this.selectedTipoUsuario),
      actividad: toNull(this.selectedActividad),
    };

    this.catastroService
      .listarPadronActividad(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          this.filtrosVisible = false;
          if (response.data && response.data.length > 0) {
            this.resultadoBusquedaJson = response.data;
            this.actualizarCapasComerciales();
          } else {
            this.resultadoBusquedaJson = [];
            this.limpiarCapas();
            this.avisar(
              "info",
              "Resultados",
              "No se encontraron registros con los filtros seleccionados",
            );
          }
        },
        error: (err) => {
          console.error("Error al cargar padrón de clientes:", err);
          this.cargando = false;
          this.limpiarCapas();
          this.resultadoBusquedaJson = [];
          this.avisar(
            "error",
            "Error",
            "Ocurrió un error al cargar el padrón de clientes",
          );
        },
      });
  }

  limpiar(): void {
    this.selectedCiclo = this.dataCiclos[1] || this.dataCiclos[0];
    this.onCicloChange();
    this.selectedEstadoServicio = "ALL";
    this.selectedTipoServicio = "ALL";
    this.selectedActividad = "ALL";
    this.selectedTipoUsuario = "ALL";
    this.limpiarCapas();
    this.resultadoBusquedaJson = [];
  }

  private actualizarCapasComerciales(fitBounds = true): void {
    this.estilos.limpiar();
    this.limpiarCapas();

    const registros = this.resultadoBusquedaJson || [];
    this.totalClientes = registros.length;
    if (registros.length === 0) return;

    const puntos = (origen: keyof typeof ORIGENES_COORDENADA) =>
      registros
        .map((r) => crearFeaturePunto(r, ORIGENES_COORDENADA[origen]))
        .filter((f): f is Feature => f !== null);

    const featuresUsr = puntos("usuario");
    this.usuariosLayer.getSource()!.addFeatures(featuresUsr);

    this.totalSinCoordenadas = registros.length - featuresUsr.length;

    this.ajustarVista(fitBounds);
  }

  private ajustarVista(fitBounds: boolean): void {
    const srcUsuarios = this.usuariosLayer.getSource()!;

    if (srcUsuarios.getFeatures().length === 0) {
      this.avisar(
        "info",
        "Aviso",
        "No se encontraron coordenadas para los clientes",
      );
      return;
    }

    if (fitBounds) {
      const extent = srcUsuarios.getExtent();
      this.map
        .getView()
        .fit(extent, { duration: 800, maxZoom: 18, padding: [60, 60, 60, 60] });
    }
    this.avisar(
      "success",
      "Proceso completado",
      "Clientes cargados en el mapa",
    );
  }

  private limpiarCapas(): void {
    this.capasVector.forEach((capa) => capa?.getSource()?.clear());
    this.totalClientes = 0;
    this.totalSinCoordenadas = 0;
  }

  ngAfterViewInit(): void {
    this.crearMapa();
    this.capasSidebar?.conectarMapa(this.map);

    requestAnimationFrame(() => {
      const el =
        this.mapContainer?.nativeElement ?? document.getElementById("map");
      if (!el) {
        return;
      }
      this.map.setTarget(el);
      this.map.updateSize();
      this.detenerObservadorMapa = observarTamanoMapa(this.map, el);
    });
  }

  ngOnDestroy(): void {
    this.detenerObservadorMapa?.();
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
    const query = String(this.searchCodCliente || "").trim();
    if (!query) {
      this.reiniciarBusqueda();
      return;
    }

    const feature = this.usuariosLayer
      ?.getSource()
      ?.getFeatures()
      .find((f) => {
        const fc = String(
          f.get("codcliente") || f.get("nroSuministro") || "",
        ).trim();
        return fc === query;
      });

    if (feature) {
      if (!this.isBusquedaClienteActiva) {
        this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
        this.isBusquedaClienteActiva = true;
      }

      const userFeature = this.resultadoBusquedaOriginalJson?.find(
        (r: any) =>
          String(r.codcliente || r.nroSuministro || "").trim() === query,
      );

      if (userFeature) {
        this.resultadoBusquedaJson = [userFeature];
        this.actualizarCapasComerciales(false);

        const refound = this.usuariosLayer
          ?.getSource()
          ?.getFeatures()
          .find(
            (f) =>
              String(
                f.get("codcliente") || f.get("nroSuministro") || "",
              ).trim() === query,
          );

        if (refound) {
          const geom = refound.getGeometry();
          if (geom) {
            this.map.getView().animate({
              center: getCenter(geom.getExtent()),
              zoom: 21,
              duration: 800,
            });
          }
          this.seleccionarFeature(refound);
        }
      }
      return;
    }

    if (!this.selectedSucursal) return;

    this.cargando = true;
    this.catastroService
      .buscarClienteActividad({
        codsuc: this.selectedSucursal.codsuc,
        codcliente: Number(query),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.cargando = false;
          if (response.data) {
            if (!this.isBusquedaClienteActiva) {
              this.resultadoBusquedaOriginalJson = this.resultadoBusquedaJson;
              this.isBusquedaClienteActiva = true;
            }
            this.resultadoBusquedaJson = [response.data];
            this.searchCodCliente = "";
            this.actualizarCapasComerciales(false);

            const coord = extraerCoordenada(
              response.data,
              ORIGENES_COORDENADA["usuario"],
            );
            if (coord) {
              this.map
                .getView()
                .animate({ center: coord, zoom: 21, duration: 600 });
            }

            const refound = this.usuariosLayer
              ?.getSource()
              ?.getFeatures()
              .find(
                (f) =>
                  String(
                    f.get("codcliente") || f.get("nroSuministro") || "",
                  ).trim() === query,
              );
            if (refound) {
              this.seleccionarFeature(refound);
            }
          } else {
            this.avisar(
              "warn",
              "Aviso",
              "No se encontró un usuario con ese código.",
            );
          }
        },
        error: (err) => {
          this.cargando = false;
          this.avisar(
            "error",
            "Error",
            "Ocurrió un error al buscar el cliente.",
          );
        },
      });
  }

  // MAPA

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
      visible: true,
      style: (f) => {
        return this.estilos.punto({
          forma: "circulo",
          color: "#3b82f6",
          zoom: zoomActual(),
          seleccionado: f === this.featureSeleccionado,
          etiqueta: f.get("codcliente") || f.get("nroSuministro"),
          ...RADIOS_LECTURA,
        });
      },
    });

    this.capasVector = [this.usuariosLayer];

    this.registroCapas = {
      usuarios: this.usuariosLayer,
      lotes: this.lotesLayer,
      sectores: this.sectoresComercialesLayer,
      calles: this.callesLayer,
    };

    this.map = new OlMap({
      layers: [
        this.osmLayer,
        this.satelitalLayer,
        this.lotesLayer,
        this.sectoresComercialesLayer,
        this.callesLayer,
        this.usuariosLayer,
      ],
      view: new View({
        projection: this.gis.proyeccionMapa,
        center: this.gis.vista.centro,
        zoom: this.gis.vista.zoom,
      }),
      controls: [new Zoom()],
    });

    agregarHerramientasMapa(this.map, (geometry) => {
      if (geometry && geometry.getType() === "Circle") {
        this.contarElementosEnRadio(geometry);
      }
    });

    this.initClick();
  }

  setBaseLayer(id: string): void {
    this.baseActive = id;
    this.osmLayer.setVisible(id === "osm");
    this.satelitalLayer.setVisible(id === "satelital");
  }

  toggleCommercialLayer(layerOption: any): void {
    layerOption.active = !layerOption.active;
    const capa = this.registroCapas[layerOption.id];
    if (capa) {
      capa.setVisible(layerOption.active);
    }
  }

  onSidebarToggle(): void {
    setTimeout(() => {
      this.map?.updateSize();
    }, 300);
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      const isDrawing = this.map
        .getInteractions()
        .getArray()
        .some((i) => i.get("isDrawInteraction"));
      if (isDrawing) return;
      const feature = this.map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        hitTolerance: 5,
        layerFilter: (layer: any) => !layer.get("isDrawLayer"),
      }) as Feature | undefined;

      if (feature) {
        this.seleccionarFeature(feature);
      } else if (!this.clienteSeleccionado) {
        this.cerrarPopup();
      }
    });
  }

  private seleccionarFeature(feature: Feature): void {
    this.featureSeleccionado = feature;
    this.refrescarCapasVector();
    this.clienteSeleccionado = feature.getProperties();
  }

  cerrarPopup(): void {
    this.clienteSeleccionado = null;
    this.featureSeleccionado = null;
    this.refrescarCapasVector();
  }

  private refrescarCapasVector(): void {
    this.usuariosLayer?.changed();
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
    this.ref = abrirConsultaUsuario(
      this.dialogService,
      codcliente,
      this.selectedSucursal?.codsuc || this.clienteSeleccionado?.codsuc,
    );
  }

  private avisar(severity: string, summary: string, detail: string): void {
    this.messageService.add({ severity, summary, detail });
  }

  private contarElementosEnRadio(circulo: Circle): void {
    const total = contarPuntosEnCirculo(this.usuariosLayer?.getSource(), circulo);
    this.messageService.add({
      severity: "info",
      summary: "Selección de Radio",
      detail: `Se encontraron ${total} clientes en el área seleccionada.`,
    });
  }
}
