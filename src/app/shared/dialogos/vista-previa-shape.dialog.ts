import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";
import {
  VistaPreviaShape,
  VistaPreviaShapeComponent,
} from "../components/vista-previa-shape/vista-previa-shape.component";

/** Abre la vista previa del shape; `onClose` emite `true` cuando el usuario confirma la descarga. */
export function abrirVistaPreviaShape(
  dialogService: DialogService,
  datos: VistaPreviaShape,
): DynamicDialogRef {
  return dialogService.open(VistaPreviaShapeComponent, {
    header: "Vista previa del shape",
    width: "70%",
    baseZIndex: 10000,
    maximizable: true,
    contentStyle: { overflow: "auto" },
    data: datos,
  });
}
