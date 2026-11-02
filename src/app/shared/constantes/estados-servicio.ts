import { GrupoLeyenda } from "../components/leyenda-grupos/leyenda-grupos.component";

export interface EstadoServicioUI {
  codigo: string;
  /** Como lo nombra la leyenda del GIS. */
  etiqueta: string;
  descripcion: string;
  color: string;
  /** Nombre corto del catálogo (`tipoestservicio.nombre`): algunos procedimientos devuelven este y no la descripción. */
  nombres: string[];
  /** La conexión proyectada se dibuja rayada en el GIS. */
  rayado?: boolean;
}

// Colores de la leyenda "Estado del Servicio" del GIS de la EPS, para que el mapa se lea igual.
export const ESTADOS_SERVICIO: EstadoServicioUI[] = [
  { codigo: "001", etiqueta: "Operativo con servicio activo", descripcion: "OPERATIVO CON SERVICIO-ACTIVO", nombres: ["ACTIVO"], color: "#1f77d0" },
  { codigo: "002", etiqueta: "Operativo sin servicio, cortado", descripcion: "OPERATIVO SIN SERVICIO-CORTADO", nombres: ["CORTADO X DEUDA"], color: "#8a2be2" },
  { codigo: "003", etiqueta: "Clandestino y/o clausurado", descripcion: "CLANDESTINO Y/O CLAUSURADO", nombres: ["CLANDESTINO"], color: "#e8b37c" },
  { codigo: "004", etiqueta: "Levantado", descripcion: "LEVANTADO", nombres: [], color: "#ec8a2f" },
  { codigo: "005", etiqueta: "Operativo sin servicio, a solicitud", descripcion: "OPERATIVO SIN SERVICIO-A SOLICITUD", nombres: ["CORTE SOLICTUD", "CORTE SOLICITUD"], color: "#c6c64a" },
  { codigo: "006", etiqueta: "Incobrable", descripcion: "INCOBRABLE", nombres: ["DEUDA MAYOR 12 MESES"], color: "#111111" },
  { codigo: "007", etiqueta: "Quebrado", descripcion: "QUEBRADO", nombres: [], color: "#d9304f" },
  { codigo: "008", etiqueta: "Anulado", descripcion: "ANULADO", nombres: [], color: "#3a2a2a" },
  { codigo: "009", etiqueta: "Conexión proyectada", descripcion: "CONEXION PROYECTADA", nombres: ["PROYECTADO", "PROYECTADA"], color: "#f4f4f5", rayado: true },
];

const ESTADO_DESCONOCIDO: EstadoServicioUI = { codigo: "", etiqueta: "Sin estado", descripcion: "SIN ESTADO", nombres: [], color: "#94a3b8" };

function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Acepta el código ("002"), la descripción o el nombre corto que devuelven los procedimientos. */
export function estadoServicioDe(valor: unknown): EstadoServicioUI {
  const texto = normalizar(valor);
  if (!texto) return ESTADO_DESCONOCIDO;
  return (
    ESTADOS_SERVICIO.find(
      (estado) => estado.codigo === texto || estado.descripcion === texto || estado.nombres.includes(texto),
    ) ?? { ...ESTADO_DESCONOCIDO, etiqueta: texto, descripcion: texto }
  );
}

export function grupoDeEstadoServicio(valor: unknown): GrupoLeyenda {
  const estado = estadoServicioDe(valor);
  return {
    clave: estado.codigo || estado.descripcion,
    etiqueta: estado.etiqueta,
    detalle: estado.descripcion,
    color: estado.color,
    rayado: estado.rayado,
  };
}
