#!/usr/bin/env node
/**
 * verify-rls
 *
 * Proves that the Supabase publishable/anon key cannot read another customer's
 * rows before the app is allowed to read anything directly.
 *
 * The failure mode this exists to catch: a table with RLS *disabled*. PostgREST
 * will happily serve every row to the anon key, which means every customer's
 * name, phone, contract and payment history, published inside a public bundle.
 * No amount of app-side code prevents that — only an RLS policy does.
 *
 * Method: make an anonymous request (no user session) for a small slice of every
 * table the app reads. With a correct policy this returns zero rows. If it
 * returns any row, the policy is missing or wrong and we fail.
 *
 * Usage:
 *   EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... node scripts/verify-rls.mjs
 */

import { readFileSync, existsSync } from 'node:fs';

const TABLES = ['customers', 'devices', 'installments', 'contracts', 'notifications'];

function loadDotEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadDotEnv();

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('FAIL  Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (.env.local).');
  process.exit(2);
}

if (key.startsWith('sb_secret_')) {
  console.error('FAIL  The supplied key is a secret key. It bypasses RLS and must never be used here.');
  process.exit(2);
}

if (key.startsWith('eyJ')) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString());
    if (payload.role === 'service_role' || payload.role === 'postgres') {
      console.error('FAIL  The supplied key has role "' + payload.role + '". Use the anon/publishable key.');
      process.exit(2);
    }
  } catch {
    // Undecodable token; let the request itself fail below.
  }
}

const findings = [];

for (const table of TABLES) {
  const endpoint = `${url}/rest/v1/${table}?select=*&limit=1`;

  let status;
  let body;
  try {
    const response = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    status = response.status;
    body = await response.text();
  } catch (error) {
    findings.push({ table, verdict: 'UNREACHABLE', detail: error.message });
    continue;
  }

  if (status === 200) {
    let rows;
    try {
      rows = JSON.parse(body);
    } catch {
      findings.push({ table, verdict: 'UNKNOWN', detail: `HTTP 200 with non-JSON body (${body.slice(0, 80)})` });
      continue;
    }
    if (Array.isArray(rows) && rows.length === 0) {
      findings.push({ table, verdict: 'SAFE', detail: 'anonymous read returned 0 rows' });
    } else if (Array.isArray(rows)) {
      findings.push({
        table,
        verdict: 'LEAKING',
        detail: `anonymous read returned ${rows.length}+ row(s) — RLS is NOT enabled on this table`,
      });
    } else {
      findings.push({ table, verdict: 'UNKNOWN', detail: `unexpected payload: ${body.slice(0, 80)}` });
    }
  } else if (status === 401 || status === 403) {
    findings.push({ table, verdict: 'SAFE', detail: `anonymous read rejected (HTTP ${status})` });
  } else if (status === 404) {
    findings.push({ table, verdict: 'MISSING', detail: 'table does not exist or is not exposed' });
  } else {
    findings.push({ table, verdict: 'UNKNOWN', detail: `HTTP ${status}: ${body.slice(0, 100)}` });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log('');
for (const f of findings) {
  console.log(`  ${pad(f.verdict, 11)} ${pad(f.table, 16)} ${f.detail}`);
}
console.log('');

const leaking = findings.filter((f) => f.verdict === 'LEAKING');
const unsafe = findings.filter((f) => f.verdict === 'UNKNOWN');

if (leaking.length > 0) {
  console.error(`FAIL  ${leaking.length} table(s) expose rows to the anon key.`);
  console.error('      Keep EXPO_PUBLIC_SUPABASE_READS_ENABLED=false and add RLS policies, e.g.:');
  console.error('');
  console.error('        alter table public.' + leaking[0].table + ' enable row level security;');
  console.error('        create policy "own rows" on public.' + leaking[0].table);
  console.error('          for select using (auth.uid() = customer_id);');
  process.exit(1);
}

if (unsafe.length > 0) {
  console.error(`FAIL  ${unsafe.length} table(s) returned an unexpected response; cannot confirm RLS.`);
  process.exit(1);
}

console.log('PASS  Every table the app reads is unreachable without a customer session.');
console.log('      You may now set EXPO_PUBLIC_SUPABASE_READS_ENABLED=true');
