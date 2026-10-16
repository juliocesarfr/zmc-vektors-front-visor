import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { CatastroService } from "@host/_servicios/vektors/catastro.service";
import { Response_Generico } from "@host/_reponse/response_generico";
import {
  BusquedaAvanzadaClientesRequest,
  BusquedaAvanzadaClienteResponse,
} from "../models/busqueda-avanzada-clientes.models";

@Injectable({
  providedIn: "root",
})
export class BusquedaAvanzadaClientesService {
  private http = inject(HttpClient);
  private catastroService = inject(CatastroService);

  private getBaseUrl(): string {
    const adminUrl = this.catastroService?.urlAdministracion;
    if (adminUrl && !adminUrl.includes("undefined")) {
      return adminUrl.endsWith("/") ? adminUrl : `${adminUrl}/`;
    }
    return "https://167.88.36.54:8889/vektors/backend/api-georeferencia/v1/vektors-catastro/";
  }

  buscarClientesAvanzada(
    filtro: BusquedaAvanzadaClientesRequest
  ): Observable<Response_Generico<BusquedaAvanzadaClienteResponse[]>> {
    const url = `${this.getBaseUrl()}clientes/busqueda-avanzada`;
    return this.http.post<Response_Generico<BusquedaAvanzadaClienteResponse[]>>(
      url,
      filtro
    );
  }
}
