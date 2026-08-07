import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-mapa-popup-cliente',
  standalone: true,
  imports: [CommonModule, ButtonModule, TooltipModule],
  providers: [DatePipe],
  templateUrl: './mapa-popup-cliente.component.html',
  styleUrls: ['./mapa-popup-cliente.component.scss']
})
export class MapaPopupClienteComponent {
  @Input() clienteSeleccionado: any = null;
  @Input() mostrarBotonVerMas: boolean = false;

  @Output() onCerrar = new EventEmitter<void>();
  @Output() onVerStreetView = new EventEmitter<{lon: number, lat: number}>();
  @Output() onVerMasInfo = new EventEmitter<number>();

  cerrarPopup(event: Event) {
    event.stopPropagation();
    this.onCerrar.emit();
  }

  abrirStreetView(event: Event) {
    event.stopPropagation();
    const lon = this.clienteSeleccionado?.lon ?? this.clienteSeleccionado?.lonpredio;
    const lat = this.clienteSeleccionado?.lat ?? this.clienteSeleccionado?.latpredio ?? this.clienteSeleccionado?.latitud;
    this.onVerStreetView.emit({ lon, lat });
  }

  verMasInformacion(event: Event) {
    event.stopPropagation();
    if (this.clienteSeleccionado?.codcliente) {
      this.onVerMasInfo.emit(this.clienteSeleccionado.codcliente);
    }
  }

  getTarifaName(catetar: string): string {
    // Return empty so the HTML handles fallbacks with other properties like desctarifa, nomtar, etc.
    return '';
  }

  vmaParamsList = [
    { key: 'dbo5', label: 'DBO5' },
    { key: 'dqo', label: 'DQO' },
    { key: 'sst', label: 'SST' },
    { key: 'ayg', label: 'A y G' },
    { key: 'al', label: 'Aluminio' },
    { key: 'as', label: 'Arsénico' },
    { key: 'b', label: 'Boro' },
    { key: 'cd', label: 'Cadmio' },
    { key: 'cn', label: 'Cianuro' },
    { key: 'cr', label: 'Cromo' },
    { key: 'cu', label: 'Cobre' },
    { key: 'fe', label: 'Hierro' },
    { key: 'mn', label: 'Manganeso' },
    { key: 'ni', label: 'Níquel' },
    { key: 'pb', label: 'Plomo' },
    { key: 'sn', label: 'Estaño' },
    { key: 'zn', label: 'Zinc' },
    { key: 'ph', label: 'pH' },
    { key: 't', label: 'Temp.' },
  ];
}
