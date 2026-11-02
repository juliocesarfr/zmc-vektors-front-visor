import { CommonModule } from "@angular/common";
import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, inject } from "@angular/core";
import OlMap from "ol/Map";
import BaseLayer from "ol/layer/Base";
import LayerGroup from "ol/layer/Group";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import TileWMS from "ol/source/TileWMS";
import XYZ from "ol/source/XYZ";
import { containsCoordinate } from "ol/extent";
import { transformExtent } from "ol/proj";

import { CapaConsultable, GisConfigService, WGS84 } from "../../../core/gis";
import { crearCapaOrtofoto, crearCapaSatelital, crearCapaWms } from "../../mapa/capas";

export interface CapaBaseUi {
  id: string;
  label: string;
  iconUrl: string;
}

/** Cómo se dibuja la capa en el mapa, para mostrar su símbolo junto al nombre. */
export interface SimboloCapaUi {
  forma: "punto" | "rombo" | "linea" | "area";
  color: string;
}

export interface CapaSwitchUi {
  id: string;
  label: string;
  active: boolean;
  simbolo?: SimboloCapaUi;
}

// La leyenda de GeoServer no sirve aquí: varias capas traen estilos genéricos o bordes negros que no se ven sobre el panel.
const SIMBOLOS_TECNICOS: Record<string, SimboloCapaUi> = {
  fuentes: { forma: "punto", color: "#06b6d4" },
  tuberiasAgua: { forma: "linea", color: "#3b82f6" },
  tuberiasAlcantarillado: { forma: "linea", color: "#b7791f" },
  valvulas: { forma: "rombo", color: "#f43f5e" },
  curvasNivel: { forma: "linea", color: "#a3a3a3" },
  nodosAlcantarillado: { forma: "punto", color: "#d97706" },
  sectoresOperacionales: { forma: "area", color: "#0d9488" },
  presiones: { forma: "punto", color: "#9333ea" },
};

type ClaseCapas = "comerciales" | "tecnicas";

const TECLA_PANEL = "c";

@Component({
  selector: "app-capas-sidebar",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./capas-sidebar.component.html",
  styleUrls: ["./capas-sidebar.component.scss"],
})
export class CapasSidebarComponent implements OnChanges {
  private readonly gis = inject(GisConfigService);

  @Input() baseLayers: CapaBaseUi[] = [];
  @Input() baseActive: string | null = null;

  @Input() commercialLayers: CapaSwitchUi[] = [];
  @Input() tituloComerciales = "Capas comerciales";

  @Input() tituloTecnicas = "Capas técnicas";

  @Input() abierto = true;

  @Output() baseLayerChange = new EventEmitter<string>();
  @Output() layerToggle = new EventEmitter<CapaSwitchUi>();
  @Output() abiertoChange = new EventEmitter<boolean>();

  // Las técnicas las maneja el propio panel a partir de `capasTecnicas` de la EPS.
  readonly technicalLayers: CapaSwitchUi[] = this.gis.capasTecnicasParaUi().map((capa) => ({
    id: capa.id,
    label: capa.label,
    active: false,
    simbolo: SIMBOLOS_TECNICOS[capa.id],
  }));

  // Las fotos de dron de la EPS se suman a los fondos que manda la pantalla; el panel las dibuja y las prende.
  readonly basesOrtofoto: CapaBaseUi[] = this.gis.ortofotos.map((ortofoto) => ({
    id: ortofoto.id,
    label: ortofoto.etiqueta,
    iconUrl: "",
  }));

  readonly clasesPlegadas = new Set<ClaseCapas>();

  private mapa?: OlMap;
  private readonly capasOrtofoto = new Map<string, LayerGroup>();

  private readonly capasTecnicas = new Map<string, TileLayer<TileWMS>>();

  get cantidadActivas(): number {
    return this.contarActivas(this.commercialLayers) + this.contarActivas(this.technicalLayers);
  }

  contarActivas(capas: CapaSwitchUi[]): number {
    return capas.filter((capa) => capa.active).length;
  }

  /** Agrega las capas técnicas al mapa de la pantalla, justo encima del fondo. */
  conectarMapa(map: OlMap): void {
    const capas = map.getLayers();
    let indice = 0;
    while (indice < capas.getLength() && this.esFondo(capas.item(indice))) {
      indice++;
    }

    for (const ortofoto of this.gis.ortofotos) {
      const extension = transformExtent(ortofoto.extension, WGS84, map.getView().getProjection());
      const foto = crearCapaOrtofoto(this.gis.urlWms(), ortofoto.capa, extension);
      // El vuelo cubre solo una parte: alrededor se ve el satelital en vez de un fondo en blanco.
      const grupo = new LayerGroup({ layers: [crearCapaSatelital(true), foto], visible: false });
      this.capasOrtofoto.set(ortofoto.id, grupo);
      capas.insertAt(indice++, grupo);
    }

    for (const c of this.gis.capasTecnicasParaUi()) {
      const capa = crearCapaWms(this.gis.urlWms(), c.capa, false, 1, this.gis.sldCapa(c.id));
      this.capasTecnicas.set(c.id, capa);
      capas.insertAt(indice++, capa);
    }

    this.mapa = map;
    this.mostrarOrtofoto();
  }

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios["baseActive"]) this.mostrarOrtofoto();
  }

  // Cada pantalla prende solo OSM o satelital: al elegir una ortofoto apaga ambos y aquí se prende la foto.
  private mostrarOrtofoto(): void {
    for (const [id, grupo] of this.capasOrtofoto) grupo.setVisible(id === this.baseActive);

    const ortofoto = this.gis.ortofotos.find((foto) => foto.id === this.baseActive);
    const vista = this.mapa?.getView();
    if (!ortofoto || !vista) return;
    const extension = transformExtent(ortofoto.extension, WGS84, vista.getProjection());
    const centro = vista.getCenter();
    if (!centro || !containsCoordinate(extension, centro)) vista.fit(extension, { duration: 400 });
  }

  capasTecnicasConsultables(): CapaConsultable[] {
    return Array.from(this.capasTecnicas, ([rol, capa]) => ({ rol, capa }));
  }

  toggleTecnica(capa: CapaSwitchUi): void {
    capa.active = !capa.active;
    this.capasTecnicas.get(capa.id)?.setVisible(capa.active);
  }

  apagarTecnicas(): void {
    for (const capa of this.technicalLayers) {
      if (capa.active) this.toggleTecnica(capa);
    }
  }

  alternarCapa(capa: CapaSwitchUi, clase: ClaseCapas): void {
    if (clase === "tecnicas") this.toggleTecnica(capa);
    else this.layerToggle.emit(capa);
  }

  plegarClase(clase: ClaseCapas): void {
    if (this.clasesPlegadas.has(clase)) this.clasesPlegadas.delete(clase);
    else this.clasesPlegadas.add(clase);
  }

  togglePanel(): void {
    this.abierto = !this.abierto;
    this.abiertoChange.emit(this.abierto);
  }

  @HostListener("document:keydown", ["$event"])
  alPresionarTecla(evento: KeyboardEvent): void {
    if (evento.key.toLowerCase() !== TECLA_PANEL || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    const enfocado = document.activeElement as HTMLElement | null;
    const escribiendo =
      !!enfocado &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(enfocado.tagName) || enfocado.isContentEditable);
    if (escribiendo) return;
    this.togglePanel();
  }

  private esFondo(capa: BaseLayer): boolean {
    if (capa instanceof LayerGroup) return true;
    const fuente = capa instanceof TileLayer ? capa.getSource() : null;
    return fuente instanceof OSM || fuente instanceof XYZ;
  }
}
