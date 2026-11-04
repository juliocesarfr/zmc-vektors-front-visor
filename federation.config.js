const { withNativeFederation, shareAll } = require("@angular-architects/native-federation/config");
require("../../federation-microfrontends-ausentes").tolerarMicrofrontendsAusentes();

module.exports = withNativeFederation({
  name: "mf-georeferencia",

  exposes: {
    "./mfGeoreferencia": "./projects/mf-georeferencia/src/app/pages-georeferencia/pages-georeferencia.module.ts",
  },

  shared: {
    ...shareAll({ singleton: true, strictVersion: false, requiredVersion: "auto" }),
  },

  // esbuild deja externas también las rutas profundas de un paquete compartido, y el import map solo trae las que
  // el paquete declara una por una: los que se importan por rutas sin declarar se empaquetan dentro de cada proyecto
  skip: [
    // primeng/types/* son solo tipos: compartidos salían como archivos vacíos que Hostinger no sube (404 y página en blanco)
    new RegExp("^primeng/types/"),
    "rxjs/ajax",
    "rxjs/fetch",
    "rxjs/testing",
    "rxjs/webSocket",
    "ol",
    "@primeuix/themes",
    // trae dependencias de Node (archiver, unzipper); empaquetado usa su versión para navegador
    "exceljs",
    // su versión para navegador pide "stream" al compartirlo; empaquetado dentro de cada proyecto funciona
    "jszip",
    "@softarc/native-federation-node",
  ],

  // el código de @host/* se compila dentro de cada proyecto, como hoy; compartir cada archivo serían más de mil piezas
  sharedMappings: [],

  features: {
    ignoreUnusedDeps: true,
  },
});
