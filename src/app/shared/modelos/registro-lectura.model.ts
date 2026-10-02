/** Fila que devuelve el listado de lecturas; trae además las coordenadas de `ORIGENES_COORDENADA`. */
export interface RegistroLectura {
  codcliente?: string;
  codsuc?: string;
  codsector?: string;
  estadolectura?: string;
  [key: string]: unknown;
}

/** Qué ficha muestra el popup según la capa en que se hizo clic. */
export type TipoPopup = "lectura" | "agua" | "alcantarillado";
