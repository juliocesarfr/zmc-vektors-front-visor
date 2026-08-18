import {Component, ElementRef, Input, inject} from '@angular/core';
import {ActivatedRoute, Params, Router} from "@angular/router";
// import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import { OSM } from 'ol/source';
import { XYZ } from 'ol/source';
import {
  defaults as defaultControls,
  FullScreen,
  ZoomSlider,
  ScaleLine
} from 'ol/control';
import {FormsModule} from "@angular/forms";
import {SucursalesService} from "@host/_servicios/administracion/sucursales.service";
import {GisConfigService} from "../../core/gis";

export const DEFAULT_HEIGHT = `${window.innerHeight - 70}px`;
export const DEFAULT_WIDTH = `${window.innerWidth - 260}px`;
@Component({
  selector: 'app-georeferencia',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './georeferencia.component.html',
  styleUrl: './georeferencia.component.scss'
})
export class GeoreferenciaComponent {

  map: Map;
  navbar: boolean = false;
  capa: string = "";
  token: string = "";
  codcliente: number = 0;
  base: string = "";
  nameCapas: string = "";
  target: string = 'map-' + Math.random().toString(36).substring(2);
  private mapEl: HTMLElement;

  @Input() width: string | number = DEFAULT_WIDTH;
  @Input() height: string | number = DEFAULT_HEIGHT;

  /** GeoServer, capas y proyección de la EPS logueada (resueltos por `ccodeps`). */
  private readonly gis = inject(GisConfigService);

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private _sucursalService: SucursalesService,
    private elementRef: ElementRef
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe((data: Params) => {
      sessionStorage.setItem('tokengis', data['tokengis']);
      sessionStorage.setItem('capa', data['capa']);
      this.token = data['tokengis'];
      this.capa = data['capa'];
      this.codcliente = data['codcliente'];
      this.base = data['base'];

      this._sucursalService.buscar_x_id('001').subscribe((data) => {
        if (data.response === 'NO_TOKEN') {
          this.router.navigate(['/login']);
          return;
        }

        // Esta ruta no pasa por `gisConfigResolver`, así que se resuelve aquí.
        this.gis.cargar().subscribe(() => {
          this.mapEl = this.elementRef.nativeElement.querySelector('#' + this.target);
          this.setSize();

          const layers01: any[] = [];

          // Use OSM if the base layer is OSM
          if (this.base === 'OSM') {
            layers01.push(new TileLayer({ source: new OSM() }));
          } else {
            // Use XYZ for Stamen tiles
            const stamenUrl = `https://{a-d}.tile.stamen.com/${this.base}/{z}/{x}/{y}.png`;
            layers01.push(new TileLayer({ source: new XYZ({ url: stamenUrl }) }));
          }

          // Process WMS layers
          let tileWMS;
          const arraySplit = this.capa.split('|');
          this.nameCapas = '';
          for (let rows of arraySplit) {
            if (rows !== '0') {
              this.nameCapas += `${rows}/`;
              if (rows === 'FICHACOMERCIAL') {
                this.navbar = true;

                let codiCliente = this.codcliente.toString();
                if (this.codcliente === 0) {
                  codiCliente = '%';
                }

                tileWMS = new TileLayer({
                  source: new TileWMS({
                    url: this.gis.urlWms(),
                    params: {
                      LAYERS: this.gis.calificarCapa(rows),
                      TILED: true,
                      CQL_FILTER: `USERCODE like '${codiCliente}'`
                    },
                    serverType: 'geoserver',
                    transition: 0
                  })
                });
              } else {
                tileWMS = new TileLayer({
                  source: new TileWMS({
                    url: this.gis.urlWms(),
                    params: { LAYERS: this.gis.calificarCapa(rows), TILED: true },
                    serverType: 'geoserver',
                    transition: 0
                  })
                });
              }

              layers01.push(tileWMS);
            }
          }

          this.nameCapas = this.nameCapas.slice(0, -2); // Remove last '/'

          // Initialize map
          this.map = new Map({
            controls: defaultControls().extend([new FullScreen(), new ZoomSlider(), new ScaleLine()]),
            layers: layers01,
            target: this.target,
            view: new View({
              projection: this.gis.proyeccionMapa,
              // La sucursal manda; si no trae coordenadas se usa la vista de la EPS.
              center: this.centroSucursal(data.aaData) ?? this.gis.vista.centro,
              zoom: 12.5
            })
          });
        });
      });
    });
  }

  onSubmit(): void {
    let codigocliente = this.codcliente;
    if (codigocliente.toString().length === 0) {
      codigocliente = 0;
    }
    location.href = `sysco-gis/frontend/#/dashboard/${this.token}/${this.capa}/${codigocliente}/${this.base}`;
  }

  /** Centro declarado por la sucursal, o `null` si no tiene coordenadas válidas. */
  private centroSucursal(sucursal: any): [number, number] | null {
    const lon = Number(sucursal?.longitud);
    const lat = Number(sucursal?.latitud);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lon === 0 && lat === 0) return null;
    return [lon, lat];
  }

  private setSize(): void {
    if (this.mapEl) {
      const styles = this.mapEl.style;
      styles.height = coerceCssPixelValue(this.height) || DEFAULT_HEIGHT;
      styles.width = coerceCssPixelValue(this.width) || DEFAULT_WIDTH;
    }
  }
}

const cssUnitsPattern = /([A-Za-z%]+)$/;

function coerceCssPixelValue(value: any): string {
  if (value == null) {
    return '';
  }

  return cssUnitsPattern.test(value) ? value : `${value}px`;
}

function MapQuest(arg0: { layer: string; }): any {
  throw new Error('Function not implemented.');
}
