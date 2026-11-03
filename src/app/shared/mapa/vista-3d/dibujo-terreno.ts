import type { Terreno } from "./terreno";

/** Dónde está y hacia dónde mira la persona que camina. Las distancias van en metros y los ángulos en radianes. */
export interface CamaraPeaton {
  /** Metros desde el borde oeste del área. */
  x: number;
  /** Metros desde el borde sur del área. */
  y: number;
  /** Hacia dónde mira: 0 = norte, crece hacia el este. */
  rumbo: number;
  /** Positivo mira hacia arriba, negativo hacia el suelo. */
  cabeceo: number;
  /** Cuántas veces se agranda la altura del terreno. */
  exageracion: number;
  /** Metros de los ojos sobre el suelo: 1,7 a pie; más para ver la pendiente desde arriba. */
  alturaOjos: number;
}

/** Altura de los ojos de una persona parada. */
export const ALTURA_OJOS_M = 1.7;
export const COLOR_CIELO_ARRIBA = "#6fa8dc";
export const COLOR_CIELO_HORIZONTE = "#dce9f5";

const CAMPO_VISUAL = (75 * Math.PI) / 180;
const DISTANCIA_MINIMA_M = 0.2;
// Alrededor del área va un suelo liso hasta el horizonte, para que no se vea el cielo por debajo del terreno.
const LADOS_DE_SUELO_ALREDEDOR = 8;
const COLOR_NIEBLA: [number, number, number] = [220 / 255, 233 / 255, 245 / 255];
const COLOR_SUELO_LEJANO: [number, number, number] = [154 / 255, 165 / 255, 140 / 255];
const LUZ = normalizar([-1, 1, 1.3]);

const SOMBREADOR_VERTICES = `#version 300 es
in vec3 posicion;
in vec2 coordenada;
in vec2 pendiente;
uniform mat4 proyeccionVista;
uniform float exageracion;
uniform vec3 ojos;
uniform vec3 luz;
out vec2 vCoordenada;
out float vTono;
out float vDistancia;
void main() {
  vec3 punto = vec3(posicion.xy, posicion.z * exageracion);
  vec3 normal = normalize(vec3(-pendiente * exageracion, 1.0));
  // Se compara con el suelo plano para que lo plano quede con el color real del mapa.
  vTono = clamp((dot(normal, luz) - luz.z) * 1.2, -0.55, 0.3);
  vCoordenada = coordenada;
  vDistancia = distance(punto, ojos);
  gl_Position = proyeccionVista * vec4(punto, 1.0);
}`;

const SOMBREADOR_FRAGMENTOS = `#version 300 es
precision highp float;
in vec2 vCoordenada;
in float vTono;
in float vDistancia;
uniform sampler2D textura;
uniform bool conTextura;
uniform vec3 colorLiso;
uniform vec3 colorNiebla;
uniform float distanciaNiebla;
out vec4 color;
void main() {
  vec3 base = conTextura ? texture(textura, vCoordenada).rgb : colorLiso;
  base = vTono > 0.0 ? mix(base, vec3(1.0), vTono) : mix(base, vec3(0.0), -vTono);
  float niebla = min(0.65, pow(vDistancia / distanciaNiebla, 1.5) * 0.65);
  color = vec4(mix(base, colorNiebla, niebla), 1.0);
}`;

interface Malla {
  vertices: WebGLVertexArrayObject;
  cantidadIndices: number;
}

/**
 * Dibuja con WebGL (el 3D del navegador, sin librerías) el terreno visto por una persona parada en él,
 * con la imagen del mapa encima. La tarjeta de video se encarga de la perspectiva y de que lo de
 * adelante tape lo de atrás, así se puede caminar con fluidez.
 */
export class DibujoTerreno {
  private readonly gl: WebGL2RenderingContext;
  private readonly programa: WebGLProgram;
  private readonly terrenoMalla: Malla;
  private readonly sueloMalla: Malla;
  private readonly texturaGl: WebGLTexture;
  private readonly pasoX: number;
  private readonly pasoY: number;
  private readonly ladoMayor: number;

  /** Lanza un error si el navegador no tiene WebGL 2 (equipos muy antiguos o con la aceleración apagada). */
  constructor(
    private readonly lienzo: HTMLCanvasElement,
    private readonly terreno: Terreno,
    textura: HTMLCanvasElement,
  ) {
    // `preserveDrawingBuffer` deja leer el lienzo después de dibujar, para descargar la imagen.
    const gl = lienzo.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true, alpha: true });
    if (!gl) throw new Error("El navegador no tiene WebGL 2 para la vista 3D.");
    this.gl = gl;
    this.pasoX = terreno.anchoMetros / (terreno.columnas - 1);
    this.pasoY = terreno.altoMetros / (terreno.filas - 1);
    this.ladoMayor = Math.max(terreno.anchoMetros, terreno.altoMetros);

    this.programa = crearPrograma(gl, SOMBREADOR_VERTICES, SOMBREADOR_FRAGMENTOS);
    this.terrenoMalla = this.crearMallaTerreno();
    this.sueloMalla = this.crearMallaSuelo();
    this.texturaGl = this.subirTextura(textura);
    gl.enable(gl.DEPTH_TEST);
  }

  /** Altura del suelo en ese punto, ya exagerada, en metros sobre la cota más baja del área. */
  alturaSuelo(x: number, y: number, exageracion: number): number {
    const { terreno } = this;
    const columna = Math.min(terreno.columnas - 1.001, Math.max(0, x / this.pasoX));
    const fila = Math.min(terreno.filas - 1.001, Math.max(0, (terreno.altoMetros - y) / this.pasoY));
    const columnaEntera = Math.floor(columna);
    const filaEntera = Math.floor(fila);
    const fraccionColumna = columna - columnaEntera;
    const fraccionFila = fila - filaEntera;
    const altura = (desplazamientoFila: number, desplazamientoColumna: number) =>
      terreno.alturas[(filaEntera + desplazamientoFila) * terreno.columnas + columnaEntera + desplazamientoColumna];
    const arriba = altura(0, 0) * (1 - fraccionColumna) + altura(0, 1) * fraccionColumna;
    const abajo = altura(1, 0) * (1 - fraccionColumna) + altura(1, 1) * fraccionColumna;
    return (arriba * (1 - fraccionFila) + abajo * fraccionFila - terreno.minima) * exageracion;
  }

  dibujar(camara: CamaraPeaton): void {
    const { gl, lienzo, programa } = this;
    gl.viewport(0, 0, lienzo.width, lienzo.height);
    // Transparente: el cielo es el degradado del fondo de la ventana.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(programa);

    const ojos: [number, number, number] = [
      camara.x,
      camara.y,
      this.alturaSuelo(camara.x, camara.y, camara.exageracion) + camara.alturaOjos,
    ];
    const lejania = this.ladoMayor * (LADOS_DE_SUELO_ALREDEDOR + 1);
    const proyeccion = perspectiva(CAMPO_VISUAL, lienzo.width / Math.max(1, lienzo.height), DISTANCIA_MINIMA_M, lejania);
    const matriz = multiplicar(proyeccion, vista(ojos, camara.rumbo, camara.cabeceo));

    gl.uniformMatrix4fv(gl.getUniformLocation(programa, "proyeccionVista"), false, matriz);
    gl.uniform1f(gl.getUniformLocation(programa, "exageracion"), camara.exageracion);
    gl.uniform3fv(gl.getUniformLocation(programa, "ojos"), ojos);
    gl.uniform3fv(gl.getUniformLocation(programa, "luz"), LUZ);
    gl.uniform3fv(gl.getUniformLocation(programa, "colorNiebla"), COLOR_NIEBLA);
    gl.uniform1f(gl.getUniformLocation(programa, "distanciaNiebla"), this.ladoMayor * 1.1);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texturaGl);
    gl.uniform1i(gl.getUniformLocation(programa, "textura"), 0);

    gl.uniform1i(gl.getUniformLocation(programa, "conTextura"), 0);
    gl.uniform3fv(gl.getUniformLocation(programa, "colorLiso"), COLOR_SUELO_LEJANO);
    this.dibujarMalla(this.sueloMalla);

    gl.uniform1i(gl.getUniformLocation(programa, "conTextura"), 1);
    this.dibujarMalla(this.terrenoMalla);
  }

  /** Libera la memoria de la tarjeta de video al cerrar la ventana. */
  destruir(): void {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private dibujarMalla({ vertices, cantidadIndices }: Malla): void {
    this.gl.bindVertexArray(vertices);
    this.gl.drawElements(this.gl.TRIANGLES, cantidadIndices, this.gl.UNSIGNED_INT, 0);
    this.gl.bindVertexArray(null);
  }

  /** Un punto por cada punto de la malla, con su lugar en la imagen y la pendiente para la sombra. */
  private crearMallaTerreno(): Malla {
    const { terreno } = this;
    const { columnas, filas, alturas } = terreno;
    const posiciones = new Float32Array(columnas * filas * 3);
    const coordenadas = new Float32Array(columnas * filas * 2);
    const pendientes = new Float32Array(columnas * filas * 2);
    const alturaEn = (columna: number, fila: number) =>
      alturas[Math.min(filas - 1, Math.max(0, fila)) * columnas + Math.min(columnas - 1, Math.max(0, columna))];

    for (let fila = 0; fila < filas; fila++) {
      for (let columna = 0; columna < columnas; columna++) {
        const indice = fila * columnas + columna;
        posiciones.set([columna * this.pasoX, terreno.altoMetros - fila * this.pasoY, alturaEn(columna, fila) - terreno.minima], indice * 3);
        coordenadas.set([columna / (columnas - 1), fila / (filas - 1)], indice * 2);
        // La fila crece hacia el sur: la pendiente hacia el norte es la de la fila anterior menos la siguiente.
        pendientes.set(
          [
            (alturaEn(columna + 1, fila) - alturaEn(columna - 1, fila)) / (2 * this.pasoX),
            (alturaEn(columna, fila - 1) - alturaEn(columna, fila + 1)) / (2 * this.pasoY),
          ],
          indice * 2,
        );
      }
    }

    const indices = new Uint32Array((columnas - 1) * (filas - 1) * 6);
    let posicion = 0;
    for (let fila = 0; fila < filas - 1; fila++) {
      for (let columna = 0; columna < columnas - 1; columna++) {
        const arribaIzquierda = fila * columnas + columna;
        const abajoIzquierda = arribaIzquierda + columnas;
        indices.set(
          [arribaIzquierda, abajoIzquierda, arribaIzquierda + 1, arribaIzquierda + 1, abajoIzquierda, abajoIzquierda + 1],
          posicion,
        );
        posicion += 6;
      }
    }
    return this.crearMalla(posiciones, coordenadas, pendientes, indices);
  }

  /** Suelo liso un poco por debajo de la cota más baja, alrededor del área hasta el horizonte. */
  private crearMallaSuelo(): Malla {
    const { anchoMetros, altoMetros } = this.terreno;
    const margen = this.ladoMayor * LADOS_DE_SUELO_ALREDEDOR;
    const abajo = -0.3;
    const posiciones = new Float32Array([
      -margen, -margen, abajo,
      anchoMetros + margen, -margen, abajo,
      -margen, altoMetros + margen, abajo,
      anchoMetros + margen, altoMetros + margen, abajo,
    ]);
    return this.crearMalla(posiciones, new Float32Array(8), new Float32Array(8), new Uint32Array([0, 1, 2, 2, 1, 3]));
  }

  private crearMalla(
    posiciones: Float32Array,
    coordenadas: Float32Array,
    pendientes: Float32Array,
    indices: Uint32Array,
  ): Malla {
    const { gl, programa } = this;
    const vertices = gl.createVertexArray()!;
    gl.bindVertexArray(vertices);
    const atributo = (nombre: string, datos: Float32Array, tamano: number) => {
      const ubicacion = gl.getAttribLocation(programa, nombre);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, datos, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(ubicacion);
      gl.vertexAttribPointer(ubicacion, tamano, gl.FLOAT, false, 0, 0);
    };
    atributo("posicion", posiciones, 3);
    atributo("coordenada", coordenadas, 2);
    atributo("pendiente", pendientes, 2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vertices, cantidadIndices: indices.length };
  }

  private subirTextura(imagen: HTMLCanvasElement): WebGLTexture {
    const { gl } = this;
    const textura = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, textura);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imagen);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Mirando el suelo de costado la imagen se ve borrosa; el filtro anisotrópico la mantiene nítida.
    const anisotropico = gl.getExtension("EXT_texture_filter_anisotropic");
    if (anisotropico) {
      const maximo = gl.getParameter(anisotropico.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, anisotropico.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, maximo));
    }
    return textura;
  }
}

function crearPrograma(gl: WebGL2RenderingContext, codigoVertices: string, codigoFragmentos: string): WebGLProgram {
  const compilar = (tipo: number, codigo: string) => {
    const sombreador = gl.createShader(tipo)!;
    gl.shaderSource(sombreador, codigo);
    gl.compileShader(sombreador);
    if (!gl.getShaderParameter(sombreador, gl.COMPILE_STATUS)) {
      throw new Error(`No compiló el sombreador de la vista 3D: ${gl.getShaderInfoLog(sombreador)}`);
    }
    return sombreador;
  };
  const programa = gl.createProgram()!;
  gl.attachShader(programa, compilar(gl.VERTEX_SHADER, codigoVertices));
  gl.attachShader(programa, compilar(gl.FRAGMENT_SHADER, codigoFragmentos));
  gl.linkProgram(programa);
  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
    throw new Error(`No se armó el programa de la vista 3D: ${gl.getProgramInfoLog(programa)}`);
  }
  return programa;
}

// Matrices de 4×4 guardadas por columnas, como las espera WebGL.

function perspectiva(campoVisual: number, proporcion: number, cerca: number, lejos: number): Float32Array {
  const foco = 1 / Math.tan(campoVisual / 2);
  const rango = 1 / (cerca - lejos);
  return new Float32Array([
    foco / proporcion, 0, 0, 0,
    0, foco, 0, 0,
    0, 0, (cerca + lejos) * rango, -1,
    0, 0, 2 * cerca * lejos * rango, 0,
  ]);
}

/** Cámara en `ojos` mirando según rumbo y cabeceo; WebGL mira hacia -z, por eso "adelante" va negado. */
function vista(ojos: [number, number, number], rumbo: number, cabeceo: number): Float32Array {
  const [senoRumbo, cosenoRumbo] = [Math.sin(rumbo), Math.cos(rumbo)];
  const [senoCabeceo, cosenoCabeceo] = [Math.sin(cabeceo), Math.cos(cabeceo)];
  const adelante = [senoRumbo * cosenoCabeceo, cosenoRumbo * cosenoCabeceo, senoCabeceo];
  const derecha = [cosenoRumbo, -senoRumbo, 0];
  const arriba = [-senoRumbo * senoCabeceo, -cosenoRumbo * senoCabeceo, cosenoCabeceo];
  const producto = (eje: number[]) => eje[0] * ojos[0] + eje[1] * ojos[1] + eje[2] * ojos[2];
  return new Float32Array([
    derecha[0], arriba[0], -adelante[0], 0,
    derecha[1], arriba[1], -adelante[1], 0,
    derecha[2], arriba[2], -adelante[2], 0,
    -producto(derecha), -producto(arriba), producto(adelante), 1,
  ]);
}

function multiplicar(primera: Float32Array, segunda: Float32Array): Float32Array {
  const resultado = new Float32Array(16);
  for (let columna = 0; columna < 4; columna++) {
    for (let fila = 0; fila < 4; fila++) {
      let suma = 0;
      for (let paso = 0; paso < 4; paso++) suma += primera[paso * 4 + fila] * segunda[columna * 4 + paso];
      resultado[columna * 4 + fila] = suma;
    }
  }
  return resultado;
}

function normalizar([x, y, z]: number[]): [number, number, number] {
  const largo = Math.hypot(x, y, z) || 1;
  return [x / largo, y / largo, z / largo];
}
