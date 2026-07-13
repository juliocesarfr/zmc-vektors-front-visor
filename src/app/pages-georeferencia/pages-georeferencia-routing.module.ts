import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [{
              path: "main",
              loadChildren: () =>
                import("../_pages/main-georeferencia/main-georeferencia.module").then((m) => m.MainGeoreferenciaModule),
              },
              {
                path: "maps",
                loadChildren: () =>
                  import("../_pages/gis/gis.module").then(
                    (m) => m.GisModule
                  ),
              },
              {
                path: "catastrocomercial",
                loadChildren: () =>
                  import("../_pages/catastrocomercial/catastrocomercial-routing.module").then(
                    (m) => m.CatastrocomercialRoutingModule
                  ),
              },
              {
                path: "cortes",
                loadChildren: () =>
                  import("../_pages/cortes/cortes.module").then(
                    (m) => m.CortesModule
                  ),
              },
              {
                path: "micromedicion/control-digitacion",
                loadComponent: () =>
                  import("../_pages/micromedicion/controldigitacion/controldigitacion.component")
                    .then(m => m.ControldigitacionComponent),
              },
              { path: '', redirectTo:'/main' , pathMatch: 'full'},
            ];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PagesGeoreferenciaRoutingModule { }
