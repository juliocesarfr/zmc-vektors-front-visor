import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DialogModule } from "primeng/dialog";
import { ButtonModule } from "primeng/button";
import { Workbook } from "exceljs";
import * as fs from "file-saver";

import { ComercioOsm, EstadoCruceComercial, ResumenDeteccionOsm } from "../../../core/gis/osm-comercios.service";
import { abrirGoogleStreetView } from "../../mapa/street-view";

@Component({
  selector: "app-dialogo-comercios-osm",
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      [modal]="false"
      [resizable]="false"
      [draggable]="true"
      [style]="{ width: '92vw', maxWidth: '1100px', maxHeight: '90vh' }"
      [header]="'Detección de Comercios y Cruce con Suministros'"
      (onHide)="cerrar.emit()"
    >
      @if (resumen) {
        <div class="osm-panel-content">
          <!-- Métricas Resumen con paleta Sysco -->
          <div class="osm-metrics-bar">
            <div class="metric-card total" (click)="filtroEstado = 'TODOS'" [class.active]="filtroEstado === 'TODOS'">
              <div class="metric-num">{{ resumen.totalOsm }}</div>
              <div class="metric-label">
                <i class="pi pi-shop"></i> Total detectados
              </div>
            </div>

            <div class="metric-card no-registrado" (click)="filtroEstado = 'NO_REGISTRADO'" [class.active]="filtroEstado === 'NO_REGISTRADO'">
              <div class="metric-num">{{ resumen.noRegistrados }}</div>
              <div class="metric-label">
                <i class="pi pi-exclamation-triangle"></i> Sin cliente registrado
              </div>
            </div>

            <div class="metric-card cambio-uso" (click)="filtroEstado = 'CAMBIO_DE_USO'" [class.active]="filtroEstado === 'CAMBIO_DE_USO'">
              <div class="metric-num">{{ resumen.cambioDeUso }}</div>
              <div class="metric-label">
                <i class="pi pi-info-circle"></i> En tarifa doméstica
              </div>
            </div>

            <div class="metric-card coincidente" (click)="filtroEstado = 'COINCIDENTE'" [class.active]="filtroEstado === 'COINCIDENTE'">
              <div class="metric-num">{{ resumen.coincidentes }}</div>
              <div class="metric-label">
                <i class="pi pi-check-circle"></i> Regularizados
              </div>
            </div>
          </div>

          <!-- Barra de información y exportación -->
          <div class="osm-info-bar">
            <span class="info-radio">
              <i class="pi pi-compass"></i> Radio de búsqueda: <strong>{{ resumen.radioMetros }} m</strong>
            </span>
            <span class="separador">•</span>
            <span class="info-conteo">
              Mostrando: <strong>{{ comerciosFiltrados.length }}</strong> de {{ resumen.totalOsm }} comercios
            </span>
            <div class="osm-exportar">
              <button
                type="button"
                class="btn-excel"
                (click)="exportarExcel()"
                [disabled]="resumen.comercios.length === 0 || exportando"
                title="Descargar reporte en formato Excel"
              >
                <i class="pi" [class.pi-file-excel]="!exportando" [class.pi-spin]="exportando" [class.pi-spinner]="exportando"></i>
                <span>{{ exportando ? 'Generando...' : 'Exportar a Excel' }}</span>
              </button>
            </div>
          </div>

          <!-- Tabla de Resultados con cabecera oscura Sysco -->
          <div class="osm-tabla-wrap">
            <table class="osm-tabla">
              <thead>
                <tr>
                  <th>Comercio en OSM</th>
                  <th>Rubro</th>
                  <th>Estado del suministro</th>
                  <th>Suministro identificado</th>
                  <th style="text-align: center;">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @if (comerciosFiltrados.length === 0) {
                  <tr>
                    <td colspan="5" class="td-vacio">
                      No hay comercios con el filtro seleccionado.
                    </td>
                  </tr>
                }
                @for (c of comerciosFiltrados; track c.id) {
                  <tr>
                    <td>
                      <div class="nombre-comercio">{{ c.nombre }}</div>
                      @if (c.direccion) {
                        <div class="dir-comercio"><i class="pi pi-map-marker"></i> {{ c.direccion }}</div>
                      }
                    </td>
                    <td>
                      <span class="badge-rubro">{{ c.rubroLegible }}</span>
                    </td>
                    <td>
                      @if (c.estadoCruce === 'NO_REGISTRADO') {
                        <span class="badge-estado badge-rojo">
                          <i class="pi pi-times-circle"></i> Sin cliente registrado
                        </span>
                      } @else if (c.estadoCruce === 'CAMBIO_DE_USO') {
                        <span class="badge-estado badge-amarillo">
                          <i class="pi pi-exclamation-circle"></i> Tarifa {{ c.clienteCercano?.categoria || 'Doméstica' }}
                        </span>
                      } @else {
                        <span class="badge-estado badge-verde">
                          <i class="pi pi-check-circle"></i> Comercial formalizado
                        </span>
                      }
                    </td>
                    <td>
                      @if (c.clienteCercano) {
                        <div class="cliente-info">
                          <div class="suministro-tag">
                            <i class="pi pi-check"></i>
                            <span>Suministro: <strong>{{ c.clienteCercano.codcliente }}</strong></span>
                          </div>
                          @if (c.clienteCercano.propietario) {
                            <span class="titular">{{ c.clienteCercano.propietario }}</span>
                          }
                          @if (c.clienteCercano.direccion) {
                            <span class="dir-sysco"><i class="pi pi-map-marker"></i> {{ c.clienteCercano.direccion }}</span>
                          }
                        </div>
                      } @else {
                        <span class="sin-cliente"><i class="pi pi-ban"></i> Sin suministro identificado</span>
                      }
                    </td>
                    <td style="text-align: center;">
                      <div class="acciones-fila">
                        <button
                          type="button"
                          class="btn-accion-mini btn-mapa"
                          (click)="ubicarEnMapa(c)"
                          title="Ubicar en el mapa de Sysco y minimizar ventana"
                        >
                          <i class="pi pi-search"></i>
                        </button>
                        <button
                          type="button"
                          class="btn-accion-mini btn-street"
                          (click)="abrirStreetView(c)"
                          title="Ver fachada en Google Street View"
                        >
                          <i class="pi pi-external-link"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </p-dialog>
  `,
  styles: [`
    .osm-panel-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    .osm-metrics-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }

    .metric-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
      }

      &.active {
        border-width: 2px;
      }

      &.total.active {
        border-color: #0284c7;
        background: #f0f9ff;
      }
      &.no-registrado.active {
        border-color: #ef4444;
        background: #fef2f2;
      }
      &.cambio-uso.active {
        border-color: #f59e0b;
        background: #fffbeb;
      }
      &.coincidente.active {
        border-color: #10b981;
        background: #f0fdf4;
      }
    }

    .metric-num {
      font-size: 24px;
      font-weight: 800;
      line-height: 1.1;
      color: #0f172a;
    }

    .metric-card.total .metric-num { color: #0284c7; }
    .metric-card.no-registrado .metric-num { color: #dc2626; }
    .metric-card.cambio-uso .metric-num { color: #d97706; }
    .metric-card.coincidente .metric-num { color: #059669; }

    .metric-label {
      font-size: 11.5px;
      color: #64748b;
      font-weight: 600;
      margin-top: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;

      i { font-size: 11px; }
    }

    .osm-info-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 12.5px;
      color: #334155;
      background: #f8fafc;
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;

      .info-radio i {
        color: #0284c7;
        margin-right: 4px;
      }
    }

    .separador { color: #cbd5e1; }
    .osm-exportar { margin-left: auto; }

    .btn-excel {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 6px rgba(5, 150, 105, 0.3);
      transition: all 0.2s;

      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #047857 0%, #065f46 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(5, 150, 105, 0.4);
      }

      &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
    }

    .osm-tabla-wrap {
      max-height: 440px;
      overflow-y: auto;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .osm-tabla {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;

      th {
        position: sticky;
        top: 0;
        background: #0f172a;
        color: #ffffff;
        font-weight: 700;
        font-size: 11.5px;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        padding: 9px 12px;
        border-bottom: 2px solid #0284c7;
        text-align: left;
        z-index: 1;
      }

      td {
        padding: 8px 12px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: middle;
      }

      tr:hover td {
        background: #f8fafc;
      }
    }

    .td-vacio {
      text-align: center;
      padding: 28px !important;
      color: #94a3b8;
      font-style: italic;
    }

    .nombre-comercio {
      font-weight: 700;
      color: #0f172a;
      font-size: 13px;
    }

    .dir-comercio {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: 4px;

      i { font-size: 10px; color: #94a3b8; }
    }

    .badge-rubro {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
      font-size: 11px;
      font-weight: 600;
    }

    .badge-estado {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 9px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.2px;

      i { font-size: 11px; }
    }

    .badge-rojo {
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fca5a5;
    }

    .badge-amarillo {
      background: #fffbeb;
      color: #b45309;
      border: 1px solid #fcd34d;
    }

    .badge-verde {
      background: #f0fdf4;
      color: #047857;
      border: 1px solid #86efac;
    }

    .cliente-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 11.5px;
    }

    .suministro-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      color: #0369a1;
      font-weight: 600;

      i { font-size: 10px; color: #0284c7; }
      strong { color: #0f172a; font-weight: 800; }
    }

    .titular {
      color: #334155;
      font-weight: 500;
      font-size: 11px;
    }

    .dir-sysco {
      font-size: 10.5px;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 3px;

      i { font-size: 9px; }
    }

    .sin-cliente {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: #94a3b8;
      font-weight: 500;
      font-size: 11.5px;

      i { font-size: 11px; color: #cbd5e1; }
    }

    .acciones-fila {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .btn-accion-mini {
      border: none;
      width: 30px;
      height: 30px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      transition: all 0.2s;
    }

    .btn-mapa {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: #ffffff;
      box-shadow: 0 2px 5px rgba(2, 132, 199, 0.3);

      &:hover {
        background: linear-gradient(135deg, #0369a1 0%, #0c4a6e 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(2, 132, 199, 0.4);
      }
    }

    .btn-street {
      background: #fef08a;
      color: #854d0e;
      border: 1px solid #fde047;

      &:hover {
        background: #fde047;
        color: #713f12;
      }
    }
  `],
})
export class DialogoComerciosOsmComponent {
  @Input() visible = false;
  @Input() resumen: ResumenDeteccionOsm | null = null;

  @Output() cerrar = new EventEmitter<void>();
  @Output() seleccionarComercio = new EventEmitter<ComercioOsm>();

  filtroEstado: "TODOS" | EstadoCruceComercial = "TODOS";
  exportando = false;

  get comerciosFiltrados(): ComercioOsm[] {
    if (!this.resumen) return [];
    if (this.filtroEstado === "TODOS") return this.resumen.comercios;
    return this.resumen.comercios.filter((c) => c.estadoCruce === this.filtroEstado);
  }

  ubicarEnMapa(comercio: ComercioOsm): void {
    // Al seleccionar buscar un cliente/comercio, se minimiza la ventana para ver el mapa
    this.seleccionarComercio.emit(comercio);
    this.visible = false;
    this.cerrar.emit();
  }

  abrirStreetView(comercio: ComercioOsm): void {
    abrirGoogleStreetView(comercio.coordenada);
  }

  async exportarExcel(): Promise<void> {
    if (!this.resumen || this.resumen.comercios.length === 0 || this.exportando) return;

    this.exportando = true;
    try {
      const workbook = new Workbook();
      workbook.creator = "Sysco - Georreferencia";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("Comercios Detectados");

      // Anchos de columna optimizados
      worksheet.columns = [
        { key: "item", width: 8 },
        { key: "nombre", width: 34 },
        { key: "rubro", width: 24 },
        { key: "direccion_osm", width: 34 },
        { key: "estado", width: 32 },
        { key: "suministro", width: 22 },
        { key: "titular", width: 36 },
        { key: "tarifa", width: 22 },
        { key: "latitud", width: 15 },
        { key: "longitud", width: 15 },
      ];

      // Fila 2: Título principal
      worksheet.mergeCells("A2:J2");
      const titleCell = worksheet.getCell("A2");
      titleCell.value = "REPORTE DE FISCALIZACIÓN - COMERCIOS DETECTADOS (OPENSTREETMAP)";
      titleCell.font = { name: "Segoe UI", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0284C7" }, // Azul Sysco
      };
      worksheet.getRow(2).height = 30;

      // Fila 4 y 5: Resumen métrico
      const fechaStr = new Date().toLocaleString("es-PE");
      worksheet.getCell("A4").value = "Fecha de emisión:";
      worksheet.getCell("A4").font = { name: "Segoe UI", bold: true, size: 9 };
      worksheet.getCell("B4").value = fechaStr;
      worksheet.getCell("B4").font = { name: "Segoe UI", size: 9 };

      worksheet.getCell("D4").value = "Radio analizado:";
      worksheet.getCell("D4").font = { name: "Segoe UI", bold: true, size: 9 };
      worksheet.getCell("E4").value = `${this.resumen.radioMetros} metros`;
      worksheet.getCell("E4").font = { name: "Segoe UI", size: 9 };

      worksheet.getCell("G4").value = "Total detectados:";
      worksheet.getCell("G4").font = { name: "Segoe UI", bold: true, size: 9 };
      worksheet.getCell("H4").value = this.resumen.totalOsm;
      worksheet.getCell("H4").font = { name: "Segoe UI", bold: true, size: 10, color: { argb: "FF0284C7" } };

      worksheet.getCell("A5").value = "Sin suministro:";
      worksheet.getCell("A5").font = { name: "Segoe UI", bold: true, size: 9, color: { argb: "FFDC2626" } };
      worksheet.getCell("B5").value = this.resumen.noRegistrados;
      worksheet.getCell("B5").font = { name: "Segoe UI", bold: true, size: 9, color: { argb: "FFDC2626" } };

      worksheet.getCell("D5").value = "Tarifa doméstica:";
      worksheet.getCell("D5").font = { name: "Segoe UI", bold: true, size: 9, color: { argb: "FFD97706" } };
      worksheet.getCell("E5").value = this.resumen.cambioDeUso;
      worksheet.getCell("E5").font = { name: "Segoe UI", bold: true, size: 9, color: { argb: "FFD97706" } };

      worksheet.getCell("G5").value = "Regularizados:";
      worksheet.getCell("G5").font = { name: "Segoe UI", bold: true, size: 9, color: { argb: "FF059669" } };
      worksheet.getCell("H5").value = this.resumen.coincidentes;
      worksheet.getCell("H5").font = { name: "Segoe UI", bold: true, size: 9, color: { argb: "FF059669" } };

      // Fila 7: Cabecera de la tabla
      const headerValues = [
        "N°",
        "Comercio OSM",
        "Rubro",
        "Dirección OSM",
        "Estado del cruce",
        "Suministro identificado",
        "Titular Sysco",
        "Tarifa Sysco",
        "Latitud",
        "Longitud",
      ];
      const headerRow = worksheet.getRow(7);
      headerRow.values = headerValues;
      headerRow.height = 24;
      headerRow.eachCell((cell) => {
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0F172A" }, // Slate oscuro
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "medium", color: { argb: "FF0284C7" } },
        };
      });

      // Filas de datos
      this.resumen.comercios.forEach((c, index) => {
        const estadoDesc =
          c.estadoCruce === "NO_REGISTRADO"
            ? "SIN CLIENTE (POTENCIAL CLANDESTINO)"
            : c.estadoCruce === "CAMBIO_DE_USO"
              ? "EN TARIFA DOMÉSTICA (CAMBIO DE USO)"
              : "REGULARIZADO (TARIFA COMERCIAL)";

        const row = worksheet.addRow([
          index + 1,
          c.nombre,
          c.rubroLegible,
          c.direccion || "-",
          estadoDesc,
          c.clienteCercano?.codcliente ? String(c.clienteCercano.codcliente) : "SIN SUMINISTRO",
          c.clienteCercano?.propietario || "-",
          c.clienteCercano?.categoria || "-",
          c.coordenada[1],
          c.coordenada[0],
        ]);

        row.height = 20;
        row.eachCell((cell, colNumber) => {
          cell.font = { name: "Segoe UI", size: 9.5 };
          cell.alignment = {
            vertical: "middle",
            horizontal: colNumber === 1 || colNumber === 9 || colNumber === 10 ? "center" : "left",
          };
          cell.border = {
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          };

          // Colores de estado
          if (colNumber === 5) {
            if (c.estadoCruce === "NO_REGISTRADO") {
              cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFDC2626" } };
            } else if (c.estadoCruce === "CAMBIO_DE_USO") {
              cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFD97706" } };
            } else {
              cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF059669" } };
            }
          }
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const pad = (n: number) => String(n).padStart(2, "0");
      const d = new Date();
      const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
      fs.saveAs(blob, `Reporte_Comercios_OSM_${timestamp}.xlsx`);
    } catch (err) {
      console.error("[EXCEL] Error al exportar archivo Excel:", err);
    } finally {
      this.exportando = false;
    }
  }
}
