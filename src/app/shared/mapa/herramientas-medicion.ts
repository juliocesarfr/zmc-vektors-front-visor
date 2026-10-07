import OlMap from "ol/Map";
import Overlay from "ol/Overlay";
import { Control, FullScreen, ScaleLine, Zoom, ZoomSlider } from "ol/control";
import CircleGeom from "ol/geom/Circle";
import Point from "ol/geom/Point";
import { fromCircle } from "ol/geom/Polygon";
import Draw from "ol/interaction/Draw";
import DoubleClickZoom from "ol/interaction/DoubleClickZoom";
import VectorLayer from "ol/layer/Vector";
import { unByKey } from "ol/Observable";
import { getPointResolution } from "ol/proj";
import VectorSource from "ol/source/Vector";
import { getArea, getLength } from "ol/sphere";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";

const MARCA_DIBUJO_EN_CURSO = "dibujoEnCurso";

/** Cada dibujo guarda aquí su rótulo de medida ("Área: …", "Radio: …") para borrarlo con él. */
export const PROPIEDAD_ROTULO_MEDIDA = "rotuloMedida";

// OpenLayers dispara `singleclick` unos 250 ms después del clic que cerró el dibujo,
// cuando la interacción ya se quitó: sin este margen ese clic consultaría el mapa.
const MS_MARGEN_TRAS_DIBUJO = 400;

/** `true` mientras se dibuja, se escribe el radio o acaba de terminarse un dibujo: el clic no es para el mapa. */
export function estaUsandoHerramientas(map: OlMap): boolean {
  return (
    !!map.get(MARCA_DIBUJO_EN_CURSO) ||
    map.getInteractions().getArray().some((interaccion) => interaccion.get("isDrawInteraction"))
  );
}

// El doble clic que cierra una línea o un polígono también acercaba el mapa y movía el dibujo de lugar.
function activarZoomDobleClic(map: OlMap, activo: boolean): void {
  map.getInteractions().forEach((interaccion) => {
    if (interaccion instanceof DoubleClickZoom) interaccion.setActive(activo);
  });
}

function liberarClicTrasDibujo(map: OlMap): void {
  window.setTimeout(() => {
    map.set(MARCA_DIBUJO_EN_CURSO, false);
    activarZoomDobleClic(map, true);
  }, MS_MARGEN_TRAS_DIBUJO);
}

/**
 * Agrega al mapa los controles de zoom, pantalla completa, escala y el menú
 * de medición/dibujo (línea, área y radio).
 *
 * @param alTerminarDibujo se llama con la geometría al terminar cada dibujo
 *        (por ejemplo, para contar los clientes dentro de un radio).
 * @param alLimpiarDibujos se llama al borrar los dibujos con el botón de la papelera.
 */
export function agregarHerramientasMapa(
  map: OlMap,
  alTerminarDibujo?: (geometry: any) => void,
  fuentePantallaCompleta?: string | HTMLElement,
  alLimpiarDibujos?: () => void,
): void {



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

  map.addControl(new FullScreen({ 
    label: fsLabel, 
    labelActive: fsLabelActive,
    source: fuentePantallaCompleta
  }));
  map.addControl(new ZoomSlider());
  map.addControl(new ScaleLine({ units: 'metric' }));

  const drawSource = new VectorSource();
  const drawLayer = new VectorLayer({
    source: drawSource,
    style: function (feature) {
      const geom = feature.getGeometry();
      let strokeColor = '#ffcc33';
      let fillColor = 'rgba(255, 204, 51, 0.2)'; // 20% opacity
      
      if (geom) {
        if (geom.getType() === 'Polygon') {
          strokeColor = '#10b981'; // Green
          fillColor = 'rgba(16, 185, 129, 0.2)';
        } else if (geom.getType() === 'LineString') {
          strokeColor = '#3b82f6'; // Blue
          fillColor = 'rgba(59, 130, 246, 0.2)';
        } else if (geom.getType() === 'Circle') {
          strokeColor = '#ef4444'; // Red
          fillColor = 'rgba(239, 68, 68, 0.2)';
        }
      }

      const styles = [
        new Style({
          fill: new Fill({ color: fillColor }),
          stroke: new Stroke({ color: strokeColor, width: 2 }),
          image: new CircleStyle({ radius: 7, fill: new Fill({ color: strokeColor }) })
        })
      ];
      if (geom && geom.getType() === 'Circle') {
        const center = (geom as any).getCenter();
        styles.push(new Style({
          geometry: new Point(center),
          image: new CircleStyle({
            radius: 5,
            fill: new Fill({ color: strokeColor }),
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
    activarZoomDobleClic(map, false);
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
        let sketchColor = 'rgba(0, 0, 0, 0.5)';
        let sketchFill = 'rgba(255, 255, 255, 0.2)';
        if (type === 'Polygon') {
          sketchColor = '#10b981';
          sketchFill = 'rgba(16, 185, 129, 0.1)';
        } else if (type === 'LineString') {
          sketchColor = '#3b82f6';
        } else if (type === 'Circle') {
          sketchColor = '#ef4444';
          sketchFill = 'rgba(239, 68, 68, 0.1)';
        }
        
        const styles = [
          new Style({
            fill: new Fill({ color: sketchFill }),
            stroke: new Stroke({ color: sketchColor, lineDash: [10, 10], width: 2 }),
            image: new CircleStyle({ radius: 5, stroke: new Stroke({ color: sketchColor }), fill: new Fill({ color: sketchFill }) })
          })
        ];
        const geom = feature.getGeometry();
        if (geom && geom.getType() === 'Circle') {
          const center = (geom as any).getCenter();
          styles.push(new Style({
            geometry: new Point(center),
            image: new CircleStyle({
              radius: 5,
              fill: new Fill({ color: sketchColor }),
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
      map.set(MARCA_DIBUJO_EN_CURSO, true);
      evt.feature.set(PROPIEDAD_ROTULO_MEDIDA, measureTooltip);
      
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
         
         cleanupInteraction(); 

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
            liberarClicTrasDibujo(map);
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
               if (alTerminarDibujo) alTerminarDibujo(finalGeometry);
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
         
         return; 
         

         
      } 

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

      if (alTerminarDibujo) {
        alTerminarDibujo(finalGeometry);
      }

      cleanupInteraction();
      liberarClicTrasDibujo(map);
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
    map.set(MARCA_DIBUJO_EN_CURSO, false);
    activarZoomDobleClic(map, true);
    alLimpiarDibujos?.();
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
      activarZoomDobleClic(map, true);
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
