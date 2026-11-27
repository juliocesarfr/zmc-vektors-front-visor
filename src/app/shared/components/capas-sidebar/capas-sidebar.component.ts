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

import {
  CapaConsultable,
  ConsultaCapasGisService,
  GisConfigService,
  ValorFiltroCapa,
  WGS84,
  condicionCql,
} from "../../../core/gis";
import { crearCapaOrtofoto, crearCapaSatelital, crearCapaWms } from "../../mapa/capas";
import { COLORES_LECTURA, COLOR_FICHA_AGUA, COLOR_FICHA_ALCANTARILLADO } from "../../constantes/colores-mapa";

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

/** Selector de una columna de la capa: se llena con los valores que la capa tiene en GeoServer. */
export interface FiltroCapaUi {
  campo: string;
  etiqueta: string;
  opciones: ValorFiltroCapa[];
  /** Posición en `opciones` del valor elegido; `null` = todos. */
  elegido: number | null;
  cargando: boolean;
}

// La leyenda de GeoServer no sirve aquí: varias capas traen estilos genéricos o bordes negros que no se ven sobre el panel.
const SIMBOLOS_TECNICOS: Record<string, SimboloCapaUi> = {
  fuentes: { forma: "punto", color: "#06b6d4" },
  tuberiasAgua: { forma: "linea", color: "#3b82f6" },
  tuberiasAlcantarillado: { forma: "linea", color: "#b7791f" },
  valvulas: { forma: "rombo", color: "#f43f5e" },
  curvasNivel: { forma: "linea", color: "#a3a3a3" },
  // En GeoServer cada accesorio tiene su color: aquí va el de la tee, que es el más común.
  nodosAgua: { forma: "punto", color: "#1976d2" },
  nodosAlcantarillado: { forma: "punto", color: "#d97706" },
  sectoresOperacionales: { forma: "area", color: "#0d9488" },
  presiones: { forma: "punto", color: "#9333ea" },
};

// Las ventanas que no mandan el símbolo de una capa comercial toman este, el mismo de la pantalla principal.
const SIMBOLOS_COMERCIALES: Record<string, SimboloCapaUi> = {
  usuarios: { forma: "punto", color: COLORES_LECTURA.normal },
  lotes: { forma: "area", color: "#cbd5e1" },
  lotes_usuario: { forma: "area", color: "#f59e0b" },
  caja_agua: { forma: "rombo", color: COLOR_FICHA_AGUA },
  acometida: { forma: "linea", color: COLOR_FICHA_AGUA },
  acometida_agua: { forma: "linea", color: COLOR_FICHA_AGUA },
  ficha_alc: { forma: "rombo", color: COLOR_FICHA_ALCANTARILLADO },
  acc_alc: { forma: "linea", color: COLOR_FICHA_ALCANTARILLADO },
  centroideFicha: { forma: "punto", color: "#16a34a" },
  sectores: { forma: "area", color: "#a78bfa" },
  manzanas: { forma: "area", color: "#aaaaaa" },
  calles: { forma: "linea", color: "#cbd5e1" },
  rutaLectura: { forma: "linea", color: "#cba029" },
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
  private readonly consultaCapasGis = inject(ConsultaCapasGisService);

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
    simbolo: this.gis.simboloCapa(capa.id) ?? SIMBOLOS_TECNICOS[capa.id],
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

  /** Filtros de cada capa técnica; se crean al prenderla por primera vez. */
  private readonly filtrosPorCapa = new Map<string, FiltroCapaUi[]>();

  simboloDe(capa: CapaSwitchUi): SimboloCapaUi | undefined {
    return capa.simbolo ?? SIMBOLOS_COMERCIALES[capa.id];
  }

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
    if (capa.active) this.cargarFiltros(capa.id);
  }

  filtrosDe(capa: CapaSwitchUi): FiltroCapaUi[] {
    return this.filtrosPorCapa.get(capa.id) ?? [];
  }

  // Los valores se piden recién al prender la capa: la mayoría de las veces no se usan todas.
  private cargarFiltros(idCapa: string): void {
    if (this.filtrosPorCapa.has(idCapa)) return;
    const filtros: FiltroCapaUi[] = this.gis
      .filtrosCapa(idCapa)
      .map((filtro) => ({ ...filtro, opciones: [], elegido: null, cargando: true }));
    this.filtrosPorCapa.set(idCapa, filtros);

    for (const filtro of filtros) {
      this.consultaCapasGis.valoresDeCampo(idCapa, filtro.campo).subscribe((opciones) => {
        filtro.opciones = opciones;
        filtro.cargando = false;
      });
    }
  }

  /** `posicion` vacía = todos. Los filtros de una misma capa se suman (tipo Y material). */
  elegirFiltro(capa: CapaSwitchUi, filtro: FiltroCapaUi, posicion: string): void {
    filtro.elegido = posicion === "" ? null : Number(posicion);
    const condiciones = this.filtrosDe(capa)
      .filter((otro) => otro.elegido !== null && otro.opciones[otro.elegido])
      .map((otro) => condicionCql(otro.campo, otro.opciones[otro.elegido!]));
    // Sin condiciones el parámetro va como undefined y OpenLayers no lo manda: la capa vuelve a verse entera.
    this.capasTecnicas
      .get(capa.id)
      ?.getSource()
      ?.updateParams({ CQL_FILTER: condiciones.length > 0 ? condiciones.join(" AND ") : undefined });
  }

  apagarTecnicas(): void {
    for (const capa of this.technicalLayers) {
      if (capa.active) this.toggleTecnica(capa);
    }
  }

  /** Apaga todas las capas comerciales y técnicas activas y restablece sus filtros. */
  limpiarCapas(): void {
    for (const capa of this.commercialLayers) {
      if (capa.active) this.layerToggle.emit(capa);
    }
    this.apagarTecnicas();
    for (const [idCapa, filtros] of this.filtrosPorCapa) {
      let habiaFiltro = false;
      for (const filtro of filtros) {
        if (filtro.elegido !== null) {
          filtro.elegido = null;
          habiaFiltro = true;
        }
      }
      if (habiaFiltro) {
        this.capasTecnicas.get(idCapa)?.getSource()?.updateParams({ CQL_FILTER: undefined });
      }
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
