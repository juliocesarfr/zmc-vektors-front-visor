import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import TileWMS from 'ol/source/TileWMS';
import XYZ from 'ol/source/XYZ';

import { GisConfigService } from '../../core/gis';
import { observarTamanoMapa } from '../../util/Mapinit.util';
import {
  CapaSwitchUi,
  CapasSidebarComponent,
} from '../../shared/components/capas-sidebar/capas-sidebar.component';

@Component({
  selector: 'app-main-georeferencia',
  templateUrl: './main-georeferencia.component.html',
  styleUrl: './main-georeferencia.component.scss',
  standalone: true,
  imports: [CapasSidebarComponent],
})
export class MainGeoreferenciaComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapa') private mapaEl!: ElementRef<HTMLDivElement>;
  @ViewChild(CapasSidebarComponent) private capasSidebar?: CapasSidebarComponent;

  readonly gis = inject(GisConfigService);

  readonly baseLayers = [
    { id: 'osm', label: 'OSM', iconUrl: 'assets/images/img-georeferencia/capa-osm-icon.gif' },
    { id: 'satelital', label: 'Satelital', iconUrl: 'assets/images/img-georeferencia/satellital-icon.gif' },
  ];
  baseActive: string | null = 'osm';

  // `usuarios` es vectorial y la arma cada pantalla, no va aquí.
  readonly commercialLayers: CapaSwitchUi[] = this.gis
    .capasParaUi(['usuarios'])
    .map((c) => ({ id: c.id, label: c.label, active: c.id === 'lotes' }));

  private map?: OlMap;
  private detenerObservadorMapa?: () => void;
  private readonly capasBase = new Map<string, TileLayer>();
  private readonly capasWms = new Map<string, TileLayer>();

  ngAfterViewInit(): void {
    this.capasBase.set('osm', new TileLayer({ source: new OSM() }));
    this.capasBase.set(
      'satelital',
      new TileLayer({
        visible: false,
        source: new XYZ({ url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' }),
      }),
    );

    for (const capa of this.commercialLayers) {
      this.capasWms.set(
        capa.id,
        new TileLayer({
          visible: capa.active,
          source: new TileWMS({
            url: this.gis.urlWms(),
            params: { LAYERS: this.gis.capa(capa.id), TILED: true },
            serverType: 'geoserver',
            transition: 0,
          }),
        }),
      );
    }

    // Target por referencia, no por id: en el microfrontend el id puede chocar.
    this.map = new OlMap({
      target: this.mapaEl.nativeElement,
      layers: [...this.capasBase.values(), ...this.capasWms.values()],
      controls: [],
      view: new View({
        projection: this.gis.proyeccionMapa,
        center: this.gis.vista.centro,
        zoom: this.gis.vista.zoom - 1,
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
}
