import { TipoModificacionCatastral } from "@host/_models/vektors/Catastro/FiltroModificacionesCatastralesRequest";
import { GrupoLeyenda } from "../../../shared/components/leyenda-grupos/leyenda-grupos.component";

/** Grupo de la leyenda al que pertenece una modificación; define el color del punto y del lote. */
export type ClaseModificacion = GrupoLeyenda;

const COLORES_CATEGORIA: Record<string, string> = {
  DOMESTICO: "#22c55e",
  COMERCIAL: "#3b82f6",
  INDUSTRIAL: "#f97316",
  SOCIAL: "#a855f7",
  ESTATAL: "#ef4444",
};

const NOMBRES_CATEGORIA: Record<string, string> = {
  DOMESTICO: "Doméstico",
  COMERCIAL: "Comercial",
  INDUSTRIAL: "Industrial",
  SOCIAL: "Social",
  ESTATAL: "Estatal",
};

// Para categorías que no están arriba (cada EPS nombra las suyas).
const COLORES_DE_RESPALDO = ["#14b8a6", "#eab308", "#ec4899", "#8b5cf6", "#06b6d4", "#84cc16"];

const CLASES_UNIDADES: Record<"aumento" | "disminucion" | "cambioUso", ClaseModificacion> = {
  aumento: { clave: "aumento", etiqueta: "Aumentaron unidades", detalle: "Más unidades que antes", color: "#22c55e" },
  disminucion: { clave: "disminucion", etiqueta: "Disminuyeron unidades", detalle: "Menos unidades que antes", color: "#ef4444" },
  cambioUso: { clave: "cambioUso", etiqueta: "Cambió el uso", detalle: "Mismo total, otro reparto", color: "#eab308" },
};

const CLASES_NOMBRE: Record<"nuevoTitular" | "correccion", ClaseModificacion> = {
  nuevoTitular: { clave: "nuevoTitular", etiqueta: "Nuevo titular", detalle: "El nombre cambió por completo", color: "#ec4899" },
  correccion: { clave: "correccion", etiqueta: "Corrección del nombre", detalle: "Comparte la mayoría de palabras", color: "#38bdf8" },
};

// Mitad o más de las palabras en común: es el mismo titular con el nombre corregido.
const PROPORCION_MINIMA_CORRECCION = 0.5;

function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function colorDeCategoria(categoria: string): string {
  if (COLORES_CATEGORIA[categoria]) return COLORES_CATEGORIA[categoria];
  const indice = [...categoria].reduce((suma, letra) => suma + letra.charCodeAt(0), 0) % COLORES_DE_RESPALDO.length;
  return COLORES_DE_RESPALDO[indice];
}

/** "2 DOM 1 COM" → 3. */
function totalUnidades(texto: unknown): number {
  return [...String(texto ?? "").matchAll(/(\d+)\s*[A-Z]+/gi)].reduce((suma, parte) => suma + Number(parte[1]), 0);
}

function nombreDeCategoria(categoria: string): string {
  return NOMBRES_CATEGORIA[categoria] ?? categoria.charAt(0) + categoria.slice(1).toLowerCase();
}

function claseCategoria(registro: Record<string, unknown>): ClaseModificacion {
  const nueva = normalizar(registro["valorultimo"]) || "SIN CATEGORIA";
  return { clave: nueva, etiqueta: nombreDeCategoria(nueva), detalle: "Categoría nueva", color: colorDeCategoria(nueva) };
}

// En unidades el procedimiento deja lo anterior en valoractual y lo nuevo en valorultimo.
function claseUnidades(registro: Record<string, unknown>): ClaseModificacion {
  const antes = totalUnidades(registro["valoractual"]);
  const despues = totalUnidades(registro["valorultimo"]);
  if (despues > antes) return CLASES_UNIDADES.aumento;
  if (despues < antes) return CLASES_UNIDADES.disminucion;
  return CLASES_UNIDADES.cambioUso;
}

function claseNombre(registro: Record<string, unknown>): ClaseModificacion {
  const anterior = new Set(normalizar(registro["valoractual"]).split(" ").filter(Boolean));
  const nuevo = new Set(normalizar(registro["valorultimo"]).split(" ").filter(Boolean));
  const menor = Math.min(anterior.size, nuevo.size);
  if (menor === 0) return CLASES_NOMBRE.nuevoTitular;
  const comunes = [...nuevo].filter((palabra) => anterior.has(palabra)).length;
  return comunes / menor >= PROPORCION_MINIMA_CORRECCION ? CLASES_NOMBRE.correccion : CLASES_NOMBRE.nuevoTitular;
}

export function clasificarModificacion(
  tipo: TipoModificacionCatastral,
  registro: Record<string, unknown>,
): ClaseModificacion {
  if (tipo === "unidades") return claseUnidades(registro);
  if (tipo === "propietario") return claseNombre(registro);
  return claseCategoria(registro);
}
