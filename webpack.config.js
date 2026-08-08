const ModuleFederationPlugin = require("webpack/lib/container/ModuleFederationPlugin");
const mf = require("@angular-architects/module-federation/webpack");
const path = require("path");
const share = mf.share;

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

      shared: {
        "@angular/core": {
          singleton: true,
          strictVersion: false,
          requiredVersion: false,
        },
        "@angular/common": {
          singleton: true,
          strictVersion: false,
          requiredVersion: "auto",
        },
        "@angular/common/http": {
          singleton: true,
          strictVersion: false,
          requiredVersion: "auto",
        },
        "@angular/router": {
          singleton: true,
          strictVersion: false,
          requiredVersion: "auto",
        },
        "@angular/forms": {
          singleton: true,
          strictVersion: false,
          requiredVersion: "auto",
        },
        "@angular/platform-browser": {
          singleton: true,
          strictVersion: false,
          requiredVersion: "auto",
        },
        primeng: {
          singleton: true,
          strictVersion: false,
          requiredVersion: "auto",
        },
        primeicons: { singleton: true, strictVersion: false },
        "primeng/api": { singleton: true, strictVersion: false },
        "primeng/dynamicdialog": { singleton: true, strictVersion: false },
        "primeng/table": { singleton: true, strictVersion: false },
        "primeng/button": { singleton: true, strictVersion: false },
        "primeng/toast": { singleton: true, strictVersion: false },
        "primeng/dialog": { singleton: true, strictVersion: false },
        "primeng/dropdown": { singleton: true, strictVersion: false },
        "primeng/paginator": { singleton: true, strictVersion: false },
        "primeng/confirmdialog": { singleton: true, strictVersion: false },
        "primeng/tooltip": { singleton: true, strictVersion: false },
        "primeng/inputtext": { singleton: true, strictVersion: false },
        "primeng/tag": { singleton: true, strictVersion: false },
        "primeng/panel": { singleton: true, strictVersion: false },
        "primeng/scroller": { singleton: true, strictVersion: false },
        "primeng/tabview": { singleton: true, strictVersion: false },
        "primeng/selectbutton": { singleton: true, strictVersion: false },
        "primeng/overlaypanel": { singleton: true, strictVersion: false },
        "primeng/checkbox": { singleton: true, strictVersion: false },
        "primeng/radiobutton": { singleton: true, strictVersion: false },
        "primeng/inputtextarea": { singleton: true, strictVersion: false },
        "primeng/divider": { singleton: true, strictVersion: false },
        "primeng/autofocus": { singleton: true, strictVersion: false },
        rxjs: {
          singleton: true,
          strictVersion: false,
          requiredVersion: "auto",
        },
        sweetalert2: {
          singleton: true,
          strictVersion: false,
          requiredVersion: "auto",
        },
        moment: {
          singleton: true,
          strictVersion: false,
          requiredVersion: "auto",
        },
        ...sharedMappings.getDescriptors(),
      },
    }),
    sharedMappings.getPlugin(),
  ],
};
