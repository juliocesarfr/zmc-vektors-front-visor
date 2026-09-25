import { Injectable, OnDestroy, inject } from "@angular/core";
import { Observable, Subject, combineLatest } from "rxjs";
import { distinctUntilChanged, map } from "rxjs/operators";

import { WebsocketService } from "@host/_servicios/websocket.service";

import {
  ContextoTiempoReal,
  LecturaEnVivo,
  OrigenLectura,
} from "./lectura-en-vivo.model";

/**
 * El broker de `api-externa` usa `Sinks.many().replay().latest()`: al abrir la
 * conexión reenvía el ÚLTIMO mensaje emitido, aunque sea de hace horas. Sin
 * este margen, entrar a la pantalla dispararía un destello fantasma de una
 * lectura vieja.
 *
 * Solo aplica al canal MÓVIL: el broker STOMP de micromedición es un
 * `SimpleBroker` sin replay, así que descartar sus mensajes iniciales solo
 * perdería lecturas web legítimas.
 */
const MS_IGNORAR_REPLAY = 1500;

/** Ventana en la que un mismo mensaje repetido se considera duplicado. */
const MS_DEDUPE = 4000;

/**
 * Se suscribe a los dos canales de lectura en tiempo real y los entrega
 * normalizados (ver `LecturaEnVivo`).
 *
 * Se provee POR COMPONENTE (no en root): cada pantalla se da de baja al
 * destruirse sin cerrar el socket para las demás.
 */
@Injectable()
export class LecturasEnVivoService implements OnDestroy {
  private readonly ws = inject(WebsocketService);

  private readonly lecturas = new Subject<LecturaEnVivo>();
  /** Lecturas normalizadas, ya filtradas por contexto. */
  readonly lecturas$: Observable<LecturaEnVivo> = this.lecturas.asObservable();

  /** true mientras el canal móvil (APK → api-externa) está conectado. */
  readonly estadoMovil$ = this.ws.statusNative$;
  /** true mientras el canal web (digitación → api-micromedicion) está conectado. */
  readonly estadoWeb$ = this.ws.statusStomp$;

  /**
   * Conectado = al menos uno de los dos canales responde. Se usa para el
   * indicador de la pantalla: si ambos caen, el mapa deja de reflejar el campo
   * y el supervisor tiene que enterarse.
   */
  readonly conectado$: Observable<boolean> = combineLatest([
    this.estadoMovil$,
    this.estadoWeb$,
  ]).pipe(
    map(([movil, web]) => movil || web),
    distinctUntilChanged(),
  );

  private contexto: ContextoTiempoReal = {};
  private conectadoEn = 0;
  private vistos = new Map<string, number>();

  // Referencias estables: son la identidad con la que el servicio se da de baja.
  private readonly onMovil = (mensaje: any) => this.procesar(mensaje, "movil");
  private readonly onWeb = (mensaje: any) => this.procesar(mensaje, "web");
  private suscrito = false;

  /**
   * Abre (o reutiliza) ambos canales. Idempotente: llamarlo de nuevo solo
   * actualiza el contexto de filtrado.
   */
  conectar(contexto: ContextoTiempoReal = {}): void {
    this.contexto = contexto;
    if (this.suscrito) return;

    this.conectadoEn = Date.now();
    this.suscrito = true;
    this.ws.connectapk(this.onMovil);
    this.ws.connect(this.onWeb);
  }

  /** Actualiza el filtro sin reabrir la conexión (al cambiar ciclo/sucursal). */
  actualizarContexto(contexto: ContextoTiempoReal): void {
    this.contexto = contexto;
  }

  desconectar(): void {
    if (!this.suscrito) return;
    this.suscrito = false;
    this.ws.desuscribirApk(this.onMovil);
    this.ws.desuscribirStomp(this.onWeb);
    this.vistos.clear();
  }

  ngOnDestroy(): void {
    this.desconectar();
    this.lecturas.complete();
  }

  // ============================================================
  // NORMALIZACIÓN
  // ============================================================

  /**
   * Ambos canales envuelven el dato igual (`res.body.data`), pero el móvil
   * manda un ARRAY (una sincronización trae varias lecturas) y la web un solo
   * objeto. Se aplana a una lista en los dos casos.
   */
  private procesar(mensaje: any, origen: OrigenLectura): void {
    // Descartar el replay del Sink al conectar (solo el canal móvil lo tiene).
    if (origen === "movil" && Date.now() - this.conectadoEn < MS_IGNORAR_REPLAY) {
      return;
    }

    const data = mensaje?.body?.data ?? mensaje?.data ?? mensaje;
    if (!data) return;

    const registros: any[] = Array.isArray(data) ? data : [data];

    for (const registro of registros) {
      const lectura =
        origen === "movil"
          ? this.desdeMovil(registro)
          : this.desdeWeb(registro);

      if (!lectura || !lectura.codcliente) continue;
      if (!this.pasaContexto(lectura)) continue;
      if (this.esDuplicado(lectura)) continue;

      this.lecturas.next(lectura);
    }
  }

  /** Payload `response_lecturas_movil` (api-externa). */
  private desdeMovil(r: any): LecturaEnVivo | null {
    if (r == null) return null;
    return {
      origen: "movil",
      codcliente: this.texto(r.codcliente),
      codsuc: this.texto(r.codsuc),
      codciclo: this.texto(r.codciclo),
      codsector: this.texto(r.codsector),
      anio: this.texto(r.anio),
      mes: this.texto(r.mes),
      estadolectura: this.texto(r.estadolectura) || undefined,
      tipoestlectura: this.texto(r.tipoestlectura) || undefined,
      // `codinspectormovil` es quien realmente hizo la toma en campo; el
      // `codinspector` del padrón es el asignado, que puede no coincidir.
      codinspector:
        this.texto(r.codinspectormovil) || this.texto(r.codinspector) || undefined,
      inspector: this.texto(r.inspector) || undefined,
      latitud: this.texto(r.latitud) || undefined,
      longitud: this.texto(r.longitud) || undefined,
      tomada: Number(r.web) === 1 && Number(r.recibido) === 1,
      crudo: r,
    };
  }

  /** Payload `MeterReadingSectorDto` (api-micromedicion, STOMP). */
  private desdeWeb(r: any): LecturaEnVivo | null {
    if (r == null) return null;
    return {
      origen: "web",
      codcliente: this.texto(r.codcliente),
      // El DTO de digitación no viaja con ciclo/año/mes: el filtro efectivo es
      // que el cliente ya esté pintado en el mapa.
      codsuc: this.texto(r.codsuc) || undefined,
      codsector: this.texto(r.codsector) || undefined,
      estadolectura: this.texto(r.readingStatus) || undefined,
      tipoestlectura: this.texto(r.tipoestlectura) || undefined,
      codinspector:
        this.texto(r.codinspectormovil) || this.texto(r.codinspector) || undefined,
      inspector: this.texto(r.inspector) || undefined,
      latitud: this.texto(r.latitud) || undefined,
      longitud: this.texto(r.longitud) || undefined,
      tomada: Number(r.web) === 1 && Number(r.recibido) === 1,
      crudo: r,
    };
  }

  // ============================================================
  // FILTROS
  // ============================================================

  /**
   * Compara códigos tolerando padding y mayúsculas: el móvil manda "1" donde
   * el combo de la pantalla tiene "01".
   */
  private mismoCodigo(a?: string | null, b?: string | null): boolean {
    if (!a || !b) return true; // dato ausente: no descarta
    const norm = (v: string) =>
      v.trim().toUpperCase().replace(/^0+(?=\d)/, "");
    return norm(a) === norm(b);
  }

  private pasaContexto(lectura: LecturaEnVivo): boolean {
    const ctx = this.contexto;
    return (
      this.mismoCodigo(lectura.codsuc, ctx.codsuc) &&
      this.mismoCodigo(lectura.codciclo, ctx.codciclo) &&
      this.mismoCodigo(lectura.anio, ctx.anio) &&
      this.mismoCodigo(lectura.mes, ctx.mes)
    );
  }

  /**
   * El mismo hecho puede llegar por los dos canales (la APK registra y el
   * digitador confirma). Se deduplica por cliente + lectura dentro de una
   * ventana corta, para no encadenar dos destellos sobre el mismo punto.
   */
  private esDuplicado(lectura: LecturaEnVivo): boolean {
    const r = lectura.crudo as any;
    const clave = [
      lectura.codcliente,
      r?.lecturaultima ?? r?.lastReading ?? "",
      lectura.estadolectura ?? "",
    ].join("|");

    const ahora = Date.now();
    const previo = this.vistos.get(clave);
    if (previo !== undefined && ahora - previo < MS_DEDUPE) return true;

    this.vistos.set(clave, ahora);
    this.purgarVistos(ahora);
    return false;
  }

  /**
   * Toda entrada más vieja que la ventana de dedupe es inservible, así que se
   * purga por antigüedad. Si aun así quedan demasiadas (ráfaga masiva dentro de
   * la misma ventana) se recortan las más antiguas: el Map conserva el orden de
   * inserción, así que basta con ir por el principio.
   */
  private purgarVistos(ahora: number): void {
    if (this.vistos.size <= 200) return;

    for (const [clave, visto] of this.vistos) {
      if (ahora - visto > MS_DEDUPE) this.vistos.delete(clave);
    }

    while (this.vistos.size > 200) {
      const masAntigua = this.vistos.keys().next().value;
      if (masAntigua === undefined) break;
      this.vistos.delete(masAntigua);
    }
  }

  private texto(valor: unknown): string {
    return valor === null || valor === undefined ? "" : String(valor).trim();
  }
}
