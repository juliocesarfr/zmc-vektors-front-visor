import { Component, CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DropdownModule } from "primeng/dropdown";
import { ButtonModule } from "primeng/button";
import { InputNumberModule } from "primeng/inputnumber";
import { InputTextModule } from "primeng/inputtext";
import { ToastModule } from "primeng/toast";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import { DialogService } from "primeng/dynamicdialog";

import {
  EstadoCorte,
  SeguimientoCortesconProgramaComponent,
} from "../seguimiento-cortescon-programa/seguimiento-cortescon-programa.component";

@Component({
  selector: "app-seguimiento-reaperturacon-programa",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DropdownModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    ToastModule,
    TagModule,
  ],
  templateUrl: "./seguimiento-reaperturacon-programa.component.html",
  styleUrl: "./seguimiento-reaperturacon-programa.component.scss",
  providers: [MessageService, DialogService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SeguimientoReaperturaconProgramaComponent extends SeguimientoCortesconProgramaComponent {
  protected override tipoOperacion = "002"; // 002 = REAPERTURAS
  protected override campoFechaEjecucion = "freapertura"; // fecha relevante distinta
  protected override etiquetaEjecutadoTxt = "REAPERTURADO";
  protected override titulo = "Seguimiento de Reaperturas con Programa";

  protected override COLORES = {
    ejecutado: "#22c55e", // REAPERTURADO -> verde
    pendiente: "#ef4444", // pendiente de reabrir -> rojo
    pagado: "#3b82f6", // pagó -> azul
  };
}
