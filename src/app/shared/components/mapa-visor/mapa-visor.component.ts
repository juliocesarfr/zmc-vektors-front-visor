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
  ViewEncapsulation
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
import { GEOSERVER_URL, GEOSERVER_CAPAS, VISTA_INICIAL } from '../../../config/Controldigitacion.config';
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
  @Input() mapCenter: [number, number] = VISTA_INICIAL.centro;
  @Input() mapZoom: number = VISTA_INICIAL.zoom;

  @Input() baseLayers: BaseLayerConfig[] = [
    { id: "osm", label: "OSM", iconUrl: "assets/images/img-georeferencia/capa-osm-icon.gif" },
    { id: "satelital", label: "Satelital", iconUrl: "assets/images/img-georeferencia/satellital-icon.gif" },
  ];

  @Input() commercialLayers: CommercialLayerConfig[] = [
    { id: "usuarios", label: "Usuarios", active: true },
    { id: "lotes", label: "Lotes", active: true },
    { id: "sectores", label: "Sectores Comerciales", active: false },
    { id: "calles", label: "Calles", active: false },
  ];

  @Input() customVectorLayers: VectorLayer<VectorSource>[] = [];

  @Output() featureClick = new EventEmitter<Feature>();
  @Output() mapClick = new EventEmitter<void>();
  @Output() search = new EventEmitter<string>();
  @Output() clearSearch = new EventEmitter<void>();
  @Output() mapReady = new EventEmitter<OlMap>();

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  map!: OlMap;
  private detenerObservadorMapa?: () => void;
  sidebarOpen = false;
  baseActive = "osm";
  mostrarSearchPanel = false;
  searchQuery = "";
  isBusquedaActiva = false;

  private osmLayer!: TileLayer<OSM>;
  private satelitalLayer!: TileLayer<XYZ>;
  private catastroLayer!: TileLayer<TileWMS>;
  private callLayer!: TileLayer<TileWMS>;
  private secComLayer!: TileLayer<TileWMS>;

  ngOnInit(): void {}

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

    this.catastroLayer = new TileLayer({
      source: new TileWMS({
        url: GEOSERVER_URL,
        params: { LAYERS: GEOSERVER_CAPAS.lotes, TILED: false },
        serverType: "geoserver",
        transition: 0,
      }),
      visible: true,
      opacity: 0.7,
    });

    this.callLayer = new TileLayer({
      source: new TileWMS({
        url: GEOSERVER_URL,
        params: { LAYERS: GEOSERVER_CAPAS.calles, TILED: false },
        serverType: "geoserver",
        transition: 0,
      }),
      visible: false,
    });

    this.secComLayer = new TileLayer({
      source: new TileWMS({
        url: GEOSERVER_URL,
        params: { LAYERS: GEOSERVER_CAPAS.sectoresComerciales, TILED: false },
        serverType: "geoserver",
        transition: 0,
      }),
      visible: false,
    });

    this.map = new OlMap({
      target: undefined,
      layers: [
        this.osmLayer,
        this.satelitalLayer,
        this.catastroLayer,
        this.callLayer,
        this.secComLayer,
        ...this.customVectorLayers
      ],
      view: new View({
        projection: "EPSG:4326",
        center: this.mapCenter,
        zoom: this.mapZoom,
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
    if (layer.id === "usuarios") {
      this.customVectorLayers.forEach(l => l.setVisible(layer.active));
    } else if (layer.id === "lotes") {
      this.catastroLayer.setVisible(layer.active);
    } else if (layer.id === "sectores") {
      this.secComLayer.setVisible(layer.active);
    } else if (layer.id === "calles") {
      this.callLayer.setVisible(layer.active);
    }
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
