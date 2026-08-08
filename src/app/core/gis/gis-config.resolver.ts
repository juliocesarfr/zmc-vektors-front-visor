import { inject } from "@angular/core";
import { ResolveFn, Routes } from "@angular/router";

import { GisEpsConfig } from "./gis-config.model";
import { GisConfigService } from "./gis-config.service";

export const gisConfigResolver: ResolveFn<GisEpsConfig> = () =>
  inject(GisConfigService).cargar();
export function conConfigGis(routes: Routes): Routes {
  return routes.map((route) => {
    if (route.redirectTo !== undefined) return route;
    return {
      ...route,
      resolve: { ...(route.resolve ?? {}), gisConfig: gisConfigResolver },
    };
  });
}
