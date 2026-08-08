import { Component, OnInit, inject } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import LayerGroup from 'ol/layer/Group';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import { CommonModule } from '@angular/common';
import { CapaGisId, GisConfigService } from '../../core/gis';

@Component({
  selector: 'app-catastrocomercial',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './catastrocomercial.component.html',
  styleUrl: './catastrocomercial.component.scss'
})
export class CatastrocomercialComponent implements OnInit {

  /** GeoServer y capas de la EPS logueada; ya resueltos por `gisConfigResolver`. */
  private readonly gis = inject(GisConfigService);

  map!: Map;
      acometidaAgua!: TileLayer;
      acometidaAlcantarillado!: TileLayer;
      fichaAgua!: TileLayer;
      fichaAlcantarillado!: TileLayer;
      lotesLayer!: TileLayer;
      usuariosLayer!: TileLayer;
      sectoresLayer!: TileLayer;
      sectorActual: string | null = null;
      infoSeleccionada: any = null;
      tabActiva = 'general';
      popupX = 0;
      popupY = 0;

/** Capa WMS de la EPS a partir de su id lógico. */
private crearWms(id: CapaGisId): TileLayer {
  return new TileLayer({
    visible: false,
    source: new TileWMS({
      url: this.gis.urlWms(),
      params: {
        LAYERS: this.gis.capa(id),
        TILED: true
      },
      serverType: 'geoserver'
    })
  });
}

ngOnInit(): void {
  const capasBase = new LayerGroup({
    layers: [
      new TileLayer({
        source: new OSM(),
        visible: true
      }),
      new TileLayer({
        source: new XYZ({
          url: 'https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}'
        }),
        visible: true
      })
    ]
  });
this.lotesLayer = this.crearWms('lotes');
this.usuariosLayer = this.crearWms('usuarios');
this.sectoresLayer = this.crearWms('sectoresComerciales');
this.acometidaAgua = this.crearWms('acometidaAgua');
this.acometidaAlcantarillado = this.crearWms('acometidaAlcantarillado');
this.fichaAgua = this.crearWms('fichaAgua');
this.fichaAlcantarillado = this.crearWms('fichaAlcantarillado');

this.map = new Map({
  target: 'map',
  layers: [
  capasBase,
  this.acometidaAgua,
  this.acometidaAlcantarillado,
  this.fichaAgua,
  this.fichaAlcantarillado,
  this.lotesLayer,
  this.sectoresLayer,
  this.usuariosLayer
],

 view: new View({
    projection: this.gis.proyeccionMapa,
    center: this.gis.vista.centro,
    zoom: this.gis.vista.zoom
  })
});
this.map.on('singleclick', (evt) => {
  console.log('CLICK EN MAPA');
  const source = this.usuariosLayer.getSource() as TileWMS;

  const viewResolution = this.map.getView().getResolution();

  const url = source.getFeatureInfoUrl(
    evt.coordinate,
    viewResolution!,
    this.gis.proyeccionMapa,
    {
      INFO_FORMAT: 'application/json'
    }
  );

  if (url) {

    fetch(url)
      .then(response => response.json())
      .then(data => {

        console.log(data);

 if (data.features && data.features.length > 0) {

  const p = data.features[0].properties;

  console.log('TODOS LOS CAMPOS');
  console.log(Object.keys(p));

  console.log('MEDIDOR:', p['agua_número_medidor']);
  console.log('MARCA:', p['agua_marca_medidor']);
  console.log('ESTADO AGUA:', p['agua_estado_conexión_agua']);

  console.log('ESTADO DESAGUE:', p['acl_estado_conexión_desague']);
  console.log('SITUACION DESAGUE:', p['acl_situación_desagüe']);

  this.infoSeleccionada = p;

  this.tabActiva = 'general';
  this.popupX = evt.pixel[0] + 15;
  this.popupY = evt.pixel[1] - 20;

} else {

  alert('No se encontró información');

}

      });

  }

});

}
toggleLayer(tipo: string, event: any) {

  const visible = event.target.checked;

  switch (tipo) {

    case 'agua':
      this.acometidaAgua.setVisible(visible);
      break;

    case 'alcantarillado':
      this.acometidaAlcantarillado.setVisible(visible);
      break;

    case 'fichaAgua':
      this.fichaAgua.setVisible(visible);
      break;

    case 'fichaAlcantarillado':
      this.fichaAlcantarillado.setVisible(visible);
      break;
    case 'usuarios':
      this.usuariosLayer.setVisible(visible);
      break;

    case 'lotes':
      this.lotesLayer.setVisible(visible);
      break;
      }
}
//==================================
activarSector(codigo: string): void {

  this.sectorActual = codigo;

  // LOTES
  (this.lotesLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER: `ZONECODE='${codigo}'`
  });

  // SECTORES
  (this.sectoresLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER: `ZONECODE='${codigo}'`
  });

  // USUARIOS
  (this.usuariosLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER: `cod_sector='${codigo}'`
  });

  this.lotesLayer.getSource()?.refresh();
  this.sectoresLayer.getSource()?.refresh();
  this.usuariosLayer.getSource()?.refresh();

  // Resumen (temporal)
  this.sectorResumen = codigo;

  // Luego estos valores vendrán de la BD
  this.totalUsuarios = 0;
  this.totalLotes = 0;

}
//==================================
// LIMPIAR FILTROS
//==================================
limpiarSector(): void {

  this.sectorActual = null;

  (this.lotesLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER: ''
  });

  (this.sectoresLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER: ''
  });

  (this.usuariosLayer.getSource() as TileWMS).updateParams({
    CQL_FILTER: ''
  });

  this.lotesLayer.getSource()?.refresh();
  this.sectoresLayer.getSource()?.refresh();
  this.usuariosLayer.getSource()?.refresh();

  // Resumen
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
