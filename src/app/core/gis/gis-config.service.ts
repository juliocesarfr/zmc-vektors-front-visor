import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { catchError, map, shareReplay, tap } from "rxjs/operators";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";

import {
  CapaGisId,
  GisEpsConfig,
  GisProyeccionesConfig,
  GisVistaConfig,
} from "./gis-config.model";
import {
  CONFIG_EPS,
  CONFIG_EPS_DEFAULT,
  ZOOM_POR_DEFECTO,
} from "./eps-config.data";


@Injectable({ providedIn: "root" })
export class GisConfigService {
  private readonly consulGenericService = inject(ConsulGenericService);

  private peticion$?: Observable<GisEpsConfig>;

   private actual: GisEpsConfig = CONFIG_EPS_DEFAULT;

  private centroEmpresa?: [number, number];

  
  cargar(): Observable<GisEpsConfig> {
    if (!this.peticion$) {
      this.peticion$ = this.consulGenericService.getdatosEmpresa().pipe(
        map((respuesta) => this.resolverEmpresa(respuesta?.data?.emp)),
        catchError(() => {
          console.warn(
            "[GIS] No se pudo obtener los datos de la empresa; se usa la configuración por defecto.",
          );
          return of(CONFIG_EPS_DEFAULT);
        }),
        tap((config) => (this.actual = config)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.peticion$;
  }

  /** Traduce el `emp` del backend a la configuración GIS que le corresponde. */
  private resolverEmpresa(emp: any): GisEpsConfig {
    const lon = Number(emp?.longitud);
    const lat = Number(emp?.latitud);
    this.centroEmpresa =
      Number.isFinite(lon) && Number.isFinite(lat) && !(lon === 0 && lat === 0)
        ? [lon, lat]
        : undefined;

    const ccodeps = emp?.ccodeps;
    const config = ccodeps ? CONFIG_EPS[ccodeps] : undefined;

    if (!config) {
      console.warn(
        `[GIS] La EPS "${ccodeps ?? "(sin ccodeps)"}" no tiene configuración en CONFIG_EPS; ` +
          `se usa la de "${CONFIG_EPS_DEFAULT.descripcion}". ` +
          `Agregue una entrada en core/gis/eps-config.data.ts.`,
      );
      return CONFIG_EPS_DEFAULT;
    }
    return config;
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
    return CONFIG_EPS_DEFAULT.vista!;
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

  /** Antepone el workspace salvo que el nombre ya venga calificado. */
  private calificar(nombre: string | undefined): string {
    if (!nombre) return "";
    if (nombre.includes(":")) return nombre;
    return `${this.actual.geoserver.workspace}:${nombre}`;
  }
}
