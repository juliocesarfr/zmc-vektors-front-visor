import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { catchError, map, timeout } from "rxjs/operators";
import { CatastroService } from "@host/_servicios/vektors/catastro.service";
import { Response_Generico } from "@host/_reponse/response_generico";
import { BuscarClientesRadioRequest, ClienteRadioResponse } from "./clientes-radio.model";

@Injectable({
  providedIn: "root",
})
export class ClientesRadioService {
  private readonly http = inject(HttpClient);
  private readonly catastroService = inject(CatastroService);

  private getBaseUrl(): string {
    const adminUrl = this.catastroService?.urlAdministracion;
    if (adminUrl && !adminUrl.includes("undefined")) {
      return adminUrl.endsWith("/") ? adminUrl : `${adminUrl}/`;
    }
    return "https://167.88.36.54:8889/vektors/backend/api-georeferencia/v1/vektors-catastro/";
  }

  buscarClientesPorRadio(
    filtro: BuscarClientesRadioRequest
  ): Observable<ClienteRadioResponse[]> {
    const url = `${this.getBaseUrl()}clientes/por-radio`;
    return this.http
      .post<Response_Generico<ClienteRadioResponse[]>>(url, filtro)
      .pipe(
        timeout(10000),
        map((res) => res?.data || []),
        catchError((err) => {
          console.warn("[CLIENTES-RADIO] Error al consultar clientes por radio desde backend:", err);
          return of([]);
        })
      );
  }
}

