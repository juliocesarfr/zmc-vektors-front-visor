import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import Polygon from "ol/geom/Polygon";
import MultiPolygon from "ol/geom/MultiPolygon";
import type { Coordinate } from "ol/coordinate";

import { ElementoGis } from "../../../core/gis";
import type { ControladorMapaGis } from "../../mapa/controlador-mapa-gis";
import { FilaListado } from "../../utils/listado-excel";
import { GaleriaFotosComponent } from "../galeria-fotos/galeria-fotos.component";

const LARGO_VALOR_FILA_COMPLETA = 26;

/** Ficha de un elemento de GeoServer (válvula, tubería, lote…) consultado al hacer clic en el mapa. */
@Component({
  selector: "app-mapa-popup-gis",
  standalone: true,
  imports: [CommonModule, GaleriaFotosComponent],
  templateUrl: "./mapa-popup-gis.component.html",
  styleUrls: ["./mapa-popup-gis.component.scss"],
})
export class MapaPopupGisComponent implements OnChanges, OnDestroy {
  @Input() elementos: ElementoGis[] = [];
  /** Mapa de la pantalla: sus clientes cargados con «Filtrar datos» y la capa donde se marcan los del área. */
  @Input() controlador?: ControladorMapaGis;

  @Output() cerrar = new EventEmitter<void>();
  /** Para resaltar en el mapa el elemento de la pestaña elegida. */
  @Output() elementoActivoCambia = new EventEmitter<ElementoGis>();

  indiceActivo = 0;
  /** Clientes cargados dentro del área activa; `null` si no es un área o la pantalla no cargó clientes. */
  cantidadClientes: number | null = null;
  /** La pantalla todavía no cargó clientes con «Filtrar datos». */
  faltaCargarClientes = false;
  estanEnMapa = false;
  estaDescargando = false;
  mensajeDescarga = "";

  private filas: FilaListado[] = [];
  private coordenadas: Coordinate[] = [];

  get elementoActivo(): ElementoGis | undefined {
    return this.elementos[this.indiceActivo];
  }

  /** Solo un área (sector, manzana, lote…) tiene clientes "dentro". */
  get esArea(): boolean {
    const geometria = this.elementoActivo?.geometria;
    return !!this.controlador && (geometria instanceof Polygon || geometria instanceof MultiPolygon);
  }

  ngOnChanges(): void {
    this.indiceActivo = 0;
    this.buscarClientesDentro();
  }

  ngOnDestroy(): void {
    this.controlador?.quitarPuntosEnArea();
  }

  seleccionarElemento(indice: number): void {
    this.indiceActivo = indice;
    this.buscarClientesDentro();
    this.elementoActivoCambia.emit(this.elementos[indice]);
  }

  ocupaFilaCompleta(valor: string): boolean {
    return valor.length > LARGO_VALOR_FILA_COMPLETA;
  }

  // Se usan los clientes que la pantalla cargó con «Filtrar datos»: son los que el usuario ve en el mapa.
  private buscarClientesDentro(): void {
    this.mensajeDescarga = "";
    this.cantidadClientes = null;
    this.faltaCargarClientes = false;
    this.estanEnMapa = false;
    this.filas = [];
    this.coordenadas = [];
    this.controlador?.quitarPuntosEnArea();

    const geometria = this.elementoActivo?.geometria;
    if (!this.esArea || !geometria) return;
    const cargados = this.controlador!.clientesCargadosEn(geometria);
    if (!cargados) {
      this.faltaCargarClientes = true;
      return;
    }
    this.filas = cargados.filas;
    this.coordenadas = cargados.coordenadas;
    this.cantidadClientes = cargados.filas.length;
  }

  /** Marca en el mapa los clientes del área, para comprobarlos antes de descargarlos. */
  alternarEnMapa(): void {
    if (!this.controlador) return;
    if (this.estanEnMapa) {
      this.controlador.quitarPuntosEnArea();
    } else {
      this.controlador.mostrarPuntosEnArea(this.coordenadas);
    }
    this.estanEnMapa = !this.estanEnMapa;
  }

  async descargarClientes(): Promise<void> {
    const elemento = this.elementoActivo;
    if (!elemento || !this.controlador || this.estaDescargando || this.filas.length === 0) return;
    this.estaDescargando = true;
    this.mensajeDescarga = "";
    try {
      await this.controlador.descargarClientesCargados(
        this.filas,
        `CLIENTES DENTRO DE ${elemento.capa.toUpperCase()} ${elemento.titulo}`,
        `${elemento.capa}: ${elemento.titulo}`,
      );
      this.mensajeDescarga = `Se descargaron ${this.filas.length} clientes.`;
    } catch (error) {
      console.warn("[GIS] No se pudieron descargar los clientes del área.", error);
      this.mensajeDescarga = "No se pudieron descargar los clientes. Intente de nuevo.";
    } finally {
      this.estaDescargando = false;
    }
  }
}
