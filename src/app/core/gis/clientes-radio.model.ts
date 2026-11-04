export interface BuscarClientesRadioRequest {
  codsuc?: string;
  lat: number;
  lon: number;
  radioMetros?: number;
}

export interface ClienteRadioResponse {
  codemp?: string;
  codsuc?: string;
  codcliente?: number;
  propietario?: string;
  catetar?: string;
  nomtar?: string;
  actividad?: string;
  tipoactividad?: string;
  descripcioncalle?: string;
  descripcioncorta?: string;
  nrocalle?: string;
  codmza?: string;
  nrolote?: string;
  nrosublote?: string;
  direccion?: string;
  estadoservicio?: string;
  tipoestadoservicio?: string;
  unidaddom?: number;
  unidadcom?: number;
  unidadind?: number;
  unidadsoc?: number;
  unidadest?: number;
  lon?: number;
  lat?: number;
  distanciaMetros?: number;
}

