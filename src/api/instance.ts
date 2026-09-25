import { ApiClient } from './client';
import { notifySessionExpired } from '@/auth/sessionEvents';
import { getAccessToken } from '@/supabase/auth';

/**
 * The one configured HTTP client the app uses.
 *
 * The bearer is the current Supabase access token. The backend validates that
 * JWT against the project's signing keys before trusting any claim, which is
 * what replaces the `/auth/*` routes this API never had — see
 * `backend/app/Http/Middleware/VerifySupabaseJwt.php`.
 */
export const apiClient = new ApiClient({
  getToken: getAccessToken,
  onUnauthorized: notifySessionExpired,
});
