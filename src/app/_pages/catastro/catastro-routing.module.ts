import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: "conexiones",
    loadChildren: () =>
      import("../catastro/conexiones/conexiones-routing.module").then(
        (m) => m.ConexionesRoutingModule
      ),
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CatastroRoutingModule { }
