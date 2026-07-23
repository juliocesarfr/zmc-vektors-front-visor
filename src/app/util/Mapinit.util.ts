import OlMap from "ol/Map";

export function observarTamanoMapa(
  map: OlMap,
  target: HTMLElement | string,
): () => void {
  const el =
    typeof target === "string" ? document.getElementById(target) : target;
  if (!el) return () => {};

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

  observer.observe(el);

  return () => observer.disconnect();
}
