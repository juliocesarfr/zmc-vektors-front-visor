import { ReclamoPrimeraInstancia } from "@host/_models/vektors/Reclamos/ReclamosPrimeraInstancia";
import { GrupoLeyenda } from "../../../shared/components/leyenda-grupos/leyenda-grupos.component";

const COLORES_ESTADO = [
  "#1f77d0",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#8a2be2",
  "#14b8a6",
  "#ec4899",
  "#a16207",
  "#0ea5e9",
  "#64748b",
];

const COLOR_SIN_ESTADO = "#94a3b8";

/**
 * Agrupa los reclamos por su estado para la leyenda y los colores del mapa. Los estados salen de
 * lo que devuelve el procedimiento (no hay una lista fija): cada estado nuevo toma el siguiente color.
 */
export class GruposEstadoReclamo {
  private readonly grupos = new Map<string, GrupoLeyenda>();

  grupoDe(registro: ReclamoPrimeraInstancia): GrupoLeyenda {
    const codigo = String(registro?.estadorec ?? "").trim();
    const descripcion = String(registro?.estadoreclamo ?? "").trim();
    const clave = codigo || descripcion || "sin-estado";

    let grupo = this.grupos.get(clave);
    if (!grupo) {
      const sinEstado = !codigo && !descripcion;
      grupo = {
        clave,
        etiqueta: descripcion || codigo || "Sin estado",
        detalle: "",
        color: sinEstado ? COLOR_SIN_ESTADO : COLORES_ESTADO[this.grupos.size % COLORES_ESTADO.length],
      };
      this.grupos.set(clave, grupo);
    }
    return grupo;
  }
}
