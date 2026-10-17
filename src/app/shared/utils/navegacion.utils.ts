import { Router } from '@angular/router';


export function volverAlMainGeoreferencia(router: Router): void {
  const currentUrl = router.url.split('?')[0];

 
  const gisIdx = currentUrl.indexOf('/gis');
  if (gisIdx !== -1) {
    router.navigateByUrl(`${baseUrl}/main`);
    return;
  }

  
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
