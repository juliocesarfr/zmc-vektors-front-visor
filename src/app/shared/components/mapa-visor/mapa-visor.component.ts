import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  CUSTOM_ELEMENTS_SCHEMA,
  ViewEncapsulation,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import { defaults as defaultControls } from 'ol/control';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';

import { observarTamanoMapa } from '../../../util/Mapinit.util';
import { GisConfigService } from '../../../core/gis';
import { MapEstilosFactory } from '../../../util/Mapaestilos.factory';

export interface BaseLayerConfig {
  id: string;
  label: string;
  iconUrl: string;
}

export interface CommercialLayerConfig {
  id: string;
  label: string;
  active: boolean;
}

@Component({
  selector: 'app-mapa-visor',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule],
  templateUrl: './mapa-visor.component.html',
  styleUrl: './mapa-visor.component.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  encapsulation: ViewEncapsulation.None
})
export class MapaVisorComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input() title: string = "MAPA VISOR";
  @Input() titleIcon: string = "assets/images/img-medicion/writing.png";
  @Input() cargando: boolean = false;
  /** Override opcional; por defecto se usa la vista de la EPS logueada. */
  @Input() mapCenter?: [number, number];
  /** Override opcional; por defecto se usa el zoom de la EPS logueada. */
  @Input() mapZoom?: number;

  @Input() baseLayers: BaseLayerConfig[] = [
    { id: "osm", label: "OSM", iconUrl: "assets/images/img-georeferencia/capa-osm-icon.gif" },
    { id: "satelital", label: "Satelital", iconUrl: "assets/images/img-georeferencia/satellital-icon.gif" },
  ];

  /**
   * Switches de capas comerciales. No se recibe por parámetro: se arma con las
   * capas que declara la EPS logueada, así que cada EPS ve exactamente las
   * suyas (incluidas las que ninguna otra publica) sin tocar este componente.
   */
  commercialLayers: CommercialLayerConfig[] = [];

  @Input() customVectorLayers: VectorLayer<VectorSource>[] = [];

  @Output() featureClick = new EventEmitter<Feature>();
  @Output() mapClick = new EventEmitter<void>();
  @Output() search = new EventEmitter<string>();
  @Output() clearSearch = new EventEmitter<void>();
  @Output() mapReady = new EventEmitter<OlMap>();

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  /** GeoServer y capas de la EPS logueada; ya resueltos por `gisConfigResolver`. */
  private readonly gis = inject(GisConfigService);

  map!: OlMap;
  private detenerObservadorMapa?: () => void;
  sidebarOpen = false;
  baseActive = "osm";
  mostrarSearchPanel = false;
  searchQuery = "";
  isBusquedaActiva = false;

  private osmLayer!: TileLayer<OSM>;
  private satelitalLayer!: TileLayer<XYZ>;

  /** Rol de capa -> capa WMS creada para esta EPS. */
  private readonly capasWms = new Map<string, TileLayer<TileWMS>>();

  /** Id del switch que agrupa las capas vectoriales que aporta el padre. */
  private static readonly SWITCH_VECTORIAL = "usuarios";

  ngOnInit(): void {
    // Las capas WMS salen del catálogo de la EPS logueada, en su orden de
    // declaración. La primera arranca visible (es la capa base catastral de esa
    // EPS); el resto queda apagada.
    const capasEps = this.gis.capasParaUi([MapaVisorComponent.SWITCH_VECTORIAL]);

    const switchVectorial: CommercialLayerConfig[] = this.customVectorLayers.length
      ? [
          {
            id: MapaVisorComponent.SWITCH_VECTORIAL,
            label: this.gis.etiquetaCapa(MapaVisorComponent.SWITCH_VECTORIAL),
            active: true,
          },
        ]
      : [];

    this.commercialLayers = [
      ...switchVectorial,
      ...capasEps.map((capa, i) => ({
        id: capa.id,
        label: capa.label,
        active: i === 0,
      })),
    ];
  }

  ngAfterViewInit(): void {
    this.crearMapa();

    requestAnimationFrame(() => {
      const el = this.mapContainer?.nativeElement ?? document.getElementById("map");
      if (!el) return;
      this.map.setTarget(el);
      this.map.updateSize();
      this.detenerObservadorMapa = observarTamanoMapa(this.map, el);
      this.mapReady.emit(this.map);
    });
  }

  ngOnDestroy(): void {
    if (this.detenerObservadorMapa) {
      this.detenerObservadorMapa();
    }
    if (this.map) {
      this.map.setTarget(undefined);
    }
  }

  /** Capa WMS del workspace de la EPS. */
  private crearWms(capa: string, visible: boolean, opacity = 1): TileLayer<TileWMS> {
    return new TileLayer({
      visible,
      opacity,
      source: new TileWMS({
        url: this.gis.urlWms(),
        params: { LAYERS: capa, TILED: false },
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

    // Una capa WMS por cada capa que declara la EPS, en el mismo orden que los
    // switches. La capa base catastral va semitransparente para dejar ver el
    // mapa de fondo.
    this.capasWms.clear();
    const capasEps = this.gis.capasParaUi([MapaVisorComponent.SWITCH_VECTORIAL]);
    capasEps.forEach((capa, i) => {
      this.capasWms.set(
        capa.id,
        this.crearWms(capa.capa, i === 0, i === 0 ? 0.7 : 1),
      );
    });

    const vista = this.gis.vista;

    this.map = new OlMap({
      target: undefined,
      layers: [
        this.osmLayer,
        this.satelitalLayer,
        ...this.capasWms.values(),
        ...this.customVectorLayers
      ],
      view: new View({
        projection: this.gis.proyeccionMapa,
        center: this.mapCenter ?? vista.centro,
        zoom: this.mapZoom ?? vista.zoom,
      }),
      controls: defaultControls({ zoom: false }),
    });

    this.map.on("singleclick", (evt) => {
      const isDrawing = this.map.getInteractions().getArray().some(i => i.get('isDrawInteraction'));
      if (isDrawing) return;

      let f: Feature | undefined;
      this.map.forEachFeatureAtPixel(
        evt.pixel,
        (feature) => {
          if (!f) f = feature as Feature;
        },
        { hitTolerance: 5, layerFilter: (layer: any) => !layer.get('isDrawLayer') }
      );

      if (f) {
        this.featureClick.emit(f);
      } else {
        this.mapClick.emit();
      }
    });
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  setBaseLayer(id: string): void {
    this.baseActive = id;
    this.osmLayer.setVisible(id === "osm");
    this.satelitalLayer.setVisible(id === "satelital");
  }

  toggleCommercialLayer(layer: CommercialLayerConfig): void {
    layer.active = !layer.active;

    if (layer.id === MapaVisorComponent.SWITCH_VECTORIAL) {
      this.customVectorLayers.forEach(l => l.setVisible(layer.active));
      return;
    }

    this.capasWms.get(layer.id)?.setVisible(layer.active);
  }

  abrirBusqueda(): void {
    this.mostrarSearchPanel = true;
    setTimeout(() => {
      const input = document.querySelector('.search-body input') as HTMLInputElement;
      if (input) input.focus();
    }, 100);
  }

  cerrarBusqueda(): void {
    this.mostrarSearchPanel = false;
  }

  emitirBusqueda(): void {
    if (this.searchQuery && this.searchQuery.trim().length > 0) {
      this.isBusquedaActiva = true;
      this.search.emit(this.searchQuery.trim());
    }
  }

  limpiarBusqueda(): void {
    this.searchQuery = "";
    this.isBusquedaActiva = false;
    this.clearSearch.emit();
  }
}
