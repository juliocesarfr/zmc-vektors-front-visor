import { Injectable, inject } from "@angular/core";
import { HttpBackend, HttpClient } from "@angular/common/http";
import { Observable, of } from "rxjs";
import { catchError, map } from "rxjs/operators";
import GeoJSON from "ol/format/GeoJSON";
import { get as obtenerProyeccion } from "ol/proj";
import type View from "ol/View";
import type TileLayer from "ol/layer/Tile";
import type TileWMS from "ol/source/TileWMS";
import type Geometry from "ol/geom/Geometry";
import type { Coordinate } from "ol/coordinate";
import type { ProjectionLike } from "ol/proj";

import { CapaGisId } from "./gis-config.model";
import { GisConfigService } from "./gis-config.service";
import { formatoFechaCorta } from "../../shared/utils/fechas.utils";

export interface CapaConsultable {
  rol: CapaGisId;
  capa: TileLayer<TileWMS>;
}

export interface AtributoGis {
  etiqueta: string;
  valor: string;
}

export interface ElementoGis {
  rol: CapaGisId;
  /** Rótulo de la capa ("Válvulas"). */
  capa: string;
  /** Identificador del elemento ("E0898TPV01"); si la capa no lo tiene, el rótulo de la capa. */
  titulo: string;
  atributos: AtributoGis[];
  /** En la proyección del mapa, para resaltarlo. */
  geometria?: Geometry;
}

interface RespuestaGeoServer {
  features?: any[];
  crs?: { properties?: { name?: string } };
}

const MAXIMO_ELEMENTOS = 10;

// Píxeles de tolerancia alrededor del clic: una válvula es un punto diminuto y sin margen casi nunca se acierta.
const TOLERANCIA_PX = 8;

// Solo se ocultan cuando la capa no declara sus atributos en CONFIG_EPS.
const COLUMNAS_OCULTAS = new Set([
  "geom", "the_geom", "geometry", "shape", "bbox", "id_prov", "id_dist", "minorloss",
  "roughness", "hor_reg", "plano_pdf", "plano_dwg", "plano_dxf", "doc_adicional",
]);

const PRIORIDAD_POLIGONO = 2;

// Un punto encima de una línea o de un lote es casi siempre lo que el usuario quiso tocar.
const PRIORIDAD_GEOMETRIA: Record<string, number> = {
  Point: 0,
  MultiPoint: 0,
  LineString: 1,
  MultiLineString: 1,
  Polygon: PRIORIDAD_POLIGONO,
  MultiPolygon: PRIORIDAD_POLIGONO,
};

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}(Z|T[\d:.]+Z?)?$/;

@Injectable({ providedIn: "root" })
export class ConsultaCapasGisService {
  private readonly gis = inject(GisConfigService);
  private readonly formatoGeoJson = new GeoJSON();

  // Sin interceptores: el del host pondría el token del ERP en una petición a GeoServer,
  // forzaría un preflight CORS y un 401 de GeoServer cerraría la sesión.
  private readonly http = new HttpClient(inject(HttpBackend));

  /**
   * Pregunta a GeoServer qué hay bajo el clic en las capas WMS visibles, con una sola
   * petición GetFeatureInfo. Devuelve primero lo más cercano al clic.
   */
  consultarPunto(
    capas: CapaConsultable[],
    coordenada: Coordinate,
    vista: View,
  ): Observable<ElementoGis[]> {
    const visibles = capas.filter(({ capa }) => capa.getVisible() && capa.getSource());
    if (visibles.length === 0) return of([]);

    const rolPorNombre = new Map<string, CapaGisId>();
    const nombres: string[] = [];
    for (const { rol, capa } of visibles) {
      const nombresCapa = String(capa.getSource()!.getParams()["LAYERS"] ?? "")
        .split(",")
        .filter(Boolean);
      for (const nombre of nombresCapa) {
        nombres.push(nombre);
        rolPorNombre.set(this.sinWorkspace(nombre), rol);
      }
    }
    if (nombres.length === 0) return of([]);

    const capasTexto = nombres.join(",");
    const url = visibles[0].capa.getSource()!.getFeatureInfoUrl(
      coordenada,
      vista.getResolution()!,
      vista.getProjection(),
      {
        LAYERS: capasTexto,
        QUERY_LAYERS: capasTexto,
        INFO_FORMAT: "application/json",
        FEATURE_COUNT: MAXIMO_ELEMENTOS,
        BUFFER: TOLERANCIA_PX,
      },
    );
    if (!url) return of([]);

    return this.http.get<RespuestaGeoServer>(url).pipe(
      map((respuesta) => {
        const proyeccionDatos = respuesta.crs?.properties?.name;
        const elementos = (respuesta.features ?? [])
          .map((elemento) =>
            this.aElementoGis(elemento, rolPorNombre, proyeccionDatos, vista.getProjection()),
          )
          .filter((elemento) => this.contieneSiEsPoligono(elemento, coordenada));
        return this.titulosUnicos(this.ordenarPorCercania(elementos, coordenada));
      }),
      catchError((error) => {
        console.warn("[GIS] No se pudo consultar GetFeatureInfo.", error);
        return of([]);
      }),
    );
  }

  /** Polígono del lote de un cliente, en la proyección del mapa. `undefined` si la EPS no lo publica o no existe. */
  buscarPredioDeCliente(
    codcliente: string,
    proyeccionMapa: string,
  ): Observable<Geometry | undefined> {
    const { campoCliente } = this.gis.consultaCapa("lotes");
    // Solo dígitos: el código va dentro de un filtro CQL.
    if (!campoCliente || !/^\d+$/.test(codcliente)) return of(undefined);

    const url = this.gis.urlGetFeature("lotes", `${campoCliente}=${codcliente}`, {
      srsName: proyeccionMapa,
      maxFeatures: "1",
    });
    if (!url) return of(undefined);

    return this.http.get<RespuestaGeoServer>(url).pipe(
      map((respuesta) =>
        this.leerGeometria(
          respuesta.features?.[0]?.geometry,
          respuesta.crs?.properties?.name,
          proyeccionMapa,
        ),
      ),
      catchError((error) => {
        console.warn("[GIS] No se pudo ubicar el predio del cliente.", error);
        return of(undefined);
      }),
    );
  }

  // GeoServer identifica cada elemento como "<capa>.<id>", sin el workspace.
  private aElementoGis(
    elemento: any,
    rolPorNombre: Map<string, CapaGisId>,
    proyeccionDatos: string | undefined,
    proyeccionMapa: ProjectionLike,
  ): ElementoGis {
    const nombreCapa = String(elemento?.id ?? "").replace(/\.[^.]*$/, "");
    const rol = rolPorNombre.get(nombreCapa) ?? nombreCapa;
    const propiedades: Record<string, unknown> = elemento?.properties ?? {};
    const etiquetaCapa = rolPorNombre.has(nombreCapa) ? this.gis.etiquetaCapa(rol) : nombreCapa;
    const { campoTitulo } = this.gis.consultaCapa(rol);
    const identificador = campoTitulo ? this.formatearValor(propiedades[campoTitulo]) : "";

    return {
      rol,
      capa: etiquetaCapa,
      titulo: identificador || etiquetaCapa,
      atributos: this.atributosVisibles(rol, propiedades),
      geometria: this.leerGeometria(elemento?.geometry, proyeccionDatos, proyeccionMapa),
    };
  }

  // Si GeoServer responde en una proyección que OpenLayers no conoce, el elemento se muestra sin resaltarlo.
  private leerGeometria(
    geometria: unknown,
    proyeccionDatos: string | undefined,
    proyeccionMapa: ProjectionLike,
  ): Geometry | undefined {
    if (!geometria || (proyeccionDatos && !obtenerProyeccion(proyeccionDatos))) return undefined;
    try {
      return this.formatoGeoJson.readGeometry(geometria, {
        dataProjection: proyeccionDatos ?? proyeccionMapa,
        featureProjection: proyeccionMapa,
      });
    } catch {
      return undefined;
    }
  }

  // La tolerancia sirve para atinarle a un punto o a una línea; en un polígono traería al lote vecino.
  private contieneSiEsPoligono(elemento: ElementoGis, coordenada: Coordinate): boolean {
    const geometria = elemento.geometria;
    if (!geometria || PRIORIDAD_GEOMETRIA[geometria.getType()] !== PRIORIDAD_POLIGONO) return true;
    return geometria.intersectsCoordinate(coordenada);
  }

  private ordenarPorCercania(elementos: ElementoGis[], coordenada: Coordinate): ElementoGis[] {
    const prioridad = (elemento: ElementoGis) =>
      PRIORIDAD_GEOMETRIA[elemento.geometria?.getType() ?? ""] ?? 3;
    const distancia = (elemento: ElementoGis) => {
      if (!elemento.geometria) return Infinity;
      const [x, y] = elemento.geometria.getClosestPoint(coordenada);
      return (x - coordenada[0]) ** 2 + (y - coordenada[1]) ** 2;
    };
    return [...elementos].sort(
      (a, b) => prioridad(a) - prioridad(b) || distancia(a) - distancia(b),
    );
  }

  // Dos tuberías sin código saldrían como "Tuberías" y "Tuberías": se numeran para distinguir las pestañas.
  private titulosUnicos(elementos: ElementoGis[]): ElementoGis[] {
    const vistos = new Map<string, number>();
    return elementos.map((elemento) => {
      const veces = (vistos.get(elemento.titulo) ?? 0) + 1;
      vistos.set(elemento.titulo, veces);
      return veces === 1 ? elemento : { ...elemento, titulo: `${elemento.titulo} (${veces})` };
    });
  }

  private atributosVisibles(
    rol: CapaGisId,
    propiedades: Record<string, unknown>,
  ): AtributoGis[] {
    const { atributos } = this.gis.consultaCapa(rol);
    const columnas = atributos
      ? Object.entries(atributos)
      : Object.keys(propiedades)
          .filter((columna) => !COLUMNAS_OCULTAS.has(columna.toLowerCase()))
          .map((columna) => [columna, this.gis.etiquetaCapa(columna)] as const);

    return columnas
      .map(([columna, etiqueta]) => ({ etiqueta, valor: this.formatearValor(propiedades[columna]) }))
      .filter((atributo) => atributo.valor !== "");
  }

  private formatearValor(valor: unknown): string {
    if (valor === null || valor === undefined || typeof valor === "object") return "";
    if (typeof valor === "boolean") return valor ? "Sí" : "No";
    if (typeof valor === "number") {
      return Number.isInteger(valor) ? String(valor) : valor.toFixed(2);
    }
    const texto = String(valor).trim();
    return FECHA_ISO.test(texto) ? formatoFechaCorta(texto) : texto;
  }

  private sinWorkspace(nombre: string): string {
    return nombre.includes(":") ? nombre.split(":")[1] : nombre;
  }
}
