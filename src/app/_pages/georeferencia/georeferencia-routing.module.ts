import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [{path: "",
  loadComponent: () => import("@mf-georeferencia/_pages/georeferencia/georeferencia.component").then((m) => m.GeoreferenciaComponent)
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GeoreferenciaRoutingModule { }
