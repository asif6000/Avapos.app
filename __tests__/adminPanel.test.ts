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

describe('the admin panel is usable in a hand and on a desk', () => {
  const css = readFileSync(path.join(ADMIN, 'dist/../src/styles.css'), 'utf8');
  const panels = read('src/screens/panels.tsx');

  it('gives a desk a sidebar and a phone a drawer, never both at once', () => {
    expect(css).toContain('@media (min-width: 900px)');
    expect(css).toContain('flex-direction: column');
    expect(read('src/App.tsx')).toContain('className="rail"');

    // The sidebar is the drawer shape's sibling, off below desk width. A menu
    // drawn twice — a strip under the header *and* behind a button — is two menus
    // to keep in step, and one of them is always the wrong one.
    expect(css).toContain('.rail { display: none; }');
    expect(css).toMatch(/@media \(min-width: 900px\)[\s\S]*?\.rail \{\s*display: flex;/);
  });

  it('turns every table into cards on a narrow screen', () => {
    // A table that has to be scrolled sideways to read a reference number is a
    // table nobody reads. The cells carry their own labels so the card version
    // needs no header row.
    expect(css).toContain('@media (max-width: 720px)');
    expect(css).toContain('attr(data-label)');
    expect(panels).toContain('data-label={label}');
    expect(css).toContain('overflow-x: visible');
  });

  it('gives every control a thumb-sized target on a phone', () => {
    expect(css).toContain('min-height: 44px');
    // 16px inputs, or iOS zooms when a field is focused and the layout jumps.
    expect(css).toContain('16px');
  });

  it('keeps the header and the sidebar reachable while scrolling', () => {
    expect(css).toContain('position: sticky');
    expect(css).toContain('100dvh');
  });
});

describe('every part of the panel is one tap away', () => {
  const app = read('src/App.tsx');
  const panels = read('src/screens/panels.tsx');
  const css = readFileSync(path.join(ADMIN, 'src/styles.css'), 'utf8');

  it('lists every section in a single navigation, grouped by task', () => {
    // One list, two shapes. A screen that is only reachable from somewhere inside
    // another screen is a screen the first person to use it never finds.
    const ids = [...app.matchAll(/id: '([a-z]+)', label: '([A-Za-z]+)'/g)].map((match) => match[1]);

    expect(ids).toEqual([
      'dashboard',
      'customers',
      'devices',
      'payments',
      'tickets',
      'notifications',
      'audit',
    ]);
    expect(app.match(/id: '(dashboard|customers|devices|payments|tickets|notifications|audit)'/g)).toHaveLength(7);

    // Grouped, because "People" and "Money" are what somebody is doing, and a
    // flat list of seven names is a list nobody scans.
    for (const group of ['Overview', 'People', 'Money', 'Work', 'Record']) {
      expect(app).toContain(`label: '${group}'`);
    }
    expect(app).toContain('export const SECTIONS = GROUPS.flatMap');

    // Every section is rendered by the switch, so no nav entry is a dead end.
    // `audit` is the default arm, so it is checked by its heading instead.
    for (const id of ids.filter((id) => id !== 'audit')) {
      expect(app).toContain(`tab === '${id}'`);
    }
    for (const title of ['Dashboard', 'Customers', 'Payments', 'Devices', 'Tickets', 'Notifications', 'Audit']) {
      expect(app).toContain(`<PageHead title="${title}"`);
    }
  });

  it('draws the same list twice: a drawer in a hand, a sidebar on a desk', () => {
    expect(app).toContain('const nav = (inDrawer: boolean)');
    expect(app).toContain('{nav(false)}');
    expect(app).toContain('{nav(true)}');
    expect(app).toContain('className="rail"');
    expect(app).toContain('className="drawer"');
  });

  it('opens the drawer on a phone and leaves it out of the way on a desk', () => {
    // The hamburger is only rendered when there is no drawer open, and it is
    // gone at desk width, where the sidebar already has everything.
    expect(app).toContain('window.matchMedia(\'(min-width: 900px)\')');
    expect(app).toContain('{drawer ? null : (');
    expect(app).toContain('<MenuButton onClick={() => setDrawer(true)} label="Open menu" />');
  });

  it('gives the drawer the things a hand needs', () => {
    // A drawer that is a `<div>` is a drawer a screen reader walks straight past,
    // and one the page behind can be scrolled out from under.
    expect(app).toContain('role="dialog"');
    expect(app).toContain('aria-modal="true"');
    expect(app).toContain("event.key === 'Escape'");
    expect(app).toContain("document.body.style.overflow = 'hidden'");
    // And it must let go of the page when it closes.
    expect(app).toContain("document.body.style.overflow = previous");
  });

  it('closes the drawer on the way to a screen, and offers a way out of it', () => {
    expect(app).toContain('setDrawer(false)');
    expect(app).toContain('aria-label="Close menu"');
    // Sign-out is inside the menu too, because a hand is what opened it.
    expect(app).toContain('className="menuFoot"');
    expect(css).toContain('.menuFoot {');
  });

  it('keeps the buttons out of the header, where the screen name is', () => {
    // The header is a name and nothing else. Every action lives in the menu, so
    // there is one place to look for it — and the top of a screen is not a place
    // that changes meaning from one screen to the next.
    const header = app.slice(app.indexOf('<header className="bar"'), app.indexOf('</header>'));

    expect(header).toContain('Customer');
    expect(header).not.toMatch(/Sign out/);
    expect(header).not.toContain('identity.email');

    // Both menu shapes carry the same foot, so signing out is reachable in either.
    expect(app.match(/className="menuFoot"/g)).toHaveLength(2);
  });

  it('shows the menu button only where there is no sidebar', () => {
    // On a desk the sidebar is always there, so a button to open a menu over it
    // would be a button that opens nothing useful. On a phone it is the only way
    // in, so it must not be hidden.
    expect(app).toContain('className="menuOnly"');
    expect(css).toMatch(/\.menuOnly \{ display: inline-flex; \}/);
    expect(css).toMatch(/@media \(min-width: 900px\)[\s\S]*?\.menuOnly \{ display: none; \}/);
  });

  it('says which screen you are on, to a person and to a screen reader', () => {
    expect(app).toContain("aria-current={active === item.id ? 'page' : undefined}");
    expect(app).toContain('navItemActive');
  });

  it('never leaves a table cell without a label', () => {
    // The phone layout hides the header row and prints each cell's own label, so
    // an empty one renders as a card of bare values with nothing to attach them
    // to. This is the check that keeps that from coming back.
    const labels = [...panels.matchAll(/<Cell label="([^"]*)"/g)].map((match) => match[1] ?? '');

    expect(labels.length).toBeGreaterThan(20);
    expect(labels.filter((label) => label.trim() === '')).toEqual([]);

    // And no column header may be blank either, or the desk view loses a column.
    for (const match of panels.matchAll(/head=\{(\[[^\]]*\])\}/g)) {
      const columns = (match[1] ?? '')
        .replace(/[[\]'\s]/g, '')
        .split(',')
        .map((column) => column.trim());
      expect(columns.length).toBeGreaterThan(1);
      expect(columns.filter((column) => column === '')).toEqual([]);
    }
  });

  it('shows something honest while waiting, and when there is nothing', () => {
    // "Loading…" plus a layout jump tells an agent nothing; a skeleton looks like
    // the rows it is standing in for.
    expect(panels).toContain('export function Loading');
    expect(panels).toContain('className="skeleton"');
    expect(css).toContain('.skeleton');
    // An empty list is stated, not rendered as a table header over nothing.
    expect(panels).toContain('export function Empty');
  });
});

/**
 * What the panel may ask of a customer's phone.
 *
 * A financed phone is managed by an enterprise DPC the *store* provisioned. So
 * every button here is a request, and the properties that matter are all about
 * what the panel is prevented from claiming:
 *
 * - a press is a request, and the record says `REQUESTED` until the phone answers
 * - there is no route that marks a command done, for the same reason there is no
 *   "mark this payment paid"
 * - a phone the store never provisioned is refused, not faked
 * - the two irreversible commands cost a typed confirmation
 * - the reminder's figure comes from the schedule, never from the browser
 * - a phone cannot write `APPLIED` onto its own row through PostgREST
 */
describe('the panel may ask a phone, but cannot answer for it', () => {
  const service = readFileSync(
    path.join(ROOT, 'backend/app/Services/Devices/DeviceCommandService.php'),
    'utf8',
  );
  const actions = readFileSync(
    path.join(ROOT, 'backend/app/Http/Controllers/Admin/AdminActionController.php'),
    'utf8',
  );
  const reads = readFileSync(
    path.join(ROOT, 'backend/app/Http/Controllers/Admin/AdminReadController.php'),
    'utf8',
  );
  const routes = readFileSync(path.join(ROOT, 'backend/routes/admin-api.php'), 'utf8');
  const panelApi = read('src/lib/api.ts');
  const panels = read('src/screens/panels.tsx');
  const sql = readFileSync(path.join(ROOT, 'sql/05-device-commands.sql'), 'utf8');

  it('records a request, and nothing but a request', () => {
    // A row is born REQUESTED. The service has no method that changes it, apart
    // from the one the device's own check-in calls.
    expect(service).toContain("'outcome' => 'REQUESTED'");
    expect(service).toContain('public function reportOutcome(');
  });

  it('cannot mark a command done from the panel', () => {
    // The one place `APPLIED` may be written is the device reporter, and the
    // controller is not it. The audit record says REQUESTED as well, so the trail
    // does not claim the phone did something it had not yet reported doing.
    expect(actions).not.toContain('APPLIED');
    expect(actions).toContain("'outcome' => 'REQUESTED'");
    // And no route offers it.
    expect(routes).not.toMatch(/devices\/\{id\}\/[^']*(done|apply|confirm|outcome)/i);
  });

  it('refuses a phone that cannot be asked, and says why', () => {
    // Not a 500 and not a cheerful "done": a refusal a person at a counter can act
    // on, because a shop phone the store never provisioned really cannot lock.
    expect(service).toContain('public function blockerFor(');
    expect(service).toContain('This phone is not managed, so it cannot be asked to do anything.');
    // Both facts have to hold: the agent and the paperwork.
    expect(service).toContain('is_managed');
    expect(service).toContain("!== 'ENROLLED'");
    expect(actions).toContain("'status' => 'refused'");
  });

  it('needs a reason for every press, and a confirmation for the two that stick', () => {
    expect(actions).toContain("'reason' => ['required', 'string', 'min:4', 'max:280']");
    // RELEASE and UNINSTALL cannot be taken back from anywhere, so the device id
    // has to be typed at them.
    expect(service).toContain("'RELEASE' => ['label' => 'Release the device', 'needs_confirmation' => true");
    expect(service).toContain("'UNINSTALL' => ['label' => 'Uninstall device management', 'needs_confirmation' => true");
    expect(service).toContain('Type the device id to confirm this one.');
  });

  it('will not let a phone confirm its own work', () => {
    // `device_commands` has RLS on and **no** policy, so the publishable key in a
    // phone can neither read the requests aimed at it nor write APPLIED onto one.
    // If that insert succeeded, a locked phone could say it had locked itself.
    expect(sql).toContain('alter table public.device_commands enable row level security;');
    expect(sql).not.toMatch(/create policy[^;]*device_commands/i);
    expect(sql).toContain("outcome = 'REQUESTED'");
  });

  it('makes the outcome impossible to leave half-answered', () => {
    // An outcome with no time and no speaker is not an outcome.
    expect(sql).toContain('device_commands_reported_check');
    expect(sql).toMatch(/outcome = 'REQUESTED'\s*\n\s*or \(outcome_at is not null and reported_by is not null\)/);
  });

  it('writes down a location lookup, because a read of a person is not free', () => {
    expect(reads).toContain("'action' => 'device.location.read'");
    expect(routes).toContain("devices/{id}/location");
  });

  it('quotes the schedule in a reminder, never a number from the browser', () => {
    // The panel sends no amount: it cannot, and that is the point. A reminder that
    // quotes a typed figure can quote the wrong figure to a customer about money
    // they owe.
    expect(panelApi).toContain('deviceReminder: (id: string, message?: string)');
    expect(panelApi).toMatch(/deviceReminder[\s\S]*?JSON\.stringify\(\{ message \}\)/);
    expect(actions).toContain('Installment::query()');
    expect(actions).not.toMatch(/\$request->input\('amount'/);
  });

  it('takes its buttons from the server rather than inventing them', () => {
    // A button for something the server would refuse is a button that lies, and a
    // list in the panel would drift from the service that enforces it.
    expect(reads).toContain('private function commandCatalogue()');
    expect(reads).toContain('DeviceCommandService::COMMANDS');
    expect(panels).toContain('commands.filter(');
    expect(panels).toContain('data.canCommand');
  });

  it('says out loud that a press is not a result', () => {
    expect(panels).toContain('What the phone reported');
    expect(panels).toContain('not answered yet, so it has not happened');
    // And it shows the blocker rather than leaving four dead buttons.
    expect(panels).toContain('Nothing can be asked of this phone.');
  });

  it('opens a phone from the list, and from one place only', () => {
    expect(panels).toContain('onClick={() => onOpen(device.id)}');
    expect(read('src/App.tsx')).toContain('<DeviceDetailView id={deviceId}');
  });
});

/**
 * The panel shows the phone, not a row somebody typed.
 *
 * The app can read Android's own answers about a handset, and it now sends them.
 * These are the properties that make that worth having, and the ones that make it
 * dangerous if they go wrong:
 *
 * - a handset that has not spoken is marked as demo data, not blended in with
 *   real ones
 * - a phone's report is believed *downwards* — "I am not managed" comes down at
 *   once — and never upwards, because a customer app cannot report its way into
 *   owning itself
 * - a report is a report: it grants no money, no access and no command
 * - the screen says how live it is, rather than pulsing and hoping
 */
describe('the panel shows the phone, not a row somebody typed', () => {
  const service = readFileSync(path.join(ROOT, 'src/services/deviceManagement.ts'), 'utf8');
  const endpoints = readFileSync(path.join(ROOT, 'src/api/endpoints.ts'), 'utf8');
  const mock = readFileSync(path.join(ROOT, 'mock-server', 'server.mjs'), 'utf8');
  const reads = readFileSync(
    path.join(ROOT, 'backend/app/Http/Controllers/Admin/AdminReadController.php'),
    'utf8',
  );
  const sql = readFileSync(path.join(ROOT, 'sql/06-device-report.sql'), 'utf8');
  const panels = read('src/screens/panels.tsx');
  const ui = read('src/ui.tsx');

  it('sends what the phone says on sync, not an empty body', () => {
    // It used to send nothing at all: `sync()` took no argument, so a handset
    // could be sold a contract and never once say what it was.
    expect(endpoints).toContain('sync: (report: DeviceReport)');
    expect(endpoints).toContain("'/devices/me/sync', { report }");
    expect(service).toContain('async reportSelf(): Promise<DeviceReport>');
  });

  it('sends it with the agreement too, not only afterwards', () => {
    expect(endpoints).toContain('report: DeviceReport;');
    expect(service).toContain('report: await this.reportSelf()');
  });

  it('collects only what the consent screen lists, and no more', () => {
    // The consent copy names model, manufacturer, Android version, a device
    // identifier, and what Android reports about management. The native module has
    // no IMEI and no serial, and the app asks for no location — and must not.
    const identity = service.slice(
      service.indexOf('async getIdentity()'),
      service.indexOf('async isDeviceManaged()'),
    );
    expect(identity).toContain('androidId');
    expect(identity).toContain('sdkInt');
    expect(identity).not.toMatch(/imei|serial|macAddress|advertisingId/i);
  });

  it('marks a row nobody has spoken for as demo data', () => {
    // An operator deciding whether to lock somebody's phone must never be looking
    // at a phone that does not exist, so this is on the row rather than in a
    // footnote.
    expect(panels).toContain('<Pill label="Demo data" tone="warn" />');
    expect(panels).toContain("device.source === 'PHONE'");
    expect(reads).toContain("'source' => \$device->source === 'PHONE' ? 'PHONE' : 'DEMO'");
    // Anything the database has never heard of reads as DEMO rather than trusted.
    expect(sql).toContain("check (source in ('PHONE', 'DEMO'))");
  });

  it('believes a phone downwards and never upwards', () => {
    // The asymmetry, which is the whole point of the feature. Believing a phone
    // that claims to be managed would hand a customer app the ability to grant
    // itself a lock button; refusing to believe one that claims it is not would
    // show an operator a button for a phone that nobody can lock.
    const fn = mock.slice(
      mock.indexOf('function recordDeviceReport('),
      mock.indexOf('const presentCustomerDevice'),
    );
    expect(fn).toContain('target.is_managed = target.is_managed === true && reportedManaged');
    expect(fn).toContain("target.source = 'PHONE'");
  });

  it('keeps the report from granting anything', () => {
    // A report is Android answering a question. It is not a claim on money, on
    // access, or on a command, and the device's financing state stays the
    // server's own.
    const fn = mock.slice(
      mock.indexOf('function recordDeviceReport('),
      mock.indexOf('const presentCustomerDevice'),
    );
    expect(fn).not.toMatch(/state\s*=\s*'(RESTRICTED|UNLOCKED|SUSPENDED)'/);
    expect(fn).not.toMatch(/installment|payment|paid/i);
  });

  it('says how live the screen is instead of pulsing and hoping', () => {
    expect(ui).toContain('export function useLiveResource');
    // Stops when nobody is watching, and catches up the moment they are.
    expect(ui).toContain("document.addEventListener('visibilitychange'");
    expect(ui).toContain("document.visibilityState === 'visible'");
    // And the caller shows the age of the last completed request.
    expect(panels).toContain('export function LiveMark');
    expect(panels).toContain('checkedAt');
  });

  it('does not blank a good list every time it polls', () => {
    // A skeleton on every tick would make a settled screen flash ten times a
    // minute, which is a worse experience than a few seconds of staleness.
    expect(panels).toContain('{loading && !data ? <Loading /> : null}');
    expect(panels).toContain('{error && !data ? <Failure');
  });

  it('keeps a phone from describing itself twice over', () => {
    // One handset, one row: a second sync from another phone must not silently
    // take over a customer's device.
    expect(sql).toContain('create unique index if not exists devices_android_id_idx');
    // And the phone cannot write this through PostgREST, so it cannot rename
    // itself — or set `is_managed` and buy itself a lock button.
    expect(sql).toContain('policy is added here on purpose');
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

    const client = read('src/lib/api.ts');
    // The prefix is still `/admin/api`. How it is assembled may vary — the base is
    // configurable so the panel can be served from its own origin when the API is
    // on another — but the route prefix itself may never change.
    expect(client).toContain('/admin/api');

    // Scoped to the request line rather than the whole file, because this file's
    // own documentation discusses `/customer` in prose. The claim is about the
    // URL the panel calls, not about the words in a comment.
    const call = client
      .split('\n')
      .find((line) => line.includes('fetch(') && line.includes('admin/api'));
    expect(call).toBeDefined();
    expect(call).not.toContain('/customer');
  });

  it('defaults the API base to same-origin, and only moves it when told to', () => {
    const client = read('src/lib/api.ts');
    // Empty by default, because the deployed service sends no CORS headers: a
    // panel on another origin could not read a single response. The escape hatch
    // has to exist for that to be changeable at all.
    expect(client).toContain("import.meta.env.VITE_ADMIN_API_BASE ?? ''");
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
