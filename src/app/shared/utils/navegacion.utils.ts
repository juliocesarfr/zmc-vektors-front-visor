import { Router } from '@angular/router';

export function volverAlMainGeoreferencia(router: Router): void {
  // 1. Obtener la ruta actual tanto del hash de la ventana del navegador (host microfrontend) como de router.url
  const hash =
    typeof window !== 'undefined' && window.location && window.location.hash
      ? window.location.hash.replace(/^#/, '')
      : '';
  const currentUrl = (hash || router.url || '').split('?')[0];

  // 2. Resolver la ruta destino adecuada (/main dentro del contexto GIS activo)
  let targetUrl = '/view/sysco/gis/main';

  const gisIdx = currentUrl.indexOf('/gis');
  if (gisIdx !== -1) {
    const baseGis = currentUrl.substring(0, gisIdx + 4);
    targetUrl = `${baseGis}/main`;
  } else {
    // Si no contiene '/gis' en la ruta (ej. standalone o prefijo directo)
    const subroutePrefixes = [
      '/micromedicion',
      '/cobranza',
      '/catastro',
      '/comercializacion',
      '/recaudacion',
      '/vma',
      '/facturacion',
    ];
    let matchedPrefix = false;
    for (const prefix of subroutePrefixes) {
      const idx = currentUrl.indexOf(prefix);
      if (idx !== -1) {
        matchedPrefix = true;
        const baseUrl = currentUrl.substring(0, idx);
        targetUrl = baseUrl ? `${baseUrl}/main` : '/view/sysco/gis/main';
        break;
      }
    }
    if (!matchedPrefix && !currentUrl.includes('/main')) {
      targetUrl = '/view/sysco/gis/main';
    }
  }

  // Función auxiliar para actualizar el hash directamente en el navegador si usa HashLocationStrategy
  const actualizarHashDirecto = () => {
    if (typeof window !== 'undefined' && window.location) {
      const formattedHash = targetUrl.startsWith('/') ? `#${targetUrl}` : `/#/${targetUrl}`;
      if (window.location.hash !== formattedHash) {
        window.location.hash = formattedHash;
      }
    }
  };

  // 3. Intentar navegar con Angular Router
  router
    .navigateByUrl(targetUrl)
    .then((success) => {
      if (!success) {
        router
          .navigate([targetUrl])
          .then((s2) => {
            if (!s2) {
              actualizarHashDirecto();
            }
          })
          .catch(() => {
            actualizarHashDirecto();
          });
      }
    })
    .catch(() => {
      router
        .navigate([targetUrl])
        .then((s2) => {
          if (!s2) {
            actualizarHashDirecto();
          }
        })
        .catch(() => {
          actualizarHashDirecto();
        });
    });

  // 4. Mecanismo de seguridad garantizado para microfrontends con HashLocationStrategy:
  // Si transcurridos 100ms el hash del navegador no apunta a /main, forzarlo vía hashchange
  if (typeof window !== 'undefined' && window.location && window.location.hash) {
    setTimeout(() => {
      const actualHash = (window.location.hash || '').replace(/^#/, '').split('?')[0];
      if (!actualHash.endsWith('/main')) {
        actualizarHashDirecto();
      }
    }, 100);
  }
}
