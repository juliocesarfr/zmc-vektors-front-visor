import { transform } from "ol/proj";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import {
  ConfigOrigenCoordenada,
  PROYECCION_MAPA,
} from "../config/Controldigitacion.config";

/** Distancia entre dos puntos WGS84 en metros (fórmula de Haversine). */
export function distanciaHaversineMetros(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const df = (lat2 - lat1) * rad;
  const dl = (lon2 - lon1) * rad;
  const a =
    Math.sin(df / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Extrae lon/lat de un registro según la config de origen. `null` si es inválida. */
export function extraerCoordenada(
  registro: Record<string, unknown>,
  config: ConfigOrigenCoordenada,
): [number, number] | null {
  const rawLon = registro[config.lonField];
  const rawLat = registro[config.latField];
  const lon = Number(rawLon);
  const lat = Number(rawLat);

  const invalida =
    rawLon == null ||
    rawLat == null ||
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    (lon === 0 && lat === 0);

  if (invalida) return null;

  if (config.proyeccion !== PROYECCION_MAPA) {
    return transform([lon, lat], config.proyeccion, PROYECCION_MAPA) as [
      number,
      number,
    ];
  }
  return [lon, lat];
}

export function crearFeaturePunto(
  registro: Record<string, unknown>,
  config: ConfigOrigenCoordenada,
): Feature | null {
  const coord = extraerCoordenada(registro, config);
  if (!coord) return null;
  return new Feature({ ...registro, geometry: new Point(coord) });
}

export function crearFeatureLinea(
  registro: Record<string, unknown>,
  origen: ConfigOrigenCoordenada,
  destino: ConfigOrigenCoordenada,
  maxDistanciaM: number,
): Feature | null {
  const c1 = extraerCoordenada(registro, origen);
  const c2 = extraerCoordenada(registro, destino);
  if (!c1 || !c2) return null;

  // Nota: la validación de distancia asume coordenadas WGS84 (proyección del mapa).
  if (distanciaHaversineMetros(c1[0], c1[1], c2[0], c2[1]) > maxDistanciaM) {
    return null;
  }

  return new Feature({
    ...registro,
    esLinea: true,
    geometry: new LineString([c1, c2]),
  });
}
