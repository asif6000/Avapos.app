/// <reference types="vite/client" />

/**
 * Build-time settings for the panel.
 *
 * Both are public. This is a browser bundle: anything here is readable by anyone
 * who opens the panel, so none of it may be a secret. The service-role key lives
 * on the server, never in this file.
 */
interface ImportMetaEnv {
  /** Supabase project URL. 'same-origin' is accepted and resolved to this page's origin. */
  readonly VITE_SUPABASE_URL?: string;
  /** Publishable / anon key only. A `service_role` or `sb_secret_` key here is a full database compromise. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Absolute origin of the API, when it is not this panel's own origin. Empty means same-origin. */
  readonly VITE_ADMIN_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
