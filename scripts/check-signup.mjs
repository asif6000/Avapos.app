#!/usr/bin/env node
/**
 * check-signup
 *
 * Tells you exactly why account creation is or is not working on the real
 * Supabase project, and what to change.
 *
 *   npm run check:signup
 *
 * It performs a real signup attempt against the configured project. If the
 * attempt *succeeds*, a throwaway account is created at a disposable address so
 * that no real person receives an email — delete it afterwards in
 * Dashboard → Authentication → Users.
 *
 * The most common cause of a silent failure here is the built-in mailer's rate
 * limit: Supabase allows only a couple of messages an hour, and signup has to
 * send a confirmation email, so every new account dies on the limit.
 */

import { readFileSync, existsSync } from 'node:fs';

const DISPOSABLE_DOMAIN = 'mailinator.com';

function loadDotEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const name = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[name] === undefined) process.env[name] = value;
    }
  }
}

loadDotEnv();

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function die(message, code = 2) {
  console.error(`\nFAIL  ${message}\n`);
  process.exit(code);
}

if (!url || !key) {
  die('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local.');
}

if (key.startsWith('sb_secret_')) {
  die('That is a secret key. Use the publishable/anon key here.');
}

console.log('');
console.log(`  project : ${url}`);

let settings = {};
try {
  const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  settings = await response.json();
} catch (error) {
  die(`Could not reach the project: ${error.message}`);
}

console.log(`  email provider : ${settings?.external?.email ? 'enabled' : 'DISABLED'}`);
console.log(`  signups blocked: ${settings?.disable_signup ? 'yes' : 'no'}`);
console.log(`  confirm email  : ${settings?.mailer_autoconfirm ? 'no (auto-confirms)' : 'yes'}`);
console.log('');

if (!settings?.external?.email) {
  console.error('  The Email provider is switched off.');
  console.error('  Dashboard → Authentication → Sign In / Providers → Email → enable it.\n');
  process.exit(1);
}

const probeEmail = `signup.check.${Date.now()}@${DISPOSABLE_DOMAIN}`;
const password = 'Passw0rd!1x';

let status = 0;
let body = {};
try {
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: probeEmail, password }),
  });
  status = response.status;
  body = await response.json();
} catch (error) {
  die(`Signup request failed: ${error.message}`);
}

if (status >= 200 && status < 300 && body.access_token) {
  console.log('  PASS  Account creation works.');
  console.log('');
  console.log(`  A throwaway account was created at ${probeEmail}`);
  console.log('  (a disposable address, so no real person was emailed).');
  console.log('  Delete it in Dashboard → Authentication → Users when convenient.');
  console.log('');
  process.exit(0);
}

const code = body?.error_code ?? body?.code ?? `HTTP ${status}`;

if (/over_email|rate limit/i.test(String(code) + String(body?.msg))) {
  console.error('  BLOCKED  The built-in mailer has hit its hourly limit.');
  console.error('');
  console.error('  Supabase allows only a couple of messages an hour on the built-in');
  console.error('  SMTP, and signup has to send a confirmation email, so account');
  console.error('  creation fails until the limit resets.');
  console.error('');
  console.error('  Fix — pick one:');
  console.error('');
  console.error('    A. Add a custom SMTP provider (recommended).');
  console.error('       Settings → Providers → Email → SMTP. Resend, SendGrid or SES.');
  console.error('       Removes the limit and keeps email verification.');
  console.error('');
  console.error('    B. Turn off email confirmation.');
  console.error('       Authentication → Sign In / Providers → Email → uncheck');
  console.error('       "Confirm email". Signup then sends no mail at all.');
  console.error('       Note: addresses are then never verified, so anyone could claim');
  console.error('       someone else\'s email. Do not ship that for a money-handling app.');
  console.error('');
  process.exit(1);
}

if (/provider_disabled|signup_disabled|not enabled/i.test(String(code))) {
  console.error(`  BLOCKED  ${code}: ${body?.msg ?? 'signups are switched off'}`);
  console.error('  Dashboard → Authentication → Sign In / Providers → Email.');
  console.error('');
  process.exit(1);
}

if (/email_address_invalid/i.test(String(code))) {
  console.error('  The probe address was rejected. Supabase blocks some domains,');
  console.error('  including example.com. That is not a project misconfiguration.');
  console.error('');
  process.exit(1);
}

if (/weak_password|password/i.test(String(code))) {
  console.error(`  The password was rejected: ${body?.msg ?? body?.message ?? code}`);
  console.error('  Supabase requires a minimum length; raise it in the dashboard too.');
  console.error('');
  process.exit(1);
}

console.error(`  BLOCKED  ${code}: ${body?.msg ?? body?.message ?? 'unknown'}`);
console.error('');
console.error('  Check the Supabase dashboard logs (Dashboard → Logs → Auth) for detail.');
console.error('');
process.exit(1);
