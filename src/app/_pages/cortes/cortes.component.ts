import { Component, AfterViewInit, inject } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';

import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import LayerGroup from 'ol/layer/Group';

import TileWMS from 'ol/source/TileWMS';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';

import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';

import { Stroke, Style } from 'ol/style';

import { CommonModule } from '@angular/common';
import Feature from 'ol/Feature';
import Geometry from 'ol/geom/Geometry';
import { CapaGisId, GisConfigService } from '../../core/gis';

@Component({
  selector: 'app-cortes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cortes.component.html',
  styleUrls: ['./cortes.component.scss']
})
export class CortesComponent implements AfterViewInit {

  /** GeoServer y capas de la EPS logueada; ya resueltos por `gisConfigResolver`. */
  private readonly gis = inject(GisConfigService);

  /** Nombre de la EPS logueada, para el campo "Sede" del panel de consulta. */
  get sede(): string {
    return this.gis.config.descripcion;
  }

  map!: Map;
  popup!: Overlay;

  lotesLayer!: TileLayer;
  usuariosLayer!: TileLayer;
  sectoresLayer!: TileLayer;

  highlightLayer!: VectorLayer;

  selectedData: any = {
    lote: null,
    usuario: null,
    sector: null
  };

  // Sector seleccionado
  sectorActual: string | null = null;

  ngAfterViewInit(): void {

    this.crearMapa();

    this.initPopup();

    this.initHighlight();

    this.map.on('singleclick', this.identify.bind(this));
  }

  //==================================
  // CREAR MAPA
  //==================================
  private crearMapa(): void {

    const base = new LayerGroup({
      layers: [

        new TileLayer({
          source: new OSM(),
          visible: false
        }),

        new TileLayer({
          source: new XYZ({
            url: 'https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}'
          }),
          visible: true
        })

      ]
    });

    this.lotesLayer = this.createWMS('lotes');

    this.usuariosLayer = this.createWMS('usuarios');

    this.sectoresLayer = this.createWMS('sectoresComerciales');

    this.map = new Map({

      target: 'map',

      layers: [

        base,

        this.lotesLayer,

        this.usuariosLayer,

        this.sectoresLayer

      ],

      view: new View({

        projection: this.gis.proyeccionMapa,

        center: this.gis.vista.centro,

        zoom: 19

      })

    });

  }

  //==================================
  // CREAR WMS
  //==================================
  private createWMS(id: CapaGisId): TileLayer {

   return new TileLayer({

  source: new TileWMS({

    url: this.gis.urlWms(),

    params: {
      LAYERS: this.gis.capa(id),
      TILED: true,
      INFO_FORMAT: 'application/json',

      CQL_FILTER: `"agua_estado_conexión_agua" = 'OPERATIVO SIN SERVICIO-CORTADO'`
    },

    serverType: 'geoserver'

  })

});

  }  //==================================
  // POPUP
  //==================================
  private initPopup(): void {

    const container = document.getElementById('popup')!;
    const closer = document.getElementById('popup-closer')!;

    this.popup = new Overlay({
      element: container,
      autoPan: {
        animation: {
          duration: 250
        }
      }
    });

    this.map.addOverlay(this.popup);

    closer.onclick = () => {
      this.popup.setPosition(undefined);
      return false;
    };

  }

  //==================================
  // CAPA HIGHLIGHT
  //==================================
  private initHighlight(): void {

    this.highlightLayer = new VectorLayer({

      source: new VectorSource(),

      style: new Style({

        stroke: new Stroke({

          color: '#ff0000',

          width: 3

        })

      })

    });

    this.map.addLayer(this.highlightLayer);

  }

  //==================================
  // IDENTIFY MULTICAPA
  //==================================
  private async identify(evt: any): Promise<void> {

    this.selectedData = {
      lote: null,
      usuario: null,
      sector: null
    };

    const resolution = this.map.getView().getResolution();

    const capas = [

      {
        key: 'lote',
        layer: this.lotesLayer
      },

      {
        key: 'usuario',
        layer: this.usuariosLayer
      },

      {
        key: 'sector',
        layer: this.sectoresLayer
      }

    ];

    this.highlightLayer.getSource()?.clear();

    for (const item of capas) {

      const source = item.layer.getSource() as TileWMS;

      const url = source.getFeatureInfoUrl(

        evt.coordinate,

        resolution!,

        this.gis.proyeccionMapa,

        {
          INFO_FORMAT: 'application/json'
        }

      );

      if (!url) {
        continue;
      }

      try {

        const response = await fetch(url);

        const json = await response.json();

        if (json.features && json.features.length > 0) {

          const feature = json.features[0];

          this.selectedData[item.key] = feature.properties;

          this.highlightFeature(feature);

        }

      } catch (error) {

        console.error(error);

      }

    }

    this.showPopup(evt.coordinate);

  }

  //==================================
  // RESALTAR GEOMETRÍA
  //==================================
  private highlightFeature(feature: any): void {

    const format = new GeoJSON();

    const olFeature = format.readFeature(feature, {
      featureProjection: this.gis.proyeccionMapa
    });

    this.highlightLayer.getSource()?.clear();

    this.highlightLayer.getSource()?.addFeature(olFeature);

    const geometry = (olFeature as any).getGeometry();

    if (geometry) {

      this.map.getView().fit(

        geometry.getExtent(),

        {

          duration: 800,

          maxZoom: 20

        }

      );

    }

  }

  //==================================
  // POPUP
  //==================================
  private showPopup(coord: any): void {

    const content = document.getElementById('popup-content')!;

    content.innerHTML = `

      <h4>Lote</h4>
      <pre>${JSON.stringify(this.selectedData.lote ?? {}, null, 2)}</pre>

      <h4>Usuario</h4>
      <pre>${JSON.stringify(this.selectedData.usuario ?? {}, null, 2)}</pre>

      <h4>Sector</h4>
      <pre>${JSON.stringify(this.selectedData.sector ?? {}, null, 2)}</pre>

    `;

    this.popup.setPosition(coord);

  }  //==================================
  // FILTRAR SECTOR
  //==================================
//==================================
// FILTRAR SECTOR
//==================================
activarSector(codigo: string): void {

  this.sectorActual = codigo;

  // LOTES → solo por sector
  (this.lotesLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER: `ZONECODE='${codigo}'`
  });

  // SECTORES → solo por sector
  (this.sectoresLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER: `ZONECODE='${codigo}'`
  });

  // USUARIOS → SOLO CORTADOS + sector
  (this.usuariosLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER:
      `"agua_estado_conexión_agua" LIKE '%CORTADO%' AND cod_sector='${codigo}'`
  });

  this.lotesLayer.getSource()?.refresh();
  this.sectoresLayer.getSource()?.refresh();
  this.usuariosLayer.getSource()?.refresh();

  // 🔥 ZOOM AUTOMÁTICO AL SECTOR
  const url = this.gis.urlGetFeature(
    'sectoresComerciales',
    `ZONECODE='${codigo}'`
  );

  // La EPS puede no publicar la capa de sectores: en ese caso no hay a dónde
  // hacer zoom, pero los filtros CQL de arriba ya se aplicaron.
  if (!url) {
    this.sectorResumen = codigo;
    this.totalUsuarios = 0;
    this.totalLotes = 0;
    return;
  }

  fetch(url)
    .then(res => res.json())
    .then(data => {

      const format = new GeoJSON();

      const features = format.readFeatures(data, {
        featureProjection: this.gis.proyeccionMapa
      });

    if (features.length > 0 && features[0].getGeometry()) {

  const extent = features[0].getGeometry()!.getExtent();

  this.map.getView().fit(extent, {
    duration: 800,
    maxZoom: 18   // zoom máximo
        });

      }

    })
    .catch(err => console.error(err));

  this.sectorResumen = codigo;
  this.totalUsuarios = 0;
  this.totalLotes = 0;
}
  //==================================
  // LIMPIAR FILTROS
  //==================================
//==================================
// LIMPIAR FILTROS
//==================================
limpiarSector(): void {

  this.sectorActual = null;

  // LOTES sin filtro
  (this.lotesLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER: ''
  });

  // SECTORES sin filtro
  (this.sectoresLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER: ''
  });

  // USUARIOS → solo cortados global
  (this.usuariosLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER: `"agua_estado_conexión_agua" LIKE '%CORTADO%'`
  });

  this.lotesLayer.getSource()?.refresh();
  this.sectoresLayer.getSource()?.refresh();
  this.usuariosLayer.getSource()?.refresh();

  this.sectorResumen = 'TODOS';
  this.totalUsuarios = 0;
  this.totalLotes = 0;
}
// ==============================
// PANEL IZQUIERDO
// ==============================
panelAbierto = true;

// ==============================
// RESUMEN
// ==============================
totalUsuarios = 0;
totalLotes = 0;
sectorResumen = 'TODOS';

togglePanel(): void {
  this.panelAbierto = !this.panelAbierto;
}

}