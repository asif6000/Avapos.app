/**
 * Running the service locally.
 *
 * The app itself is in `app.ts` so that the same instance can be handed to Vercel
 * as a serverless function. Nothing here is imported by that path: calling
 * `listen` at import time would open a port inside a function that must not have
 * one.
 */

import { createApp } from './app.js';
import { config } from './supabase.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`srabon-api listening on :${config.port} (read-only)`);
  if ((process.env.ALLOWED_ORIGINS ?? '').trim().length === 0) {
    console.log('  ALLOWED_ORIGINS is empty — CORS is off. Set it before serving a web build.');
  }
});
