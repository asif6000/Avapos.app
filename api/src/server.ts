/**
 * The API process.
 *
 * Mounted at `/customer`, because that is the prefix the app is built with and
 * the prefix the deployed service used. Changing it would mean a rebuild and a
 * new `EXPO_PUBLIC_API_BASE_URL`, and this service exists to make the app work
 * without touching the app.
 *
 * CORS is included deliberately. The native build ignores it, but the admin
 * panel and any web build are browsers and discard a response that lacks
 * `Access-Control-Allow-Origin`. The deployed service sent no CORS headers at
 * all, which is why a web build could not read a single response from it.
 * `allowedOrigins` is a list, not `*`, because a bearer token in a response that
 * any page can read is a customer record any page can read.
 */

import express, { type NextFunction, type Request, type Response } from 'express';

import { customerRouter } from './customerRouter.js';
import { config } from './supabase.js';

const app = express();

// Behind whatever terminates TLS in front of this, so `req.ip` and rate limits
// see the real client rather than the proxy.
app.set('trust proxy', true);

app.disable('x-powered-by');

// The request body is never read: this service is read-only and every route is a
// GET. A small limit anyway, so a malformed POST cannot be buffered.
app.use(express.json({ limit: '16kb' }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  if (typeof origin === 'string' && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-client-request-id');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.get('/health', (_req: Request, res: Response) => {
  // Says only that the process is up. Deliberately does not touch the database:
  // a health check that reports "healthy" because a query was not attempted is
  // worse than one that is honest about what it does not know.
  res.json({ ok: true, service: 'srabon-api', mode: 'read-only' });
});

app.use('/customer', customerRouter());

app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    code: 'no_such_route',
    message: `${req.method} ${req.path} is not a route on this service.`,
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // A failed database read is a service failure, not a fact about the customer,
  // and it must not be reported as 403 or 404: the app shows a different screen
  // for each of those and would tell a paying customer their account is gone.
  const message = error instanceof Error ? error.message : 'unknown error';
  console.error('[api] unhandled', message);

  res.status(503).json({
    status: 'error',
    code: 'service_unavailable',
    message: 'The service could not complete this request.',
  });
});

app.listen(config.port, () => {
  console.log(`srabon-api listening on :${config.port} (read-only)`);
  if (allowedOrigins.length === 0) {
    console.log('  ALLOWED_ORIGINS is empty — CORS is off. Set it before serving a web build.');
  }
});
