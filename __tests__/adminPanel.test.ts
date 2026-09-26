import { readFileSync } from 'node:fs';
import path from 'path';

/**
 * The admin panel's front door.
 *
 * An admin can read a customer's money, contract and device, and can release a
 * phone. That makes these properties worth a test rather than a review comment,
 * because each one is a way the panel could become a way *into* the customer
 * data:
 *
 * - the panel holds no credential of its own, so a browser cannot become the
 *   server: the service-role key is never in the bundle
 * - the panel is never trusted to say who it is; the server decides, on every
 *   request, from the token
 * - the role comes from the token's `app_metadata`, which a client cannot write
 * - the panel's API prefix is separate from the directory it is served from, so
 *   a route can never be mistaken for a file
 * - nothing in the panel can mark a payment paid. Asking the gateway is the only
 *   way, and that is a question, not a decision
 */

const ROOT = path.resolve(__dirname, '..');
const ADMIN = path.join(ROOT, 'admin');

const read = (...parts: string[]) => readFileSync(path.join(ADMIN, ...parts), 'utf8');

describe('the admin panel holds no credential', () => {
  const files = [
    'src/lib/api.ts',
    'src/ui.tsx',
    'src/App.tsx',
    'src/screens/SignIn.tsx',
    'src/screens/panels.tsx',
    'src/main.tsx',
    'vite.config.ts',
    'index.html',
  ];

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each([
    ['VITE_SUPABASE_SERVICE_ROLE', 'a service-role key'],
    ['service_role', 'a service-role key'],
    ['sb_secret_', 'a secret key'],
  ])('never mentions %s (%s)', (needle) => {
    const offenders = files.filter((file) => read(file).includes(needle));

    expect(offenders).toEqual([]);
  });

  it('only ever asks Supabase to sign in a person', () => {
    const source = read('src/lib/api.ts');

    // One call, and it is the password grant. No admin endpoint, no key.
    expect(source).toContain('/auth/v1/token?grant_type=password');
    expect(source.match(/fetch\(/g)?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('can point at the Supabase project the mock publishes, on its own origin', () => {
    // The same `same-origin` switch the customer app has, so a panel on a tunnel
    // or a LAN address needs no hard-coded host and makes no cross-origin
    // request at all.
    const source = read('src/lib/api.ts');
    expect(source).toContain("configured.replace('same-origin', window.location.origin)");
  });

  it('cannot be built without its Supabase settings', () => {
    // The failure this prevents is quiet and total: a panel with no URL and no
    // key still builds and still loads, and then refuses every sign-in as though
    // the server were broken.
    const guard = readFileSync(path.join(ADMIN, 'check-env.mjs'), 'utf8');
    expect(guard).toContain('VITE_SUPABASE_URL');
    expect(guard).toContain('VITE_SUPABASE_ANON_KEY');
    expect(guard).toContain('process.exit(1)');

    const scripts = JSON.parse(readFileSync(path.join(ADMIN, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(scripts.scripts.build).toContain('check-env.mjs');
  });

  it('says which build setting is missing, rather than blaming the server', () => {
    expect(read('src/lib/api.ts')).toContain('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  });

  it('asks the server who it is, and treats a 403 as a signed-out state', () => {
    const source = read('src/lib/api.ts');

    expect(source).toContain('whoAmI');
    // The panel never decides it is an admin; it asks, and a refusal signs it out.
    expect(source).toMatch(/response\.status === 401 \|\| response\.status === 403/);
  });
});

describe('the admin API', () => {
  const routes = readFileSync(path.join(ROOT, 'backend/routes/admin-api.php'), 'utf8');
  const middleware = readFileSync(
    path.join(ROOT, 'backend/app/Http/Middleware/RequireAdmin.php'),
    'utf8',
  );
  const actions = readFileSync(
    path.join(ROOT, 'backend/app/Http/Controllers/Admin/AdminActionController.php'),
    'utf8',
  );

  it('sits behind both signature verification and the admin check', () => {
    expect(routes).toContain('VerifySupabaseJwt::class');
    expect(routes).toContain('RequireAdmin::class');
  });

  it('guards the whole group, so a route added later cannot forget it', () => {
    expect(routes).toContain('->middleware([VerifySupabaseJwt::class, RequireAdmin::class])');

    // Every route is declared inside that group: the guard comes first, and no
    // route appears above it where it would be unguarded.
    const guard = routes.indexOf('RequireAdmin::class');
    const firstRoute = routes.indexOf('Route::get(');
    expect(guard).toBeGreaterThan(-1);
    expect(firstRoute).toBeGreaterThan(guard);
  });

  it('serves the API from a prefix the panel\'s own files do not use', () => {
    // The panel is served from /admin; if the API used the same prefix a route
    // would compete with a file for the same URL.
    expect(routes).toContain("Route::prefix('admin/api')");
    expect(read('src/lib/api.ts')).toContain("`/admin/api${path}`");
  });

  it('takes the role from the token, not from the request', () => {
    expect(middleware).toContain('app_metadata');
    // Nothing in the middleware may read a role, a flag or an address out of the
    // request body or query: a browser can send those.
    expect(middleware).not.toMatch(/\$request->(input|query)\(/);
  });

  it('refuses with one message, whatever the reason', () => {
    expect(middleware).toContain("'You do not have access to this area.'");
    // And it writes the attempt down: somebody probing this with a customer
    // token is exactly what an operator wants to see.
    expect(middleware).toContain('Refused an admin request');
  });

  it('cannot mark a payment paid', () => {
    // The only way to SUCCESS is asking the gateway, and the controller never
    // writes a payment's status itself.
    expect(actions).toContain('settleFromInvoice');
    expect(actions).not.toMatch(/'status'\s*=>\s*'SUCCESS'/);
    expect(actions).not.toMatch(/CustomerPayment::[^;]*->update/);
  });

  it('requires a reason for anything that touches a customer', () => {
    expect(actions).toContain("'reason' => ['required'");
  });

  it('writes an audit record for every action', () => {
    expect(actions).toContain('admin_audit');
  });
});
