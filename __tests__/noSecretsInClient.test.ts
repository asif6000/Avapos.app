import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'path';

/**
 * A gateway secret must never exist in the app.
 *
 * The key that starts a payment is a *merchant* credential: with it, anybody can
 * create orders that no installment backs. An `EXPO_PUBLIC_*` value is inlined
 * into the shipped bundle and readable by anyone who unzips the app, and
 * AsyncStorage or SecureStore on a customer's phone is not a secret store either
 * — it is a file the customer owns.
 *
 * So the key lives in the backend's environment and nowhere else, and this test
 * is what keeps that true as the app changes. It fails on the *name* of the
 * dangerous variable as well as on anything that looks like a live key, because
 * the common accident is adding the variable and wiring it up in the same commit.
 */

const ROOT = path.resolve(__dirname, '..');

/** Everything that ships to a customer's phone. */
const CLIENT_TREES = ['src', 'app', 'plugins', 'modules'];
const CLIENT_FILES = ['app.config.ts', 'package.json', '.env.example', 'metro.config.js'];

/**
 * Names that must only ever appear in the backend. A `PAYMENT_*_SECRET`,
 * `*_API_KEY` or `*_TOKEN` in the client is a finding.
 */
const FORBIDDEN_NAME = [
  /EXPO_PUBLIC_[A-Z0-9_]*(SECRET|API_KEY|APIKEY|PRIVATE|TOKEN|PASSWORD|MERCHANT)/,
  /\b(PAYMENT_GATEWAY_API_KEY|PAYMENT_CALLBACK_SECRET|SUPABASE_SERVICE_ROLE|STRIPE_SECRET|SSL_COMMERZ_[A-Z_]*KEY)\b/,
];

/** Anything shaped like a live credential, long enough not to be a false alarm. */
const KEY_SHAPED_VALUE = [
  /\b(sk|pk)_(live|test)_[A-Za-z0-9]{16,}\b/,             // Stripe-style
  /\b[A-Za-z0-9]{40,}\b(?=[^\w]|$)/,                        // 40+ char opaque token
  /\bzbRmREw[A-Za-z0-9]{20,}\b/i,                          // the shape of the key in this project's chat
];

function clientFiles(): string[] {
  const files: string[] = [];
  for (const file of CLIENT_FILES) {
    try {
      files.push(path.join(ROOT, file));
    } catch {
      // missing file is not a secret
    }
  }
  for (const tree of CLIENT_TREES) {
    const found = execSync(
      `find ${tree} -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.kt' -o -name '*.java' -o -name '*.json' -o -name '*.mjs' \\) 2>/dev/null || true`,
      { cwd: ROOT, encoding: 'utf8' },
    );
    for (const line of found.split('\n')) {
      if (line.trim()) files.push(path.join(ROOT, line.trim()));
    }
  }
  return files.filter((file) => {
    try {
      readFileSync(file);
      return true;
    } catch {
      return false;
    }
  });
}

describe('the client holds no secret', () => {
  const files = clientFiles();

  it('has client source to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN_NAME)('names no forbidden credential %s', (pattern) => {
    const offenders = files
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it.each(KEY_SHAPED_VALUE)('contains no value shaped like a live key %s', (pattern) => {
    const offenders = files
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('reads the gateway configuration from the server, not the bundle', () => {
    // The app must point at the customer API, never at a gateway host with a key
    // in it. `same-origin` is the development value; both are a URL, not a secret.
    const config = readFileSync(path.join(ROOT, 'src/api/config.ts'), 'utf8');
    expect(config).not.toMatch(/api[_-]?key/i);
    expect(config).not.toMatch(/gateway/i);
  });
});
