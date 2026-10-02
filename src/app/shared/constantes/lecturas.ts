export const LISTA_MESES = [
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

export const TIPOS_PROMEDIO = [
  { descripcion: "MEDIDO", codigo: "0" },
  { descripcion: "ASIGNADO", codigo: "1" },
  { descripcion: "PROMEDIADO", codigo: "2" },
];

/** Tipos de recepción de las fotos que toma el lecturista. */
export const TIPOS_RECEPCION_FOTOS_LECTURA = [
  "000", "050", "046", "045", "044", "043", "042",
  "041", "040", "039", "038", "037", "004", "003",
].map((tipo) => ({ tipo }));

/** Tipos de recepción de las fotos de corte y reapertura. */
export const TIPOS_RECEPCION_FOTOS_CORTE = ["054", "055"].map((tipo) => ({ tipo }));
