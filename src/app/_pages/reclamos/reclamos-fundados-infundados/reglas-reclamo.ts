import { ReclamoFundadoInfundado } from "@host/_models/vektors/Reclamos/ReclamosFundadosInfundados";
import { GrupoLeyenda } from "../../../shared/components/leyenda-grupos/leyenda-grupos.component";

// Los códigos (estadoplazo, notificacion, resultado, improcedente, revocado, rebajaestimada) los calcula el
// procedimiento. Aquí solo se convierten en etiquetas y colores, para que el mapa, la ficha, el resumen y el Excel digan lo mismo.

export type ModoPintado = "resultado" | "plazo" | "reincidencia" | "notificacion";
export type VistaMapa = "puntos" | "calor";

export const MODOS_PINTADO: { modo: ModoPintado; nombre: string; explicacion: string }[] = [
  { modo: "resultado", nombre: "Resultado", explicacion: "Resultado de la instancia vigente de los reclamos del cliente." },
  { modo: "plazo", nombre: "Plazo", explicacion: "Plazo de la primera instancia en días hábiles. Si el cliente tiene varios reclamos, manda el más grave." },
  { modo: "reincidencia", nombre: "Reincidencia", explicacion: "Cuántos reclamos tiene el cliente en el periodo consultado." },
  { modo: "notificacion", nombre: "Notificación", explicacion: "Si la resolución vigente ya se notificó al usuario." },
];

const grupo = (clave: string, etiqueta: string, detalle: string, color: string): GrupoLeyenda => ({ clave, etiqueta, detalle, color });

// ---------- Resultado ----------

export const GRUPO_FUNDADO = grupo("fundado", "Fundado", "Se le dio la razón al usuario", "#16a34a");
export const GRUPO_INFUNDADO = grupo("infundado", "Infundado", "El reclamo no procedió", "#dc2626");
const GRUPO_CLIENTE_CON_AMBOS = grupo("ambos", "Cliente con ambos", "El cliente tiene reclamos fundados e infundados", "#7c3aed");
// Una apelación antigua guardó un valor que no es 1 ni 0: el procedimiento la deja sin resultado en vez de adivinar.
const GRUPO_SIN_RESULTADO = grupo("sinresultado", "Sin resultado registrado", "La instancia vigente guardó un resultado que no es fundado ni infundado", "#94a3b8");

export function esFundado(reclamo: ReclamoFundadoInfundado): boolean {
  return Number(reclamo.resultado) === 1;
}

/** Number(null) es 0: por eso se pregunta primero si hay resultado. */
export function esInfundado(reclamo: ReclamoFundadoInfundado): boolean {
  return reclamo.resultado !== null && reclamo.resultado !== undefined && Number(reclamo.resultado) === 0;
}

export function etiquetaResultado(reclamo: ReclamoFundadoInfundado): string {
  if (!esFundado(reclamo) && !esInfundado(reclamo)) return GRUPO_SIN_RESULTADO.etiqueta;
  const resultado = esFundado(reclamo) ? "Fundado" : "Infundado";
  // Se dice en qué grupo se cuenta, para que la etiqueta cuadre con las tarjetas y la leyenda.
  return Number(reclamo.improcedente) === 1 ? `${resultado} (improcedente)` : resultado;
}

export function colorResultado(reclamo: ReclamoFundadoInfundado): string {
  if (esFundado(reclamo)) return GRUPO_FUNDADO.color;
  return esInfundado(reclamo) ? GRUPO_INFUNDADO.color : GRUPO_SIN_RESULTADO.color;
}

/** Etiqueta de un resultado guardado de una instancia (1 fundado, 0 infundado); sin dato queda en blanco. */
export function etiquetaResultadoInstancia(resultado: number | null | undefined): string {
  if (resultado === null || resultado === undefined) return "";
  return Number(resultado) === 1 ? "Fundado" : "Infundado";
}

// ---------- Instancia ----------

const INSTANCIAS: Record<string, string> = {
  "004": "Conciliación",
  "005": "Resolución (1ª instancia)",
  "007": "Reconsideración",
  "009": "Apelación (TRASS)",
};

export function etiquetaInstancia(reclamo: ReclamoFundadoInfundado): string {
  const codigo = String(reclamo.estadorec ?? "").trim();
  return INSTANCIAS[codigo] ?? String(reclamo.estadoreclamo ?? "").trim();
}

const INSTANCIAS_CORTAS: Record<string, string> = {
  "004": "Conciliación",
  "005": "1ª instancia",
  "007": "Reconsideración",
  "009": "Apelación",
};

export function etiquetaInstanciaCorta(reclamo: ReclamoFundadoInfundado): string {
  return INSTANCIAS_CORTAS[String(reclamo.estadorec ?? "").trim()] ?? etiquetaInstancia(reclamo);
}

/** Solo la resolución y la apelación guardan la razón del fundado; la conciliación y la reconsideración no. */
export function guardaRazonFundado(reclamo: ReclamoFundadoInfundado): boolean {
  const codigo = String(reclamo.estadorec ?? "").trim();
  return codigo === "005" || codigo === "009";
}

export function esFundadoSinRazon(reclamo: ReclamoFundadoInfundado): boolean {
  return esFundado(reclamo) && guardaRazonFundado(reclamo) && !String(reclamo.razonfundado ?? "").trim();
}

export function etiquetaRevocado(reclamo: ReclamoFundadoInfundado): string {
  if (String(reclamo.estadorec ?? "").trim() !== "009") return "";
  return Number(reclamo.revocado) === 1 ? "SI" : "NO";
}

// ---------- Plazo ----------

/** De más grave a menos grave: el orden decide el color de un cliente con varios reclamos. */
const PLAZOS: { codigo: string; grupo: GrupoLeyenda }[] = [
  { codigo: "SP", grupo: grupo("SP", "Silencio positivo", "Se notificó después del límite: se entiende fundado", "#7f1d1d") },
  { codigo: "SN", grupo: grupo("SN", "Sin notificación registrada (plazo vencido)", "Resuelto sin fecha de notificación y con el límite vencido: puede ser silencio positivo o una fecha que falta registrar", "#be185d") },
  { codigo: "FP", grupo: grupo("FP", "Resuelto fuera de plazo", "Se resolvió después de la fecha máxima", "#ef4444") },
  { codigo: "SF", grupo: grupo("SF", "Notificado sin fecha", "Pasó a reconsideración o apelación (hubo notificación), pero la 1ª instancia no tiene la fecha de notificación registrada", "#a855f7") },
  { codigo: "AL", grupo: grupo("AL", "Al límite (≤ 3 días)", "Se resolvió con 3 días hábiles o menos de margen antes de la fecha máxima", "#f59e0b") },
  { codigo: "PN", grupo: grupo("PN", "Pendiente de notificar", "Resuelto a tiempo y aún sin notificar, con el límite vigente", "#0ea5e9") },
  { codigo: "EP", grupo: grupo("EP", "En plazo", "Resuelto y notificado a tiempo", "#16a34a") },
  { codigo: "NA", grupo: grupo("NA", "No aplica", "Conciliado o sin fecha de resolución", "#94a3b8") },
];

export function grupoPlazo(reclamo: ReclamoFundadoInfundado): GrupoLeyenda {
  const codigo = String(reclamo.estadoplazo ?? "").trim();
  return (PLAZOS.find((plazo) => plazo.codigo === codigo) ?? PLAZOS[PLAZOS.length - 1]).grupo;
}

export function etiquetaPlazo(reclamo: ReclamoFundadoInfundado): string {
  return grupoPlazo(reclamo).etiqueta;
}

export function estaFueraDePlazo(reclamo: ReclamoFundadoInfundado): boolean {
  const codigo = String(reclamo.estadoplazo ?? "").trim();
  return codigo === "FP" || codigo === "SP" || codigo === "SN";
}

function gravedadPlazo(reclamo: ReclamoFundadoInfundado): number {
  const posicion = PLAZOS.findIndex((plazo) => plazo.grupo === grupoPlazo(reclamo));
  return PLAZOS.length - posicion;
}

// ---------- Notificación ----------

const NOTIFICACIONES: Record<string, GrupoLeyenda> = {
  NO: grupo("NO", "Sin notificar", "La resolución vigente no tiene fecha de notificación", "#f97316"),
  SI: grupo("SI", "Notificado", "La resolución vigente ya se notificó", "#2563eb"),
  NA: grupo("NA", "No aplica", "La conciliación no se notifica", "#94a3b8"),
};

export function grupoNotificacion(reclamo: ReclamoFundadoInfundado): GrupoLeyenda {
  return NOTIFICACIONES[String(reclamo.notificacion ?? "").trim()] ?? NOTIFICACIONES["NA"];
}

export function estaSinNotificar(reclamo: ReclamoFundadoInfundado): boolean {
  return String(reclamo.notificacion ?? "").trim() === "NO";
}

// ---------- Reincidencia ----------

export const MINIMO_REINCIDENTE = 3;

const REINCIDENCIAS: GrupoLeyenda[] = [
  grupo("1", "1 reclamo", "Un solo reclamo en el periodo", "#94a3b8"),
  grupo("2", "2 reclamos", "Dos reclamos en el periodo", "#f59e0b"),
  grupo("3", "3 o más", "Tres o más reclamos en el periodo: la causa no se corrigió", "#b91c1c"),
];

/** Reclamos del cliente en el periodo consultado, como lo cuenta el procedimiento. */
export function reclamosDelClienteEnElPeriodo(reclamo: ReclamoFundadoInfundado): number {
  return Math.max(1, Number(reclamo.reclamoscliente) || 1);
}

export function esReincidente(reclamo: ReclamoFundadoInfundado): boolean {
  return reclamosDelClienteEnElPeriodo(reclamo) >= MINIMO_REINCIDENTE;
}

// ---------- Rebaja ----------

export function etiquetaEnlaceRebaja(reclamo: ReclamoFundadoInfundado): string {
  if (!(Number(reclamo.cantidadrebajas) > 0)) return "";
  return Number(reclamo.rebajaestimada) === 1 ? "Estimado por los meses reclamados" : "Por el número de reclamo";
}

// ---------- Grupo de un cliente en el mapa ----------

/** Color del punto y del lote de un cliente según el modo, a partir de sus reclamos visibles. */
export function grupoDelCliente(modo: ModoPintado, reclamos: ReclamoFundadoInfundado[]): GrupoLeyenda {
  if (modo === "resultado") {
    const hayFundado = reclamos.some(esFundado);
    const hayInfundado = reclamos.some(esInfundado);
    if (hayFundado && hayInfundado) return GRUPO_CLIENTE_CON_AMBOS;
    if (hayFundado) return GRUPO_FUNDADO;
    return hayInfundado ? GRUPO_INFUNDADO : GRUPO_SIN_RESULTADO;
  }
  if (modo === "plazo") {
    const masGrave = reclamos.reduce((elegido, reclamo) => (gravedadPlazo(reclamo) > gravedadPlazo(elegido) ? reclamo : elegido));
    return grupoPlazo(masGrave);
  }
  if (modo === "reincidencia") {
    const cantidad = Math.max(...reclamos.map(reclamosDelClienteEnElPeriodo));
    return REINCIDENCIAS[Math.min(cantidad, MINIMO_REINCIDENTE) - 1];
  }
  if (reclamos.some(estaSinNotificar)) return NOTIFICACIONES["NO"];
  if (reclamos.some((reclamo) => String(reclamo.notificacion ?? "").trim() === "SI")) return NOTIFICACIONES["SI"];
  return NOTIFICACIONES["NA"];
}

/** Grupos de un modo en el orden en que se muestran en la leyenda. */
export function gruposDelModo(modo: ModoPintado): GrupoLeyenda[] {
  if (modo === "resultado") return [GRUPO_FUNDADO, GRUPO_INFUNDADO, GRUPO_CLIENTE_CON_AMBOS, GRUPO_SIN_RESULTADO];
  if (modo === "plazo") return PLAZOS.map((plazo) => plazo.grupo);
  if (modo === "reincidencia") return REINCIDENCIAS;
  return [NOTIFICACIONES["SI"], NOTIFICACIONES["NO"], NOTIFICACIONES["NA"]];
}

// ---------- Mostrar solo ----------

export interface FiltroRapido {
  clave: string;
  nombre: string;
  cumple: (reclamo: ReclamoFundadoInfundado) => boolean;
  /** Filtros que no se pueden combinar con este (fundados e infundados juntos no dejan nada). */
  excluye?: string[];
}

export const FILTROS_RAPIDOS: FiltroRapido[] = [
  { clave: "fundados", nombre: "Fundados", cumple: esFundado, excluye: ["infundados"] },
  { clave: "infundados", nombre: "Infundados", cumple: esInfundado, excluye: ["fundados", "sinrazon", "fundadosinrebaja"] },
  { clave: "fuera", nombre: "Fuera de plazo", cumple: estaFueraDePlazo },
  { clave: "sinnotificacionvencida", nombre: "Sin notificación registrada (vencido)", cumple: (reclamo) => String(reclamo.estadoplazo ?? "").trim() === "SN" },
  { clave: "connulidad", nombre: "Con nulidad", cumple: (reclamo) => Number(reclamo.nulidad) === 1 },
  { clave: "allimite", nombre: "Al límite (≤ 3 días)", cumple: (reclamo) => String(reclamo.estadoplazo ?? "").trim() === "AL" },
  { clave: "reincidentes", nombre: `Reincidentes (${MINIMO_REINCIDENTE} o más)`, cumple: esReincidente },
  { clave: "sinnotificar", nombre: "Sin notificar", cumple: estaSinNotificar },
  { clave: "sinrazon", nombre: "Fundado sin razón registrada", cumple: esFundadoSinRazon, excluye: ["infundados"] },
  { clave: "apelados", nombre: "Apelados", cumple: (reclamo) => String(reclamo.estadorec ?? "").trim() === "009" },
  { clave: "revocados", nombre: "Revocados por el TRASS", cumple: (reclamo) => Number(reclamo.revocado) === 1 },
  { clave: "nofinalizados", nombre: "No finalizados", cumple: (reclamo) => !Number(reclamo.procesado) },
  { clave: "conrebaja", nombre: "Con rebaja", cumple: (reclamo) => Number(reclamo.cantidadrebajas) > 0 },
  { clave: "fundadosinrebaja", nombre: "Fundado sin rebaja", cumple: (reclamo) => esFundado(reclamo) && !(Number(reclamo.cantidadrebajas) > 0), excluye: ["infundados", "conrebaja"] },
];

// ---------- Fechas dd/mm/yyyy del procedimiento ----------

/** Número ordenable (yyyymmdd) de una fecha dd/mm/yyyy; sin fecha vale 0. */
export function fechaOrdenable(fecha: string | null | undefined): number {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(fecha ?? "").trim());
  return partes ? Number(partes[3] + partes[2] + partes[1]) : 0;
}

/** El más reciente primero; si empatan, el de número mayor. */
export function compararMasReciente(primero: ReclamoFundadoInfundado, segundo: ReclamoFundadoInfundado): number {
  return (
    fechaOrdenable(segundo.fecharec) - fechaOrdenable(primero.fecharec) ||
    Number(segundo.nroreclamo ?? 0) - Number(primero.nroreclamo ?? 0)
  );
}
