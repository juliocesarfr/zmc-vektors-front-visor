/**
 * Forma normalizada de una lectura que llega por WebSocket.
 *
 * Los dos canales publican el mismo hecho ("se registró una lectura") con
 * nombres de campo distintos, así que las pantallas consumen SOLO esta forma:
 *
 * - `movil`: APK del lecturista → `api-externa`, topic `/ws/registra-lecturas`.
 *   Payload `response_lecturas_movil` (campos en español).
 * - `web`: digitación en el ERP → `api-micromedicion`, topic STOMP
 *   `/topic/meter-reading-update`. Payload `MeterReadingSectorDto` (campos en
 *   inglés).
 */
export type OrigenLectura = "movil" | "web";

export interface LecturaEnVivo {
  origen: OrigenLectura;

  /** Clave de cruce contra los features ya pintados en el mapa. */
  codcliente: string;

  // Contexto: solo el canal móvil los envía completos. Se usan como defensa
  // extra del filtro; su ausencia NO descarta el mensaje.
  codsuc?: string;
  codciclo?: string;
  codsector?: string;
  anio?: string;
  mes?: string;

  /** Código del SP de estado de lectura ("000" normal, "008" atípica, …). */
  estadolectura?: string;
  tipoestlectura?: string;

  codinspector?: string;
  inspector?: string;

  /** Coordenada GPS donde el inspector registró la toma (WGS84, como string). */
  latitud?: string;
  longitud?: string;

  /**
   * Misma regla que el SP de resumen y que `esLecturaTomada` de la pantalla de
   * seguimiento: la lectura está TOMADA cuando web = 1 y recibido = 1.
   */
  tomada: boolean;

  /** Payload original, por si una pantalla necesita un campo no normalizado. */
  crudo: Record<string, unknown>;
}

/**
 * Contexto de la pantalla, para descartar lecturas de otro ciclo/sucursal.
 * Es un filtro de apoyo: el filtro fuerte es que el `codcliente` ya esté
 * pintado en el mapa.
 */
export interface ContextoTiempoReal {
  codsuc?: string | null;
  codciclo?: string | null;
  anio?: string | null;
  mes?: string | null;
}
