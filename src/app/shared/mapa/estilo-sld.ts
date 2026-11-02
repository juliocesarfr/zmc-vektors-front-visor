import type { EstiloCapaGis } from "../../core/gis/gis-config.model";

const parametro = (nombre: string, valor: string | number) => `<CssParameter name="${nombre}">${valor}</CssParameter>`;

function simbolo(estilo: EstiloCapaGis): string {
  if (estilo.forma === "area") {
    return (
      `<PolygonSymbolizer><Fill>${parametro("fill", estilo.color)}${parametro("fill-opacity", 0.12)}</Fill>` +
      `<Stroke>${parametro("stroke", estilo.color)}${parametro("stroke-width", 2)}</Stroke></PolygonSymbolizer>`
    );
  }
  return (
    `<PointSymbolizer><Graphic><Mark><WellKnownName>circle</WellKnownName>` +
    `<Fill>${parametro("fill", estilo.color)}</Fill>` +
    `<Stroke>${parametro("stroke", "#ffffff")}${parametro("stroke-width", 1)}</Stroke>` +
    `</Mark><Size>8</Size></Graphic></PointSymbolizer>`
  );
}

function rotulo(estilo: EstiloCapaGis): string {
  if (!estilo.campoEtiqueta) return "";
  return (
    `<TextSymbolizer><Label><ogc:PropertyName>${estilo.campoEtiqueta}</ogc:PropertyName></Label>` +
    `<Font>${parametro("font-family", "Arial")}${parametro("font-size", 12)}${parametro("font-weight", "bold")}</Font>` +
    `<Halo><Radius>2</Radius><Fill>${parametro("fill", "#ffffff")}</Fill></Halo>` +
    `<Fill>${parametro("fill", estilo.color)}</Fill></TextSymbolizer>`
  );
}

/**
 * SLD para mandar como SLD_BODY.
 * @param nombreCapa nombre SIN workspace: el servicio WMS del workspace ignora el estilo si lleva prefijo.
 */
export function crearSld(nombreCapa: string, estilo: EstiloCapaGis): string {
  const escala = estilo.escalaMaxima ? `<MaxScaleDenominator>${estilo.escalaMaxima}</MaxScaleDenominator>` : "";
  return (
    `<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">` +
    `<NamedLayer><Name>${nombreCapa}</Name><UserStyle><FeatureTypeStyle>` +
    `<Rule>${escala}${simbolo(estilo)}${rotulo(estilo)}</Rule>` +
    `</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`
  );
}
