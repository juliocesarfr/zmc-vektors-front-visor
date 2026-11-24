import { AfterViewInit, Component, ElementRef, HostListener, Input, OnDestroy, ViewChild } from "@angular/core";
import { GalleriaModule } from "primeng/galleria";

import { FotoGis } from "../../../core/gis";

const ORIGEN_ZOOM_AL_CENTRO = "50% 50%";

/** Miniaturas de las fotos de una ficha; al elegir una se abre la galería a pantalla completa, sin salir del mapa. */
@Component({
  selector: "app-galeria-fotos",
  standalone: true,
  imports: [GalleriaModule],
  templateUrl: "./galeria-fotos.component.html",
  styleUrls: ["./galeria-fotos.component.scss"],
})
export class GaleriaFotosComponent implements AfterViewInit, OnDestroy {
  @Input() fotos: FotoGis[] = [];

  @ViewChild("visor", { read: ElementRef }) private visor?: ElementRef<HTMLElement>;

  estaAbierta = false;
  indiceActivo = 0;
  /** La foto se ve ampliada y sigue al cursor, para leer el medidor o el número de la puerta. */
  estaAmpliada = false;
  origenZoom = ORIGEN_ZOOM_AL_CENTRO;

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
    this.estaAmpliada = false;
    this.origenZoom = ORIGEN_ZOOM_AL_CENTRO;
  }

  alternarZoom(evento: MouseEvent): void {
    evento.stopPropagation();
    this.estaAmpliada = !this.estaAmpliada;
    this.moverZoom(evento);
  }

  moverZoom(evento: MouseEvent): void {
    if (!this.estaAmpliada) return;
    const marco = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    const horizontal = ((evento.clientX - marco.left) / marco.width) * 100;
    const vertical = ((evento.clientY - marco.top) / marco.height) * 100;
    this.origenZoom = `${horizontal}% ${vertical}%`;
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

  private avanzar(pasos: number): void {
    const total = this.fotos.length;
    if (total > 1) this.irA((this.indiceActivo + pasos + total) % total);
  }
}
