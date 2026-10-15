import { Router } from '@angular/router';

/**
 * Navega desde cualquier subpágina o módulo secundario de Georreferencia
 * de regreso al visor principal (/main).
 * Soporta tanto ejecución standalone (localhost) como host microfrontend (/gis/..., /view/vektors/gis/...).
 */
export function volverAlMainGeoreferencia(router: Router): void {
  const currentUrl = router.url.split('?')[0];

  // Caso 1: Si corre dentro del host y contiene el segmento '/gis'
  const gisIdx = currentUrl.indexOf('/gis');
  if (gisIdx !== -1) {
    const baseUrl = currentUrl.substring(0, gisIdx + 4); // E.g., '/gis' o '/view/vektors/gis'
    router.navigateByUrl(`${baseUrl}/main`);
    return;
  }

  // Caso 2: Si corre standalone o con prefijo conocido del módulo
  const subroutePrefixes = [
    '/micromedicion',
    '/cobranza',
    '/catastro',
    '/vma',
    '/facturacion',
  ];
  for (const prefix of subroutePrefixes) {
    const idx = currentUrl.indexOf(prefix);
    if (idx !== -1) {
      const baseUrl = currentUrl.substring(0, idx);
      router.navigateByUrl(`${baseUrl}/main`);
      return;
    }
  }

  // Fallback por defecto
  router.navigateByUrl('/main');
}
