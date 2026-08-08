import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { conConfigGis } from "../core/gis";

const routes: Routes = conConfigGis([
  {
    path: "main",
    loadChildren: () =>
      import("../_pages/main-georeferencia/main-georeferencia.module").then(
        (m) => m.MainGeoreferenciaModule,
      ),
  },
  {
    path: "maps",
    loadChildren: () =>
      import("../_pages/gis/gis.module").then((m) => m.GisModule),
  },
  {
    path: "catastrocomercial",
    loadChildren: () =>
      import("../_pages/catastrocomercial/catastrocomercial-routing.module").then(
        (m) => m.CatastrocomercialRoutingModule,
      ),
  },
  {
    path: "cortes",
    loadChildren: () =>
      import("../_pages/cortes/cortes.module").then((m) => m.CortesModule),
  },
  {
    path: "micromedicion/control-digitacion",
    loadComponent: () =>
      import("../_pages/micromedicion/controldigitacion/controldigitacion.component").then(
        (m) => m.ControldigitacionComponent,
      ),
  },
  {
    path: "micromedicion/seguimiento_de_lectura_x_inspector",
    loadComponent: () =>
      import("../_pages/micromedicion/seguimiento-de-lectura-xinspector/seguimiento-de-lectura-xinspector.component").then(
        (m) => m.SeguimientoDeLecturaXinspectorComponent,
      ),
  },
  {
    path: "cobranza/seguimiento_cortes_conprograma",
    loadComponent: () =>
      import("../_pages/cobranza/seguimiento-cortescon-programa/seguimiento-cortescon-programa.component").then(
        (m) => m.SeguimientoCortesconProgramaComponent,
      ),
  },
  {
    path: "cobranza/seguimiento_reapertura_conprograma",
    loadComponent: () =>
      import("../_pages/cobranza/seguimiento-reaperturacon-programa/seguimiento-reaperturacon-programa.component").then(
        (m) => m.SeguimientoReaperturaconProgramaComponent,
      ),
  },
  {
    path: "catastro/padron_de_clientes",
    loadComponent: () =>
      import("../_pages/catastro/padron-de-clientes/padron-de-clientes.component").then(
        (m) => m.PadronDeClientesComponent,
      ),
  },
  { path: "", redirectTo: "/main", pathMatch: "full" },
]);

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PagesGeoreferenciaRoutingModule {}
