import { Injectable, inject } from "@angular/core";
import { HttpBackend, HttpClient } from "@angular/common/http";
import { Observable, catchError, map, of, timeout, throwError } from "rxjs";
import { Coordinate } from "ol/coordinate";
import { transform } from "ol/proj";

import { distanciaHaversineMetros } from "../../shared/mapa/geo.utils";
import { WGS84 } from "./gis-proyeccion";
import { coordenadaLonLat } from "../../shared/mapa/street-view";

export type EstadoCruceComercial =
  | "NO_REGISTRADO" // Comercio en OSM pero no hay suministro en Sysco (potencial clandestino / predio nuevo)
  | "CAMBIO_DE_USO" // Hay suministro cerca pero su tarifa es Doméstico/Social (alerta de fiscalización)
  | "COINCIDENTE"; // Hay suministro con tarifa Comercial/Industrial formalizado

export interface ClienteCruce {
  codcliente: string | number;
  propietario?: string;
  direccion?: string;
  categoria?: string;
  distanciaMetros: number;
}

export interface ComercioOsm {
  id: number;
  nombre: string;
  tipo: "shop" | "amenity" | "tourism" | "craft" | "office" | "commercial" | "otro";
  subtipo: string;
  rubroLegible: string;
  coordenada: [number, number]; // [lon, lat] en WGS84
  direccion?: string;
  tags: Record<string, string>;
  estadoCruce: EstadoCruceComercial;
  clienteCercano?: ClienteCruce;
}

export interface ResumenDeteccionOsm {
  totalOsm: number;
  noRegistrados: number;
  cambioDeUso: number;
  coincidentes: number;
  radioMetros: number;
  centroWgs84: [number, number];
  comercios: ComercioOsm[];
}

/** Servidores Overpass de respaldo si la API oficial de OSM estuviese inaccesible */
const SERVIDORES_OVERPASS_FALLBACK = [
  "https://overpass.private.coffee/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const MS_ESPERA_OSM_OFICIAL = 15000;
const MS_ESPERA_OVERPASS = 20000;

/** Elementos de tipo amenity que NO representan comercios o servicios útiles para fiscalización */
const AMENITIES_A_IGNORAR = new Set([
  "bench",
  "waste_basket",
  "toilets",
  "fountain",
  "drinking_water",
  "shelter",
  "telephone",
  "bicycle_parking",
  "motorcycle_parking",
  "parking",
  "post_box",
  "recycling",
  "grit_bin",
  "clock",
  "watering_place",
  "hunting_stand",
  "vending_machine",
]);

/** Diccionario ampliado de traducción amigable para las etiquetas comunes de OpenStreetMap. */
const RUBROS_TRADUCIDOS: Record<string, string> = {
  supermarket: "Supermercado",
  convenience: "Bodega / Abarrotes",
  grocery: "Abarrotes / Víveres",
  bakery: "Panadería / Pastelería",
  butcher: "Carnicería",
  hardware: "Ferretería",
  clothes: "Tienda de ropa",
  hairdresser: "Peluquería / Barbería",
  beauty: "Salón de belleza / Spa",
  pharmacy: "Farmacia / Botica",
  chemist: "Botica",
  restaurant: "Restaurante",
  cafe: "Cafetería",
  fast_food: "Comida rápida / Snack",
  bar: "Bar / Licorería",
  pub: "Bar / Pub",
  nightclub: "Discoteca / Club",
  bank: "Banco / Financiera",
  atm: "Cajero automático",
  payment_terminal: "Agente bancario / Pago",
  fuel: "Grifo / Gasolinera",
  clinic: "Clínica / Consultorio",
  hospital: "Hospital / Centro de Salud",
  dentist: "Consultorio Dental",
  veterinary: "Veterinaria",
  hotel: "Hotel / Hospedaje",
  hostel: "Hostal",
  guest_house: "Alojamiento / Hospedaje",
  motel: "Hospedaje / Motel",
  car_wash: "Lavado de autos (Car Wash)",
  car_repair: "Taller mecánico / Llantería",
  motorcycle_repair: "Taller de motos",
  car_parts: "Repuestos y accesorios",
  laundry: "Lavandería",
  dry_cleaning: "Lavandería y tintorería",
  stationery: "Librería / Bazar",
  copyshop: "Fotocopias / Impresiones",
  marketplace: "Mercado / Abastos",
  shoe_repair: "Reparación de calzado",
  optician: "Óptica",
  electronics: "Electrodomésticos / Celulares",
  mobile_phone: "Venta de celulares",
  school: "Colegio / Institución Educativa",
  kindergarten: "Nido / Jardín de Niños",
  college: "Instituto / Superior",
  university: "Universidad",
  internet_cafe: "Cabina de Internet",
  gym: "Gimnasio",
  cinema: "Cine",
  theatre: "Teatro / Centro Cultural",
  furniture: "Mueblería",
  department_store: "Tienda por departamentos",
  mall: "Centro comercial / Galería",
  tailor: "Sastrería / Confección",
  jewelry: "Joyería / Relojería",
  beverages: "Depósito de bebidas / Licores",
  kiosk: "Kiosco",
  variety_store: "Bazar / Tienda de variedades",
};

/**
 * Normaliza cualquier coordenada recibida al formato exacto WGS84 [lon, lat].
 * Tolera coordenadas en UTM, Web Mercator o grados WGS84 invertidos.
 */
export function normalizarCoordenadaWgs84(
  coord: Coordinate | [number, number],
  proyeccionMapa: string,
  proyeccionUtm: string,
): [number, number] {
  const [x, y] = coord;

  // 1. Detección directa de coordenadas en Perú (Lon: -85 a -65, Lat: -20 a 5)
  if (x >= -85 && x <= -65 && y >= -20 && y <= 5) {
    return [x, y];
  }
  // 2. Coordenadas de Perú que llegaron invertidas [lat, lon]
  if (y >= -85 && y <= -65 && x >= -20 && x <= 5) {
    return [y, x];
  }

  // 3. Proyección del mapa activa (Web Mercator EPSG:3857 o UTM EPSG:32718 / 32717 / 32719)
  if (proyeccionMapa && proyeccionMapa !== WGS84) {
    try {
      const t = transform([x, y], proyeccionMapa, WGS84) as [number, number];
      if (Math.abs(t[0]) <= 180 && Math.abs(t[1]) <= 90) {
        if (t[0] >= -85 && t[0] <= -65 && t[1] >= -20 && t[1] <= 5) return t;
        if (t[1] >= -85 && t[1] <= -65 && t[0] >= -20 && t[0] <= 5) return [t[1], t[0]];
        return t;
      }
    } catch {}
  }

  // 4. Proyección UTM configurada para la EPS
  if (proyeccionUtm && proyeccionUtm !== WGS84) {
    try {
      const t = transform([x, y], proyeccionUtm, WGS84) as [number, number];
      if (Math.abs(t[0]) <= 180 && Math.abs(t[1]) <= 90) return t;
    } catch {}
  }

  // 5. Fallback Web Mercator EPSG:3857 (valores en metros absolutos > 100,000)
  if (Math.abs(x) > 100000 || Math.abs(y) > 100000) {
    try {
      const t = transform([x, y], "EPSG:3857", WGS84) as [number, number];
      if (Math.abs(t[0]) <= 180 && Math.abs(t[1]) <= 90) return t;
    } catch {}
  }

  // Fallback si está en grados WGS84 genérico
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return [x, y];
  }

  return [x, y];
}

@Injectable({ providedIn: "root" })
export class OsmComerciosService {
  // HttpBackend directo para que no se inyecten interceptores de JWT ni headers de Sysco
  private readonly http = new HttpClient(inject(HttpBackend));

  /**
   * Consulta OpenStreetMap para detectar todos los comercios en un radio delimitado alrededor de (lat, lon).
   * Utiliza la API oficial de OpenStreetMap (API 0.6) con CDN global de alta disponibilidad y fallback a Overpass.
   *
   * @param lat Latitud en WGS84 (ej. -6.4862)
   * @param lon Longitud en WGS84 (ej. -76.3655)
   * @param radioMetros Radio en metros (ej. 50, 100, 300)
   */
  consultarComercios(lat: number, lon: number, radioMetros: number): Observable<ComercioOsm[]> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      console.error("[OSM-COMERCIOS] Coordenadas inválidas:", { lat, lon, radioMetros });
      return throwError(() => new Error(`Coordenadas inválidas para detección OSM: lat=${lat}, lon=${lon}`));
    }

    const radioValido = Math.max(30, Math.min(300, Math.round(radioMetros)));

    console.log(
      `[OSM-COMERCIOS] Iniciando detección en centro WGS84 [lat: ${lat.toFixed(5)}, lon: ${lon.toFixed(5)}], radio: ${radioValido} m`,
    );

    // 1. Intentar primero con la API Oficial de OpenStreetMap (API 0.6), rápida, sin bloqueos de cola 502/406
    return this.consultarOsmOficial(lat, lon, radioValido).pipe(
      catchError((errOficial) => {
        console.warn(
          "[OSM-COMERCIOS] La API oficial de OpenStreetMap retornó error, intentando Overpass fallback...",
          errOficial,
        );
        return this.consultarOverpassFallback(lat, lon, radioValido);
      }),
    );
  }

  /**
   * Consulta directa a la API Oficial de OpenStreetMap (OpenStreetMap Foundation API 0.6).
   * Endpoint: https://api.openstreetmap.org/api/0.6/map?bbox=left,bottom,right,top
   */
  private consultarOsmOficial(lat: number, lon: number, radioMetros: number): Observable<ComercioOsm[]> {
    // Cálculo del Bounding Box geodésico
    const deltaLat = radioMetros / 111132;
    const deltaLon = radioMetros / (111320 * Math.cos((lat * Math.PI) / 180));

    const minLon = (lon - deltaLon).toFixed(6);
    const minLat = (lat - deltaLat).toFixed(6);
    const maxLon = (lon + deltaLon).toFixed(6);
    const maxLat = (lat + deltaLat).toFixed(6);

    const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${minLon},${minLat},${maxLon},${maxLat}`;

    return this.http
      .get(url, {
        responseType: "text",
        headers: {
          Accept: "application/xml, text/xml, */*",
        },
      })
      .pipe(
        timeout(MS_ESPERA_OSM_OFICIAL),
        map((xmlTexto) => {
          const comercios = this.parsearXmlOsm(xmlTexto, lon, lat, radioMetros);
          console.log(
            `[OSM-COMERCIOS] Éxito desde OSM Oficial: ${comercios.length} comercios dentro del radio de ${radioMetros} m`,
          );
          return comercios;
        }),
      );
  }

  /**
   * Parsea la respuesta XML de OpenStreetMap API 0.6 usando DOMParser nativo del navegador.
   * Extrae nodos y polígonos (ways) con etiquetas comerciales dentro del radio haversine.
   */
  private parsearXmlOsm(
    xmlTexto: string,
    centroLon: number,
    centroLat: number,
    radioMetros: number,
  ): ComercioOsm[] {
    if (typeof window === "undefined" || !xmlTexto) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlTexto, "application/xml");

    const parseError = xmlDoc.getElementsByTagName("parsererror");
    if (parseError.length > 0) {
      console.warn("[OSM-COMERCIOS] Error de sintaxis en XML recibido de OSM");
      return [];
    }

    // 1. Mapear todos los nodos: id -> [lon, lat] para resolver ways/polígonos
    const nodosCoords = new Map<string, [number, number]>();
    const nodeElements = xmlDoc.getElementsByTagName("node");
    const comercios: ComercioOsm[] = [];
    const clavesUnicas = new Set<string>();

    for (let i = 0; i < nodeElements.length; i++) {
      const node = nodeElements[i];
      const id = node.getAttribute("id") || "";
      const latAttr = node.getAttribute("lat");
      const lonAttr = node.getAttribute("lon");
      if (!latAttr || !lonAttr) continue;

      const lat = parseFloat(latAttr);
      const lon = parseFloat(lonAttr);
      if (isNaN(lat) || isNaN(lon)) continue;

      nodosCoords.set(id, [lon, lat]);

      // Extraer tags del nodo
      const tagElements = node.getElementsByTagName("tag");
      if (tagElements.length === 0) continue;

      const tags: Record<string, string> = {};
      for (let j = 0; j < tagElements.length; j++) {
        const k = tagElements[j].getAttribute("k");
        const v = tagElements[j].getAttribute("v");
        if (k && v) tags[k] = v;
      }

      const comercio = this.convertirAComercio(
        parseInt(id, 10) || i,
        lat,
        lon,
        tags,
        centroLat,
        centroLon,
        radioMetros,
      );

      if (comercio) {
        const key = `${comercio.nombre}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
        if (!clavesUnicas.has(key)) {
          clavesUnicas.add(key);
          comercios.push(comercio);
        }
      }
    }

    // 2. Procesar ways (construcciones, supermercados, locales mapeados como polígonos)
    const wayElements = xmlDoc.getElementsByTagName("way");
    for (let i = 0; i < wayElements.length; i++) {
      const way = wayElements[i];
      const wayId = way.getAttribute("id") || "";

      const tagElements = way.getElementsByTagName("tag");
      if (tagElements.length === 0) continue;

      const tags: Record<string, string> = {};
      for (let j = 0; j < tagElements.length; j++) {
        const k = tagElements[j].getAttribute("k");
        const v = tagElements[j].getAttribute("v");
        if (k && v) tags[k] = v;
      }

      if (!this.tieneTagsComerciales(tags)) continue;

      // Calcular centroide a partir de los nodos miembros
      const ndElements = way.getElementsByTagName("nd");
      let sumLat = 0;
      let sumLon = 0;
      let count = 0;
      for (let j = 0; j < ndElements.length; j++) {
        const ref = ndElements[j].getAttribute("ref");
        if (ref && nodosCoords.has(ref)) {
          const [nLon, nLat] = nodosCoords.get(ref)!;
          sumLat += nLat;
          sumLon += nLon;
          count++;
        }
      }

      if (count === 0) continue;
      const cLat = sumLat / count;
      const cLon = sumLon / count;

      const comercio = this.convertirAComercio(
        parseInt(wayId, 10) || i,
        cLat,
        cLon,
        tags,
        centroLat,
        centroLon,
        radioMetros,
      );

      if (comercio) {
        const key = `${comercio.nombre}|${cLat.toFixed(4)}|${cLon.toFixed(4)}`;
        if (!clavesUnicas.has(key)) {
          clavesUnicas.add(key);
          comercios.push(comercio);
        }
      }
    }

    return comercios;
  }

  /**
   * Determina si las etiquetas de un elemento OSM corresponden a un comercio o servicio.
   */
  private tieneTagsComerciales(tags: Record<string, string>): boolean {
    if (tags["shop"]) return true;
    if (tags["tourism"]) return true;
    if (tags["craft"]) return true;
    if (tags["office"]) return true;
    if (tags["commercial"]) return true;
    if (tags["building"] === "commercial" || tags["building"] === "retail") return true;

    if (tags["amenity"]) {
      const a = tags["amenity"].toLowerCase();
      if (!AMENITIES_A_IGNORAR.has(a)) return true;
    }

    return false;
  }

  /**
   * Convierte un elemento con coordenadas y etiquetas a un `ComercioOsm` validado contra el radio.
   */
  private convertirAComercio(
    id: number,
    lat: number,
    lon: number,
    tags: Record<string, string>,
    centroLat: number,
    centroLon: number,
    radioMetros: number,
  ): ComercioOsm | null {
    if (!this.tieneTagsComerciales(tags)) return null;

    // Filtro espacial exacto dentro del círculo
    const dist = distanciaHaversineMetros(lon, lat, centroLon, centroLat);
    if (dist > radioMetros) return null;

    const amenity = tags["amenity"];
    if (amenity && AMENITIES_A_IGNORAR.has(amenity.toLowerCase())) {
      return null;
    }

    const subtipo =
      tags["shop"] ||
      tags["amenity"] ||
      tags["tourism"] ||
      tags["craft"] ||
      tags["office"] ||
      tags["commercial"] ||
      (tags["building"] === "commercial" || tags["building"] === "retail" ? "comercial" : null);

    if (!subtipo && !tags["name"] && !tags["brand"]) {
      return null;
    }

    const tipoFinal = tags["shop"]
      ? "shop"
      : tags["amenity"]
        ? "amenity"
        : tags["tourism"]
          ? "tourism"
          : tags["craft"]
            ? "craft"
            : tags["office"]
              ? "office"
              : tags["commercial"]
                ? "commercial"
                : "otro";

    const sub = (subtipo || "comercio").toLowerCase();
    const rubroLegible = RUBROS_TRADUCIDOS[sub] || sub.replace(/_/g, " ").toUpperCase();
    const nombre = tags["name"] || tags["brand"] || tags["operator"] || `Comercio (${rubroLegible})`;

    let direccion: string | undefined;
    if (tags["addr:street"]) {
      direccion = `${tags["addr:street"]} ${tags["addr:housenumber"] || ""}`.trim();
    }

    return {
      id,
      nombre,
      tipo: tipoFinal,
      subtipo: sub,
      rubroLegible,
      coordenada: [lon, lat],
      direccion,
      tags,
      estadoCruce: "NO_REGISTRADO",
    };
  }

  /**
   * Fallback a Overpass API si el endpoint oficial de OSM experimentara problemas.
   */
  private consultarOverpassFallback(lat: number, lon: number, radioMetros: number): Observable<ComercioOsm[]> {
    const query = `[out:json][timeout:25];
(
  node["shop"](around:${radioMetros},${lat},${lon});
  way["shop"](around:${radioMetros},${lat},${lon});
  node["amenity"](around:${radioMetros},${lat},${lon});
  way["amenity"](around:${radioMetros},${lat},${lon});
  node["tourism"](around:${radioMetros},${lat},${lon});
  way["tourism"](around:${radioMetros},${lat},${lon});
  node["craft"](around:${radioMetros},${lat},${lon});
  way["craft"](around:${radioMetros},${lat},${lon});
  node["office"](around:${radioMetros},${lat},${lon});
  way["office"](around:${radioMetros},${lat},${lon});
);
out center tags;`;

    return this.ejecutarConsultaOverpassEnServidor(query, 0, lat, lon, radioMetros);
  }

  private ejecutarConsultaOverpassEnServidor(
    query: string,
    index: number,
    centroLat: number,
    centroLon: number,
    radioMetros: number,
  ): Observable<ComercioOsm[]> {
    if (index >= SERVIDORES_OVERPASS_FALLBACK.length) {
      console.error("[OSM-COMERCIOS] Fallaron todos los servidores públicos de Overpass.");
      return throwError(
        () =>
          new Error(
            "Los servidores públicos de OpenStreetMap están experimentando alta demanda en este momento. Por favor, reintente en unos instantes.",
          ),
      );
    }

    const url = SERVIDORES_OVERPASS_FALLBACK[index];
    const postBody = `data=${encodeURIComponent(query)}`;

    return this.http
      .post<{ elements?: any[] }>(url, postBody, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
      .pipe(
        timeout(MS_ESPERA_OVERPASS),
        map((res) => {
          const elements = res.elements || [];
          const comercios = this.mapearElementosOverpassJson(elements, centroLat, centroLon, radioMetros);
          console.log(`[OSM-COMERCIOS] Éxito desde Overpass ${url}: ${comercios.length} comercios`);
          return comercios;
        }),
        catchError((errPost) => {
          console.warn(`[OSM-COMERCIOS] Falló Overpass en ${url}:`, errPost);
          return this.ejecutarConsultaOverpassEnServidor(query, index + 1, centroLat, centroLon, radioMetros);
        }),
      );
  }

  private mapearElementosOverpassJson(
    elements: any[],
    centroLat: number,
    centroLon: number,
    radioMetros: number,
  ): ComercioOsm[] {
    const resultado: ComercioOsm[] = [];
    const idsProcesados = new Set<string>();

    for (const el of elements) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const tags: Record<string, string> = el.tags || {};
      const comercio = this.convertirAComercio(
        el.id,
        lat,
        lon,
        tags,
        centroLat,
        centroLon,
        radioMetros,
      );

      if (comercio) {
        const key = `${comercio.nombre}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
        if (!idsProcesados.has(key)) {
          idsProcesados.add(key);
          resultado.push(comercio);
        }
      }
    }

    return resultado;
  }

  /**
   * Realiza el cruce espacial entre los comercios detectados por OSM y los clientes registrados en Sysco.
   * Tolerancia espacial por defecto de 35 metros para acomodar anchos de calle y lotes.
   */
  cruzarComerciosConClientes(
    comercios: ComercioOsm[],
    clientesRegistrados: Record<string, unknown>[],
    proyeccionUtm: string,
    centroWgs84: [number, number],
    radioMetros: number,
    toleranciaMetros = 35,
  ): ResumenDeteccionOsm {
    const clientesProcesados: {
      registro: Record<string, unknown>;
      coordenada: [number, number];
      categoria: string;
      esComercial: boolean;
      esDomestico: boolean;
    }[] = [];

    for (const c of clientesRegistrados) {
      const coord =
        coordenadaLonLat(
          c["lon"] ?? c["lonpredio"] ?? c["coord_x"] ?? c["longitud"] ?? c["x"],
          c["lat"] ?? c["latpredio"] ?? c["coord_y"] ?? c["latitud"] ?? c["y"],
          proyeccionUtm,
        ) ||
        coordenadaLonLat(
          c["lon_caja"] ?? c["loncaja"] ?? c["longitud_caja"],
          c["lat_caja"] ?? c["latcaja"] ?? c["latitud_caja"],
          proyeccionUtm,
        );

      if (!coord) continue;

      const categoria = String(
        c["nomtar"] ||
          c["descatetar"] ||
          c["tipoactividad"] ||
          c["categoria"] ||
          c["tipousuario"] ||
          "",
      ).toUpperCase();

      const esComercial =
        categoria.includes("COMER") ||
        categoria.includes("INDUS") ||
        categoria.includes("ESTAT") ||
        categoria.includes("PRODUCT");

      const esDomestico =
        categoria.includes("DOMEST") ||
        categoria.includes("SOCIAL") ||
        categoria.includes("DOM");

      clientesProcesados.push({
        registro: c,
        coordenada: coord,
        categoria: categoria || "SIN CATEGORÍA",
        esComercial,
        esDomestico,
      });
    }

    let noRegistrados = 0;
    let cambioDeUso = 0;
    let coincidentes = 0;

    const comerciosClasificados: ComercioOsm[] = comercios.map((comercio) => {
      const [lonOsm, latOsm] = comercio.coordenada;
      let clienteMasCercano: (typeof clientesProcesados)[0] | null = null;
      let menorDistancia = Infinity;

      for (const cliente of clientesProcesados) {
        const [lonCli, latCli] = cliente.coordenada;
        const dist = distanciaHaversineMetros(lonOsm, latOsm, lonCli, latCli);
        if (dist <= toleranciaMetros && dist < menorDistancia) {
          menorDistancia = dist;
          clienteMasCercano = cliente;
        }
      }

      let estado: EstadoCruceComercial = "NO_REGISTRADO";
      let clienteCruce: ClienteCruce | undefined;

      if (clienteMasCercano) {
        const reg = clienteMasCercano.registro;
        clienteCruce = {
          codcliente: String(reg["codcliente"] || reg["nroSuministro"] || ""),
          propietario: String(reg["propietario"] || reg["nombre"] || "").trim(),
          direccion: String(reg["direccion"] || "").trim(),
          categoria: clienteMasCercano.categoria,
          distanciaMetros: Math.round(menorDistancia * 10) / 10,
        };

        if (clienteMasCercano.esComercial) {
          estado = "COINCIDENTE";
          coincidentes++;
        } else {
          estado = "CAMBIO_DE_USO";
          cambioDeUso++;
        }
      } else {
        estado = "NO_REGISTRADO";
        noRegistrados++;
      }

      return {
        ...comercio,
        estadoCruce: estado,
        clienteCercano: clienteCruce,
      };
    });

    return {
      totalOsm: comerciosClasificados.length,
      noRegistrados,
      cambioDeUso,
      coincidentes,
      radioMetros,
      centroWgs84,
      comercios: comerciosClasificados,
    };
  }
}
