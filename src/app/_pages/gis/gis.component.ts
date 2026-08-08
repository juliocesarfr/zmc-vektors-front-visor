import { Component, OnInit, inject } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { FullScreen, ZoomSlider, ScaleLine, defaults as defaultControls } from 'ol/control';
import LayerSwitcher from 'ol-ext/control/LayerSwitcher';
import LayerGroup from 'ol/layer/Group';
import XYZ from 'ol/source/XYZ';
import Bar from 'ol-ext/control/Bar';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Toggle from 'ol-ext/control/Toggle';
import Draw from 'ol/interaction/Draw';
import { getArea, getLength } from 'ol/sphere';
import { Modify } from 'ol/interaction';
import { Point, LineString, Polygon } from 'ol/geom';
import { Fill, RegularShape, Stroke, Style, Text } from 'ol/style';
import CircleStyle from 'ol/style/Circle';
import { ConsulGenericService } from '@host/_servicios/consultaGeneral/consul-generic.service';
import { GisConfigService } from '../../core/gis';
import { CheckboxModule } from 'primeng/checkbox';
import { FormsModule } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';

@Component({
  selector: 'app-gis',
  standalone: true,
  imports: [CheckboxModule, FormsModule, DropdownModule],
  templateUrl: './gis.component.html',
  styleUrl: './gis.component.scss',
})
export class GisComponent implements OnInit {
  /** GeoServer y capas de la EPS logueada; ya resueltos por `gisConfigResolver`. */
  private readonly gis = inject(GisConfigService);

  /** Zoom general de este visor de dibujo/medición (vista de ciudad, no de lote). */
  private static readonly ZOOM_VISOR = 12.5;

  map!: Map;
  longitud: any;
  latitud: any;
  checkSegments: boolean = true;
  checkClear: boolean = true;
  selectedValor: any = 'LineString';
  valores: any = [
    {
      nombre: 'Length (LineString)',
      value: 'LineString',
    },
    {
      nombre: 'Area (Polygon)',
      value: 'Polygon',
    },
  ];

  draw: any; // global so we can remove it later
  labelStyle = new Style({
    text: new Text({
      font: '14px Calibri,sans-serif',
      fill: new Fill({
        color: 'rgba(255, 255, 255, 1)',
      }),
      backgroundFill: new Fill({
        color: 'rgba(0, 0, 0, 0.7)',
      }),
      padding: [3, 3, 3, 3],
      textBaseline: 'bottom',
      offsetY: -15,
    }),
    image: new RegularShape({
      radius: 8,
      points: 3,
      angle: Math.PI,
      displacement: [0, 10],
      fill: new Fill({
        color: 'rgba(0, 0, 0, 0.7)',
      }),
    }),
  });

  tipStyle = new Style({
    text: new Text({
      font: '12px Calibri,sans-serif',
      fill: new Fill({
        color: 'rgba(255, 255, 255, 1)',
      }),
      backgroundFill: new Fill({
        color: 'rgba(0, 0, 0, 0.4)',
      }),
      padding: [2, 2, 2, 2],
      textAlign: 'left',
      offsetX: 15,
    }),
  });

  style = new Style({
    fill: new Fill({
      color: 'rgba(255, 255, 255, 0.2)',
    }),
    stroke: new Stroke({
      color: 'rgba(0, 0, 0, 0.5)',
      lineDash: [10, 10],
      width: 2,
    }),
    image: new CircleStyle({
      radius: 5,
      stroke: new Stroke({
        color: 'rgba(0, 0, 0, 0.7)',
      }),
      fill: new Fill({
        color: 'rgba(255, 255, 255, 0.2)',
      }),
    }),
  });

  modifyStyle = new Style({
    image: new CircleStyle({
      radius: 5,
      stroke: new Stroke({
        color: 'rgba(0, 0, 0, 0.7)',
      }),
      fill: new Fill({
        color: 'rgba(0, 0, 0, 0.4)',
      }),
    }),
    text: new Text({
      text: 'Drag to modify',
      font: '12px Calibri,sans-serif',
      fill: new Fill({
        color: 'rgba(255, 255, 255, 1)',
      }),
      backgroundFill: new Fill({
        color: 'rgba(0, 0, 0, 0.7)',
      }),
      padding: [2, 2, 2, 2],
      textAlign: 'left',
      offsetX: 15,
    }),
  });

  segmentStyle = new Style({
    text: new Text({
      font: '12px Calibri,sans-serif',
      fill: new Fill({
        color: 'rgba(255, 255, 255, 1)',
      }),
      backgroundFill: new Fill({
        color: 'rgba(0, 0, 0, 0.4)',
      }),
      padding: [2, 2, 2, 2],
      textBaseline: 'bottom',
      offsetY: -12,
    }),
    image: new RegularShape({
      radius: 6,
      points: 3,
      angle: Math.PI,
      displacement: [0, 8],
      fill: new Fill({
        color: 'rgba(0, 0, 0, 0.4)',
      }),
    }),
  });

  source = new VectorSource();
  segmentStyles = [this.segmentStyle];
  modify = new Modify({ source: this.source, style: this.modifyStyle });
  tipPoint;

  constructor(
    private _consultaService: ConsulGenericService
  ) {}

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos() {
    // `cargar()` está cacheado (shareReplay): el resolver de ruta ya lo resolvió.
    this.gis.cargar().subscribe(() => {
      [this.longitud, this.latitud] = this.gis.vista.centro;

      const lg_capas_base = new LayerGroup({
        properties: {
          title: 'Capas Bases',
          baseLayer: true,
        },
        layers: [
          new TileLayer({
            source: new OSM(),
            properties: { title: 'OSM', baseLayer: true },
            visible: true,
          }),
          new TileLayer({
            source: new XYZ({
              url: `https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}`,
            }),
            properties: { title: 'Google Maps', baseLayer: true },
            visible: false,
          }),
        ],
      });

      this.map = new Map({
        controls: defaultControls().extend([new FullScreen(), new ZoomSlider(), new ScaleLine()]),
        target: 'map',
        layers: [lg_capas_base],
        view: new View({
          projection: this.gis.proyeccionMapa,
          center: [this.longitud, this.latitud],
          zoom: GisComponent.ZOOM_VISOR,
        }),
      });

      this.addInteraction();
      this.map.addControl(new LayerSwitcher());
      const vectorLayer = new VectorLayer({
        source: new VectorSource(),
        style: {
          'fill-color': 'rgba(255, 255, 255, 0.2)',
          'stroke-color': '#ffcc33',
          'stroke-width': 2,
          'circle-radius': 7,
          'circle-fill-color': '#ffcc33',
        },
        properties: {
          displayInLayerSwitcher: true, // false
        },
      });

      this.map.addLayer(vectorLayer);
      const mainBar = new Bar({});
      this.map.addControl(mainBar);
      const dibujoBar = new Bar({
        group: true,
        toggleOne: true,
      });

      mainBar.addControl(dibujoBar);
      const tg_punto = new Toggle({
        title: 'Dibujar Punto',
        html: '<i class="pi pi-map-marker"></i>',
        interaction: new Draw({
          type: 'Point',
          source: vectorLayer.getSource() as VectorSource,
        }),
      });

      dibujoBar.addControl(tg_punto);

      const tg_linea = new Toggle({
        title: 'Dibujar Línea',
        html: 'L',
        interaction: new Draw({
          type: 'LineString',
          source: vectorLayer.getSource() as VectorSource,
        }),
      });

      dibujoBar.addControl(tg_linea);

      const tg_poligono = new Toggle({
        title: 'Dibujar Polígono',
        html: '<i class="pi pi-share-alt"></i>',
        interaction: new Draw({
          type: 'Polygon',
          source: vectorLayer.getSource() as VectorSource,
        }),
      });

      dibujoBar.addControl(tg_poligono);

      // NUEVO
      const vector = new VectorLayer({
        source: this.source,
        style: (feature) => this.styleFunction(feature, this.checkSegments, false, false),
      });
      this.map.addLayer(vector);
    });
  }

  formatLength(line: LineString): string {
    const transformedLine = line.clone().transform(this.gis.proyeccionMapa, 'EPSG:3857');
    const length = getLength(transformedLine);
    let output;
    if (length > 100) {
      output = Math.round((length / 1000) * 100) / 100 + ' km';
    } else {
      output = Math.round(length * 100) / 100 + ' m';
    }
    return output;
  }

  formatArea(polygon): string {
    const area = getArea(polygon);
    let output;
    if (area > 10000) {
      output = Math.round((area / 1000000) * 100) / 100 + ' km2';
    } else {
      output = Math.round(area * 100) / 100 + ' m2';
    }
    return output;
  }

  styleFunction(feature, segments, drawType, tip): Style[] {
    const styles: Style[] = [];
    const geometry = feature.getGeometry();
    const type = geometry.getType();
    let point, label, line;

    if (!drawType || drawType === type || type === 'Point') {
      styles.push(this.style);

      if (type === 'Polygon') {
        point = geometry.getInteriorPoint();
        const transformedPolygon = geometry.clone().transform(this.gis.proyeccionMapa, 'EPSG:3857');
        label = this.formatArea(transformedPolygon);
        line = new LineString(geometry.getCoordinates()[0]);
      } else if (type === 'LineString') {
        point = new Point(geometry.getLastCoordinate());
        label = this.formatLength(geometry);
        line = geometry;
      }
    }

    if (segments && line) {
      let count = 0;
      line.forEachSegment((a, b) => {
        const segment = new LineString([a, b]);
        label = this.formatLength(segment);

        if (this.segmentStyles.length - 1 < count) {
          this.segmentStyles.push(this.segmentStyle.clone());
        }

        const segmentPoint = new Point(segment.getCoordinateAt(0.5));
        this.segmentStyles[count].setGeometry(segmentPoint);
        this.segmentStyles[count]?.getText()!.setText(label);
        styles.push(this.segmentStyles[count]);

        count++;
      });
    }

    if (label) {
      this.labelStyle.setGeometry(point);
      this.labelStyle.getText()!.setText(label);
      styles.push(this.labelStyle);
    }

    if (tip && type === 'Point' && !this.modify.getOverlay().getSource()!.getFeatures().length) {
      this.tipPoint = geometry;
      this.tipStyle.getText()!.setText(tip);
      styles.push(this.tipStyle);
    }

    return styles;
  }

  addInteraction() {
    const drawType = this.selectedValor;
    const activeTip = 'Click to continue drawing the ' + (drawType === 'Polygon' ? 'polygon' : 'line');
    const idleTip = 'Click to start measuring';
    let tip = idleTip;

    this.draw = new Draw({
      source: this.source,
      type: drawType,
      style: (feature) => this.styleFunction(feature, this.checkSegments, drawType, tip),
    });

    this.draw.on('drawstart', () => {
      if (this.checkClear) {
        this.source.clear();
      }
      this.modify.setActive(false);
      tip = activeTip;
    });

    this.draw.on('drawend', () => {
      this.modifyStyle.setGeometry(this.tipPoint);
      this.modify.setActive(true);
      this.map.once('pointermove', () => {
        this.modifyStyle.setGeometry(new Point([0, 0]));
      });
      tip = idleTip;
    });

    this.modify.setActive(true);
    this.map.addInteraction(this.draw);
  }

  cambioValor() {
    this.draw.getOverlay().changed();
  }
}
