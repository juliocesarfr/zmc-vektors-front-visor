import { AfterViewInit, Component, ElementRef, HostListener, Input, OnDestroy, ViewChild } from "@angular/core";
import { DecimalPipe } from "@angular/common";
import { GalleriaModule } from "primeng/galleria";

import { FotoGis } from "../../../core/gis";

// Igual que el visor de fotos de las demás ventanas (VisorImagenesComponent).
const ZOOM_NORMAL = 1;
const ZOOM_MAXIMO = 5;
const PASO_ZOOM_RUEDA = 0.15;
const PASO_ZOOM_BOTON = 0.25;

/** Miniaturas de las fotos de una ficha; al elegir una se abre la galería a pantalla completa, sin salir del mapa. */
@Component({
  selector: "app-galeria-fotos",
  standalone: true,
  imports: [GalleriaModule, DecimalPipe],
  templateUrl: "./galeria-fotos.component.html",
  styleUrls: ["./galeria-fotos.component.scss"],
})
export class GaleriaFotosComponent implements AfterViewInit, OnDestroy {
  @Input() fotos: FotoGis[] = [];

  @ViewChild("visor", { read: ElementRef }) private visor?: ElementRef<HTMLElement>;

  estaAbierta = false;
  indiceActivo = 0;
  zoom = ZOOM_NORMAL;
  rotacion = 0;
  desplazamientoX = 0;
  desplazamientoY = 0;
  estaArrastrando = false;

  private inicioArrastreX = 0;
  private inicioArrastreY = 0;

  get estaAmpliada(): boolean {
    return this.zoom > ZOOM_NORMAL;
  }

  get transformacion(): string {
    return `translate(${this.desplazamientoX}px, ${this.desplazamientoY}px) scale(${this.zoom}) rotate(${this.rotacion}deg)`;
  }

  ngAfterViewInit(): void {
    // Los cuadros del mapa llevan desenfoque de fondo, que encierra dentro de ellos a lo que es de pantalla completa.
    if (this.visor) document.body.appendChild(this.visor.nativeElement);
  }

  ngOnDestroy(): void {
    this.visor?.nativeElement.remove();
  }

  abrir(indice: number): void {
    this.irA(indice);
    this.estaAbierta = true;
  }

  cerrar(): void {
    this.estaAbierta = false;
  }

  irA(indice: number): void {
    this.indiceActivo = indice;
    this.zoom = ZOOM_NORMAL;
    this.rotacion = 0;
    this.centrar();
  }

  acercar(): void {
    this.aplicarZoom(this.zoom + PASO_ZOOM_BOTON);
  }

  alejar(): void {
    this.aplicarZoom(this.zoom - PASO_ZOOM_BOTON);
  }

  rotarIzquierda(): void {
    this.rotacion -= 90;
  }

  rotarDerecha(): void {
    this.rotacion += 90;
  }

  /** Con la rueda se acerca hacia donde apunta el cursor: ese punto de la foto queda quieto bajo el mouse. */
  alGirarRueda(evento: WheelEvent, zonaFoto: HTMLElement): void {
    evento.preventDefault();
    const borde = zonaFoto.getBoundingClientRect();
    const cursorX = evento.clientX - (borde.left + borde.width / 2);
    const cursorY = evento.clientY - (borde.top + borde.height / 2);
    const zoomAnterior = this.zoom;
    this.aplicarZoom(this.zoom + (evento.deltaY < 0 ? PASO_ZOOM_RUEDA : -PASO_ZOOM_RUEDA));
    if (!this.estaAmpliada) return;
    const proporcion = this.zoom / zoomAnterior;
    this.desplazamientoX = cursorX - (cursorX - this.desplazamientoX) * proporcion;
    this.desplazamientoY = cursorY - (cursorY - this.desplazamientoY) * proporcion;
  }

  iniciarArrastre(evento: MouseEvent): void {
    if (!this.estaAmpliada) return;
    this.estaArrastrando = true;
    this.inicioArrastreX = evento.clientX - this.desplazamientoX;
    this.inicioArrastreY = evento.clientY - this.desplazamientoY;
    evento.preventDefault();
  }

  moverArrastre(evento: MouseEvent): void {
    if (!this.estaArrastrando) return;
    this.desplazamientoX = evento.clientX - this.inicioArrastreX;
    this.desplazamientoY = evento.clientY - this.inicioArrastreY;
  }

  terminarArrastre(): void {
    this.estaArrastrando = false;
  }

  @HostListener("document:keydown", ["$event"])
  alPulsarTecla(evento: KeyboardEvent): void {
    if (!this.estaAbierta) return;
    if (evento.key === "Escape") this.cerrar();
    else if (evento.key === "ArrowRight" || evento.key === "ArrowDown") this.avanzar(1);
    else if (evento.key === "ArrowLeft" || evento.key === "ArrowUp") this.avanzar(-1);
    else return;
    evento.preventDefault();
  }

  private aplicarZoom(valor: number): void {
    this.zoom = Math.min(Math.max(valor, ZOOM_NORMAL), ZOOM_MAXIMO);
    // Sin zoom no tiene sentido que la foto quede corrida.
    if (!this.estaAmpliada) this.centrar();
  }

  private centrar(): void {
    this.desplazamientoX = 0;
    this.desplazamientoY = 0;
  }

  private avanzar(pasos: number): void {
    const total = this.fotos.length;
    if (total > 1) this.irA((this.indiceActivo + pasos + total) % total);
  }
}
