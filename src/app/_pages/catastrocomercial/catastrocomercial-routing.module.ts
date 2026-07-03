import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CatastrocomercialComponent } from './catastrocomercial.component';

const routes: Routes = [
  {
    path: '',
    component: CatastrocomercialComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CatastrocomercialRoutingModule { }