import { Injectable, inject } from "@angular/core";
import { Observable, forkJoin, of } from "rxjs";
import { catchError, map, shareReplay, tap } from "rxjs/operators";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { ParamaeService } from "@host/_servicios/administracion/paramae.service";
import { GIS } from "@host/_models/GisModel";

import {
  CapaGisId,
  CapasGis,
  GisEpsConfig,
  GisProyeccionesConfig,
  GisVistaConfig,
} from "./gis-config.model";
import {
  CONFIG_EPS,
  configSinCapas,
  VISTA_POR_DEFECTO,
  ZOOM_POR_DEFECTO,
} from "./eps-config.data";
import { setProyeccionMapa } from "./gis-proyeccion";

/** Descriptor de capa listo para pintar un switch en la barra lateral. */
export interface CapaGisUi {
  /** Rol declarado por la EPS (`lotes`, `calles`, `redAgua`, …). */
  id: CapaGisId;
  /** Rótulo a mostrar. */
  label: string;
  /** Nombre calificado con el workspace, listo para el parámetro `LAYERS`. */
  capa: string;
}

@Injectable({ providedIn: "root" })
export class GisConfigService {
  private readonly consulGenericService = inject(ConsulGenericService);
  private readonly paramaeService = inject(ParamaeService);

  private peticion$?: Observable<GisEpsConfig>;

  /**
   * Configuración vigente. Arranca vacía a propósito: hasta que `cargar()`
   * resuelva no se conoce la EPS, y no hay ninguna configuración "genérica"
   * que sea correcta para todas.
   */
  private actual: GisEpsConfig = configSinCapas("", "", "");

  private centroEmpresa?: [number, number];

  /**
   * Resuelve la configuración GIS de la EPS logueada combinando dos fuentes:
   * el `ccodeps` de la empresa (tabla `CONFIG_EPS`) y el GeoServer que declara
   * el backend en `paramae/URLGIS`. Se cachea para toda la sesión.
   */
  cargar(): Observable<GisEpsConfig> {
    if (!this.peticion$) {
      this.peticion$ = forkJoin({
        // Cada fuente se degrada por separado: si falla el GeoServer del
        // backend todavía sirve el `ccodeps`, y viceversa.
        empresa: this.consulGenericService.getdatosEmpresa().pipe(
          catchError(() => {
            console.warn(
              "[GIS] No se pudo obtener los datos de la empresa; no se conoce el ccodeps.",
            );
            return of(null);
          }),
        ),
        gis: this.paramaeService.URLGIS().pipe(
          catchError(() => {
            console.warn(
              "[GIS] No se pudo obtener paramae/URLGIS; se usa el GeoServer de la tabla CONFIG_EPS.",
            );
            return of(null);
          }),
        ),
      }).pipe(
        map(({ empresa, gis }) =>
          this.resolverEmpresa((empresa as any)?.data?.emp, gis?.aaData),
        ),
        catchError(() => of(configSinCapas("", "", ""))),
        tap((config) => {
          this.actual = config;
          // Las utilidades puras de `util/Geo.utils` leen la proyección de aquí.
          setProyeccionMapa(config.proyecciones.mapa);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.peticion$;
  }

  /** Traduce el `emp` del backend a la configuración GIS que le corresponde. */
  private resolverEmpresa(emp: any, gis?: GIS): GisEpsConfig {
    const lon = Number(emp?.longitud);
    const lat = Number(emp?.latitud);
    this.centroEmpresa =
      Number.isFinite(lon) && Number.isFinite(lat) && !(lon === 0 && lat === 0)
        ? [lon, lat]
        : undefined;

    const ccodeps: string | undefined = emp?.ccodeps
      ? String(emp.ccodeps).trim()
      : undefined;
    const config = ccodeps ? CONFIG_EPS[ccodeps] : undefined;

    if (config) return config;

    // Sin entrada propia no se puede saber cómo se llaman las capas de esta
    // EPS: no hay convención que derivar ni otra EPS de la que heredar. Se
    // conserva el GeoServer del backend y se deja el catálogo vacío.
    const workspace = gis?.ESPACIO?.trim() ?? "";
    const baseUrl = this.baseUrlGeoserver(gis?.URLGIS) ?? "";

    console.warn(
      `[GIS] La EPS "${ccodeps ?? "(sin ccodeps)"}" no tiene entrada en CONFIG_EPS; ` +
        `se omiten las capas WMS (los nombres de capa no se pueden deducir). ` +
        `Agregue su ccodeps en core/gis/eps-config.data.ts con las capas que publica.`,
    );

    return configSinCapas(ccodeps ?? "", baseUrl, workspace);
  }

  /** `URLGIS` llega como host raíz; el endpoint de GeoServer le agrega `/geoserver`. */
  private baseUrlGeoserver(urlGis: string | undefined): string | undefined {
    const raiz = urlGis?.trim().replace(/\/+$/, "");
    if (!raiz) return undefined;
    return /\/geoserver$/i.test(raiz) ? raiz : `${raiz}/geoserver`;
  }

  // ============================================================
  // LECTURA
  // ============================================================

  get config(): GisEpsConfig {
    return this.actual;
  }

  get ccodeps(): string {
    return this.actual.ccodeps;
  }

  get proyecciones(): GisProyeccionesConfig {
    return this.actual.proyecciones;
  }

  get proyeccionMapa(): string {
    return this.actual.proyecciones.mapa;
  }

  /** Zona UTM de la EPS (varía con la región, no es siempre 18S). */
  get proyeccionUtm(): string {
    return this.actual.proyecciones.utm;
  }

  get vista(): GisVistaConfig {
    if (this.actual.vista) return this.actual.vista;
    if (this.centroEmpresa) {
      return { centro: this.centroEmpresa, zoom: ZOOM_POR_DEFECTO };
    }
    return VISTA_POR_DEFECTO;
  }

  /** `true` si la EPS tiene GeoServer resuelto y publica al menos una capa. */
  get tieneGeoserver(): boolean {
    const { baseUrl, workspace } = this.actual.geoserver;
    return !!baseUrl && !!workspace;
  }

  /** Endpoint WMS del workspace de la EPS. */
  urlWms(): string {
    const { baseUrl, workspace } = this.actual.geoserver;
    return `${baseUrl}/${workspace}/wms`;
  }

  /** Endpoint OWS/WFS del workspace de la EPS. */
  urlWfs(): string {
    const { baseUrl, workspace } = this.actual.geoserver;
    return `${baseUrl}/${workspace}/ows`;
  }

  urlGetFeature(id: CapaGisId, cqlFilter?: string): string | null {
    const typeName = this.capa(id);
    if (!typeName) return null;

    const params = new URLSearchParams({
      service: "WFS",
      version: "1.0.0",
      request: "GetFeature",
      typeName,
      outputFormat: "application/json",
    });
    if (cqlFilter) params.set("CQL_FILTER", cqlFilter);

    return `${this.urlWfs()}?${params.toString()}`;
  }

  // ============================================================
  // CAPAS
  // ============================================================

  /** Catálogo crudo declarado por la EPS. */
  get capasDeclaradas(): CapasGis {
    return this.actual.capas;
  }

  /** `true` si la EPS publica esa capa. */
  tieneCapa(id: CapaGisId): boolean {
    return !!this.actual.capas[id];
  }

  capa(id: CapaGisId): string {
    return this.calificar(this.actual.capas[id]);
  }

  /** Nombres de varias capas, separados por coma, omitiendo las no publicadas. */
  capas(...ids: CapaGisId[]): string {
    return ids
      .map((id) => this.capa(id))
      .filter((nombre) => !!nombre)
      .join(",");
  }

  lotesPorSector(sufijo: string): string {
    const plantilla = this.actual.capas.lotesPorSector;
    if (!plantilla) return this.capa("lotes");
    return this.calificar(plantilla.replace("{sector}", sufijo));
  }

  /**
   * Capas WMS que esta EPS publica, listas para pintar switches. El orden es el
   * de declaración en `CONFIG_EPS`, de modo que cada EPS controla su propia
   * barra lateral sin que ningún componente hardcodee una lista.
   *
   * Se excluyen las plantillas (las que llevan `{sector}`, que no son una capa
   * concreta) y los roles que el llamador maneje aparte (capas vectoriales
   * propias, por ejemplo `usuarios`).
   */
  capasParaUi(excluir: CapaGisId[] = []): CapaGisUi[] {
    const omitidos = new Set<string>(excluir);
    return Object.entries(this.actual.capas)
      .filter(
        ([rol, nombre]) =>
          !!nombre && !nombre.includes("{") && !omitidos.has(rol),
      )
      .map(([rol]) => ({
        id: rol,
        label: this.etiquetaCapa(rol),
        capa: this.capa(rol),
      }));
  }

  /**
   * Id de switch usado por las barras laterales -> rol de capa del catálogo.
   * Es vocabulario de la UI (igual para todas las EPS), no una convención sobre
   * los nombres reales de las capas.
   */
  private static readonly ROL_POR_SWITCH: Record<string, CapaGisId> = {
    lotes: "lotes",
    sectores: "sectoresComerciales",
    calles: "calles",
  };

  /**
   * Quita los switches respaldados por una capa WMS que esta EPS no publica.
   * Los switches de capas vectoriales (las que arma la propia pantalla con
   * datos del backend) no dependen de GeoServer y se conservan siempre.
   */
  soloCapasPublicadas<T extends { id: string }>(switches: T[]): T[] {
    return switches.filter((s) => {
      const rol = GisConfigService.ROL_POR_SWITCH[s.id];
      return !rol || this.tieneCapa(rol);
    });
  }

  /** Rótulo declarado por la EPS o, si no lo declara, derivado del rol. */
  etiquetaCapa(id: CapaGisId): string {
    const declarada = this.actual.etiquetas?.[id];
    if (declarada) return declarada;
    // `sectoresComerciales` -> "Sectores Comerciales"
    const palabras = String(id)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim();
    return palabras.charAt(0).toUpperCase() + palabras.slice(1);
  }

  /**
   * Califica con el workspace de la EPS un nombre de capa que no está en el
   * catálogo (por ejemplo, capas que llegan por parámetro de ruta).
   */
  calificarCapa(nombre: string | undefined): string {
    return this.calificar(nombre);
  }

  /** Antepone el workspace salvo que el nombre ya venga calificado. */
  private calificar(nombre: string | undefined): string {
    if (!nombre) return "";
    if (nombre.includes(":")) return nombre;
    return `${this.actual.geoserver.workspace}:${nombre}`;
  }
}
