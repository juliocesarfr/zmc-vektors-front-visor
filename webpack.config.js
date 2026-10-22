const ModuleFederationPlugin = require("webpack/lib/container/ModuleFederationPlugin");
const mf = require("@angular-architects/module-federation/webpack");
const path = require("path");
const sharedDeps = require("../host/src/assets/mf.shared.config");

const sharedMappings = new mf.SharedMappings();
sharedMappings.register(path.join(__dirname, "../../tsconfig.json"), [
  /* mapped paths to share */
]);

module.exports = {
  output: {
    uniqueName: "mfGeoreferencia",
    publicPath: "auto",
  },
  optimization: {
    runtimeChunk: false,
  },
  resolve: {
    alias: {
      ...sharedMappings.getAliases(),
    },
  },
  experiments: {
    outputModule: true,
  },
  devServer: {
    allowedHosts: "all",
  },
  plugins: [
    new ModuleFederationPlugin({
      library: { type: "module" },

      // For remotes (please adjust)
      name: "mfGeoreferencia",
      filename: "mfGeoreferenciaremoteEntry.js",
      exposes: {
        "./mfGeoreferencia":
          "./projects/mf-georeferencia/src/app/pages-georeferencia/pages-georeferencia.module.ts",
      },

      // For hosts (please adjust)
      // remotes: {
      //     "host": "http://localhost:5000/remoteEntry.js",
      //     "mfSeguridad": "http://localhost:4201/remoteEntry.js",
      //     "mfCatastro": "http://localhost:4200/remoteEntry.js",

      // },

      // La misma lista que el host: lo que el host ya cargó (exceljs, quill, animations…) no se vuelve a bajar.
      shared: {
        ...sharedDeps,
        ...sharedMappings.getDescriptors(),
      },
    }),
    sharedMappings.getPlugin(),
  ],
};
