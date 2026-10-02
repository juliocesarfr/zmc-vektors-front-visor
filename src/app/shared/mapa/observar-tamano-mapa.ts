import OlMap from "ol/Map";

/**
 * Recalcula el tamaño del mapa cada vez que cambia el de su contenedor (paneles
 * que se abren o cierran, ventana redimensionada). Devuelve la función para dejar
 * de observar; llamarla en `ngOnDestroy`.
 */
export function observarTamanoMapa(map: OlMap, contenedor: HTMLElement): () => void {
  let listo = false;

  const refrescar = () => {
    // updateSize recalcula el viewport; si ya hay alto, OL repinta el canvas.
    map.updateSize();
  };

  // Si el navegador no soporta ResizeObserver (muy improbable hoy), caemos a
  // un par de refrescos diferidos como respaldo.
  if (typeof ResizeObserver === "undefined") {
    requestAnimationFrame(refrescar);
    setTimeout(refrescar, 300);
    return () => {};
  }

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        refrescar();
        // Primer tamaño válido: un rAF extra asegura el pintado tras el layout.
        if (!listo) {
          listo = true;
          requestAnimationFrame(refrescar);
        }
      }
    }
  });

  observer.observe(contenedor);

  return () => observer.disconnect();
}
