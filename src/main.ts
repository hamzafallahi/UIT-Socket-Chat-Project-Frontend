import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Some bundled dependencies still reference Node's global object.
// Map it to globalThis in the browser runtime.
(globalThis as { global?: typeof globalThis }).global ??= globalThis;
(globalThis as { process?: { env: Record<string, string> } }).process ??= { env: {} };

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
