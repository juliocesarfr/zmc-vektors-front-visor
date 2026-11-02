import { car as RegistroCar } from "@host/_models/administracion/car";
import { PagoClienteCar } from "@host/_models/vektors/Recaudacion/CoberturaCar";
import { distanciaHaversineMetros } from "../../../shared/mapa/geo.utils";

// Reglas de la cobertura por CAR. Son funciones puras: no dependen del mapa ni del componente.
// Las distancias se miden en WGS84, que es como llegan las coordenadas del backend y de la tabla car.

/** Porción de clientes que define el alcance de un CAR: el radio donde vive el 80 % de ellos. */
export const FRACCION_ALCANCE = 0.8;
const METROS_CERCA = 1000;

export const BANDAS_DISTANCIA = [
  { nombre: "Hasta 500 m", desde: 0, hasta: 500 },
  { nombre: "500 m – 1 km", desde: 500, hasta: 1000 },
  { nombre: "1 – 2 km", desde: 1000, hasta: 2000 },
  { nombre: "Más de 2 km", desde: 2000, hasta: Infinity },
];

// Ordenados para que dos CAR seguidos no se confundan sobre el mapa.
const COLORES_CAR = [
  "#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#00897b", "#d81b60", "#3949ab",
  "#6d4c41", "#00acc1", "#7cb342", "#f9a825", "#5e35b1", "#f4511e", "#546e7a", "#c0ca33",
];
const COLOR_SIN_LOCAL = "#90a4ae";

export interface CarEnMapa {
  clave: string;
  codsede: string;
  car: string;
  descripcion: string;
  direccion: string;
  contacto: string;
  horarios: string;
  nombresede: string;
  color: string;
  /** [lon, lat] en WGS84; null si el CAR no tiene local registrado (bancos, pago en línea). */
  ubicacion: [number, number] | null;
}

export interface ClienteCobertura {
  clave: string;
  codsuc: string;
  codcliente: number;
  propietario: string;
  direccion: string;
  /** CAR donde pagó más veces en el rango; si empata, donde pagó más monto. */
  claveCar: string;
  nropagos: number;
  imptotal: number;
  primerdiapago: string;
  ultimodiapago: string;
  /** Otros CAR donde también pagó, con su número de pagos. */
  otrosCars: { clave: string; nropagos: number }[];
  /** [lon, lat] en WGS84 del usuario o, si no tiene, de su predio. */
  ubicacion: [number, number] | null;
  distanciaMetros: number | null;
}

export interface BandaDistancia {
  nombre: string;
  cantidad: number;
  fraccion: number;
}

export interface ResumenCar {
  car: CarEnMapa;
  clientes: number;
  pagos: number;
  monto: number;
  sinCoordenadas: number;
  mediana: number | null;
  alcance: number | null;
  maximo: number | null;
  fraccionCerca: number | null;
  bandas: BandaDistancia[];
}

export interface CoberturaCalculada {
  cars: Map<string, CarEnMapa>;
  clientes: ClienteCobertura[];
  resumenes: ResumenCar[];
  totales: { pagos: number; clientes: number; monto: number; sinCoordenadas: number };
}

/**
 * Un mismo local está registrado en varias sedes con el mismo código y nombre, y a la vez un código se repite
 * entre sedes para locales distintos (071 es Vista Alegre en Tarapoto y otra tienda en Picota): el CAR es
 * código + nombre. Sin nombre no se puede saber si es el mismo local, así que entonces va por sede.
 */
export function claveCar(codsede: string, car: string, descripcion: string | null | undefined): string {
  const nombre = String(descripcion ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return nombre ? `${String(car).trim()}|${nombre}` : `${String(car).trim()}|sede${String(codsede).trim()}`;
}

/** La tabla car guarda latitud y longitud como texto: acepta coma decimal y descarta valores fuera de rango. */
export function leerUbicacionCar(registro: Pick<RegistroCar, "latitud" | "longitud">): [number, number] | null {
  const latitud = Number(String(registro.latitud ?? "").trim().replace(",", "."));
  const longitud = Number(String(registro.longitud ?? "").trim().replace(",", "."));
  const esValida =
    Number.isFinite(latitud) && Number.isFinite(longitud) &&
    latitud !== 0 && longitud !== 0 && Math.abs(latitud) <= 90 && Math.abs(longitud) <= 180;
  return esValida ? [longitud, latitud] : null;
}

function ubicacionCliente(pago: PagoClienteCar): [number, number] | null {
  const candidatos: [unknown, unknown][] = [[pago.lon, pago.lat], [pago.lonpredio, pago.latpredio]];
  for (const [longitud, latitud] of candidatos) {
    const lon = Number(longitud);
    const lat = Number(latitud);
    if (longitud != null && latitud != null && Number.isFinite(lon) && Number.isFinite(lat) && lon !== 0 && lat !== 0) {
      return [lon, lat];
    }
  }
  return null;
}

export function percentil(valores: number[], fraccion: number): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((primero, segundo) => primero - segundo);
  return ordenados[Math.min(ordenados.length - 1, Math.floor(fraccion * ordenados.length))];
}

export function textoDistancia(metros: number | null | undefined): string {
  if (metros == null) return "-";
  return metros >= 1000
    ? `${(metros / 1000).toFixed(1).replace(".", ",")} km`
    : `${Math.round(metros / 10) * 10} m`;
}

/**
 * Arma los CAR (los de la tabla car más los que aparecen en los pagos aunque ya no estén activos),
 * elige el CAR principal de cada cliente, mide su distancia y resume cada CAR.
 */
export function calcularCobertura(
  pagos: PagoClienteCar[],
  registrosCar: RegistroCar[],
  nombresSede: Map<string, string>,
): CoberturaCalculada {
  // El SP trae descar de la misma tabla car; si falta, se toma del listado de CAR de esa sede.
  const descripcionPorSedeYCar = new Map(registrosCar.map((registro) =>
    [`${String(registro.codsede ?? "").trim()}-${String(registro.car).trim()}`, registro.descripcion]));
  const claveDePago = (pago: PagoClienteCar) => claveCar(
    pago.codsede,
    pago.car,
    pago.descar ?? descripcionPorSedeYCar.get(`${String(pago.codsede).trim()}-${String(pago.car).trim()}`),
  );

  const cars = new Map<string, CarEnMapa>();
  const agregarCar = (codsede: string, car: string, datos: Partial<RegistroCar>) => {
    const clave = claveCar(codsede, car, datos.descripcion);
    const nombreSede = nombresSede.get(String(codsede).trim()) ?? "";
    const existente = cars.get(clave);
    if (existente) {
      // El mismo local en otra sede: se juntan las sedes y se toma la ubicación de la fila que la tenga.
      if (nombreSede && !existente.nombresede.split(", ").includes(nombreSede)) {
        existente.nombresede = existente.nombresede ? `${existente.nombresede}, ${nombreSede}` : nombreSede;
      }
      existente.ubicacion ??= leerUbicacionCar({ latitud: datos.latitud, longitud: datos.longitud });
      existente.direccion ||= String(datos.direccion ?? "").trim();
      return;
    }
    cars.set(clave, {
      clave,
      codsede: String(codsede).trim(),
      car: String(car).trim(),
      descripcion: String(datos.descripcion ?? "").trim() || `CAR ${car}`,
      direccion: String(datos.direccion ?? "").trim(),
      contacto: String(datos.contacto ?? "").trim(),
      horarios: String(datos.horarios ?? "").trim(),
      nombresede: nombreSede,
      color: COLOR_SIN_LOCAL,
      ubicacion: leerUbicacionCar({ latitud: datos.latitud, longitud: datos.longitud }),
    });
  };
  registrosCar.forEach((registro) => agregarCar(registro.codsede ?? "", registro.car, registro));
  pagos.forEach((pago) => agregarCar(pago.codsede, pago.car, {
    descripcion: pago.descar ?? descripcionPorSedeYCar.get(`${String(pago.codsede).trim()}-${String(pago.car).trim()}`),
  }));

  const pagosPorCliente = new Map<string, PagoClienteCar[]>();
  pagos.forEach((pago) => {
    const clave = `${String(pago.codsuc).trim()}-${pago.codcliente}`;
    const lista = pagosPorCliente.get(clave) ?? [];
    lista.push(pago);
    pagosPorCliente.set(clave, lista);
  });

  const clientes: ClienteCobertura[] = [];
  pagosPorCliente.forEach((lista, clave) => {
    // Primero se suman los pagos por CAR: el mismo local puede venir en varias filas, una por sede.
    const porCar = new Map<string, { nropagos: number; imptotal: number }>();
    lista.forEach((pago) => {
      const acumulado = porCar.get(claveDePago(pago)) ?? { nropagos: 0, imptotal: 0 };
      acumulado.nropagos += Number(pago.nropagos || 0);
      acumulado.imptotal += Number(pago.imptotal || 0);
      porCar.set(claveDePago(pago), acumulado);
    });
    const ordenados = Array.from(porCar, ([claveDelCar, totales]) => ({ claveDelCar, ...totales }))
      .sort((primero, segundo) => segundo.nropagos - primero.nropagos || segundo.imptotal - primero.imptotal);
    const clavePrincipal = ordenados[0].claveDelCar;
    const datosCliente = lista[0];
    const ubicacion = ubicacionCliente(datosCliente);
    const ubicacionCar = cars.get(clavePrincipal)?.ubicacion ?? null;
    clientes.push({
      clave,
      codsuc: String(datosCliente.codsuc).trim(),
      codcliente: datosCliente.codcliente,
      propietario: String(datosCliente.propietario ?? "").trim(),
      direccion: String(datosCliente.direccion ?? "").trim(),
      claveCar: clavePrincipal,
      nropagos: ordenados.reduce((suma, car) => suma + car.nropagos, 0),
      imptotal: ordenados.reduce((suma, car) => suma + car.imptotal, 0),
      primerdiapago: lista.map((pago) => pago.primerdiapago).sort()[0],
      ultimodiapago: lista.map((pago) => pago.ultimodiapago).sort().reverse()[0],
      otrosCars: ordenados.slice(1).map((car) => ({ clave: car.claveDelCar, nropagos: car.nropagos })),
      ubicacion,
      distanciaMetros: ubicacion && ubicacionCar
        ? distanciaHaversineMetros(ubicacion[0], ubicacion[1], ubicacionCar[0], ubicacionCar[1])
        : null,
    });
  });

  const resumenes = Array.from(cars.values()).map((car): ResumenCar => {
    const pagosDelCar = pagos.filter((pago) => claveDePago(pago) === car.clave);
    const clientesDelCar = clientes.filter((cliente) => cliente.claveCar === car.clave);
    const distancias = clientesDelCar
      .map((cliente) => cliente.distanciaMetros)
      .filter((distancia): distancia is number => distancia != null);
    return {
      car,
      clientes: clientesDelCar.length,
      pagos: pagosDelCar.reduce((suma, pago) => suma + Number(pago.nropagos || 0), 0),
      monto: pagosDelCar.reduce((suma, pago) => suma + Number(pago.imptotal || 0), 0),
      sinCoordenadas: clientesDelCar.filter((cliente) => !cliente.ubicacion).length,
      mediana: percentil(distancias, 0.5),
      alcance: percentil(distancias, FRACCION_ALCANCE),
      maximo: distancias.length ? Math.max(...distancias) : null,
      fraccionCerca: distancias.length ? distancias.filter((distancia) => distancia <= METROS_CERCA).length / distancias.length : null,
      bandas: BANDAS_DISTANCIA.map((banda) => {
        const cantidad = distancias.filter((distancia) => distancia <= banda.hasta && (banda.desde === 0 || distancia > banda.desde)).length;
        return { nombre: banda.nombre, cantidad, fraccion: distancias.length ? cantidad / distancias.length : 0 };
      }),
    };
  })
    .filter((resumen) => resumen.pagos > 0 || resumen.car.ubicacion)
    .sort((primero, segundo) => segundo.clientes - primero.clientes || segundo.pagos - primero.pagos);

  // Los colores se reparten por orden de clientes: los CAR con más clientes reciben los más distinguibles.
  let indiceColor = 0;
  resumenes.forEach((resumen) => {
    if (resumen.car.ubicacion) resumen.car.color = COLORES_CAR[indiceColor++ % COLORES_CAR.length];
  });

  return {
    cars,
    clientes,
    resumenes,
    totales: {
      pagos: pagos.reduce((suma, pago) => suma + Number(pago.nropagos || 0), 0),
      clientes: clientes.length,
      monto: pagos.reduce((suma, pago) => suma + Number(pago.imptotal || 0), 0),
      sinCoordenadas: clientes.filter((cliente) => !cliente.ubicacion).length,
    },
  };
}
