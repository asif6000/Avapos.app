/**
 * Dev-only: one origin for the whole app, so a phone can use it.
 *
 * WHY THIS EXISTS
 *
 * `npm run dev:mock` and `npm run dev:mock:app` work on the machine they run on.
 * Open the app from a phone, though, and nothing works: the tunnel or a LAN
 * address only reaches the port serving the app, so `127.0.0.1:4000` — the mock
 * — is a different machine, and `https://srabontelecom.paymently.io` sends no
 * CORS headers, so a browser discards even the 401 the server is perfectly happy
 * to give. The customer sees "Unable to reach our servers" about a server that is
 * answering, and nothing in the app can tell the two apart.
 *
 * So this serves both from one port: Supabase Auth, PostgREST and `/customer`
 * are forwarded to the mock, and everything else to the Expo dev server. The app
 * is then same-origin with its own API, which means no CORS at all.
 *
 * WHAT IT IS NOT
 *
 * Not a fallback and not reachable from a real build. It binds loopback only, it
 * refuses to start in production, it holds no secret (the mock's anon key is
 * public by design), and every production build profile pins the real API host.
 * The app only talks to it when `EXPO_PUBLIC_SUPABASE_URL` is the literal string
 * `same-origin`, which no build profile sets.
 *
 * USAGE
 *
 *   npm run dev:mock           # terminal 1 — the mock on :4000
 *   npm run dev:mock:app:proxy # terminal 2 — Expo on :8083 behind this on :8081
 *
 * Then open http://localhost:8081 on this machine, or the tunnel/phone address
 * that points at :8081, and sign in with asifghe78@gmail.com / Passw0rd!.
 */

import { createServer, request as httpRequest } from 'node:http';

const LISTEN_HOST = process.env.PROXY_HOST ?? '127.0.0.1';
const LISTEN_PORT = Number(process.env.PROXY_PORT ?? 8081);
const APP_PORT = Number(process.env.APP_PORT ?? 8083);
const MOCK_ORIGIN = process.env.MOCK_ORIGIN ?? 'http://127.0.0.1:4000';

/** The paths the mock answers. Everything else is the app. */
const MOCK_PREFIXES = ['/auth/v1', '/rest/v1', '/customer'];

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to start: the dev proxy must never run in production.');
  process.exit(1);
}
if (LISTEN_HOST !== '127.0.0.1' && LISTEN_HOST !== 'localhost' && !process.argv.includes('--allow-remote')) {
  console.error(`Refusing to bind ${LISTEN_HOST}. Pass --allow-remote if you really mean it.`);
  process.exit(1);
}

function isMockPath(pathname) {
  return MOCK_PREFIXES.some(
    (prefix) => pathname === prefix || pathname === `${prefix}/` || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`),
  );
}

function forward(request, response, target) {
  const proxied = httpRequest(
    target,
    {
      method: request.method,
      // Forwarded verbatim: the Authorization header is the Supabase session JWT
      // the mock validates, and dropping it would make every call anonymous.
      headers: { ...request.headers, host: new URL(target).host },
    },
    (upstream) => {
      response.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(response);
    },
  );

  proxied.on('error', (error) => {
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'error', message: String(error.message) }));
  });

  request.pipe(proxied);
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${LISTEN_HOST}:${LISTEN_PORT}`).pathname;
  const target = isMockPath(pathname) ? `${MOCK_ORIGIN}${request.url}` : `http://127.0.0.1:${APP_PORT}${request.url}`;

  console.log(`  ${request.method} ${pathname}  ->  ${isMockPath(pathname) ? 'mock' : 'expo'}`);
  forward(request, response, target);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log('');
  console.log('  Dev proxy (development only)');
  console.log(`    app + API   http://${LISTEN_HOST}:${LISTEN_PORT}`);
  console.log(`    expo        http://127.0.0.1:${APP_PORT}`);
  console.log(`    mock API    ${MOCK_ORIGIN}`);
  console.log('');
  console.log('  Open the app on this port — the phone, the tunnel and this machine');
  console.log('  all reach it, and the app is same-origin with its own API.');
  console.log('  Sign in with  asifghe78@gmail.com  /  Passw0rd!');
  console.log('');
});
