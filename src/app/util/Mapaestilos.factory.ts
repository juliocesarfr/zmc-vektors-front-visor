import Feature from "ol/Feature";
import LineString from "ol/geom/LineString";
import { Style, Circle as CircleStyle, Fill, Stroke, Text, RegularShape } from "ol/style";
import { Control, FullScreen, ZoomSlider, ScaleLine, Zoom } from 'ol/control';
import Draw from 'ol/interaction/Draw';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Overlay from 'ol/Overlay';
import { getArea, getLength } from 'ol/sphere';
import { unByKey } from 'ol/Observable';
import OlMap from 'ol/Map';
import Polygon, { fromCircle } from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';
import { getPointResolution } from 'ol/proj';
import { LARGO_MIN_LINEA_PX } from "../config/Controldigitacion.config";

export type FormaPunto = "circulo" | "rombo";

export interface OpcionesPunto {
  forma: FormaPunto;
  color: string;
  zoom: number;
  seleccionado: boolean;
  etiqueta?: string;
  radioSeleccionado: number;
  radiosPorZoom: { z14: number; z16: number; z18: number; max: number };
  offsetYTexto: number;
  minZoomEtiqueta?: number;
}

export const RADIOS_LECTURA = { radioSeleccionado: 9, radiosPorZoom: { z14: 3, z16: 4, z18: 6, max: 7 }, offsetYTexto: -12 };
export const RADIOS_FICHA = { radioSeleccionado: 11, radiosPorZoom: { z14: 4, z16: 6, z18: 8, max: 9 }, offsetYTexto: -15 };

export class MapEstilosFactory {
  private cache = new Map<string, Style>();

  limpiar(): void {
    this.cache.clear();
  }

  static setupAdvancedMapTools(map: OlMap, onDrawEnd?: (geometry: any) => void): void {



    map.getControls().getArray().slice().forEach(c => {
      if (c instanceof Zoom) map.removeControl(c);
    });

    const zoomInLabel = document.createElement('i');
    zoomInLabel.className = 'fa-solid fa-plus btn-zoom-in';

    const zoomOutLabel = document.createElement('i');
    zoomOutLabel.className = 'fa-solid fa-minus btn-zoom-out';

    map.addControl(new Zoom({ zoomInLabel, zoomOutLabel }));

    const fsLabel = document.createElement('i');
    fsLabel.className = 'fa-solid fa-expand btn-fs';

    const fsLabelActive = document.createElement('i');
    fsLabelActive.className = 'fa-solid fa-compress btn-fs-active';

    map.addControl(new FullScreen({ label: fsLabel, labelActive: fsLabelActive }));
    map.addControl(new ZoomSlider());
    map.addControl(new ScaleLine({ units: 'metric' }));

    const drawSource = new VectorSource();
    const drawLayer = new VectorLayer({
      source: drawSource,
      style: function (feature) {
        const styles = [
          new Style({
            fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
            stroke: new Stroke({ color: '#ffcc33', width: 2 }),
            image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#ffcc33' }) })
          })
        ];
        const geom = feature.getGeometry();
        if (geom && geom.getType() === 'Circle') {
          const center = (geom as any).getCenter();
          styles.push(new Style({
            geometry: new Point(center),
            image: new CircleStyle({
              radius: 5,
              fill: new Fill({ color: '#ef4444' }),
              stroke: new Stroke({ color: '#fff', width: 1.5 })
            })
          }));
        }
        return styles;
      },
      zIndex: 9999
    });
    drawLayer.set('isDrawLayer', true);
    map.addLayer(drawLayer);

    const container = document.createElement('div');
    container.className = 'ol-unselectable ol-control ol-custom-draw-menu';

    const mainBtn = document.createElement('button');
    mainBtn.className = 'btn-draw-main';
    mainBtn.innerHTML = '<i class="fa-solid fa-compass-drafting"></i>';
    mainBtn.title = 'Herramientas de Medición/Dibujo';

    const menu = document.createElement('div');
    menu.className = 'ol-custom-draw-submenu';

    let currentDrawInteraction: Draw | null = null;
    let measureTooltipElement: HTMLElement | null = null;
    let measureTooltip: Overlay | null = null;

    const createMeasureTooltip = () => {
      if (measureTooltip) {
        map.removeOverlay(measureTooltip);
      }
      if (measureTooltipElement && measureTooltipElement.parentNode) {
        measureTooltipElement.parentNode.removeChild(measureTooltipElement);
      }
      measureTooltipElement = document.createElement('div');
      measureTooltipElement.className = 'ol-tooltip ol-tooltip-measure';
      measureTooltipElement.style.visibility = 'hidden'; // stay hidden until content is set

      measureTooltip = new Overlay({
        element: measureTooltipElement,
        offset: [0, -15],
        positioning: 'bottom-center'
      });
      map.addOverlay(measureTooltip);
    };

    const formatLength = (line: any) => {
      const length = getLength(line, { projection: map.getView().getProjection() });
      return 'Distancia: ' + (length > 100 ? (Math.round(length / 1000 * 100) / 100) + ' km' : Math.round(length * 100) / 100 + ' m');
    };

    const formatArea = (polygon: any) => {
      const area = getArea(polygon, { projection: map.getView().getProjection() });
      return 'Área: ' + (area > 10000 ? (Math.round(area / 1000000 * 100) / 100) + ' km²' : Math.round(area * 100) / 100 + ' m²');
    };

    let helpTooltipElement: HTMLElement | null = null;
    let helpTooltip: Overlay | null = null;
    let pointerMoveListener: any;

    const createHelpTooltip = () => {
      if (helpTooltip) {
        map.removeOverlay(helpTooltip);
      }
      if (helpTooltipElement && helpTooltipElement.parentNode) {
        helpTooltipElement.parentNode.removeChild(helpTooltipElement);
      }
      helpTooltipElement = document.createElement('div');
      helpTooltipElement.className = 'ol-tooltip ol-tooltip-static'; // Re-use static style or similar
      helpTooltipElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
      helpTooltipElement.style.color = 'white';
      helpTooltipElement.style.border = 'none';
      helpTooltipElement.style.visibility = 'hidden';

      helpTooltip = new Overlay({
        element: helpTooltipElement,
        offset: [15, 0],
        positioning: 'center-left'
      });
      map.addOverlay(helpTooltip);
    };

    const addDrawInteraction = (type: string) => {
      if (currentDrawInteraction) {
        map.removeInteraction(currentDrawInteraction);
      }
      if (pointerMoveListener) {
        unByKey(pointerMoveListener);
        pointerMoveListener = null;
      }
      
      createHelpTooltip();
      
      const drawType = type;

      currentDrawInteraction = new Draw({
        source: drawSource,
        type: drawType as any,
        style: function (feature) {
          const styles = [
            new Style({
              fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
              stroke: new Stroke({ color: 'rgba(0, 0, 0, 0.5)', lineDash: [10, 10], width: 2 }),
              image: new CircleStyle({ radius: 5, stroke: new Stroke({ color: 'rgba(0, 0, 0, 0.7)' }), fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }) })
            })
          ];
          const geom = feature.getGeometry();
          if (geom && geom.getType() === 'Circle') {
            const center = (geom as any).getCenter();
            styles.push(new Style({
              geometry: new Point(center),
              image: new CircleStyle({
                radius: 5,
                fill: new Fill({ color: '#ef4444' }),
                stroke: new Stroke({ color: '#fff', width: 1.5 })
              })
            }));
          }
          return styles;
        }
      });
      
      currentDrawInteraction.set('isDrawInteraction', true);

      let listener: any;
      let sketch: any;
      
      const pointerMoveHandler = (evt: any) => {
        if (evt.dragging) {
          return;
        }
        let helpMsg = 'Clic para empezar a dibujar';

        if (sketch) {
          const geom = sketch.getGeometry();
          if (geom.getType() === 'Polygon' || geom.getType() === 'LineString') {
            helpMsg = 'Clic para continuar, doble clic para terminar';
          }
        } else {
          if (type === 'Circle') {
            helpMsg = 'Clic para establecer el centro del círculo (luego ingrese el radio)';
          }
        }

        if (helpTooltipElement) {
          helpTooltipElement.innerHTML = helpMsg;
          helpTooltipElement.style.visibility = 'visible';
          helpTooltip?.setPosition(evt.coordinate);
        }
      };

      pointerMoveListener = map.on('pointermove', pointerMoveHandler);

      currentDrawInteraction.on('drawstart', (evt: any) => {
        sketch = evt.feature;
        let tooltipCoord = evt.coordinate;
        createMeasureTooltip();

        listener = sketch.getGeometry().on('change', (e: any) => {
          const geom = e.target;
          let output = '';
          if (geom.getType() === 'Polygon') {
            output = formatArea(geom);
            tooltipCoord = geom.getInteriorPoint().getCoordinates();
          } else if (geom.getType() === 'LineString') {
            output = formatLength(geom);
            tooltipCoord = geom.getLastCoordinate();
          } else if (geom.getType() === 'Circle') {
            const poly = fromCircle(geom as any);
            const area = getArea(poly, { projection: map.getView().getProjection() });
            const radius = Math.sqrt(area / Math.PI);
            output = 'Radio: ' + (radius > 100 ? (Math.round(radius / 1000 * 100) / 100) + ' km' : Math.round(radius * 100) / 100 + ' m');
            tooltipCoord = (geom as any).getLastCoordinate();
          }

          if (measureTooltipElement && output) {
            measureTooltipElement.style.visibility = 'visible'; // reveal once there is content
            measureTooltipElement.innerHTML = output;
            measureTooltip?.setPosition(tooltipCoord);
          }
        });
      });

      currentDrawInteraction.on('drawend', (evt: any) => {
        let finalGeometry = evt.feature.getGeometry();
        
        const cleanupInteraction = () => {
          unByKey(listener);
          if (pointerMoveListener) {
            unByKey(pointerMoveListener);
            pointerMoveListener = null;
          }
          if (helpTooltip) {
            map.removeOverlay(helpTooltip);
            helpTooltip = null;
          }
          if (currentDrawInteraction) {
            map.removeInteraction(currentDrawInteraction);
            currentDrawInteraction = null;
          }
          menu.classList.remove('open');
        };

        if (type === 'Circle' && finalGeometry.getType() === 'Circle') {
           const center = (finalGeometry as any).getCenter();
           const drawnRadiusMapUnits = (finalGeometry as any).getRadius();
           
           cleanupInteraction(); // Stop drawing immediately so they don't accidentally click again

           const projection = map.getView().getProjection();
           const pointRes = getPointResolution(projection, 1, center, 'm');
           const drawnRadiusMeters = drawnRadiusMapUnits * pointRes;

           const inputContainer = document.createElement('div');
           inputContainer.className = 'ol-custom-radius-input';
           inputContainer.style.background = 'white';
           inputContainer.style.padding = '6px';
           inputContainer.style.borderRadius = '6px';
           inputContainer.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
           inputContainer.style.display = 'flex';
           inputContainer.style.alignItems = 'center';
           inputContainer.style.gap = '6px';
           inputContainer.style.fontFamily = 'sans-serif';
           
           const input = document.createElement('input');
           input.type = 'number';
           input.step = '0.1';
           if (drawnRadiusMeters > 0) {
             input.value = (Math.round(drawnRadiusMeters * 100) / 100).toString();
           } else {
             input.placeholder = 'Radio (m)';
           }
           input.style.width = '80px';
           input.style.border = '1px solid #ddd';
           input.style.borderRadius = '4px';
           input.style.padding = '4px 6px';
           input.style.outline = 'none';
           input.style.fontSize = '13px';
           
           const btn = document.createElement('button');
           btn.innerHTML = '<i class="fa-solid fa-check"></i>';
           btn.style.background = '#0ea5e9';
           btn.style.color = 'white';
           btn.style.border = 'none';
           btn.style.borderRadius = '4px';
           btn.style.cursor = 'pointer';
           btn.style.padding = '4px 8px';
           btn.style.fontSize = '12px';
           
           inputContainer.appendChild(input);
           inputContainer.appendChild(btn);
           
           const inputOverlay = new Overlay({
             element: inputContainer,
             position: center,
             positioning: 'bottom-center',
             offset: [0, -15]
           });
           
           map.addOverlay(inputOverlay);
           
           if (measureTooltipElement) {
             measureTooltipElement.style.visibility = 'hidden';
           }
           
           const finishCircle = (radiusStr: string) => {
              map.removeOverlay(inputOverlay);
              const r = Number(radiusStr);
              if (radiusStr && radiusStr.trim() !== '' && !isNaN(r) && r > 0) {
                 const mapRadius = r / pointRes;
                 
                 finalGeometry = new CircleGeom(center, mapRadius);
                 evt.feature.setGeometry(finalGeometry);
                 
                 if (measureTooltipElement) {
                     measureTooltipElement.innerHTML = 'Radio: ' + (r > 100 ? (Math.round(r / 1000 * 100) / 100) + ' km' : r + ' m');
                     measureTooltipElement.style.visibility = 'visible';
                     measureTooltipElement.className = 'ol-tooltip ol-tooltip-static';
                 }
                 if (onDrawEnd) onDrawEnd(finalGeometry);
              } else {
                 drawSource.removeFeature(evt.feature);
                 if (measureTooltip) map.removeOverlay(measureTooltip);
                 if (measureTooltipElement && measureTooltipElement.parentNode) {
                   measureTooltipElement.parentNode.removeChild(measureTooltipElement);
                 }
              }
           };

           input.onkeydown = (e) => {
              if (e.key === 'Enter') finishCircle(input.value);
              else if (e.key === 'Escape') finishCircle('');
           };
           const handleBtn = (e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              finishCircle(input.value);
           };
           btn.addEventListener('pointerdown', handleBtn);
           btn.addEventListener('click', handleBtn);
           
           setTimeout(() => {
              input.focus();
              input.select();
           }, 50);
           
           return; // Prevent standard cleanup since we handled it manually
        } // end of if (type === 'Circle')

        if (measureTooltipElement && measureTooltipElement.innerHTML.trim() !== '') {
          measureTooltipElement.className = 'ol-tooltip ol-tooltip-static';
        } else {
          if (measureTooltip) {
            map.removeOverlay(measureTooltip);
          }
          if (measureTooltipElement && measureTooltipElement.parentNode) {
            measureTooltipElement.parentNode.removeChild(measureTooltipElement);
          }
        }
        measureTooltipElement = null;
        measureTooltip = null;

        if (onDrawEnd) {
          onDrawEnd(finalGeometry);
        }

        cleanupInteraction();
      });

      map.addInteraction(currentDrawInteraction);
    };

    const btnLine = document.createElement('button');
    btnLine.className = 'btn-draw-line';
    btnLine.innerHTML = '<i class="fa-solid fa-ruler"></i>';
    btnLine.title = 'Medir Distancia (Línea)';
    btnLine.onclick = () => addDrawInteraction('LineString');

    const btnPoly = document.createElement('button');
    btnPoly.className = 'btn-draw-poly';
    btnPoly.innerHTML = '<i class="fa-solid fa-ruler-combined"></i>';
    btnPoly.title = 'Medir Área (Polígono)';
    btnPoly.onclick = () => addDrawInteraction('Polygon');

    const btnCircle = document.createElement('button');
    btnCircle.className = 'btn-draw-circle';
    btnCircle.innerHTML = '<i class="fa-regular fa-circle"></i>';
    btnCircle.title = 'Dibujar Radio (Círculo)';
    btnCircle.onclick = () => addDrawInteraction('Circle');

    const btnClear = document.createElement('button');
    btnClear.className = 'btn-draw-clear';
    btnClear.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    btnClear.title = 'Limpiar Dibujos';
    btnClear.onclick = () => {
      drawSource.clear();
      map.getOverlays().getArray().slice(0).forEach(overlay => {
        const el = overlay.getElement();
        if (el && el.classList.contains('ol-tooltip')) {
          map.removeOverlay(overlay);
        }
      });
      if (currentDrawInteraction) {
        map.removeInteraction(currentDrawInteraction);
        currentDrawInteraction = null;
      }
      if (pointerMoveListener) {
        unByKey(pointerMoveListener);
        pointerMoveListener = null;
      }
      if (helpTooltip) {
        map.removeOverlay(helpTooltip);
        helpTooltip = null;
      }
      menu.classList.remove('open');
    };

    menu.appendChild(btnLine);
    menu.appendChild(btnPoly);
    menu.appendChild(btnCircle);
    menu.appendChild(btnClear);

    mainBtn.onclick = () => {
      menu.classList.toggle('open');
      if (!menu.classList.contains('open') && currentDrawInteraction) {
        map.removeInteraction(currentDrawInteraction);
        currentDrawInteraction = null;
        if (pointerMoveListener) {
          unByKey(pointerMoveListener);
          pointerMoveListener = null;
        }
        if (helpTooltip) {
          map.removeOverlay(helpTooltip);
          helpTooltip = null;
        }
      }
    };

    container.appendChild(mainBtn);
    container.appendChild(menu);

    map.addControl(new Control({ element: container }));
  }

  punto(opts: OpcionesPunto): Style {
    const { forma, color, zoom, seleccionado, etiqueta, radioSeleccionado, radiosPorZoom, offsetYTexto, minZoomEtiqueta } = opts;
    const mostrarTexto = !!etiqueta && (seleccionado || zoom >= (minZoomEtiqueta ?? 17.5));

    let radio: number;
    if (seleccionado) {
      radio = radioSeleccionado;
    } else if (zoom < 14) {
      radio = radiosPorZoom.z14;
    } else if (zoom < 16) {
      radio = radiosPorZoom.z16;
    } else if (zoom < 18) {
      radio = radiosPorZoom.z18;
    } else {
      radio = radiosPorZoom.max;
    }

    const colorBorde = seleccionado ? "#000000" : zoom < 16 ? "#333333" : "#ffffff";
    const anchoBorde = seleccionado ? 2.5 : zoom < 16 ? 0.8 : 1.5;

    const clave = `${forma}_${color}_${radio}_${colorBorde}_${anchoBorde}`;
    if (!mostrarTexto) {
      const cacheado = this.cache.get(clave);
      if (cacheado) return cacheado;
    }

    const image =
      forma === "circulo"
        ? new CircleStyle({
          radius: radio,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: colorBorde, width: anchoBorde }),
        })
        : new RegularShape({
          fill: new Fill({ color }),
          stroke: new Stroke({ color: colorBorde, width: anchoBorde }),
          points: 4,
          radius: radio,
          angle: Math.PI / 4,
        });

    const style = new Style({
      image,
      ...(mostrarTexto && {
        text: new Text({
          text: String(etiqueta),
          font: "bold 11px Arial",
          fill: new Fill({ color: "#000000" }),
          stroke: new Stroke({ color: "#ffffff", width: 2 }),
          offsetY: offsetYTexto,
        }),
      }),
    });

    if (!mostrarTexto) {
      this.cache.set(clave, style);
    }
    return style;
  }

  lineaAcometida(color: string, seleccionado: boolean, resolucion: number | undefined): Style[] {
    const anchoInterior = seleccionado ? 5 : 3;
    const anchoExterior = anchoInterior + 3;

    const geometryFn = (f: Feature) => {
      const geom = f.getGeometry();
      if (!(geom instanceof LineString) || !resolucion) return geom;

      const coords = geom.getCoordinates();
      if (coords.length !== 2) return geom;

      const [p1, p2] = coords;
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const largoMapa = Math.sqrt(dx * dx + dy * dy);
      if (largoMapa === 0) return geom;

      const largoPx = largoMapa / resolucion;
      if (largoPx >= LARGO_MIN_LINEA_PX) return geom;

      const escala = LARGO_MIN_LINEA_PX / largoPx;
      return new LineString([p1, [p1[0] + dx * escala, p1[1] + dy * escala]]);
    };

    return [
      new Style({
        stroke: new Stroke({ color: "#ffffff", width: anchoExterior }),
        zIndex: 10,
        geometry: geometryFn as any,
      }),
      new Style({
        stroke: new Stroke({ color, width: anchoInterior }),
        zIndex: 11,
        geometry: geometryFn as any,
      }),
    ];
  }
}