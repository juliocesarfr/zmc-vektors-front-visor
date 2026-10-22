import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";

/** Grupo de puntos del mapa con su color: estado de servicio, categoría, tipo de cambio… */
export interface GrupoLeyenda {
  clave: string;
  etiqueta: string;
  detalle: string;
  color: string;
  rayado?: boolean;
}

export interface EntradaLeyenda {
  grupo: GrupoLeyenda;
  cantidad: number;
  porcentaje: number;
}

/** Cuenta cuántos registros caen en cada grupo, de mayor a menor. */
export function contarPorGrupo(grupos: GrupoLeyenda[]): EntradaLeyenda[] {
  const conteo = new Map<string, EntradaLeyenda>();
  grupos.forEach((grupo) => {
    const entrada = conteo.get(grupo.clave) ?? { grupo, cantidad: 0, porcentaje: 0 };
    entrada.cantidad++;
    conteo.set(grupo.clave, entrada);
  });
  const total = grupos.length || 1;
  return Array.from(conteo.values())
    .map((entrada) => ({ ...entrada, porcentaje: Math.round((entrada.cantidad / total) * 100) }))
    .sort((primera, segunda) => segunda.cantidad - primera.cantidad);
}

/** Muestra de color como en el GIS: la conexión proyectada va rayada. */
export function fondoMuestra(grupo: GrupoLeyenda): string {
  return grupo.rayado
    ? `repeating-linear-gradient(135deg, ${grupo.color} 0 3px, #1f2937 3px 5px)`
    : grupo.color;
}

/**
 * Leyenda de grupos con cantidad y porcentaje. Clic en una fila filtra el mapa a ese grupo y lo encuadra;
 * otro clic o "Ver todos" vuelve a todos. El panel (fondo y posición) lo pone la pantalla.
 */
@Component({
  selector: "app-leyenda-grupos",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./leyenda-grupos.component.html",
  styleUrls: ["./leyenda-grupos.component.scss"],
})
export class LeyendaGruposComponent implements AfterViewInit, OnDestroy {
  private readonly elemento = inject(ElementRef<HTMLElement>);
  private observadorTamano?: ResizeObserver;

  @Input() titulo = "";
  @Input() icono = "pi pi-palette";
  @Input() subtitulo = "";
  @Input() entradas: EntradaLeyenda[] = [];
  @Input() grupoFiltrado: string | null = null;
  @Input() cargando = false;
  @Input() textoCargando = "cargando…";

  @Output() elegir = new EventEmitter<string>();
  @Output() cerrar = new EventEmitter<void>();

  readonly fondoMuestra = fondoMuestra;

  // La pantalla resta este alto al panel de capas: con pocas filas la leyenda es baja y capas aprovecha el resto.
  ngAfterViewInit(): void {
    const leyenda = this.elemento.nativeElement as HTMLElement;
    const pantalla = leyenda.closest<HTMLElement>(".cd-wrapper");
    if (!pantalla) return;
    this.observadorTamano = new ResizeObserver(() =>
      pantalla.style.setProperty("--alto-leyenda", `${Math.ceil(leyenda.getBoundingClientRect().height)}px`),
    );
    this.observadorTamano.observe(leyenda);
  }

  ngOnDestroy(): void {
    this.observadorTamano?.disconnect();
    (this.elemento.nativeElement as HTMLElement).closest<HTMLElement>(".cd-wrapper")?.style.removeProperty("--alto-leyenda");
  }
}
