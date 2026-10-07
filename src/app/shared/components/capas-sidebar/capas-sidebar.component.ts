import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, inject } from "@angular/core";
import OlMap from "ol/Map";
import BaseLayer from "ol/layer/Base";
import LayerGroup from "ol/layer/Group";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import TileWMS from "ol/source/TileWMS";
import XYZ from "ol/source/XYZ";

import { CapaConsultable, GisConfigService } from "../../../core/gis";
import { crearCapaWms } from "../../mapa/capas";

export interface CapaBaseUi {
  id: string;
  label: string;
  iconUrl: string;
}

export interface CapaSwitchUi {
  id: string;
  label: string;
  active: boolean;
}

@Component({
  selector: "app-capas-sidebar",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./capas-sidebar.component.html",
  styleUrls: ["./capas-sidebar.component.scss"],
})
export class CapasSidebarComponent {
  private readonly gis = inject(GisConfigService);

  @Input() baseLayers: CapaBaseUi[] = [];
  @Input() baseActive: string | null = null;

  @Input() commercialLayers: CapaSwitchUi[] = [];
  @Input() tituloComerciales = "CAPAS COMERCIALES";

  @Input() tituloTecnicas = "CAPAS TÉCNICAS";

  @Input() abierto = true;

  @Output() baseLayerChange = new EventEmitter<string>();
  @Output() layerToggle = new EventEmitter<CapaSwitchUi>();
  @Output() abiertoChange = new EventEmitter<boolean>();

  // Las técnicas las maneja el propio panel a partir de `capasTecnicas` de la EPS.
  readonly technicalLayers: CapaSwitchUi[] = this.gis
    .capasTecnicasParaUi()
    .map((c) => ({ id: c.id, label: c.label, active: false }));

  private readonly capasTecnicas = new Map<string, TileLayer<TileWMS>>();

  /** Agrega las capas técnicas al mapa de la pantalla, justo encima del fondo. */
  conectarMapa(map: OlMap): void {
    const capas = map.getLayers();
    let indice = 0;
    while (indice < capas.getLength() && this.esFondo(capas.item(indice))) {
      indice++;
    }

    for (const c of this.gis.capasTecnicasParaUi()) {
      const capa = crearCapaWms(this.gis.urlWms(), c.capa, false);
      this.capasTecnicas.set(c.id, capa);
      capas.insertAt(indice++, capa);
    }
  }

  capasTecnicasConsultables(): CapaConsultable[] {
    return Array.from(this.capasTecnicas, ([rol, capa]) => ({ rol, capa }));
  }

  toggleTecnica(capa: CapaSwitchUi): void {
    capa.active = !capa.active;
    this.capasTecnicas.get(capa.id)?.setVisible(capa.active);
  }

  togglePanel(): void {
    this.abierto = !this.abierto;
    this.abiertoChange.emit(this.abierto);
  }

  private esFondo(capa: BaseLayer): boolean {
    if (capa instanceof LayerGroup) return true;
    const fuente = capa instanceof TileLayer ? capa.getSource() : null;
    return fuente instanceof OSM || fuente instanceof XYZ;
  }
}
