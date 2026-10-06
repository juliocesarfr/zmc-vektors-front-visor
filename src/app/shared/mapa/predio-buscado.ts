import OlMap from "ol/Map";
import Feature from "ol/Feature";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style, Text } from "ol/style";
import type Geometry from "ol/geom/Geometry";

import { MARCA_CAPA_RESALTADO } from "./interaccion-gis";

const COLOR_PREDIO = "#f59e0b";

export const ZOOM_PREDIO = 21;

// Arriba, derecha, abajo, izquierda: la derecha deja libre el popup del cliente y la izquierda el panel de capas.
const MARGEN_ENCUADRE_PX = [140, 420, 120, 340];
// En pantallas angostas el popup va abajo y el panel de capas se oculta.
const MARGEN_ENCUADRE_COMPACTO_PX = [80, 40, 260, 40];
const ANCHO_MINIMO_MARGEN_COMPLETO_PX = 1100;

/**
 * Marca el lote del cliente encontrado con el buscador. Se queda hasta limpiar la búsqueda,
 * a diferencia del resaltado de la consulta GIS, que cambia con cada clic.
 */
export class PredioBuscado {
  private readonly capa = new VectorLayer({
    source: new VectorSource(),
    zIndex: 999,
    style: (predio) => [
      new Style({ stroke: new Stroke({ color: "rgba(255, 255, 255, 0.95)", width: 8 }) }),
      new Style({
        stroke: new Stroke({ color: COLOR_PREDIO, width: 4 }),
        fill: new Fill({ color: "rgba(245, 158, 11, 0.3)" }),
        text: new Text({
          text: `Predio ${predio.get("codcliente")}`,
          font: "bold 12px Arial",
          fill: new Fill({ color: "#ffffff" }),
          backgroundFill: new Fill({ color: "#b45309" }),
          padding: [3, 6, 3, 6],
          // Por encima de la etiqueta del punto del cliente, que cae en el mismo lugar.
          offsetY: -40,
          overflow: true,
        }),
      }),
    ],
  });

  constructor(private readonly map: OlMap) {
    this.capa.set(MARCA_CAPA_RESALTADO, true);
    this.map.addLayer(this.capa);
  }

  mostrar(geometria: Geometry, codcliente: string): void {
    const fuente = this.capa.getSource()!;
    fuente.clear();
    fuente.addFeature(new Feature({ geometry: geometria, codcliente }));
  }

  encuadrar(): void {
    const fuente = this.capa.getSource()!;
    if (fuente.isEmpty()) return;
    const anchoMapa = this.map.getSize()?.[0] ?? 0;
    this.map.getView().fit(fuente.getExtent(), {
      duration: 800,
      maxZoom: ZOOM_PREDIO,
      padding:
        anchoMapa >= ANCHO_MINIMO_MARGEN_COMPLETO_PX
          ? MARGEN_ENCUADRE_PX
          : MARGEN_ENCUADRE_COMPACTO_PX,
    });
  }

  limpiar(): void {
    this.capa.getSource()!.clear();
  }

  destruir(): void {
    this.map.removeLayer(this.capa);
  }
}
