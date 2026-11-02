import OlMap from "ol/Map";
import Feature from "ol/Feature";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Stroke, Style } from "ol/style";
import type Geometry from "ol/geom/Geometry";

import { MARCA_CAPA_RESALTADO } from "./interaccion-gis";

const COLOR_CALLE = "#ff9f1c";

/** Pinta la calle buscada, como hace GIS Loreto: se queda hasta limpiar la búsqueda o elegir un cliente. */
export class CalleBuscada {
  private readonly capa = new VectorLayer({
    source: new VectorSource(),
    zIndex: 998,
    style: [
      new Style({ stroke: new Stroke({ color: "rgba(255, 255, 255, 0.9)", width: 10, lineCap: "round" }) }),
      new Style({ stroke: new Stroke({ color: COLOR_CALLE, width: 6, lineCap: "round" }) }),
    ],
  });

  constructor(private readonly map: OlMap) {
    this.capa.set(MARCA_CAPA_RESALTADO, true);
    this.map.addLayer(this.capa);
  }

  mostrar(geometrias: Geometry[]): void {
    const fuente = this.capa.getSource()!;
    fuente.clear();
    fuente.addFeatures(geometrias.map((geometria) => new Feature({ geometry: geometria })));
  }

  extension(): number[] | null {
    const fuente = this.capa.getSource()!;
    return fuente.isEmpty() ? null : fuente.getExtent();
  }

  limpiar(): void {
    this.capa.getSource()!.clear();
  }

  destruir(): void {
    this.map.removeLayer(this.capa);
  }
}
