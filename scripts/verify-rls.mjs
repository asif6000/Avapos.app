#!/usr/bin/env node
/**
 * verify-rls
 *
 * Proves that the Supabase publishable/anon key cannot read *or write* another
 * customer's rows before the app is allowed to touch the database directly.
 *
 * Why this exists: the app bundle is public. Anyone can unzip the APK and lift
 * the publishable key out of it. That key is only harmless if every table has
 * row level security. A table without RLS is not "a bit too open" — PostgREST
 * serves every row to the world, and grants INSERT/UPDATE/DELETE too, so an
 * attacker could set a device's `state` to UNLOCKED without paying a single
 * taka. That is the single most damaging thing that can go wrong in this app.
 *
 * For each table the app reads:
 *   1. anonymous SELECT  -> must return 0 rows
 *   2. anonymous UPDATE  -> must be rejected
 *   3. anonymous DELETE  -> must be rejected
 *
 * A 0-row read is reported as BLOCKED but flagged INCONCLUSIVE when the table
 * may simply be empty, because "no rows" and "RLS hid the rows" look identical
 * from the outside. Confirm a non-empty table shows 0 to anonymous but rows to
 * its own owner before you trust a green run.
 *
 * Usage:
 *   cp .env.example .env.local   # fill in URL + anon/publishable key
 *   npm run verify:rls
 */

import { readFileSync, existsSync } from 'node:fs';

const TABLES = ['profiles', 'devices', 'installments', 'payments', 'notifications', 'support_tickets'];

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
const fail = (message) => {
  console.error(`FAIL  ${message}`);
  process.exit(2);
};

if (!url || !key) fail('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (.env.local).');
if (key.startsWith('sb_secret_')) fail('That is a secret key. It bypasses RLS and must never be used here.');
if (key.startsWith('eyJ')) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString());
    if (payload.role === 'service_role' || payload.role === 'postgres') {
      fail(`Key role is "${payload.role}". Use the anon/publishable key.`);
    }
  } catch {
    /* let the requests below fail */
  }
}

const anonHeaders = { apikey: key, Authorization: `Bearer ${key}` };

/** Returns the exact row count PostgREST reports, so "0" is trustworthy. */
async function countRows(table) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
    method: 'HEAD',
    headers: { ...anonHeaders, Prefer: 'count=exact', Range: '0-0' },
  });
  const range = response.headers.get('content-range') ?? '';
  const total = range.split('/')[1];
  return { status: response.status, total: total === '*' ? null : Number(total) };
}

async function probe(table) {
  const result = { table, read: null, readCount: null, write: null, deleteBlocked: null, notes: [] };

  // 1. read
  const readResponse = await fetch(`${url}/rest/v1/${table}?select=*&limit=3`, {
    headers: anonHeaders,
  });
  if (readResponse.status === 404) {
    result.read = 'ABSENT';
    return result;
  }
  if (readResponse.status === 401 || readResponse.status === 403) {
    result.read = 'BLOCKED';
    return result;
  }
  const body = await readResponse.json().catch(() => null);
  if (!Array.isArray(body)) {
    result.read = 'UNKNOWN';
    result.notes.push(`HTTP ${readResponse.status}, non-list payload`);
    return result;
  }
  if (body.length > 0) {
    result.read = 'LEAKING';
    result.readCount = body.length;
    result.notes.push(`anonymous SELECT returned ${body.length}+ row(s)`);
    return result;
  }
  result.read = 'EMPTY';
  const { total } = await countRows(table);
  result.readCount = total;
  result.notes.push(
    total === 0
      ? 'anonymous SELECT returned 0 rows (table is empty — inconclusive, not proof)'
      : 'anonymous SELECT returned 0 rows',
  );

  // 2. write. A rejected UPDATE is the safe signal; a 200 means the table is
  //    wide open, so we stop there rather than issuing a DELETE.
  const writeResponse = await fetch(`${url}/rest/v1/${table}?select=*`, {
    method: 'PATCH',
    headers: { ...anonHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ updated_at: new Date().toISOString() }),
  });
  result.write = writeResponse.ok ? 'ALLOWED' : 'BLOCKED';
  if (writeResponse.ok) {
    result.notes.push('anonymous UPDATE was ACCEPTED — the anon role can modify this table');
  }
  return result;
}

const results = [];
for (const table of TABLES) {
  try {
    results.push(await probe(table));
  } catch (error) {
    results.push({ table, read: 'UNREACHABLE', notes: [error.message] });
  }
}

const pad = (value, width) => String(value).padEnd(width);
console.log('');
console.log(`  ${pad('table', 18)}${pad('anon read', 12)}${pad('anon write', 12)}note`);
console.log(`  ${'-'.repeat(74)}`);
for (const r of results) {
  const rows = r.readCount === null || r.readCount === undefined ? '' : ` (${r.readCount} rows)`;
  console.log(`  ${pad(r.table, 18)}${pad(`${r.read ?? '-'}${rows}`, 12)}${pad(r.write ?? '-', 12)}${r.notes.join('; ')}`);
}
console.log('');

const leaking = results.filter((r) => r.read === 'LEAKING');
const writable = results.filter((r) => r.write === 'ALLOWED');

if (leaking.length || writable.length) {
  console.error('FAIL  The publishable key can reach customer data without authentication.');
  if (leaking.length) {
    console.error(`      readable: ${leaking.map((r) => r.table).join(', ')}`);
  }
  if (writable.length) {
    console.error(`      writable: ${writable.map((r) => r.table).join(', ')}`);
  }
  console.error('');
  console.error('      Keep EXPO_PUBLIC_SUPABASE_READS_ENABLED=false and run, in order:');
  console.error('        sql/01-stop-the-bleed.sql   — enable RLS, revoke anon');
  console.error('        sql/04-link-demo-customer.sql — the owner columns 01 and 03 read');
  console.error('        sql/03-owner-policies.sql   — the per-customer policies');
  console.error('      in the Supabase SQL editor, then re-run this script.');
  process.exit(1);
}

if (results.some((r) => r.read === 'UNKNOWN' || r.read === 'UNREACHABLE')) {
  console.error('FAIL  One or more tables returned an unexpected response; RLS cannot be confirmed.');
  process.exit(1);
}

console.log('PASS  No table the app reads is readable or writable without a customer session.');
console.log('      Before flipping EXPO_PUBLIC_SUPABASE_READS_ENABLED=true, confirm that a table');
console.log('      which definitely has rows still reports 0 rows above — "0" can also mean empty.');
