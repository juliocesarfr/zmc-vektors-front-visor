import { Injectable, inject } from "@angular/core";
import { HttpBackend, HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { transformExtent } from "ol/proj";
import type { Extent } from "ol/extent";

import { CapaGisId } from "./gis-config.model";
import { GisConfigService } from "./gis-config.service";
import { CapaConsultable, COLUMNAS_OCULTAS } from "./consulta-capas-gis.service";
import { WGS84 } from "./gis-proyeccion";
import { CapaShape, crearShapefile } from "../../shared/utils/shapefile";

export interface DescargaShape {
  /** Capas WMS de la pantalla; solo se descargan las visibles. */
  capasGis: CapaConsultable[];
  /** Capas dibujadas con datos del backend, ya recortadas a la vista. */
  capasLocales: CapaShape[];
  /** Vista del mapa, en la proyección del mapa. */
  extension: Extent;
  nombreArchivo: string;
}

export interface ResultadoDescargaShape {
  capas: string[];
}

interface PropiedadGeoServer {
  name: string;
  localType: string;
}

interface DescripcionGeoServer {
  featureTypes?: { typeName: string; properties: PropiedadGeoServer[] }[];
}

const TIPOS_GEOMETRIA = new Set([
  "Geometry", "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon",
]);

// Aunque la capa no declare sus atributos, estos datos personales no salen en el shape.
const COLUMNAS_PERSONALES = new Set(["dni", "telefono", "celular", "correo", "email"]);

@Injectable({ providedIn: "root" })
export class DescargaShapeGisService {
  private readonly gis = inject(GisConfigService);

  // Sin interceptores, por lo mismo que en ConsultaCapasGisService.
  private readonly http = new HttpClient(inject(HttpBackend));

  async descargar(descarga: DescargaShape): Promise<ResultadoDescargaShape> {
    // Se cargan recién aquí: las pantallas del mapa abren sin bajar el compresor.
    const [{ default: JSZip }, { saveAs }] = await Promise.all([import("jszip"), import("file-saver")]);
    const zip = new JSZip();
    const capas: string[] = [];

    const capasGis = this.capasGisVisibles(descarga.capasGis);
    if (capasGis.size > 0) {
      const contenidoGeoServer = await this.pedirShapeGeoServer(capasGis, descarga.extension);
      await zip.loadAsync(contenidoGeoServer);
      capas.push(...Array.from(capasGis.values(), (rol) => this.gis.etiquetaCapa(rol)));
    }

    for (const capa of descarga.capasLocales) {
      if (capa.elementos.length === 0) continue;
      const archivos = crearShapefile(capa);
      for (const [extension, contenido] of Object.entries(archivos)) {
        zip.file(`${capa.nombre}.${extension}`, contenido);
      }
      capas.push(capa.nombre);
    }

    if (capas.length > 0) {
      const archivo = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      saveAs(archivo, `${descarga.nombreArchivo}.zip`);
    }
    return { capas };
  }

  /** Nombres de las capas de GeoServer que entrarían en el shape, para mostrarlos antes de descargar. */
  etiquetasCapasGis(capas: CapaConsultable[]): string[] {
    return Array.from(this.capasGisVisibles(capas).values(), (rol) => this.gis.etiquetaCapa(rol));
  }

  // Por nombre de GeoServer: dos roles pueden apuntar a la misma capa publicada.
  private capasGisVisibles(capas: CapaConsultable[]): Map<string, CapaGisId> {
    const visibles = new Map<string, CapaGisId>();
    for (const { rol, capa } of capas) {
      const nombre = this.gis.capa(rol);
      if (nombre && capa.getVisible() && !visibles.has(nombre)) visibles.set(nombre, rol);
    }
    return visibles;
  }

  private async pedirShapeGeoServer(capas: Map<string, CapaGisId>, extension: Extent): Promise<Blob> {
    const nombres = Array.from(capas.keys());
    const columnas = await this.columnasPorCapa(nombres, capas);
    const [minimoX, minimoY, maximoX, maximoY] = transformExtent(extension, this.gis.proyeccionMapa, WGS84);

    const parametros = new URLSearchParams({
      service: "WFS",
      version: "1.0.0",
      request: "GetFeature",
      typeName: nombres.join(","),
      outputFormat: "SHAPE-ZIP",
      bbox: `${minimoX},${minimoY},${maximoX},${maximoY},${WGS84}`,
      propertyName: nombres.map((nombre) => `(${columnas.get(nombre)!.join(",")})`).join(""),
    });
    const archivo = await firstValueFrom(
      this.http.get(`${this.gis.urlWfs()}?${parametros}`, { responseType: "blob" }),
    );

    // GeoServer responde 200 con un XML cuando falla (por ejemplo, sin conexiones libres a PostGIS).
    if (!archivo.type.includes("zip")) {
      const detalle = (await archivo.text()).match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/)?.[1];
      throw new Error(detalle?.trim() || "GeoServer no devolvió el shape.");
    }
    return archivo;
  }

  /** Geometría principal más los atributos declarados de cada capa, para no sacar columnas internas ni datos personales. */
  private async columnasPorCapa(nombres: string[], capas: Map<string, CapaGisId>): Promise<Map<string, string[]>> {
    const parametros = new URLSearchParams({
      service: "WFS",
      version: "1.0.0",
      request: "DescribeFeatureType",
      typeName: nombres.join(","),
      outputFormat: "application/json",
    });
    const descripcion = await firstValueFrom(
      this.http.get<DescripcionGeoServer>(`${this.gis.urlWfs()}?${parametros}`),
    );

    const columnas = new Map<string, string[]>();
    for (const nombre of nombres) {
      const nombreSinWorkspace = nombre.split(":").pop();
      const propiedades =
        descripcion.featureTypes?.find((tipo) => tipo.typeName === nombreSinWorkspace)?.properties ?? [];
      const geometrias = propiedades.filter((propiedad) => TIPOS_GEOMETRIA.has(propiedad.localType));
      // Algunas tablas traen además un punto auxiliar de tipo genérico: se toma la geometría con tipo concreto.
      const geometria = geometrias.find((propiedad) => propiedad.localType !== "Geometry") ?? geometrias[0];
      if (!geometria) throw new Error(`La capa ${nombre} no tiene geometría publicada.`);

      const declarados = this.gis.consultaCapa(capas.get(nombre)!).atributos;
      const atributos = propiedades
        .filter((propiedad) => !TIPOS_GEOMETRIA.has(propiedad.localType))
        .map((propiedad) => propiedad.name)
        .filter((columna) =>
          declarados
            ? columna in declarados
            : !COLUMNAS_OCULTAS.has(columna.toLowerCase()) && !COLUMNAS_PERSONALES.has(columna.toLowerCase()),
        );
      columnas.set(nombre, [geometria.name, ...atributos]);
    }
    return columnas;
  }
}
