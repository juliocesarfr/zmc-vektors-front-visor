import { Component, Input, OnChanges, OnDestroy, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { Subscription } from "rxjs";

import { ConsultaCapasGisService, FotoGis } from "../../../core/gis";
import { GaleriaFotosComponent } from "../galeria-fotos/galeria-fotos.component";

/**
 * Fotos de la ficha catastral de un cliente (fachada, medidor, tapas) con el enlace que publica GeoServer.
 * Va en el cuadro del cliente de cada pantalla del mapa; si la EPS no declara fotos, no muestra nada.
 */
@Component({
  selector: "app-fotos-ficha-cliente",
  standalone: true,
  imports: [CommonModule, GaleriaFotosComponent],
  templateUrl: "./fotos-ficha-cliente.component.html",
  styleUrls: ["./fotos-ficha-cliente.component.scss"],
})
export class FotosFichaClienteComponent implements OnChanges, OnDestroy {
  @Input() codcliente: unknown;

  private readonly consulta = inject(ConsultaCapasGisService);

  fotos: FotoGis[] = [];
  estaCargando = false;
  private peticion?: Subscription;

  ngOnChanges(): void {
    this.peticion?.unsubscribe();
    this.fotos = [];
    const codigo = String(this.codcliente ?? "").trim();
    if (!codigo) {
      this.estaCargando = false;
      return;
    }
    this.estaCargando = true;
    this.peticion = this.consulta.fotosDeCliente(codigo).subscribe((fotos) => {
      this.fotos = fotos;
      this.estaCargando = false;
    });
  }

  ngOnDestroy(): void {
    this.peticion?.unsubscribe();
  }
}
