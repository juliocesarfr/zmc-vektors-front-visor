import { CommonModule } from "@angular/common";
import { Component, EventEmitter, HostListener, Input, Output } from "@angular/core";

export interface FotoVisor {
  /** Imagen lista para `<img [src]>` (URL o data URI). */
  src: string;
  tiporecepcionimages?: string;
  fechareg?: string;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;

/**
 * Visor de fotos a pantalla completa con zoom, rotación, arrastre y teclado
 * (← → para navegar, Esc para cerrar).
 *
 * Uso: `<app-visor-imagenes [imagenes]="fotos" [(indice)]="indiceFoto" />`
 * Se muestra mientras `indice >= 0`; al cerrarse emite `-1`.
 */
@Component({
  selector: "app-visor-imagenes",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./visor-imagenes.component.html",
  styleUrl: "./visor-imagenes.component.scss",
})
export class VisorImagenesComponent {
  @Input() imagenes: FotoVisor[] = [];

  @Input() set indice(valor: number) {
    this.indiceActual = valor;
    this.reiniciarVista();
  }
  get indice(): number {
    return this.indiceActual;
  }
  @Output() indiceChange = new EventEmitter<number>();

  zoom = 1;
  rotacion = 0;
  desplazamientoX = 0;
  desplazamientoY = 0;
  arrastrando = false;

  private indiceActual = -1;
  private inicioArrastreX = 0;
  private inicioArrastreY = 0;

  get fotoActual(): FotoVisor | null {
    return this.imagenes[this.indiceActual] ?? null;
  }

  get transformacion(): string {
    return `translate(${this.desplazamientoX}px, ${this.desplazamientoY}px) scale(${this.zoom}) rotate(${this.rotacion}deg)`;
  }

  get cursor(): string {
    if (this.zoom <= 1) return "default";
    return this.arrastrando ? "grabbing" : "grab";
  }

  cerrar(): void {
    this.cambiarA(-1);
  }

  siguiente(evento?: Event): void {
    evento?.stopPropagation();
    if (this.imagenes.length === 0) return;
    this.cambiarA((this.indiceActual + 1) % this.imagenes.length);
  }

  anterior(evento?: Event): void {
    evento?.stopPropagation();
    if (this.imagenes.length === 0) return;
    this.cambiarA((this.indiceActual - 1 + this.imagenes.length) % this.imagenes.length);
  }

  @HostListener("document:keydown", ["$event"])
  alPresionarTecla(evento: KeyboardEvent): void {
    if (!this.fotoActual) return;
    if (evento.key === "ArrowRight") this.siguiente();
    else if (evento.key === "ArrowLeft") this.anterior();
    else if (evento.key === "Escape") this.cerrar();
  }

  acercar(): void {
    this.aplicarZoom(this.zoom + 0.25);
  }

  alejar(): void {
    this.aplicarZoom(this.zoom - 0.25);
  }

  alGirarRueda(evento: WheelEvent): void {
    evento.preventDefault();
    this.aplicarZoom(this.zoom + (evento.deltaY < 0 ? 0.15 : -0.15));
  }

  rotarIzquierda(): void {
    this.rotacion -= 90;
  }

  rotarDerecha(): void {
    this.rotacion += 90;
  }

  iniciarArrastre(evento: MouseEvent): void {
    if (this.zoom <= 1) return;
    this.arrastrando = true;
    this.inicioArrastreX = evento.clientX - this.desplazamientoX;
    this.inicioArrastreY = evento.clientY - this.desplazamientoY;
    evento.preventDefault();
  }

  moverArrastre(evento: MouseEvent): void {
    if (!this.arrastrando || this.zoom <= 1) return;
    this.desplazamientoX = evento.clientX - this.inicioArrastreX;
    this.desplazamientoY = evento.clientY - this.inicioArrastreY;
  }

  terminarArrastre(): void {
    this.arrastrando = false;
  }

  private cambiarA(indice: number): void {
    this.indice = indice;
    this.indiceChange.emit(indice);
  }

  private aplicarZoom(valor: number): void {
    this.zoom = Math.min(Math.max(valor, ZOOM_MIN), ZOOM_MAX);
    // Sin zoom no tiene sentido que la foto quede corrida.
    if (this.zoom <= 1) this.centrar();
  }

  private reiniciarVista(): void {
    this.zoom = 1;
    this.rotacion = 0;
    this.centrar();
  }

  private centrar(): void {
    this.desplazamientoX = 0;
    this.desplazamientoY = 0;
  }
}
