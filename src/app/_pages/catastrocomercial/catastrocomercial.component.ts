import { Component, OnInit } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import LayerGroup from 'ol/layer/Group';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-catastrocomercial',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './catastrocomercial.component.html',
  styleUrl: './catastrocomercial.component.scss'
})
export class CatastrocomercialComponent implements OnInit {

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
this.lotesLayer = new TileLayer({
  visible: false,
  source: new TileWMS({
    url: 'http://167.88.36.54:8085/geoserver/eps_yurimaguas/wms',
    params: {
      LAYERS: 'eps_yurimaguas:yurimaguas_sig_lotes',
      TILED: true
    },
    serverType: 'geoserver'
  })
});

this.usuariosLayer = new TileLayer({
  visible: false,
  source: new TileWMS({
    url: 'http://167.88.36.54:8085/geoserver/eps_yurimaguas/wms',
    params: {
      LAYERS: 'eps_yurimaguas:usuarios',
      TILED: true
    },
    serverType: 'geoserver'
  })
});
  this.acometidaAgua = new TileLayer({
  visible: false,
  source: new TileWMS({
    url: 'http://167.88.36.54:8085/geoserver/eps_yurimaguas/wms',
        params: {
      LAYERS: 'eps_yurimaguas:acometida_agua',
      TILED: true
    },
    serverType: 'geoserver'
  })
});

this.acometidaAlcantarillado = new TileLayer({
  visible: false,
  source: new TileWMS({
    url: 'http://167.88.36.54:8085/geoserver/eps_yurimaguas/wms',
    params: {
      LAYERS: 'eps_yurimaguas:acometida_alcantarillado',
      TILED: true
    },
    serverType: 'geoserver'
  })
});

this.fichaAgua = new TileLayer({
  visible: false,
  source: new TileWMS({
    url: 'http://167.88.36.54:8085/geoserver/eps_yurimaguas/wms',
    params: {
      LAYERS: 'eps_yurimaguas:yurimaguas_ficha_agua',
      TILED: true
    },
    serverType: 'geoserver'
  })
});

this.fichaAlcantarillado = new TileLayer({
  visible: false,
  source: new TileWMS({
    url: 'http://167.88.36.54:8085/geoserver/eps_yurimaguas/wms',
    params: {
      LAYERS: 'eps_yurimaguas:yurimaguas_ficha_alcantarillado',
      TILED: true
    },
    serverType: 'geoserver'
  })
});  
this.map = new Map({
  target: 'map',
  layers: [
  capasBase,
  this.acometidaAgua,
  this.acometidaAlcantarillado,
  this.fichaAgua,
  this.fichaAlcantarillado,
  this.lotesLayer,
  this.usuariosLayer
],

 view: new View({
    projection: 'EPSG:4326',
    center: [-76.1223, -5.9018],
    zoom: 18
  })
});
this.map.on('singleclick', (evt) => {
  console.log('CLICK EN MAPA');
  const source = this.usuariosLayer.getSource() as TileWMS;

  const viewResolution = this.map.getView().getResolution();

  const url = source.getFeatureInfoUrl(
    evt.coordinate,
    viewResolution!,
    'EPSG:4326',
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
