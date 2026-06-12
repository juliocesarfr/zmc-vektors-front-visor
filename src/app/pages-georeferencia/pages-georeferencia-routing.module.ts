import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [{
              path: "main",
              loadChildren: () =>
                import("../_pages/main-georeferencia/main-georeferencia.module").then((m) => m.MainGeoreferenciaModule),
              },
              {
                path: "georeferencia",
                loadChildren: () =>
                  import("../_pages/georeferencia/georeferencia.module").then(
                    (m) => m.GeoreferenciaModule
                  ),
              },
              {
                path: "maps",
                loadChildren: () =>
                  import("../_pages/gis/gis.module").then(
                    (m) => m.GisModule
                  ),
              },
              { path: '', redirectTo:'/main' , pathMatch: 'full'}
            ];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PagesGeoreferenciaRoutingModule { }
