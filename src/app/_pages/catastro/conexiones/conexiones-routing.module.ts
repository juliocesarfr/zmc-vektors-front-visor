import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [{path: "",
  loadComponent: () => import("@mf-georeferencia/_pages/catastro/conexiones/conexiones.component").then((m) => m.ConexionesComponent)
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ConexionesRoutingModule { }
