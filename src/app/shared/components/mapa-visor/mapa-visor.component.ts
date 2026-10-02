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

import { observarTamanoMapa } from "../../mapa/observar-tamano-mapa";
import { GisConfigService } from '../../../core/gis';
import { CapasSidebarComponent } from '../capas-sidebar/capas-sidebar.component';
import { crearCapaWms, crearCapaOsm, crearCapaSatelital, CAPAS_BASE_UI } from "../../mapa/capas";

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
  imports: [CapasSidebarComponent, CommonModule, FormsModule, ButtonModule, InputTextModule],
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

  @Input() baseLayers = CAPAS_BASE_UI;

  commercialLayers: CommercialLayerConfig[] = [];

  @Input() customVectorLayers: VectorLayer<VectorSource>[] = [];

  @Output() featureClick = new EventEmitter<Feature>();
  @Output() mapClick = new EventEmitter<void>();
  @Output() search = new EventEmitter<string>();
  @Output() clearSearch = new EventEmitter<void>();
  @Output() mapReady = new EventEmitter<OlMap>();

  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  private readonly gis = inject(GisConfigService);

  map!: OlMap;
  private detenerObservadorMapa?: () => void;
  baseActive = "osm";
  mostrarSearchPanel = false;
  searchQuery = "";
  isBusquedaActiva = false;

  private osmLayer!: TileLayer<OSM>;
  private satelitalLayer!: TileLayer<XYZ>;

  private readonly capasWms = new Map<string, TileLayer<TileWMS>>();

  private static readonly SWITCH_VECTORIAL = "usuarios";

  ngOnInit(): void {
    // La primera capa (la catastral) arranca visible; el resto apagadas.
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
    this.capasSidebar?.conectarMapa(this.map);

    requestAnimationFrame(() => {
      const el = this.mapContainer?.nativeElement;
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


  private crearMapa(): void {
    this.osmLayer = crearCapaOsm(this.baseActive === "osm");
    this.satelitalLayer = crearCapaSatelital(this.baseActive === "satelital");

    this.capasWms.clear();
    const capasEps = this.gis.capasParaUi([MapaVisorComponent.SWITCH_VECTORIAL]);
    capasEps.forEach((capa, i) => {
      this.capasWms.set(
        capa.id,
        crearCapaWms(this.gis.urlWms(), capa.capa, i === 0, i === 0 ? 0.7 : 1),
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
