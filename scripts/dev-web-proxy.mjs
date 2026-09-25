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

import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';

const LISTEN_HOST = process.env.PROXY_HOST ?? '127.0.0.1';
const LISTEN_PORT = Number(process.env.PROXY_PORT ?? 8081);
const APP_PORT = Number(process.env.APP_PORT ?? 8083);
const MOCK_ORIGIN = process.env.MOCK_ORIGIN ?? 'http://127.0.0.1:4000';
/**
 * A built app, when there is one. Serving the export is the steadier option for
 * a phone: no Metro in the loop, so a rebuild, a watcher or a websocket cannot
 * take the page away mid-demo. Without it, everything falls through to Expo.
 */
const STATIC_DIR = resolve(
  process.env.PROXY_STATIC_DIR ?? (existsSync('dist') ? 'dist' : ''),
);

/**
 * The paths the mock answers. Everything else is the app.
 *
 * `/gateway` is the simulated bKash/Nagad page: it lives on the same origin as
 * the app so the hand-off needs no CORS and no absolute host of its own, and it
 * has to come back through here or the customer would be sent to the mock's
 * loopback address, which their phone cannot reach.
 */
const MOCK_PREFIXES = ['/auth/v1', '/rest/v1', '/customer', '/gateway'];

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

/**
 * A stamp on the bundle URL, regenerated every time the proxy starts.
 *
 * Expo's dev bundle is served from a fixed path, so a browser that has it cached
 * keeps running the build it already has — which, after a configuration change,
 * means the app quietly keeps talking to the *old* backend and nothing anyone
 * can see explains why. Adding a stamp to the script URL makes a restart of this
 * proxy a cache bust, so "restart and reload" is actually enough.
 */
const BUNDLE_STAMP = Date.now().toString(36);

function bustBundleStamp(html) {
  return html.replace(
    /(src="[^"]*entry\.bundle[^"]*)"/,
    (_match, src) => `${src}${src.includes('?') ? '&' : '?'}_v=${BUNDLE_STAMP}"`,
  );
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

function serveStatic(request, response, pathname) {
  // `normalize` before joining: a request for `/../../etc/passwd` must not be
  // able to walk out of the directory it is served from.
  const candidate = join(STATIC_DIR, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  const file =
    existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(STATIC_DIR, 'index.html'); // single-page app: unknown paths are routes

  if (!existsSync(file)) return false;
  const type = CONTENT_TYPES[extname(file)] ?? 'application/octet-stream';
  const stamped = type.includes('text/html') ? bustBundleStamp : (body) => body;

  if (type.includes('text/html')) {
    const chunks = [];
    createReadStream(file)
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => {
        const body = Buffer.from(stamped(Buffer.concat(chunks).toString('utf8')));
        response.writeHead(200, {
          'Content-Type': type,
          'content-length': body.length,
          'cache-control': 'no-store',
        });
        response.end(body);
      });
    return true;
  }

  response.writeHead(200, { 'Content-Type': type, 'cache-control': 'no-store' });
  createReadStream(file).pipe(response);
  return true;
}

function forward(request, response, target, { stripOrigin = false, keepHost = false } = {}) {
  const headers = { ...request.headers };

  // Body framing belongs to the upstream response, not to the request the
  // browser happened to send. Forwarding the caller's `content-length` makes a
  // reply with a different length fail to parse.
  delete headers['content-length'];
  delete headers['transfer-encoding'];
  delete headers['accept-encoding'];

  const upstream = httpRequest(
    target,
    {
      method: request.method,
      // Forwarded verbatim: the Authorization header is the Supabase session JWT
      // the mock validates, and dropping it would make every call anonymous.
      //
      // The mock keeps the caller's `Host`, because it builds the gateway
      // redirect URL from it — that URL has to point back at the origin the
      // customer is actually on (the tunnel), not at the mock's own port. The app
      // server gets the upstream host instead, which is what it expects.
      headers: {
        ...headers,
        host: keepHost ? (request.headers.host ?? new URL(target).host) : new URL(target).host,
      },
    },
    (response_) => {
      const headers = { ...response_.headers };
      const contentType = String(headers['content-type'] ?? '');

      // The proxy *is* the origin as far as the browser is concerned, so the
      // upstream app server should not be told where the request came from.
      // Expo's dev server refuses requests carrying an Origin it does not know,
      // which is every request coming through a tunnel or a LAN address — it
      // answers 401 with "conflicting browser extension" and the phone gets a
      // broken page.
      if (stripOrigin) {
        delete headers.origin;
        delete headers.referer;
      }

      if (contentType.includes('text/html')) {
        // Buffered only so the bundle URL can be stamped. An error here is a
        // dropped connection, not a reason to take the process down.
        const chunks = [];
        response_.on('data', (chunk) => chunks.push(chunk));
        response_.on('error', () => response.end());
        response_.on('end', () => {
          if (response.writableEnded) return;
          const body = Buffer.from(bustBundleStamp(Buffer.concat(chunks).toString('utf8')));
          // Exactly one framing header, or a client that trusts
          // `content-length` will reject a chunked body of the same bytes.
          delete headers['transfer-encoding'];
          headers['content-length'] = String(body.length);
          // The page must not be cached either, or the stamp never arrives.
          headers['cache-control'] = 'no-store';
          response.writeHead(response_.statusCode ?? 200, headers);
          response.end(body);
        });
        return;
      }

      if (stripOrigin) headers['cache-control'] = 'no-store';
      // The upstream's framing travels with the body; the proxy is not
      // re-encoding anything, so it must not add a second opinion about length.
      delete headers['content-length'];
      delete headers['transfer-encoding'];
      response.writeHead(response_.statusCode ?? 502, headers);
      pipeline(response_, response, () => undefined);
    },
  );

  upstream.on('error', (error) => {
    if (response.writableEnded || response.headersSent) {
      response.end();
      return;
    }
    response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'error', message: String(error.message) }));
  });

  // `pipeline` tears both sides down together. Without it, a browser that hangs
  // up mid-request — which a page reload, an aborted HMR poll and a phone losing
  // signal all do — leaves an unhandled stream error, and an unhandled stream
  // error takes the whole process with it.
  pipeline(request, upstream, () => undefined);
}

/**
 * `--supervise` restarts the proxy if it ever exits.
 *
 * A long-lived tunnel on a phone is a bad place for a dev tool to have a bad
 * minute: an aborted request or a dropped upstream can take the process down,
 * and until it is back the page in the customer's hand is simply broken. This
 * is a development affordance, not something a build ever runs.
 */
const SUPERVISE = process.argv.includes('--supervise');

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${LISTEN_HOST}:${LISTEN_PORT}`).pathname;

  if (isMockPath(pathname)) {
    console.log(`  ${request.method} ${pathname}  ->  mock`);
    forward(request, response, `${MOCK_ORIGIN}${request.url}`, { keepHost: true });
    return;
  }

  if (STATIC_DIR && request.method === 'GET' && serveStatic(request, response, pathname)) {
    console.log(`  ${request.method} ${pathname}  ->  static`);
    return;
  }

  console.log(`  ${request.method} ${pathname}  ->  expo`);
  forward(request, response, `http://127.0.0.1:${APP_PORT}${request.url}`, { stripOrigin: true });
});

server.on('error', (error) => {
  console.error(`  proxy error: ${error.message}`);
  // A port that is busy is worth waiting for, not worth dying quietly on: the
  // previous incumbent is usually a dev server shutting down. Without this the
  // process stays alive, listening to nothing, and every request fails while
  // the log claims it started.
  if (error.code === 'EADDRINUSE') {
    console.error(`  port ${LISTEN_PORT} is busy — retrying in 2s.`);
    setTimeout(() => server.listen(LISTEN_PORT, LISTEN_HOST), 2000);
    return;
  }
  if (error.code === 'EACCES') {
    console.error(`  not allowed to bind ${LISTEN_PORT}.`);
    process.exit(1);
  }
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

if (SUPERVISE) {
  const isChild = process.env.PROXY_CHILD === '1';

  if (!isChild) {
    // The parent holds no port, so it survives whatever reaps the process that
    // does. A restart in the *same* process would not help: a signal it cannot
    // catch leaves nothing to run the handler.
    const runChild = () => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
        stdio: 'inherit',
        env: { ...process.env, PROXY_CHILD: '1' },
      });
      child.on('exit', (code, signal) => {
        if (signal === 'SIGTERM' || signal === 'SIGINT' || code === 0) {
          process.exit(code ?? 0);
        }
        console.error(`\n  proxy stopped (${signal ?? `exit ${code}`}) — restarting in 1s.`);
        setTimeout(runChild, 1000);
      });
    };

    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => process.exit(0));
    }
    runChild();
  }
}
