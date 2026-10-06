import { Injectable, inject } from "@angular/core";
import { Observable, forkJoin, of } from "rxjs";
import { catchError, map, shareReplay, tap } from "rxjs/operators";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";

import {
  CapaGisId,
  CapasTecnicasGis,
  GisEpsConfig,
  GisVistaConfig,
} from "./gis-config.model";
import {
  CONFIG_EPS,
  configSinCapas,
  ETIQUETAS_POR_DEFECTO,
  VISTA_POR_DEFECTO,
  ZOOM_POR_DEFECTO,
} from "./eps-config.data";
import { setProyeccionMapa } from "./gis-proyeccion";

export interface CapaGisUi {
  id: CapaGisId;
  label: string;
  /** Nombre calificado con el workspace, listo para el parámetro `LAYERS`. */
  capa: string;
}

@Injectable({ providedIn: "root" })
export class GisConfigService {
  private readonly consulGenericService = inject(ConsulGenericService);

  private peticion$?: Observable<GisEpsConfig>;

  // Vacía hasta que `cargar()` resuelva: no hay configuración genérica válida para todas las EPS.
  private actual: GisEpsConfig = configSinCapas("", "", "");

  private centroEmpresa?: [number, number];

  // Combina el `ccodeps` de la empresa (CONFIG_EPS) con el GeoServer del backend. Se cachea en la sesión.
  cargar(): Observable<GisEpsConfig> {
    if (!this.peticion$) {
      this.peticion$ = forkJoin({
        empresa: this.consulGenericService.getdatosEmpresa().pipe(
          catchError(() => {
            console.warn(
              "[GIS] No se pudo obtener los datos de la empresa; no se conoce el ccodeps.",
            );
            return of(null);
          }),
        ),
      }).pipe(
        map(({ empresa }) => this.resolverEmpresa((empresa as any)?.data?.emp)),
        catchError(() => of(configSinCapas("", "", ""))),
        tap((config) => {
          this.actual = config;
          // Las utilidades puras de `shared/mapa/geo.utils` leen la proyección de aquí.
          setProyeccionMapa(config.proyecciones.mapa);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.peticion$;
  }

  private resolverEmpresa(emp: any): GisEpsConfig {
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

    // Sin entrada en CONFIG_EPS no se pueden deducir los nombres de capa: catálogo vacío.

    console.warn(
      `[GIS] La EPS "${ccodeps ?? "(sin ccodeps)"}" no tiene entrada en CONFIG_EPS; ` +
        `se omiten las capas WMS (los nombres de capa no se pueden deducir). ` +
        `Agregue su ccodeps en core/gis/eps-config.data.ts con las capas que publica.`,
    );

    return configSinCapas(ccodeps ?? "", emp?.URLGIS, emp?.WORKSPACE);
  }

  /** `URLGIS` llega como host raíz; el endpoint de GeoServer le agrega `/geoserver`. */

  get config(): GisEpsConfig {
    return this.actual;
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

  urlWms(): string {
    const { baseUrl, workspace } = this.actual.geoserver;
    return `${baseUrl}/${workspace}/wms`;
  }

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

  get capasTecnicasDeclaradas(): CapasTecnicasGis {
    return this.actual.capasTecnicas ?? {};
  }

  private nombreDeclarado(id: CapaGisId): string | undefined {
    return this.actual.capas[id] ?? this.actual.capasTecnicas?.[id];
  }

  tieneCapa(id: CapaGisId): boolean {
    return !!this.nombreDeclarado(id);
  }

  capa(id: CapaGisId): string {
    return this.calificar(this.nombreDeclarado(id));
  }

  lotesPorSector(sufijo: string): string {
    const plantilla = this.actual.capas.lotesPorSector;
    if (!plantilla) return this.capa("lotes");
    return this.calificar(plantilla.replace("{sector}", sufijo));
  }

  // Excluye las plantillas con `{sector}` y los roles de `excluir`.
  capasParaUi(excluir: CapaGisId[] = []): CapaGisUi[] {
    return this.aUi(this.actual.capas, excluir);
  }

  capasTecnicasParaUi(excluir: CapaGisId[] = []): CapaGisUi[] {
    return this.aUi(this.capasTecnicasDeclaradas, excluir);
  }

  private aUi(
    catalogo: Record<string, string | undefined>,
    excluir: CapaGisId[],
  ): CapaGisUi[] {
    const omitidos = new Set<string>(excluir);
    return Object.entries(catalogo)
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

  private static readonly ROL_POR_SWITCH: Record<string, CapaGisId> = {
    lotes: "lotes",
    sectores: "sectoresComerciales",
    calles: "calles",
    rutaLectura: "rutaLectura",
  };

  // Los switches vectoriales (sin rol WMS) se conservan siempre.
  soloCapasPublicadas<T extends { id: string }>(switches: T[]): T[] {
    return switches.filter((s) => {
      const rol = GisConfigService.ROL_POR_SWITCH[s.id];
      return !rol || this.tieneCapa(rol);
    });
  }

  etiquetaCapa(id: CapaGisId): string {
    const declarada = this.actual.etiquetas?.[id] ?? ETIQUETAS_POR_DEFECTO[id];
    if (declarada) return declarada;
    const palabras = String(id)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim();
    return palabras.charAt(0).toUpperCase() + palabras.slice(1);
  }

  calificarCapa(nombre: string | undefined): string {
    return this.calificar(nombre);
  }

  private calificar(nombre: string | undefined): string {
    if (!nombre) return "";
    if (nombre.includes(":")) return nombre;
    return `${this.actual.geoserver.workspace}:${nombre}`;
  }
}
