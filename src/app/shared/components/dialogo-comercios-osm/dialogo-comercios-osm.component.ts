import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Workbook } from "exceljs";
import * as fs from "file-saver";

import { ComercioOsm, EstadoCruceComercial, ResumenDeteccionOsm } from "../../../core/gis/osm-comercios.service";
import { abrirGoogleStreetView } from "../../mapa/street-view";

@Component({
  selector: "app-dialogo-comercios-osm",
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible && resumen) {
      <div class="osm-tabla-flotante" [class.con-popup-abierto]="hayPopupAbierto">
        <!-- Cabecera del panel flotante -->
        <div class="osm-tf-header">
          <div class="osm-tf-titulo">
            <i class="pi pi-compass"></i>
            <span>Comercios Detectados (OSM)</span>
            <span class="osm-tf-badge-radio">Radio: {{ resumen.radioMetros }}m</span>
            <span class="osm-tf-total-badge">{{ comerciosFiltrados.length }} / {{ resumen.totalOsm }}</span>
          </div>

          <div class="osm-tf-acciones">
            <button
              type="button"
              class="btn-tf-excel"
              (click)="exportarExcel()"
              [disabled]="resumen.comercios.length === 0 || exportando"
              title="Descargar reporte en formato Excel"
            >
              <i class="pi" [class.pi-file-excel]="!exportando" [class.pi-spin]="exportando" [class.pi-spinner]="exportando"></i>
              <span>Excel</span>
            </button>
            <button
              type="button"
              class="btn-tf-cerrar"
              (click)="cerrar.emit()"
              title="Cerrar tabla"
              aria-label="Cerrar tabla"
            >
              <i class="pi pi-times"></i>
            </button>
          </div>
        </div>

        <!-- Filtros rápidos por estado (pestañas compactas) -->
        <div class="osm-tf-filtros">
          <button
            type="button"
            class="tf-chip"
            [class.activo]="filtroEstado === 'TODOS'"
            (click)="filtroEstado = 'TODOS'"
          >
            Todos <span class="chip-num">({{ resumen.totalOsm }})</span>
          </button>
          <button
            type="button"
            class="tf-chip warn"
            [class.activo]="filtroEstado === 'NO_REGISTRADO'"
            (click)="filtroEstado = 'NO_REGISTRADO'"
          >
            <i class="pi pi-exclamation-triangle"></i> Sin cliente <span class="chip-num">({{ resumen.noRegistrados }})</span>
          </button>
          <button
            type="button"
            class="tf-chip domestico"
            [class.activo]="filtroEstado === 'CAMBIO_DE_USO'"
            (click)="filtroEstado = 'CAMBIO_DE_USO'"
          >
            <i class="pi pi-info-circle"></i> Doméstica <span class="chip-num">({{ resumen.cambioDeUso }})</span>
          </button>
          <button
            type="button"
            class="tf-chip ok"
            [class.activo]="filtroEstado === 'COINCIDENTE'"
            (click)="filtroEstado = 'COINCIDENTE'"
          >
            <i class="pi pi-check-circle"></i> Formalizados <span class="chip-num">({{ resumen.coincidentes }})</span>
          </button>
        </div>

        <!-- Contenedor scrollable de la tabla -->
        <div class="osm-tf-tabla-wrap">
          <table class="osm-tabla">
            <thead>
              <tr>
                <th>Comercio en OSM</th>
                <th>Rubro</th>
                <th>Estado del Suministro</th>
                <th>Suministro Identificado</th>
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
                        <i class="pi pi-times-circle"></i> Sin cliente
                      </span>
                    } @else if (c.estadoCruce === 'CAMBIO_DE_USO') {
                      <span class="badge-estado badge-amarillo">
                        <i class="pi pi-exclamation-circle"></i> Tarifa {{ c.clienteCercano?.categoria || 'Doméstica' }}
                      </span>
                    } @else {
                      <span class="badge-estado badge-verde">
                        <i class="pi pi-check-circle"></i> Formalizado
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
                        title="Ubicar en el mapa de Sysco"
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
  `,
  styles: [`
    .osm-tabla-flotante {
      position: absolute;
      bottom: 24px;
      right: 68px;
      z-index: 95;
      width: min(720px, calc(100vw - 100px));
      max-height: 380px;
      display: flex;
      flex-direction: column;
      background: linear-gradient(180deg, rgba(8, 18, 38, 0.96) 0%, rgba(4, 10, 24, 0.98) 100%);
      backdrop-filter: blur(16px) saturate(1.2);
      -webkit-backdrop-filter: blur(16px) saturate(1.2);
      border-radius: 12px;
      border: 1px solid rgba(0, 229, 255, 0.35);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0, 229, 255, 0.15);
      color: #e8edf2;
      font-family: "Segoe UI", Arial, sans-serif;
      overflow: hidden;
      animation: fadeInSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      transition: right 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);

      &.con-popup-abierto {
        right: 460px;
      }
    }

    @keyframes fadeInSlideUp {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .osm-tf-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: linear-gradient(90deg, rgba(2, 74, 118, 0.95) 0%, rgba(3, 38, 92, 0.95) 100%);
      border-bottom: 1px solid rgba(0, 229, 255, 0.25);
      color: #ffffff;
      flex-shrink: 0;

      .osm-tf-titulo {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.3px;
        text-transform: uppercase;

        i {
          font-size: 13px;
          color: #00e5ff;
        }

        .osm-tf-badge-radio {
          background: rgba(0, 229, 255, 0.2);
          color: #00e5ff;
          border: 1px solid rgba(0, 229, 255, 0.4);
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 999px;
        }

        .osm-tf-total-badge {
          background: rgba(2, 132, 199, 0.4);
          color: #ffffff;
          border: 1px solid rgba(56, 189, 248, 0.4);
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 999px;
        }
      }

      .osm-tf-acciones {
        display: flex;
        align-items: center;
        gap: 8px;

        .btn-tf-excel {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #059669;
          color: #ffffff;
          border: 1px solid #10b981;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
          transition: all 0.2s;

          &:hover:not(:disabled) {
            background: #047857;
            transform: translateY(-1px);
          }

          &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        }

        .btn-tf-cerrar {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.85);
          cursor: pointer;
          width: 26px;
          height: 26px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          transition: all 0.2s;

          &:hover {
            color: #ffffff;
            background: rgba(244, 63, 94, 0.4);
            border-color: #f43f5e;
          }
        }
      }
    }

    .osm-tf-filtros {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      background: rgba(6, 14, 30, 0.95);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;

      .tf-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.05);
        color: #94a3b8;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.18s;

        .chip-num {
          font-weight: 800;
        }

        &:hover {
          border-color: rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }

        &.activo {
          border-color: #00e5ff;
          background: rgba(0, 229, 255, 0.18);
          color: #00e5ff;
          font-weight: 700;
          box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
        }

        &.warn.activo {
          border-color: #f43f5e;
          background: rgba(244, 63, 94, 0.2);
          color: #fb7185;
          box-shadow: 0 0 10px rgba(244, 63, 94, 0.25);
        }

        &.domestico.activo {
          border-color: #f59e0b;
          background: rgba(245, 158, 11, 0.2);
          color: #fbbf24;
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.25);
        }

        &.ok.activo {
          border-color: #10b981;
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.25);
        }
      }
    }

    .osm-tf-tabla-wrap {
      overflow-y: auto;
      max-height: 250px;
      flex: 1;

      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;

      &::-webkit-scrollbar {
        width: 6px;
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 4px;
      }
    }

    .osm-tabla {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;

      th {
        position: sticky;
        top: 0;
        background: rgba(8, 22, 46, 0.98);
        color: #38bdf8;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        padding: 8px 12px;
        border-bottom: 2px solid rgba(0, 229, 255, 0.35);
        text-align: left;
        z-index: 1;
      }

      td {
        padding: 7px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        vertical-align: middle;
      }

      tr {
        background: transparent;

        &:nth-child(even) {
          background: rgba(255, 255, 255, 0.02);
        }

        &:hover td {
          background: rgba(0, 229, 255, 0.08);
        }
      }
    }

    .td-vacio {
      text-align: center;
      padding: 24px !important;
      color: #94a3b8;
      font-style: italic;
    }

    .nombre-comercio {
      font-weight: 700;
      color: #ffffff;
      font-size: 12.5px;
    }

    .dir-comercio {
      font-size: 10.5px;
      color: #94a3b8;
      margin-top: 1px;
      display: flex;
      align-items: center;
      gap: 4px;

      i { font-size: 10px; color: #64748b; }
    }

    .badge-rubro {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(2, 132, 199, 0.25);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.35);
      font-size: 10.5px;
      font-weight: 700;
    }

    .badge-estado {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.2px;

      i { font-size: 10.5px; }
    }

    .badge-rojo {
      background: rgba(244, 63, 94, 0.18);
      color: #fb7185;
      border: 1px solid rgba(244, 63, 94, 0.45);
    }

    .badge-amarillo {
      background: rgba(245, 158, 11, 0.18);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.45);
    }

    .badge-verde {
      background: rgba(16, 185, 129, 0.18);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.45);
    }

    .cliente-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 11px;
    }

    .suministro-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #00e5ff;
      font-weight: 700;

      i { font-size: 10px; }
    }

    .titular {
      font-size: 10.5px;
      color: #e2e8f0;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 220px;
    }

    .dir-sysco {
      font-size: 10px;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 3px;

      i { font-size: 9px; }
    }

    .sin-cliente {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #64748b;
      font-weight: 500;
      font-size: 11px;

      i { font-size: 10px; color: #475569; }
    }

    .acciones-fila {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }

    .btn-accion-mini {
      border: none;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11.5px;
      transition: all 0.2s;
    }

    .btn-mapa {
      background: rgba(2, 132, 199, 0.35);
      border: 1px solid #00e5ff;
      color: #00e5ff;
      box-shadow: 0 0 10px rgba(0, 229, 255, 0.2);

      &:hover {
        background: #0284c7;
        color: #ffffff;
        box-shadow: 0 0 12px rgba(0, 229, 255, 0.5);
        transform: translateY(-1px);
      }
    }

    .btn-street {
      background: rgba(245, 158, 11, 0.2);
      border: 1px solid rgba(245, 158, 11, 0.45);
      color: #fbbf24;

      &:hover {
        background: rgba(245, 158, 11, 0.35);
        color: #ffffff;
      }
    }
  `],
})
export class DialogoComerciosOsmComponent {
  @Input() visible = false;
  @Input() resumen: ResumenDeteccionOsm | null = null;
  @Input() set filtroInicial(val: "TODOS" | EstadoCruceComercial) {
    if (val) {
      this.filtroEstado = val;
    }
  }
  @Input() hayPopupAbierto = false;

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
    this.seleccionarComercio.emit(comercio);
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
      titleCell.value = "CRUCE DE COMERCIOS DETECTADOS EN OPENSTREETMAP CON SUMINISTROS SYSCO";
      titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF004B87" },
      };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(2).height = 30;

      // Fila 3: Parámetros de búsqueda
      worksheet.mergeCells("A3:J3");
      const subCell = worksheet.getCell("A3");
      subCell.value = `Radio analizado: ${this.resumen.radioMetros} metros  |  Total detectados: ${this.resumen.totalOsm}  |  Formalizados: ${this.resumen.coincidentes}  |  En tarifa doméstica: ${this.resumen.cambioDeUso}  |  Sin cliente: ${this.resumen.noRegistrados}  |  Fecha: ${new Date().toLocaleString()}`;
      subCell.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF334155" } };
      subCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(3).height = 20;

      // Fila 5: Encabezados de la tabla
      const headers = [
        "N°",
        "Nombre Comercio (OSM)",
        "Rubro",
        "Dirección Referencial",
        "Estado del Suministro",
        "Suministro Sysco",
        "Titular Suministro",
        "Categoría Tarifaria",
        "Latitud",
        "Longitud",
      ];
      const headerRow = worksheet.getRow(5);
      headerRow.height = 25;

      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1D4ED8" },
        };
        cell.alignment = { vertical: "middle", horizontal: idx === 0 ? "center" : "left" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "medium", color: { argb: "FF0891B2" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
      });

      // Filas de datos
      this.resumen.comercios.forEach((c, idx) => {
        const rowIndex = 6 + idx;
        const row = worksheet.getRow(rowIndex);
        row.height = 20;

        let estadoTexto = "Comercial formalizado";
        let estadoColor = "FFECFDF5";
        let estadoFontColor = "FF047857";

        if (c.estadoCruce === "NO_REGISTRADO") {
          estadoTexto = "Sin cliente registrado";
          estadoColor = "FFFFF1F2";
          estadoFontColor = "FFE11D48";
        } else if (c.estadoCruce === "CAMBIO_DE_USO") {
          estadoTexto = "En tarifa doméstica (Requiere regularizar)";
          estadoColor = "FFFFFBEB";
          estadoFontColor = "FFB45309";
        }

        row.getCell(1).value = idx + 1;
        row.getCell(2).value = c.nombre;
        row.getCell(3).value = c.rubroLegible;
        row.getCell(4).value = c.direccion || "-";
        row.getCell(5).value = estadoTexto;
        row.getCell(6).value = c.clienteCercano?.codcliente ? String(c.clienteCercano.codcliente) : "-";
        row.getCell(7).value = c.clienteCercano?.propietario || "-";
        row.getCell(8).value = c.clienteCercano?.categoria || "-";
        row.getCell(9).value = c.coordenada[1];
        row.getCell(10).value = c.coordenada[0];

        // Estilos para cada celda
        const bgColorFila = idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";
        for (let col = 1; col <= 10; col++) {
          const cell = row.getCell(col);
          cell.font = { name: "Arial", size: 9 };
          cell.alignment = { vertical: "middle", horizontal: col === 1 || col === 9 || col === 10 ? "center" : "left" };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: bgColorFila },
          };
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } },
          };
        }

        // Resaltar celda de estado
        const celdaEstado = row.getCell(5);
        celdaEstado.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: estadoColor },
        };
        celdaEstado.font = { name: "Arial", size: 9, bold: true, color: { argb: estadoFontColor } };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const fecha = new Date().toISOString().slice(0, 10);
      fs.saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `Comercios_OSM_${this.resumen.radioMetros}m_${fecha}.xlsx`,
      );
    } catch (e) {
      console.error("Error al exportar Excel de comercios OSM:", e);
    } finally {
      this.exportando = false;
    }
  }
}
