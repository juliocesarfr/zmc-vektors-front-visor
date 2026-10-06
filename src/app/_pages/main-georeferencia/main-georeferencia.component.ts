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
import { DropdownModule } from 'primeng/dropdown';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { forkJoin } from 'rxjs';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Style from 'ol/style/Style';
import Circle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';

import { GisConfigService } from '../../core/gis';
import { MapEstilosFactory, RADIOS_LECTURA } from '../../shared/mapa/mapa-estilos';
import { colorPorEstadoLectura } from '../../shared/constantes/colores-mapa';
import { observarTamanoMapa } from "../../shared/mapa/observar-tamano-mapa";
import {
  CapaSwitchUi,
  CapasSidebarComponent,
} from '../../shared/components/capas-sidebar/capas-sidebar.component';
import { CAPAS_BASE_UI, crearCapaOsm, crearCapaSatelital, crearCapaWms } from "../../shared/mapa/capas";
import { MicromedicionService } from '@host/_servicios/vektors/micromedicion.service';
import { SucursalesService } from '@host/_servicios/seguridad/sucursales.service';
import { FactArchService } from '@host/_servicios/facturacion/fact-arch.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map } from 'rxjs/operators';
import { of, Observable } from 'rxjs';
import { extraerCoordenada } from '../../shared/mapa/geo.utils';
import { ORIGENES_COORDENADA } from '../../shared/constantes/coordenadas';
import { LISTA_MESES } from '../../shared/constantes/lecturas';
import { coordenadaLonLat, abrirGoogleStreetView } from "../../shared/mapa/street-view";
import { RegistroLectura } from '@host/_models/vektors/RegistroLectura';
import { TIPOS_RECEPCION_FOTOS_LECTURA } from '../../shared/constantes/lecturas';
import { abrirConsultaUsuario } from '../../shared/dialogos/consulta-usuario.dialog';
import { formatoFechaCorta, rangoFotosRecientes } from '../../shared/utils/fechas.utils';
import { ControlImgService } from '@host/_servicios/procesar-img/control-img.service';
import { ClientesService } from '@host/_servicios/catastro/clientes.service';

@Component({
  selector: 'app-main-georeferencia',
  templateUrl: './main-georeferencia.component.html',
  styleUrl: './main-georeferencia.component.scss',
  standalone: true,
  imports: [CapasSidebarComponent, CommonModule, FormsModule, DropdownModule, ButtonModule, InputTextModule, ToastModule],
  providers: [MessageService, DialogService]
})
export class MainGeoreferenciaComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapa') private mapaEl!: ElementRef<HTMLDivElement>;
  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;

  readonly gis = inject(GisConfigService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly estilos = new MapEstilosFactory();
  private readonly micromedicionService = inject(MicromedicionService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly factArchService = inject(FactArchService);
  private readonly messageService = inject(MessageService);
  private readonly controlImgService = inject(ControlImgService);
  private readonly clientesService = inject(ClientesService);
  private readonly dialogService = inject(DialogService);

  readonly baseLayers = CAPAS_BASE_UI;
  baseActive: string | null = 'osm';

  readonly commercialLayers: CapaSwitchUi[] = this.gis
    .capasParaUi(['usuarios'])
    .map((c) => ({ id: c.id, label: c.label, active: c.id === 'lotes' }));

  private map?: OlMap;
  private detenerObservadorMapa?: () => void;
  private readonly capasBase = new Map<string, TileLayer>();
  private readonly capasWms = new Map<string, TileLayer>();
  private markerLayer?: VectorLayer<VectorSource>;

  mostrarSearchPanel = false;
  searchCodCliente = '';
  cargando = false;
  
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
    this.cargarSucursales();
    this.cargarCombosEstaticos();
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
    this.capasBase.set("osm", crearCapaOsm());
    this.capasBase.set("satelital", crearCapaSatelital());

    for (const capa of this.commercialLayers) {
      this.capasWms.set(capa.id, crearCapaWms(this.gis.urlWms(), this.gis.capa(capa.id), capa.active));
    }

    // Target por referencia, no por id: en el microfrontend el id puede chocar.
    
    this.markerLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 1000
    });

    this.map = new OlMap({
      target: this.mapaEl.nativeElement,
      layers: [...this.capasBase.values(), ...this.capasWms.values(), this.markerLayer],
      controls: [],
      view: new View({
        projection: this.gis.proyeccionMapa,
        center: this.gis.vista.centro,
        zoom: this.gis.vista.zoom,
      }),
    });
    this.capasSidebar?.conectarMapa(this.map);
    this.detenerObservadorMapa = observarTamanoMapa(
      this.map,
      this.mapaEl.nativeElement,
    );
  }

  ngOnDestroy(): void {
    this.detenerObservadorMapa?.();
    this.map?.setTarget(undefined);
  }

  setBaseLayer(id: string): void {
    this.baseActive = id;
    this.capasBase.forEach((capa, clave) => capa.setVisible(clave === id));
  }

  toggleLayer(capa: CapaSwitchUi): void {
    capa.active = !capa.active;
    this.capasWms.get(capa.id)?.setVisible(capa.active);
  }

  abrirBusqueda(): void {
    this.mostrarSearchPanel = true;
    this.searchCodCliente = "";
    this.markerLayer?.getSource()?.clear();
    this.lecturaSeleccionada = null;
  }

  cerrarBusqueda(): void {
    this.mostrarSearchPanel = false;
    this.reiniciarBusqueda();
  }

  reiniciarBusqueda(): void {
    this.searchCodCliente = "";
    this.markerLayer?.getSource()?.clear();
    this.lecturaSeleccionada = null;
  }

  buscarPorCodCliente(): void {
    const codigo = String(this.searchCodCliente || "").trim();
    if (!codigo) {
      this.reiniciarBusqueda();
      return;
    }
    
    if (!this.selectedSucursal || !this.selectedAnio || !this.selectedMes) {
      this.avisar("warn", "Filtros incompletos", "Por favor espere a que carguen los filtros o seleccione sucursal, año y mes.");
      return;
    }

    this.cargando = true;
    this.markerLayer?.getSource()?.clear();
    this.lecturaSeleccionada = null;

    this.consultarSuministro(codigo).subscribe({
      next: (registros) => {
        this.cargando = false;
        if (registros.length === 0) {
          this.avisar("info", "Aviso", "No se encontró ningún registro para el Código de Cliente");
          return;
        }

        const registro = registros[0];
        this.lecturaSeleccionada = registro;
        this.cargarDatosPopup(registro);
        const coord = extraerCoordenada(registro, ORIGENES_COORDENADA.usuario);
        
        if (coord) {
          const feature = new Feature({ geometry: new Point(coord) });
          feature.setProperties(registro); // Save properties in feature for label
          
          feature.setStyle(
            this.estilos.punto({
              forma: 'circulo',
              color: colorPorEstadoLectura(registro.estadolectura) || '#2563eb', // Default blue if no status
              zoom: 19,
              seleccionado: true,
              etiqueta: registro.codcliente,
              ...RADIOS_LECTURA
            })
          );
          this.markerLayer?.getSource()?.addFeature(feature);
          this.map?.getView().animate({ center: coord, zoom: 19, duration: 800 });
        } else {
          this.avisar("warn", "Aviso", "El cliente no tiene coordenadas válidas.");
        }
      },
      error: () => {
        this.cargando = false;
        this.avisar("error", "Error", "Ocurrió un error al cargar el suministro.");
      }
    });
  }

  cerrarPopup(): void {
    this.lecturaSeleccionada = null;
    this.datosClientePopup = null;
    this.imagenesPopup = [];
  }

  getDescripcionEstadoLectura(codigo: string): string {
    if (!codigo) return "-";
    // In main we don't load listaEstadosLectura yet, so we return the code
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
              _conexionAgua: cliente.conx_agua,
            };
          }
          if (imagenes?.mensaje === "SUCCESS" && imagenes?.data) {
            this.imagenesPopup = imagenes.data.map((img: any) => ({
              ...img,
              src: img.archivo,
            }));
          }
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

  private consultarSuministro(codigo: string): Observable<RegistroLectura[]> {
    return this.micromedicionService
      .buscarLecturasPorSuministro({
        codsuc: this.selectedSucursal.codsuc,
        anio: this.selectedAnio,
        mes: this.selectedMes,
        nroSuministro: Number(codigo),
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
}
