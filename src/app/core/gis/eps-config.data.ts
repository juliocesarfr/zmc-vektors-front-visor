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

// Yurimaguas e Iquitos son la misma EPS (004) en servidores distintos, cada uno con su GeoServer:
// al compilar el frontend que se sube al servidor de Iquitos se cambia esta constante a "IQUITOS".
type SedeEps004 = "YURIMAGUAS" | "IQUITOS";
const SEDE_004 = "YURIMAGUAS" as SedeEps004;

const EPS_004_YURIMAGUAS: GisEpsConfig = {
  ccodeps: "004",
  descripcion: "EPS Yurimaguas",
  geoserver: {
    baseUrl: "http://177.67.250.210/geoserver",
    workspace: "YURIMAGUAS",
  },
  // El GeoServer de 177.67.250.210 no publica lotes por sector: sin `lotesPorSector` se usa la capa
  // de lotes completa. `usuarios` es una vista SQL sin datos personales sobre "FICHA PUNTOS PREDIO".
  capas: {
    lotes: "yurimaguas_sig_lotes",
    sectoresComerciales: "yurimaguas_sig_sectores_comerciales",
    manzanas: "yurimaguas_sig_manzanas",
    calles: "yurimaguas_sig_calles",
    urbanizaciones: "yurimaguas_sig_urbanismos",
    acometidaAgua: "acometida_agua",
    usuarios: "usuarios",
    acometidaAlcantarillado: "acometida_alcantarillado",
    fichaAgua: "yurimaguas_ficha_agua",
    fichaAlcantarillado: "yurimaguas_ficha_alcantarillado",
    rutaLectura: "ruta_lectura",
    rutaDistribucion: "ruta_reparto",
    secuenciaRutaLectura: "secuencia_ruta_lectura",
    secuenciaRutaReparto: "secuencia_ruta_reparto",
  },
  etiquetas: {
    rutaDistribucion: "Ruta de Reparto",
    secuenciaRutaLectura: "Secuencia de Lectura",
    secuenciaRutaReparto: "Secuencia de Reparto",
  },
  // Completar con el nombre real publicado en GeoServer.
  capasTecnicas: {
    // tuberiasAgua: "",
    // tuberiasAlcantarillado: "",
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
};

const EPS_004_IQUITOS: GisEpsConfig = {
  ccodeps: "004",
  descripcion: "EPS Sedaloreto - Iquitos",
  geoserver: {
    baseUrl: "http://143.105.156.90:8080/geoserver",
    workspace: "IQUITOS",
  },
  // Capas publicadas directamente desde las tablas de catastro de Iquitos (2026); no hay capa de calles ni de rutas.
  // La ficha predio trae nombre, DNI, celular y correo: la consulta solo muestra campos sin datos personales.
  capas: {
    lotes: "tb_lotes_iquitos2026",
    sectoresComerciales: "tb_sectores_iquitos2026",
    manzanas: "tb_manzanas_iquitos2026",
    usuarios: "tb_ficha_predio_iquitos2026",
    centroideFicha: "tb_ficha_predio_iquitos2026",
    fichaAgua: "tb_ficha_agua_iquitos2026",
    fichaAlcantarillado: "tb_ficha_alcantarillado_iquitos2026",
  },
  etiquetas: {
    fichaAgua: "Conexiones de Agua",
    fichaAlcantarillado: "Conexiones de Alcantarillado",
  },
  consultaCapas: {
    lotes: {
      campoTitulo: "SUMINISTRO",
      // El suministro del lote es el código de cliente: con él el buscador pinta el lote del usuario.
      campoCliente: "SUMINISTRO",
      atributos: { SUMINISTRO: "Suministro" },
    },
    centroideFicha: {
      campoTitulo: "suministro",
      campoCliente: "suministro",
      atributos: {
        nomb_localidad: "Localidad",
        suministro: "Suministro",
        cod_sector: "Sector",
        cod_mzna: "Manzana",
        cod_lote: "Lote",
        nombre_via: "Vía",
        nombre_urb: "Urbanización",
        num_munic: "Nro. municipal",
        ruta_lectura: "Ruta de lectura",
        ruta_reparto: "Ruta de reparto",
        estado_predio: "Estado del predio",
        condicion: "Condición",
        servicio: "Servicio",
        cat_tarifa_1: "Categoría",
      },
      // Enlaces públicos a las fotos del levantamiento catastral.
      fotos: {
        fotografia_01_fachada_predio: "Fachada del predio",
        fotografia_05_panoramico: "Vista panorámica",
      },
      campoFicha: "ficha_numero",
      campoFecha: "fecha",
    },
    fichaAgua: {
      campoTitulo: "ficha_numero",
      campoFicha: "ficha_numero",
      fotos: {
        "fotografía_2_tapa_de_agua": "Tapa de la caja de agua",
        fotografia_3_medidor: "Medidor",
      },
      atributos: {
        condicion: "Condición",
        "ubicación_caja_agua": "Ubicación",
        "estado_conexión_agua": "Estado",
        "diámetro_conexión_agua_potable": "Diámetro",
        medidor: "Medidor",
        "número_medidor": "Nro. medidor",
        estado_medidor: "Estado del medidor",
        marca_medidor: "Marca del medidor",
      },
    },
    fichaAlcantarillado: {
      campoTitulo: "ficha_numero",
      campoFicha: "ficha_numero",
      fotos: {
        "fotografía_4_tapa_de_desagüe": "Tapa de la caja de desagüe",
      },
      atributos: {
        "condición": "Condición",
        "ubicación_caja_desague": "Ubicación",
        "estado_conexión_desague": "Estado",
        "diametro_conexión_desague": "Diámetro",
      },
    },
    sectoresComerciales: {
      campoTitulo: "Layer",
      atributos: { Layer: "Sector" },
    },
    manzanas: {
      campoTitulo: "MZ",
      atributos: { MZ: "Manzana" },
    },
  },
  // Las capas de lotes, manzanas y sectores traen también Requena (al oeste de x = 660000); este servidor
  // solo atiende Iquitos: sin esto, el lote de un cliente con el mismo número se buscaba en Requena.
  zonaTrabajo: {
    campoGeometria: "geom",
    extensionUtm: [660000, 9500000, 800000, 9700000],
  },
  usuariosDesdeFichasGeoserver: true,
  vista: {
    centro: [-73.2588, -3.7531],
    zoom: 16,
  },
  proyecciones: {
    mapa: "EPSG:4326",
    utm: "EPSG:32718", // UTM 18S
  },
};

export const CONFIG_EPS: Record<string, GisEpsConfig> = {
  "004": SEDE_004 === "IQUITOS" ? EPS_004_IQUITOS : EPS_004_YURIMAGUAS,
  "051": {
    ccodeps: "051",
    descripcion: "EPS Rioja",
    // Mismo dominio que el frontend: Apache reenvía /geoserver/ al GeoServer interno.
    geoserver: {
      baseUrl: "https://sysco.epsrioja.com.pe/geoserver",
      workspace: "RIOJA",
    },
    // ficha y las cajas se publican desde vistas sin los datos personales del usuario.
    capas: {
      lotes: "lotes",
      sectoresComerciales: "sectores",
      manzanas: "manzanas",
      calles: "vias",
      usuarios: "ficha",
      centroideFicha: "ficha",
      acometidaAgua: "acometida_agua",
      acometidaAlcantarillado: "acometida_desague",
      fichaAgua: "caja_aguas",
      fichaAlcantarillado: "caja_desagues",
      rutaLectura: "ruta_lectura",
      rutaDistribucion: "ruta_distribucion",
    },
    etiquetas: {
      fichaAgua: "Cajas de Agua",
      fichaAlcantarillado: "Cajas de Desagüe",
      acometidaAlcantarillado: "Acometida de Desagüe",
    },
    consultaCapas: {
      lotes: {
        campoTitulo: "cod_catast",
        atributos: {
          cod_catast: "Cód. catastral",
          sector: "Sector",
          manzana: "Manzana",
          lote: "Lote",
          urbanizaci: "Urbanización",
          mz_muni: "Manzana municipal",
          lote_muni: "Lote municipal",
          rutalectur: "Ruta de lectura",
          rutadistri: "Ruta de distribución",
        },
      },
      centroideFicha: {
        campoTitulo: "nroinscrip",
        campoCliente: "nroinscrip",
        atributos: {
          nroinscrip: "Nro. de inscripción",
          cod_catast: "Cód. catastral",
          sector: "Sector",
          manzana: "Manzana",
          lote: "Lote",
          medidor_nu: "Medidor",
          numero_pis: "Pisos",
          habitantes: "Habitantes",
        },
      },
      fichaAgua: {
        campoTitulo: "nroinscrip",
        atributos: {
          nroinscrip: "Nro. de inscripción",
          cod_catast: "Cód. catastral",
          medidor_nu: "Medidor",
          distancia_: "Distancia",
        },
      },
      fichaAlcantarillado: {
        campoTitulo: "nroinscrip",
        atributos: { nroinscrip: "Nro. de inscripción", cod_catast: "Cód. catastral" },
      },
      acometidaAgua: {
        campoTitulo: "nroinscrip",
        atributos: { nroinscrip: "Nro. de inscripción", codcat_man: "Manzana catastral" },
      },
      acometidaAlcantarillado: {
        campoTitulo: "nroinscrip",
        atributos: { nroinscrip: "Nro. de inscripción", codcat_man: "Manzana catastral" },
      },
      sectoresComerciales: {
        campoTitulo: "sector",
        atributos: { sector: "Sector", nombre: "Nombre", detalle: "Detalle", area_ha: "Área (ha)" },
      },
      manzanas: {
        campoTitulo: "codcat_man",
        atributos: { sector: "Sector", manzana: "Manzana", mz_muni: "Manzana municipal" },
      },
      calles: {
        campoTitulo: "nombre_tip",
        atributos: { abrev_tipo: "Tipo", nombre_tip: "Nombre" },
      },
      rutaLectura: {
        campoTitulo: "codruta",
        atributos: { codruta: "Ruta", tiporuta: "Tipo", sector: "Sector" },
      },
      rutaDistribucion: {
        campoTitulo: "codruta",
        atributos: { codruta: "Ruta", tiporuta: "Tipo", sector: "Sector" },
      },
    },
    vista: {
      centro: [-77.1686, -6.0688],
      zoom: 17,
    },
    proyecciones: {
      mapa: "EPSG:4326",
      utm: "EPSG:32718", // UTM 18S
    },
  },
  "019": {
    ccodeps: "019",
    descripcion: "EPS Selva Central",
    geoserver: {
      baseUrl: "https://sysco.epsselvacentral.com.pe/geoserver",
      workspace: "SELVACENTRAL",
    },
    // Solo hay red de agua de Oxapampa y Pichanaki (sin catastro): cada capa trae la columna localidad.
    capas: {
      calles: "eje_calle",
    },
    capasTecnicas: {
      tuberiasAgua: "tuberia_agua",
      valvulas: "valvula",
      hidrantes: "hidrante",
      fuentes: "reservorio",
    },
    etiquetas: {
      hidrantes: "Hidrantes",
      fuentes: "Reservorios",
    },
    consultaCapas: {
      tuberiasAgua: {
        campoTitulo: "capa_cad",
        atributos: {
          localidad: "Localidad",
          material: "Material",
          diametro_mm: "Diámetro (mm)",
          longitud_m: "Longitud (m)",
        },
      },
      valvulas: {
        campoTitulo: "codigo",
        atributos: {
          localidad: "Localidad",
          tipo: "Tipo",
          diametro_mm: "Diámetro (mm)",
          material: "Material",
          estado: "Estado",
        },
      },
      hidrantes: {
        campoTitulo: "codigo",
        atributos: { localidad: "Localidad", tipo: "Tipo", diametro_mm: "Diámetro (mm)", estado: "Estado" },
      },
      fuentes: {
        campoTitulo: "nombre",
        atributos: { localidad: "Localidad", capacidad: "Capacidad" },
      },
      calles: {
        campoTitulo: "nombre",
        atributos: { localidad: "Localidad", nombre: "Nombre" },
      },
    },
    vista: {
      centro: [-75.402, -10.577],
      zoom: 15,
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
      lotes: "fcom_lote_poligonos",
      lotesPorSector: "fcom_sector_{sector}",
      sectoresComerciales: "fcom_sector",
      calles: "sm_sig_calles",
      usuarios: "v_com_fichas_catastrales",
      centroideFicha: "v_com_fichas_catastrales",
      acometidaAgua: "sm_sig_acometidas_ap",
      acometidaAlcantarillado: "sm_sig_acometidas_al",
      fichaAgua: "v_com_fichas_catastrales",
      fichaAlcantarillado: "emapa_ficha_alcantarillado",
      rutaLectura: "rut_a_lectura",
      manzanas: "sm_sig_manzanas",
    },
    // Completar con el nombre real publicado en GeoServer.
    // El orden es el de dibujo: el polígono de sectores va primero para quedar debajo de redes y puntos.
    capasTecnicas: {
      sectoresOperacionales: "sm_sig_sectores_hidraulicos",
      fuentes: "sm_sig_fuentes",
      tuberiasAgua: "sm_sig_tuberias",
      tuberiasAlcantarillado: "sm_sig_alcantarillado",
      nodosAgua: "sm_sig_nodos",
      nodosAlcantarillado: "sm_sig_nodosas",
      valvulas: "sm_sig_valvulas",
      presiones: "sm_sig_presiones",
      curvasNivel: "sm_sig_curvas_de_nivel",
    },
    // Columnas reales de GeoServer con pocos valores distintos (revisadas en la capa el 2026-11-19).
    filtrosCapas: {
      sectoresOperacionales: [
        { campo: "sector", etiqueta: "Sector" },
        { campo: "tipo", etiqueta: "Tipo" },
      ],
      fuentes: [{ campo: "tipo", etiqueta: "Tipo" }],
      tuberiasAgua: [
        { campo: "tipo", etiqueta: "Tipo" },
        { campo: "material", etiqueta: "Material" },
      ],
      tuberiasAlcantarillado: [
        { campo: "tipo", etiqueta: "Tipo" },
        { campo: "material", etiqueta: "Material" },
      ],
      nodosAgua: [
        { campo: "accesorio", etiqueta: "Accesorio" },
        { campo: "material", etiqueta: "Material" },
      ],
      nodosAlcantarillado: [{ campo: "tipo", etiqueta: "Tipo" }],
      valvulas: [
        { campo: "type", etiqueta: "Tipo" },
        { campo: "status", etiqueta: "Estado" },
      ],
      presiones: [
        { campo: "funcion", etiqueta: "Función" },
        { campo: "zona", etiqueta: "Zona" },
      ],
    },
    ortofotos: [
      {
        id: "ortofotoPicotaSector2",
        etiqueta: "Dron Picota S2",
        capa: "PICOTAORTOF2",
        extension: [-76.35231, -6.930632, -76.314844, -6.899163],
      },
    ],
    // Su estilo en GeoServer es el genérico: el polígono gris tapaba el mapa y los buzones salían como cuadros rojos.
    estilosCapas: {
      // El estilo de GeoServer son cuadros rojos que tapan el mapa; desde 1:20000 se ven los puntos.
      centroideFicha: { forma: "punto", color: "#16a34a", escalaMaxima: 20000 },
      sectoresOperacionales: {
        forma: "area",
        color: "#0d9488",
        campoEtiqueta: "sector",
      },
      nodosAlcantarillado: {
        forma: "punto",
        color: "#d97706",
        escalaMaxima: 5000,
      },
      presiones: { forma: "punto", color: "#9333ea" },
    },
    // Columnas reales de GeoServer. Los lotes traen datos personales (DNI, teléfono, correo):
    // nunca dejarlos sin lista de atributos.
    consultaCapas: {
      // La ficha catastral trae titular, DNI, teléfono y correo: al clic solo se lee el código de cliente
      // y el cuadro del cliente se llena desde el sistema comercial.
      centroideFicha: {
        campoTitulo: "codcliente",
        campoCliente: "codcliente",
        atributos: {
          codcliente: "Cód. cliente",
          codigo_catastral: "Código catastral",
          urbanmae: "Urbanización",
          nrocalle: "Nro. de calle",
          destiposervicio: "Tipo de servicio",
          desestadoconexion_agua: "Estado de la conexión",
          nromed: "Medidor",
          desactividad: "Actividad",
        },
      },
      valvulas: {
        campoTitulo: "dc_id",
        atributos: {
          type: "Tipo",
          funcion: "Función",
          status: "Estado",
          conserv: "Conservación",
          dn_plg: "Diámetro (pulg)",
          prof: "Profundidad (m)",
          tipo_det: "Detalle",
          tapa: "Tapa",
          protecc: "Protección",
          sentido_ap: "Sentido de apertura",
          mat_vastago: "Material del vástago",
          marca: "Marca",
          anyo: "Año",
          fec_reg: "Fecha de registro",
          comentario: "Comentario",
        },
      },
      tuberiasAgua: {
        campoTitulo: "dc_id",
        atributos: {
          tipo: "Tipo",
          material: "Material",
          dn_plg: "Diámetro (pulg)",
          dn_mm: "Diámetro (mm)",
          length_gis: "Longitud (m)",
          status: "Estado",
          conserv: "Conservación",
          node1: "Nodo inicial",
          node2: "Nodo final",
          anyo: "Año",
          fec_reg: "Fecha de registro",
          comentario: "Comentario",
        },
      },
      nodosAgua: {
        campoTitulo: "dc_id",
        atributos: {
          accesorio: "Accesorio",
          descr_acc: "Descripción",
          diametro: "Diámetro",
          material: "Material",
          marca: "Marca",
          prof: "Profundidad (m)",
          elev_terr: "Cota de terreno",
          terreno: "Terreno",
          conserv: "Conservación",
          fec_reg: "Fecha de registro",
          comentario: "Comentario",
        },
      },
      nodosAlcantarillado: {
        campoTitulo: "id",
        atributos: {
          tipo: "Tipo",
          descr_tipo: "Descripción",
          n_bz: "N° de buzón",
          diametro_m: "Diámetro (m)",
          material: "Material",
          tapa: "Tapa",
          volumen: "Volumen",
          cota_terr: "Cota de terreno",
          cota_fondo: "Cota de fondo",
          prof: "Profundidad (m)",
          terreno: "Terreno",
          conserv: "Conservación",
          anyo: "Año",
          fec_reg: "Fecha de registro",
          comentario: "Comentario",
        },
      },
      presiones: {
        campoTitulo: "direccion",
        atributos: {
          id: "Código",
          ubicacion: "Ubicación",
          funcion: "Función",
          sector: "Sector",
          zona: "Zona",
          prof_red: "Profundidad de red (m)",
          serie_eq: "Serie del equipo",
          ene: "Enero",
          feb: "Febrero",
          mar: "Marzo",
          abr: "Abril",
          may: "Mayo",
          jun: "Junio",
          jul: "Julio",
          ago: "Agosto",
          sep: "Setiembre",
          oct: "Octubre",
          nov: "Noviembre",
          dic: "Diciembre",
          observaciones: "Observaciones",
        },
      },
      sectoresOperacionales: {
        campoTitulo: "sector",
        atributos: {
          sector: "Sector",
          subsector: "Subsector",
          nombre: "Nombre",
          tipo: "Tipo",
          fuente: "Fuente",
          medidor: "Medidor",
        },
      },
      tuberiasAlcantarillado: {
        campoTitulo: "dc_id",
        atributos: {
          tipo: "Tipo",
          material: "Material",
          dn_mm: "Diámetro (mm)",
          dn_plg: "Diámetro (pulg)",
          longitud_gis: "Longitud (m)",
          pendiente: "Pendiente",
          nodo1: "Buzón inicial",
          nodo2: "Buzón final",
          cota1: "Cota inicial",
          cota2: "Cota final",
          prof_entrada: "Profundidad de entrada (m)",
          prof_salida: "Profundidad de salida (m)",
          conserv: "Conservación",
          anyo: "Año",
          fec_reg: "Fecha de registro",
          comentario: "Comentario",
        },
      },
      curvasNivel: {
        atributos: { elevation: "Elevación (m)", fuente: "Fuente" },
      },
      manzanas: {
        campoTitulo: "mz_comercial",
        atributos: {
          mz_comercial: "Manzana comercial",
          nmanzana: "Nombre",
          sectcom_gid: "Sector comercial (id)",
          zona_trabajo_id: "Zona de trabajo",
          fec_reg: "Fecha de registro",
        },
      },
      lotes: {
        campoTitulo: "codcatastral",
        campoCliente: "codcliente",
        atributos: {
          codcliente: "Cód. cliente",
          propietario: "Titular",
          direccion: "Dirección",
          codsector: "Sector",
          codmza: "Manzana",
          nrolote: "Lote",
          nromed: "Medidor",
        },
      },
    },
    usuariosDesdeFichasGeoserver: true,
    // Plaza Mayor de Tarapoto.
    vista: {
      centro: [-76.3601, -6.4874],
      zoom: 18,
    },
    proyecciones: {
      mapa: "EPSG:4326",
      utm: "EPSG:32718", // UTM 18S
    },
  },
  "021": {
    ccodeps: "021",
    descripcion: "EPS Sedacusco",
    geoserver: {
      baseUrl: "https://167.88.36.54/geoserver",
      workspace: "sedacusco",
    },
    capas: {
      lotes: "capas_lotes",
      sectoresComerciales: "capa_sectores",
      calles: "capa_vias",
      usuarios: "capa_ficha",
      acometidaAgua: "capa_agua",
      acometidaAlcantarillado: "capa_desague",
      centroideFicha: "capa_ficha",
      rutaLectura: "capa_ruta_lectura",
      rutaDistribucion: "capa_ruta_distribucion",
      areaLectura: "capa_area_lecturas",
      areaDistribucion: "capa_area_distribucion",
      manzanas: "capa_manzanas",
      urbanizaciones: "capa_urbanizaciones",
    },
    etiquetas: {
      acometidaAgua: "Medidores",
      acometidaAlcantarillado: "Cajas de Desagüe",
    },
    // Sus lotes no traen código de cliente: el buscador no puede marcar el predio (sin `campoCliente`).
    consultaCapas: {
      lotes: {
        campoTitulo: "codcatastral_lote",
        atributos: {
          codcatastral_lote: "Cód. catastral",
          codsector: "Sector",
          codmanzana: "Manzana",
          codlote: "Lote",
          cod_mzn: "Manzana (catastro)",
          cod_lote_1: "Lote (catastro)",
        },
      },
      centroideFicha: {
        campoTitulo: "codcatastral_conexion",
        atributos: {
          codcliente: "Cód. cliente",
          codcatastral_conexion: "Cód. catastral",
          codcatastral_rlectura: "Ruta de lectura",
          codcatastral_rdistribucion: "Ruta de distribución",
          concajaagua: "Con caja de agua",
        },
      },
      acometidaAgua: {
        campoTitulo: "codcatastral_conexion",
        atributos: {
          codcliente: "Cód. cliente",
          codcatastral_conexion: "Cód. catastral",
          grupo_usuario: "Grupo de usuario",
          tipousuario: "Tipo de usuario",
          name_sec_operativo: "Sector operativo",
          concajaagua: "Con caja de agua",
          dist_red_m: "Distancia a la red (m)",
        },
      },
      acometidaAlcantarillado: {
        campoTitulo: "codcatastral_lote",
        atributos: {
          codcliente: "Cód. cliente",
          codcatastral_lote: "Cód. catastral del lote",
          concajadesague: "Con caja de desagüe",
          dist_agua_desague_m: "Distancia agua-desagüe (m)",
        },
      },
      sectoresComerciales: {
        campoTitulo: "codcatastral_sector",
        atributos: { sector: "Sector", distrito: "Distrito" },
      },
      manzanas: {
        campoTitulo: "codcatastral_manzana",
        atributos: { cod_mzn: "Manzana (catastro)", obs: "Observación" },
      },
      urbanizaciones: {
        campoTitulo: "cc_nombre_",
        atributos: { cc_tipo_hu: "Tipo", cc_nombre_: "Nombre" },
      },
      calles: {
        campoTitulo: "nom_via",
        atributos: {
          cat_via: "Categoría",
          estado: "Estado",
          distrito: "Distrito",
        },
      },
      rutaLectura: {
        campoTitulo: "codcatastral_rlectura",
        atributos: { tiporuta: "Tipo", longitud: "Longitud (m)" },
      },
      rutaDistribucion: {
        campoTitulo: "codcatastral_rdistribucion",
        atributos: { tiporuta: "Tipo", longitud: "Longitud (m)" },
      },
      areaLectura: {
        campoTitulo: "codcatastral_rlectura",
        atributos: { sector: "Sector", distrito: "Distrito", tiporuta: "Tipo" },
      },
      areaDistribucion: {
        campoTitulo: "codcatastral_rdistribucion",
        atributos: { sector: "Sector", distrito: "Distrito", tiporuta: "Tipo" },
      },
    },
    vista: {
      centro: [-71.9788, -13.5167],
      zoom: 18,
    },
    proyecciones: {
      mapa: "EPSG:4326",
      utm: "EPSG:32719", // UTM 19S
    },
  },
};

export const ZOOM_POR_DEFECTO = 18;

// Rótulos que no se pueden derivar del rol (tildes, "de").
export const ETIQUETAS_POR_DEFECTO: Record<string, string> = {
  tuberiasAgua: "Tuberías de Agua",
  tuberiasAlcantarillado: "Tuberías de Desagüe",
  valvulas: "Válvulas",
  curvasNivel: "Curvas de Nivel",
  nodosAgua: "Accesorios de la Red de Agua",
  nodosAlcantarillado: "Buzones y Cajas de Desagüe",
  sectoresOperacionales: "Sectores Operacionales",
  presiones: "Puntos de Presión",
  centroideFicha: "Fichas (Centroide)",
  rutaDistribucion: "Ruta de Distribución",
  areaLectura: "Áreas de Lectura",
  areaDistribucion: "Áreas de Distribución",
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
