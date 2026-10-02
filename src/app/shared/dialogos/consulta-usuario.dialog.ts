import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";
import { ConsultaUsuarioComponent } from "@mf-consulta/_pages/consulta-usuario/consulta-usuario.component";

/**
 * Abre la "Consulta General de Usuario" de mf-consulta para un cliente.
 * Es el único lugar de este microfrontend que depende de mf-consulta.
 */
export function abrirConsultaUsuario(
  dialogService: DialogService,
  codcliente: string | number,
  codsuc: string | undefined,
): DynamicDialogRef {
  return dialogService.open(ConsultaUsuarioComponent, {
    header: "Consulta General de Usuario",
    width: "90%",
    height: "95%",
    baseZIndex: 10000,
    maximizable: true,
    data: { codcliente, codsuc, operacion: "Vektors" },
  });
}
