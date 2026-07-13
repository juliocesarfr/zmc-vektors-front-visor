import {
  Component,
  AfterViewInit,
  OnInit,
  CUSTOM_ELEMENTS_SCHEMA,
} from "@angular/core";
import { DatePipe } from "@angular/common";

import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import LayerGroup from "ol/layer/Group";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import Overlay from "ol/Overlay";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Style, Circle as CircleStyle, Fill, Stroke } from "ol/style";

import { MessageService } from "primeng/api";
import { AperturaMicromedicionService } from "@host/_servicios/micromedicion/apertura-micromedicion.service";
import { SucursalesService } from "@host/_servicios/seguridad/sucursales.service";
import { SectoresCicloService } from "@host/_servicios/seguridad/sectores-ciclo.service";
import { ConsulGenericService } from "@host/_servicios/consultaGeneral/consul-generic.service";
import { MicromedicionService } from "@host/_servicios/vektors/micromedicion.service";
import { FiltroLecturas } from "@host/_models/vektors/FiltroLecturas";
import { PrimeNGModule } from "@host/_modulos/primeng.module";
import { ValidacionSistemaService } from "@host/_servicios/validar/validacion-sistema.service";

@Component({
  selector: "app-controldigitacion",
  standalone: true,
  imports: [PrimeNGModule],
  templateUrl: "./controldigitacion.component.html",
  styleUrl: "./controldigitacion.component.scss",
  providers: [DatePipe, ValidacionSistemaService, MessageService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ControldigitacionComponent implements OnInit, AfterViewInit {
  map!: Map;
  popup!: Overlay;
  lecturasLayer!: VectorLayer<VectorSource>;

  //==================================
  // FILTROS
  //==================================
  _codsede: any;
  _codemp: any;

  dataCiclos: any[] = [];
  fechaCiclos: any;
  listaSucursalesxusr: any[] = [];
  totalSectores2: any[] = [];
  lista_estadolec: any[] = [];

  selectedCiclo: any = null; // objeto ciclo
  selectedSucursal: any = null; // objeto sucursal
  selectedSector: any = null; // objeto sector ('%' = todos)
  selectedEstados: string[] = [];
  selectedAnio: string = "";
  selectedMes: string = "";
  consumoini: number | null = null;
  consumofin: number | null = null;

  listaYear: any[] = [];
  listaMeses: any[] = [
    { mes: "ENERO", numero: "01" },
    { mes: "FEBRERO", numero: "02" },
    { mes: "MARZO", numero: "03" },
    { mes: "ABRIL", numero: "04" },
    { mes: "MAYO", numero: "05" },
    { mes: "JUNIO", numero: "06" },
    { mes: "JULIO", numero: "07" },
    { mes: "AGOSTO", numero: "08" },
    { mes: "SETIEMBRE", numero: "09" },
    { mes: "OCTUBRE", numero: "10" },
    { mes: "NOVIEMBRE", numero: "11" },
    { mes: "DICIEMBRE", numero: "12" },
  ];
  tipopromedio: any[] = [
    { descripcion: "MEDIDO", codigo: "0" },
    { descripcion: "ASIGNADO", codigo: "1" },
    { descripcion: "PROMEDIADO", codigo: "1" },
  ];
  //==================================
  // ESTADO UI / RESUMEN
  //==================================
  cargando = false;
  totalLecturas = 0;
  totalSinCoordenadas = 0;
  lecturaSeleccionada: any = null;
  mostrarLeyenda = true;

  constructor(
    private aperturaservices: AperturaMicromedicionService,
    private seguridadService: SucursalesService,
    private sectoresService: SectoresCicloService,
    private consultaService: ConsulGenericService,
    private micromedicionService: MicromedicionService,
    private messageService: MessageService,
  ) {
    this._codsede = sessionStorage.getItem("codsede");
    this._codemp = sessionStorage.getItem("codemp");
    const currentYear = new Date().getFullYear();
    for (let i = 0; i <= 5; i++) {
      this.listaYear.push({ anio: (currentYear - i).toString() });
    }
  }

  ngOnInit(): void {
    this.aperturaservices.getCiclos().subscribe((response) => {
      if (response.status === "SUCCESS") {
        this.dataCiclos = response.data;
      }
    });
    this.consultaService
      .getconsultaService("TEL", "ALL", "ALL", "ALL")
      .subscribe((data) => {
        this.lista_estadolec = data;
      });
  }

  ngAfterViewInit(): void {
    this.crearMapa();
    this.initPopup();
    this.initClick();
    // el layout de la toolbar puede cambiar el alto del contenedor tras el primer render
    setTimeout(() => this.map.updateSize(), 300);
  }

  //==================================
  // CASCADA DE FILTROS
  //==================================
  onCicloChange(): void {
    this.selectedSucursal = null;
    this.selectedSector = null;
    this.limpiarCapa();
    if (!this.selectedCiclo) return;

    this.aperturaservices
      .getfechaCiclos(this.selectedCiclo.codciclo)
      .subscribe((response) => {
        this.fechaCiclos = response.data;
        this.selectedAnio = this.fechaCiclos.year;
        this.selectedMes = this.fechaCiclos.month;
        this.seguridadService
          .drop_sucursales_x_ciclo(this.selectedCiclo.codciclo)
          .subscribe({
            next: (data) => {
              this.listaSucursalesxusr = data;
            },
          });
      });
  }

  onSucursalChange(): void {
    this.selectedSector = null;
    if (!this.selectedSucursal) return;

    this.sectoresService
      .drop_sectores_x_ciclo(
        this.selectedSucursal.codsuc,
        this.selectedCiclo.codciclo,
      )
      .subscribe({
        next: (data) => {
          let sectores = data;
          sectores.unshift({
            codemp: null,
            codsuc: null,
            codsector: "%",
            descripcion: "TODOS",
            estareg: null,
          });
          this.totalSectores2 = sectores;
          this.selectedSector = sectores[0]; // TODOS por defecto
        },
      });
  }

  //==================================
  // PROCESAR → API → PUNTOS EN MAPA
  //==================================
  procesar(): void {
    if (
      !this.selectedCiclo ||
      !this.selectedSucursal ||
      !this.selectedAnio ||
      !this.selectedMes
    ) {
      this.messageService.add({
        severity: "warn",
        summary: "Aviso de usuario",
        detail: "Debe seleccionar Ciclo, Sucursal, Año y Mes",
      });
      return;
    }
    if (
      this.consumoini != null &&
      this.consumofin != null &&
      this.consumoini > this.consumofin
    ) {
      this.messageService.add({
        severity: "warn",
        summary: "Aviso de usuario",
        detail: "El consumo inicial no puede ser mayor al final",
      });
      return;
    }

    const filtro: FiltroLecturas = {
      codsuc: this.selectedSucursal.codsuc,
      codsede: this._codsede,
      codsector: this.selectedSector?.codsector || "%",
      codciclo: this.selectedCiclo.codciclo,
      anio: this.selectedAnio,
      mes: this.selectedMes,
      estadolectura: (this.selectedEstados || []).join(","),
      consumoini: this.consumoini,
      consumofin: this.consumofin,
    };

    this.cargando = true;
    this.micromedicionService.listarLecturas(filtro).subscribe({
      next: (data) => {
        this.cargando = false;
        this.pintarLecturas(data.data || []);
      },
      error: () => {
        this.cargando = false;
        this.limpiarCapa();
        this.messageService.add({
          severity: "error",
          summary: "Aviso de usuario",
          detail: "Ocurrió un error al cargar las lecturas",
        });
      },
    });
  }

  private pintarLecturas(lecturas: any[]): void {
    const source = this.lecturasLayer.getSource()!;
    source.clear();
    this.popup.setPosition(undefined);
    this.lecturaSeleccionada = null;

    this.totalLecturas = lecturas.length;
    this.totalSinCoordenadas = 0;

    const features: Feature[] = [];
    lecturas.forEach((l) => {
      const lat = parseFloat(l.latitud);
      const lon = parseFloat(l.longitud);
      if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) {
        this.totalSinCoordenadas++;
        return;
      }
      const f = new Feature({ geometry: new Point([lon, lat]) });
      f.setProperties(l);
      features.push(f);
    });

    source.addFeatures(features);

    if (features.length > 0) {
      this.map.getView().fit(source.getExtent(), {
        duration: 800,
        maxZoom: 18,
        padding: [60, 60, 60, 60],
      });
      this.messageService.add({
        severity: "success",
        summary: "Proceso completado",
        detail:
          `${features.length} lecturas en el mapa` +
          (this.totalSinCoordenadas > 0
            ? ` (${this.totalSinCoordenadas} sin coordenadas)`
            : ""),
      });
    } else {
      this.messageService.add({
        severity: "info",
        summary: "Aviso de usuario",
        detail:
          this.totalLecturas === 0
            ? "No se encontraron lecturas con esos filtros"
            : "Las lecturas encontradas no tienen coordenadas registradas",
      });
    }
  }

  limpiar(): void {
    this.selectedSector = this.totalSectores2?.[0] || null;
    this.selectedEstados = [];
    this.consumoini = null;
    this.consumofin = null;
    if (this.fechaCiclos) {
      this.selectedAnio = this.fechaCiclos.year;
      this.selectedMes = this.fechaCiclos.month;
    }
    this.limpiarCapa();
  }

  private limpiarCapa(): void {
    this.lecturasLayer?.getSource()?.clear();
    this.popup?.setPosition(undefined);
    this.lecturaSeleccionada = null;
    this.totalLecturas = 0;
    this.totalSinCoordenadas = 0;
  }

  //==================================
  // MAPA
  //==================================
  private crearMapa(): void {
    const base = new LayerGroup({
      layers: [new TileLayer({ source: new OSM(), visible: true })],
    });

    this.lecturasLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => this.estiloLectura(feature),
    });

    this.map = new Map({
      target: "map",
      layers: [base, this.lecturasLayer],
      view: new View({
        projection: "EPSG:4326",
        center: [-74.9727, -12.7862], // Huancavelica (antes estaba Yurimaguas)
        zoom: 14,
      }),
    });
  }

  private estiloLectura(feature: any): Style {
    const estado = feature.get("estadolectura");
    let color = "#22c55e"; // 000 normal → verde
    if (estado === "008")
      color = "#ef4444"; // atípico → rojo
    else if (estado === "003" || estado === "999")
      color = "#f97316"; // sin registro → naranja
    else if (estado !== "000") color = "#3b82f6"; // observados → azul

    return new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
      }),
    });
  }

  //==================================
  // POPUP
  //==================================
  private initPopup(): void {
    const container = document.getElementById("popup")!;
    this.popup = new Overlay({
      element: container,
      autoPan: { animation: { duration: 250 } },
    });
    this.map.addOverlay(this.popup);
  }

  cerrarPopup(): void {
    this.popup.setPosition(undefined);
    this.lecturaSeleccionada = null;
  }

  private initClick(): void {
    this.map.on("singleclick", (evt) => {
      const feature = this.map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        hitTolerance: 5,
      });
      if (feature) {
        this.lecturaSeleccionada = feature.getProperties();
        this.popup.setPosition(evt.coordinate);
      } else {
        this.cerrarPopup();
      }
    });
  }
}
