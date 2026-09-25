<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * The admin panel's front door.
 *
 * Runs after `VerifySupabaseJwt`, so by the time this is reached the token's
 * signature has been checked against Supabase's own keys and the request
 * genuinely belongs to the person who presented it. This middleware then asks
 * one question: is this person an admin?
 *
 * The answer comes from the server, from two independent places, and the panel's
 * own opinion is not one of them:
 *
 *   - the address is in `config/admin.php`'s allow-list, and/or
 *   - the token carries `app_metadata.role = 'admin'`, which only the service
 *     role can set
 *
 * A customer's own token — perfectly valid, correctly signed, their own account —
 * is refused here, on every admin route, with a 403. There is no "read-only
 * admin" and no route that skips this: the panel is a separate prefix and a
 * separate middleware group, so a missing check is a missing line, not a missing
 * route.
 *
 * Every refusal is logged with the address and the route. Somebody probing the
 * panel with a stolen customer token is exactly the thing worth seeing.
 */
class RequireAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $claims = $request->attributes->get('supabase_claims');

        if (! is_array($claims)) {
            return $this->refuse($request, 'no verified session', 401);
        }

        $email = strtolower((string) ($claims['email'] ?? ''));
        $allowList = array_map('strtolower', (array) config('admin.emails', []));
        $byEmail = $email !== '' && in_array($email, $allowList, true);

        $role = (string) data_get($claims, 'app_metadata.role', '');
        $byRole = config('admin.require_app_metadata_role', true)
            && $role === (string) config('admin.app_metadata_role', 'admin');

        if (! $byEmail && ! $byRole) {
            return $this->refuse($request, 'not an admin', 403);
        }

        $request->attributes->set('admin_email', $email);
        $request->attributes->set('admin_role', $byRole ? $role : 'allow-list');

        return $next($request);
    }

    private function refuse(Request $request, string $reason, int $status): JsonResponse
    {
        Log::warning('Refused an admin request', [
            'reason' => $reason,
            'email' => $request->attributes->get('admin_email')
                ?? data_get($request->attributes->get('supabase_claims'), 'email'),
            'subject' => data_get($request->attributes->get('supabase_claims'), 'sub'),
            'route' => $request->path(),
            'ip' => $request->ip(),
        ]);

        // Deliberately the same message for every refusal: whether an address is
        // an admin is not something a stranger gets to learn by asking.
        return response()->json([
            'status' => 'error',
            'message' => 'You do not have access to this area.',
        ], $status);
    }
}
