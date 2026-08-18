import {
  GisEpsConfig,
  GisProyeccionesConfig,
  GisVistaConfig,
} from "./gis-config.model";
import {
  PROYECCION_MAPA_DEFECTO,
  PROYECCION_UTM_DEFECTO,
} from "./gis-proyeccion";

export const PROYECCIONES_POR_DEFECTO: GisProyeccionesConfig = {
  mapa: PROYECCION_MAPA_DEFECTO,
  utm: PROYECCION_UTM_DEFECTO,
};


export const CONFIG_EPS: Record<string, GisEpsConfig> = {
  "004": {
    ccodeps: "004",
    descripcion: "EPS Yurimaguas",
    geoserver: {
      baseUrl: "http://167.88.36.54:8085/geoserver",
      workspace: "eps_yurimaguas",
    },
    capas: {
      lotes: "emapa_sig_lotes",
      lotesPorSector: "emapa_sig_lotes_sector_{sector}",
      sectoresComerciales: "emapa_sig_sectores_comerciales",
      calles: "emapa_sig_calles",
      usuarios: "usuarios",
      acometidaAgua: "acometida_agua",
      acometidaAlcantarillado: "acometida_alcantarillado",
      fichaAgua: "emapa_ficha_agua",
      fichaAlcantarillado: "emapa_ficha_alcantarillado",
    },
    vista: {
      centro: [-76.1223, -5.9018],
      zoom: 18,
    },
    proyecciones: {
      mapa: "EPSG:4326",
      utm: "EPSG:32718", // UTM 18S
    },
  },
  "016": {
    ccodeps: "016",
    descripcion: "EPS emapa",
    geoserver: {
      baseUrl: "https://167.88.36.54/geoserver",
      workspace: "emapa",
    },
    capas: {
      lotes: "lotes_clientes",
      lotesPorSector: "fcom_sector_{sector}",
      sectoresComerciales: "fcom_sector",
      calles: "sm_sig_calles",
      usuarios: "v_com_fichas_catastrales",
      acometidaAgua: "sm_sig_acometidas_ap",
      acometidaAlcantarillado: "sm_sig_acometidas_al",
      fichaAgua: "emapa_ficha_agua",
      fichaAlcantarillado: "emapa_ficha_alcantarillado",
    },
    vista: {
      centro: [-76.3654, -6.4886],
      zoom: 18,
    },
    proyecciones: {
      mapa: "EPSG:4326",
      utm: "EPSG:32718", // UTM 18S
    },
  },
};

export const ZOOM_POR_DEFECTO = 18;

/**
 * Vista neutra (Perú completo). Solo se usa cuando ni la EPS ni la empresa
 * declaran coordenadas: encuadrar sobre la ciudad de otra EPS sería mentirle
 * al usuario sobre dónde está mirando.
 */
export const VISTA_POR_DEFECTO: GisVistaConfig = {
  centro: [-75.0152, -9.19],
  zoom: 5,
};

/**
 * Configuración para una EPS que todavía no tiene entrada en `CONFIG_EPS`.
 *
 * Conserva el GeoServer que reporta el backend (`paramae/URLGIS`) para que las
 * URLs se construyan bien, pero deja el catálogo de capas **vacío**: como los
 * nombres no se pueden deducir, es preferible no dibujar capas a dibujar las de
 * otra EPS.
 */
export function configSinCapas(
  ccodeps: string,
  baseUrl: string,
  workspace: string,
): GisEpsConfig {
  return {
    ccodeps,
    descripcion: ccodeps ? `EPS ${ccodeps}` : "EPS sin identificar",
    geoserver: { baseUrl, workspace },
    capas: {},
    proyecciones: PROYECCIONES_POR_DEFECTO,
  };
}
