import Feature from "ol/Feature";
import LineString from "ol/geom/LineString";
import { Style, Circle as CircleStyle, Fill, Stroke, Text, RegularShape } from "ol/style";
import { LARGO_MIN_LINEA_PX } from "../config/Controldigitacion.config";

export type FormaPunto = "circulo" | "rombo";

export interface OpcionesPunto {
  forma: FormaPunto;
  color: string;
  zoom: number;
  seleccionado: boolean;
  /** Etiqueta a mostrar (codcliente). Si es falsy, no se dibuja texto. */
  etiqueta?: string;
  /** Radios por defecto para features no seleccionados. El rombo es más grande. */
  radioSeleccionado: number;
  radiosPorZoom: { z14: number; z16: number; z18: number; max: number };
  offsetYTexto: number;
  minZoomEtiqueta?: number;
}

export const RADIOS_LECTURA = { radioSeleccionado: 9,  radiosPorZoom: { z14: 3, z16: 4, z18: 6, max: 7 }, offsetYTexto: -12 };
export const RADIOS_FICHA   = { radioSeleccionado: 11, radiosPorZoom: { z14: 4, z16: 6, z18: 8, max: 9 }, offsetYTexto: -15 };

export class MapEstilosFactory {
  private cache = new Map<string, Style>();

  limpiar(): void {
    this.cache.clear();
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

    // Solo cacheamos estilos sin texto (ver comentario de cabecera).
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

  /**
   * Estilo de línea de acometida (doble trazo: borde blanco + color interior).
   * Si la línea mide menos de LARGO_MIN_LINEA_PX en pantalla, se extiende
   * visualmente para que sea clickeable, usando la resolución REAL del render.
   */
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