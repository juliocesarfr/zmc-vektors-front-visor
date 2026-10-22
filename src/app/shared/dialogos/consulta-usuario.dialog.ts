import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";

/**
 * Abre la "Consulta General de Usuario" de mf-consulta para un cliente.
 * Es el único lugar de este microfrontend que depende de mf-consulta.
 * La pantalla pesa unos 5 MB: se carga recién al abrirla, no junto con el mapa.
 */
export async function abrirConsultaUsuario(
  dialogService: DialogService,
  codcliente: string | number,
  codsuc: string | undefined,
): Promise<DynamicDialogRef> {
  const { ConsultaUsuarioComponent } = await import("@mf-consulta/_pages/consulta-usuario/consulta-usuario.component");
  return dialogService.open(ConsultaUsuarioComponent, {
    header: "Consulta General de Usuario",
    width: "90%",
    height: "95%",
    baseZIndex: 10000,
    maximizable: true,
    data: { codcliente, codsuc, operacion: "Vektors" },
  });
}
