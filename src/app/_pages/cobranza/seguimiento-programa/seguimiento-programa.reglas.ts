import GeoJSON from "ol/format/GeoJSON";
import WKT from "ol/format/WKT";
import Geometry from "ol/geom/Geometry";
import Polygon from "ol/geom/Polygon";

import { RegistroCorte } from "@host/_models/vektors/Cobranza/RegistroCorte";
import { EstadoCorte } from "./modos-seguimiento";

// Reglas de negocio del seguimiento de programas de corte/reapertura. Son funciones
// puras: no dependen del mapa ni del componente.

/** Código de estado del SP para una operación ya ejecutada (cortado o reaperturado). */
const CODESTADO_EJECUTADO = "003";

/** Resumen por inspector; se calcula en el front a partir de los registros del programa. */
export interface ResumenInspectorCorte {
  codinspector: string;
  inspector: string;
  total: number;
  ejecutados: number;
  pagados: number;
  pendientes: number;
  rendimiento: number;
}

export interface TotalesPorEstado {
  total: number;
  ejecutados: number;
  pagados: number;
  pendientes: number;
  rendimiento: number;
}

/** Ejecutado si el SP lo marca así; si no, pagado si tiene día de pago; si no, pendiente. */
export function estadoDelCorte(registro: RegistroCorte): EstadoCorte {
  if (registro?.codestado === CODESTADO_EJECUTADO) return "ejecutado";
  if (registro?.diapago) return "pagado";
  return "pendiente";
}

/** Porcentaje ejecutado con un decimal; 0 si no hay registros. */
function rendimiento(ejecutados: number, total: number): number {
  return total ? Number(((ejecutados / total) * 100).toFixed(1)) : 0;
}

export function totalesPorEstado(registros: RegistroCorte[]): TotalesPorEstado {
  const contar = (estado: EstadoCorte) => registros.filter((r) => estadoDelCorte(r) === estado).length;
  const ejecutados = contar("ejecutado");
  return {
    total: registros.length,
    ejecutados,
    pagados: contar("pagado"),
    pendientes: contar("pendiente"),
    rendimiento: rendimiento(ejecutados, registros.length),
  };
}

/** Los registros sin inspector se agrupan bajo "—". */
export function codigoInspectorDe(registro: RegistroCorte): string {
  return registro.codinspector || "—";
}

/** Resumen por inspector, de quien tiene más registros a quien tiene menos. */
export function resumenPorInspector(registros: RegistroCorte[]): ResumenInspectorCorte[] {
  const porInspector = new Map<string, ResumenInspectorCorte>();
  for (const registro of registros) {
    const codigo = codigoInspectorDe(registro);
    let fila = porInspector.get(codigo);
    if (!fila) {
      fila = {
        codinspector: codigo,
        inspector: registro.inspector || "Sin inspector",
        total: 0,
        ejecutados: 0,
        pagados: 0,
        pendientes: 0,
        rendimiento: 0,
      };
      porInspector.set(codigo, fila);
    }
    fila.total++;
    const estado = estadoDelCorte(registro);
    if (estado === "ejecutado") fila.ejecutados++;
    else if (estado === "pagado") fila.pagados++;
    else fila.pendientes++;
  }

  const filas = [...porInspector.values()];
  filas.forEach((fila) => (fila.rendimiento = rendimiento(fila.ejecutados, fila.total)));
  return filas.sort((a, b) => b.total - a.total);
}

/**
 * Polígono del lote a partir de `capaloteslatylog`, que puede venir como GeoJSON,
 * WKT o una lista de pares lon,lat. Si las coordenadas no caben en lon/lat se asume
 * la zona UTM de la EPS. OJO: si el origen manda lat,lng en vez de lng,lat, sale volteado.
 */
export function geometriaDelLote(
  texto: string | undefined,
  proyeccionMapa: string,
  proyeccionUtm: string,
): Geometry | null {
  if (!texto) return null;
  let geometria: Geometry | null = null;
  try {
    const valor = String(texto).trim();
    if (valor.startsWith("{")) {
      geometria = new GeoJSON().readGeometry(valor);
    } else if (/POLYGON|MULTIPOLYGON/i.test(valor)) {
      geometria = new WKT().readGeometry(valor);
    } else {
      const anillo = leerParesDeCoordenadas(valor);
      if (anillo && anillo.length >= 3) geometria = new Polygon([anillo]);
    }
  } catch {
    return null;
  }
  if (!geometria) return null;

  const coordenadas = (geometria as any).getFlatCoordinates?.() ?? [];
  const [x, y] = coordenadas;
  if (x == null || y == null) return null;

  const origen = Math.abs(x) > 180 || Math.abs(y) > 90 ? proyeccionUtm : proyeccionMapa;
  if (origen !== proyeccionMapa) geometria.transform(origen, proyeccionMapa);
  return geometria;
}

/** Acepta `[[x,y],[x,y],...]` o `"x y, x y, ..."`; necesita al menos 3 puntos. */
function leerParesDeCoordenadas(valor: string): number[][] | null {
  try {
    if (valor.startsWith("[")) {
      const lista = JSON.parse(valor);
      if (Array.isArray(lista) && Array.isArray(lista[0])) {
        return lista.map((p: any) => [Number(p[0]), Number(p[1])]);
      }
    }
    const numeros = valor
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => !isNaN(n));
    if (numeros.length >= 6 && numeros.length % 2 === 0) {
      const puntos: number[][] = [];
      for (let i = 0; i < numeros.length; i += 2) puntos.push([numeros[i], numeros[i + 1]]);
      return puntos;
    }
  } catch {
    // formato no reconocido
  }
  return null;
}

/** `#rrggbb` → `rgba(r,g,b,alfa)`. */
export function colorConTransparencia(hex: string, alfa: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alfa})`;
}

/** Fecha del backend (`dd/MM/yy[yy] ...` o ISO) en milisegundos; 0 si no se puede leer. */
export function fechaEnMilisegundos(texto: string | undefined): number {
  if (!texto) return 0;
  if (texto.includes("/")) {
    const [fecha] = texto.split(" ");
    const [dia, mes, anio] = fecha.split("/");
    const anioCompleto = anio.length === 2 ? 2000 + parseInt(anio) : parseInt(anio);
    return new Date(anioCompleto, parseInt(mes) - 1, parseInt(dia)).getTime();
  }
  const ms = new Date(texto).getTime();
  return isNaN(ms) ? 0 : ms;
}

/**
 * Del historial de cortes/reaperturas del cliente, la observación de la operación
 * que corresponde a la fecha de ejecución (se descartan las anteriores a esa fecha).
 */
export function observacionDeLaOperacion(historial: any[], fechaEjecucion: string | undefined): string | undefined {
  const fechaReferencia = fechaEnMilisegundos(fechaEjecucion);
  const fila = historial.find((h) => {
    if (fechaReferencia <= 0) return true;
    const fechaFila = fechaEnMilisegundos(h.fecha || h.fechareg || h.fecha_registro);
    return !(fechaFila > 0 && fechaFila < fechaReferencia);
  });
  return fila ? fila.observacion?.trim() || "-" : undefined;
}

/**
 * La observación que viene en el propio registro: puede ser texto o un JSON con
 * la lista de observaciones; se toma la más reciente.
 */
export function observacionMasRecienteDe(corte: RegistroCorte): string {
  let observacion = corte.observaciones || corte.observacion;
  if (!observacion) return "-";

  try {
    if (typeof observacion === "string") {
      const lista = JSON.parse(observacion);
      if (Array.isArray(lista)) observacion = lista;
    }
    if (Array.isArray(observacion) && observacion.length > 0) {
      const fecha = (o: any) => new Date(o.fechareg || o.fecha || o.fecha_registro || 0).getTime();
      const masReciente = [...observacion].sort((a, b) => fecha(b) - fecha(a))[0];
      return masReciente.observacion || masReciente.observaciones || masReciente.descripcion || "-";
    }
  } catch {
    // no era JSON: se usa el texto tal cual
  }
  return typeof observacion === "string" ? observacion : "-";
}
