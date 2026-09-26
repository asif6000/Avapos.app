/**
 * Refuses to build a panel nobody can sign in to.
 *
 * The failure this prevents is quiet and total: a panel with no Supabase URL and
 * no anon key still builds, still loads, and then refuses every sign-in with a
 * message that reads like a server problem. It is a build-time mistake, so it
 * should be a build-time failure.
 */
import { existsSync } from 'node:fs';

const missing = [];

if (!process.env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
if (!process.env.VITE_SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');

if (missing.length > 0) {
  // A .env file is fine too; it is the same values, just not exported.
  if (existsSync('.env')) {
    console.log('  using admin/.env for the Supabase settings');
    process.exit(0);
  }
  console.error('\n  Cannot build the admin panel without its Supabase settings.\n');
  for (const name of missing) console.error(`    missing: ${name}`);
  console.error(`
  For the local mock (the mock publishes Supabase Auth on the panel's own origin):

    VITE_SUPABASE_URL=same-origin \\
    VITE_SUPABASE_ANON_KEY=local-dev-anon-key \\
    npm run build

  Or set them in admin/.env:

    VITE_SUPABASE_URL=https://<project>.supabase.co
    VITE_SUPABASE_ANON_KEY=<the publishable / anon key — never the service role>

  The key here is a *person* signing in. The panel never holds a service-role
  key; that stays on the server.
`);
  process.exit(1);
}
