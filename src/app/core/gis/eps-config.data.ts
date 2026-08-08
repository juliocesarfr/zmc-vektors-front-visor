import { GisEpsConfig } from "./gis-config.model";

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
      baseUrl: "http://167.88.36.54:8085/geoserver",
      workspace: "emapa",
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
      centro: [-76.3654, -6.4886],
      zoom: 18,
    },
    proyecciones: {
      mapa: "EPSG:4326",
      utm: "EPSG:32718", // UTM 18S
    },
  },
};

export const CONFIG_EPS_DEFAULT: GisEpsConfig = CONFIG_EPS["016"];

export const ZOOM_POR_DEFECTO = 18;
