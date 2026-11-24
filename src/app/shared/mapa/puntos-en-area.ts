import OlMap from "ol/Map";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Circle as CirculoEstilo, Fill, Stroke, Style } from "ol/style";
import type { Coordinate } from "ol/coordinate";

import { MARCA_CAPA_RESALTADO } from "./interaccion-gis";

const ESTILO_USUARIO_EN_AREA = new Style({
  image: new CirculoEstilo({
    radius: 4,
    fill: new Fill({ color: "#22c55e" }),
    stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
  }),
});

/** Muestra los usuarios que hay dentro del área consultada, para comprobarlos antes de descargarlos. */
export class PuntosEnArea {
  private readonly capa = new VectorLayer({
    source: new VectorSource(),
    zIndex: 998,
    style: ESTILO_USUARIO_EN_AREA,
  });

  constructor(map: OlMap) {
    // Como el resaltado: un clic sobre estos puntos no los consulta como si fueran una capa.
    this.capa.set(MARCA_CAPA_RESALTADO, true);
    map.addLayer(this.capa);
  }

  mostrar(coordenadas: Coordinate[]): void {
    const fuente = this.capa.getSource()!;
    fuente.clear();
    fuente.addFeatures(coordenadas.map((coordenada) => new Feature(new Point(coordenada))));
  }

  quitar(): void {
    this.capa.getSource()!.clear();
  }
}
