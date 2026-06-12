import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [{path: "",
  loadComponent: () => import("@mf-georeferencia/_pages/main-georeferencia/main-georeferencia.component").then((m) => m.MainGeoreferenciaComponent)
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MainGeoreferenciaRoutingModule { }
