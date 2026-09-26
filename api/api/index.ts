/**
 * The Vercel entrypoint.
 *
 * Vercel's Node runtime runs this file per request and calls the default export
 * with the request, so the app is exported rather than listened on. That is the
 * only difference from running it locally, and it is why `createApp()` lives in
 * its own module — see `server.ts` for the local path.
 *
 * `export default` rather than `module.exports = app` because this project is ESM
 * (`"type": "module"` in package.json) and Vercel reads that.
 */

import { createApp } from '../src/app.js';

const app = createApp();

export default app;
