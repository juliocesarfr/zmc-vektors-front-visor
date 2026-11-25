import type OlMap from "ol/Map";
import type Feature from "ol/Feature";
import type BaseLayer from "ol/layer/Base";
import type Layer from "ol/layer/Layer";
import VectorSource from "ol/source/Vector";
import type { Pixel } from "ol/pixel";

/** Tolerancia de un clic o del cursor sobre un punto propio de la pantalla. */
export const TOLERANCIA_ELEMENTO_PX = 5;

// Radio del punto más grande que se dibuja: el cursor está "encima" aunque no apunte al centro.
const RADIO_SIMBOLO_PX = 7;

type FuncionEstilo = (elemento: Feature, resolucion: number) => unknown;

export interface ElementoEnPixel {
  elemento: Feature;
  capa: Layer;
}

/**
 * Elemento propio de la pantalla (cliente, ficha, acometida, lote marcado) bajo `pixel`, con su capa.
 * Se busca en el índice espacial de cada capa y no pintando, como hace `forEachFeatureAtPixel`: con decenas
 * de miles de puntos esa detección tarda cientos de milisegundos y traba el mapa en cada clic o movimiento.
 * Como OpenLayers, gana la capa que se dibuja encima; dentro de una capa, el elemento más cercano.
 */
export function elementoEnPixel(
  map: OlMap,
  pixel: Pixel,
  esCapaPropia: (capa: BaseLayer) => boolean,
  toleranciaPx = TOLERANCIA_ELEMENTO_PX,
): ElementoEnPixel | undefined {
  const coordenada = map.getCoordinateFromPixel(pixel);
  const resolucion = map.getView().getResolution();
  if (!coordenada || !resolucion) return undefined;

  const radio = (toleranciaPx + RADIO_SIMBOLO_PX) * resolucion;
  const zona = [coordenada[0] - radio, coordenada[1] - radio, coordenada[0] + radio, coordenada[1] + radio];

  const capasDeArribaAbajo = map
    .getAllLayers()
    .map((capa, orden) => ({ capa, orden }))
    .sort((una, otra) => (otra.capa.getZIndex() ?? 0) - (una.capa.getZIndex() ?? 0) || otra.orden - una.orden);

  for (const { capa } of capasDeArribaAbajo) {
    if (!capa.getVisible() || !esCapaPropia(capa)) continue;
    const fuente = capa.getSource();
    if (!(fuente instanceof VectorSource)) continue;
    const estiloDe = (capa as { getStyleFunction?: () => FuncionEstilo | undefined }).getStyleFunction?.();

    let masCercano: Feature | undefined;
    let distanciaMinima = radio * radio;
    fuente.forEachFeatureInExtent(zona, (elemento) => {
      const geometria = elemento.getGeometry();
      if (!geometria) return;
      // El punto más cercano de un polígono está en su borde: dentro de él la distancia es cero.
      const cercano = geometria.intersectsCoordinate(coordenada) ? coordenada : geometria.getClosestPoint(coordenada);
      const distancia = (cercano[0] - coordenada[0]) ** 2 + (cercano[1] - coordenada[1]) ** 2;
      if (distancia >= distanciaMinima) return;
      if (estiloDe && !seDibuja(estiloDe(elemento as Feature, resolucion))) return;
      distanciaMinima = distancia;
      masCercano = elemento as Feature;
    });
    if (masCercano) return { elemento: masCercano, capa };
  }
  return undefined;
}

/** Solo el elemento: para las pantallas a las que no les importa en qué capa está. */
export function elementoPropioEn(
  map: OlMap,
  pixel: Pixel,
  toleranciaPx: number,
  esCapaPropia: (capa: BaseLayer) => boolean,
): Feature | undefined {
  return elementoEnPixel(map, pixel, esCapaPropia, toleranciaPx)?.elemento;
}

// Una capa oculta elementos desde su estilo (por ejemplo, al filtrar por un estado de la leyenda).
function seDibuja(estilo: unknown): boolean {
  return Array.isArray(estilo) ? estilo.length > 0 : !!estilo;
}
