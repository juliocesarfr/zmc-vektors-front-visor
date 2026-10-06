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
      lotes: "yurimaguas_sig_lotes",
      lotesPorSector: "yurimaguas_sig_lotes_sector_{sector}",
      sectoresComerciales: "yurimaguas_sig_sectores_comerciales",
      calles: "yurimaguas_sig_calles",
      usuarios: "usuarios",
      acometidaAgua: "acometida_agua",
      acometidaAlcantarillado: "acometida_alcantarillado",
      fichaAgua: "yurimaguas_ficha_agua",
      fichaAlcantarillado: "yurimaguas_ficha_alcantarillado",
    },
    // Completar con el nombre real publicado en GeoServer.
    capasTecnicas: {
      // tuberias: "",
      // fuentes: "",
      // valvulas: "",
      // curvasNivel: "",
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
      fichaAgua: "v_com_fichas_catastrales",
      fichaAlcantarillado: "emapa_ficha_alcantarillado",
      rutaLectura: "rut_a_lectura",
    },
    // Completar con el nombre real publicado en GeoServer.
    capasTecnicas: {
      fuentes: "sm_sig_fuentes",
      tuberias: "sm_sig_tuberias",
      valvulas: "sm_sig_valvulas",
      curvasNivel: "sm_sig_curvas_de_nivel",
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

// Rótulos que no se pueden derivar del rol (tildes, "de").
export const ETIQUETAS_POR_DEFECTO: Record<string, string> = {
  tuberias: "Tuberías",
  valvulas: "Válvulas",
  curvasNivel: "Curvas de Nivel",
};

// Solo si ni la EPS ni la empresa declaran coordenadas.
export const VISTA_POR_DEFECTO: GisVistaConfig = {
  centro: [-75.0152, -9.19],
  zoom: 5,
};

// EPS sin entrada en CONFIG_EPS: conserva el GeoServer del backend, sin capas.
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
