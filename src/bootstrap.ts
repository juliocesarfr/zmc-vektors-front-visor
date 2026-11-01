import { provideZoneChangeDetection } from "@angular/core";
import { platformBrowser } from "@angular/platform-browser";
import { AppModule } from "./app/app.module";

platformBrowser()
  // desde Angular 21 bootstrapModule arranca sin zone.js; las pantallas actualizan datos en subscribe y lo necesitan
  .bootstrapModule(AppModule, { applicationProviders: [provideZoneChangeDetection()] })
  .catch((err) => console.error(err));
