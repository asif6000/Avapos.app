<?php

namespace App\Http\Middleware;

use App\Models\Customer;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates a Supabase access token and resolves the customer behind it.
 *
 * This replaces the `/auth/*` routes the customer API never had. The app signs
 * in with Supabase Auth, so the bearer it presents is a Supabase JWT; this
 * middleware verifies that JWT against the project's own signing keys before
 * trusting a single claim in it.
 *
 * SECURITY NOTES
 *
 * - The signature is checked against the project's JWKS. A token whose
 *   signature does not verify is rejected here, so the `sub` claim can never be
 *   forged by editing a decoded JWT.
 * - `iss` and `aud` are both checked. A token minted for a different Supabase
 *   project must not be accepted here.
 * - The `sub` is used only to LOOK UP a customer. It is never trusted to
 *   identify one on its own: if no customer row is linked to that auth user,
 *   the request is unauthorized. That is the link created in
 *   `sql/02-add-auth-link.sql` (`profiles.auth_uid`).
 * - No route ever accepts a customer id from the request body or query, so a
 *   signed-in customer cannot act as someone else.
 */
class VerifySupabaseJwt
{
    /** JWKs are cached; they rotate rarely and the cache is short-lived. */
    private const JWKS_TTL_SECONDS = 3600;

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (! $token) {
            return $this->unauthorized();
        }

        $claims = $this->verifySignature($token);

        if ($claims === null) {
            return $this->unauthorized();
        }

        $userId = $claims['sub'] ?? null;
        if (! is_string($userId) || $userId === '') {
            return $this->unauthorized();
        }

        // The auth user must be linked to a real customer row. Without this
        // check, anyone who can create a Supabase user could mint a token for
        // themselves and call the API.
        $customer = Customer::query()
            ->where('auth_uid', $userId)
            ->first();

        if (! $customer) {
            return $this->unauthorized();
        }

        $request->attributes->set('supabase_user_id', $userId);
        $request->setUserResolver(fn () => $customer);

        return $next($request);
    }

    /**
     * Verifies signature, issuer and audience.
     *
     * @return array<string, mixed>|null
     */
    private function verifySignature(string $jwt): ?array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return null;
        }

        [$headerB64, $payloadB64, $signatureB64] = $parts;

        $header = json_decode($this->base64UrlDecode($headerB64), true);
        $claims = json_decode($this->base64UrlDecode($payloadB64), true);

        if (! is_array($header) || ! is_array($claims)) {
            return null;
        }

        if (($claims['exp'] ?? 0) <= time()) {
            return null;
        }

        $projectRef = config('supabase.project_ref');
        $expectedIssuer = "https://{$projectRef}.supabase.co/auth/v1";

        if (($claims['iss'] ?? null) !== $expectedIssuer) {
            return null;
        }

        // `aud` IS NOT THE ISSUER. Supabase's GoTrue issues an access token with
        //
        //   iss = https://<ref>.supabase.co/auth/v1
        //   aud = "authenticated"        <- a literal audience class
        //
        // so comparing `aud` to the issuer refuses every valid session. That is
        // not a theory: a token whose signature verified against this project's
        // JWKS and whose `sub` matched `profiles.auth_uid` was still answered
        // with 401 "Unauthorized request", which is indistinguishable from a
        // forged token and from a customer that does not exist.
        //
        // `iss` above is the check that prevents cross-project replay, and it is
        // strict. `aud` is checked against what Supabase actually issues, which
        // is also what keeps an `anon` token from being read as an identity.
        if (($claims['aud'] ?? null) !== 'authenticated') {
            return null;
        }
        if (($claims['role'] ?? null) !== 'authenticated') {
            // `anon` tokens must never be accepted as an identity.
            return null;
        }

        $alg = $header['alg'] ?? null;
        if (! in_array($alg, ['RS256', 'ES256'], true)) {
            return null;
        }

        $jwk = $this->findJwkFor((string) ($header['kid'] ?? ''));
        if ($jwk === null) {
            return null;
        }

        $publicKey = $this->toPublicKey($jwk);
        if ($publicKey === null) {
            return null;
        }

        $signed = "{$headerB64}.{$payloadB64}";
        $signature = $this->base64UrlDecode($signatureB64);

        // JWT signatures are always SHA-256 (RS256 / ES256), and are supplied in
        // the raw form OpenSSL expects, so no conversion is needed.
        $verified = openssl_verify($signed, $signature, $publicKey, OPENSSL_ALGO_SHA256);

        if ($verified !== 1) {
            return null;
        }

        return $claims;
    }

    /** @return array<string, mixed>|null */
    private function findJwkFor(string $kid): ?array
    {
        $jwks = Cache::remember('supabase-jwks', self::JWKS_TTL_SECONDS, function () {
            $ref = config('supabase.project_ref');

            $response = Http::timeout(5)
                ->get("https://{$ref}.supabase.co/auth/v1/.well-known/jwks.json");

            return $response->successful() ? $response->json() : null;
        });

        if (! is_array($jwks)) {
            return null;
        }

        foreach ($jwks['keys'] ?? [] as $key) {
            if (($key['kid'] ?? null) === $kid) {
                return $key;
            }
        }

        return null;
    }

    /** @param array<string, mixed> $jwk */
    private function toPublicKey(array $jwk): ?\OpenSSLAsymmetricKey
    {
        try {
            if (($jwk['kty'] ?? null) === 'RSA' && isset($jwk['n'], $jwk['e'])) {
                return openssl_pkey_get_public([
                    'rsa' => [
                        'n' => $this->base64UrlDecode($jwk['n']),
                        'e' => $this->base64UrlDecode($jwk['e']),
                    ],
                ]);
            }

            if (($jwk['kty'] ?? null) === 'EC' && isset($jwk['crv'], $jwk['x'], $jwk['y'])) {
                $der = $this->ecJwkToDer($jwk);
                if ($der === null) {
                    return null;
                }
                $pem = "-----BEGIN PUBLIC KEY-----\n"
                    . chunk_split(base64_encode($der), 64, "\n")
                    ."-----END PUBLIC KEY-----\n";

                return openssl_pkey_get_public($pem);
            }
        } catch (\Throwable) {
            return null;
        }

        return null;
    }

    /**
     * Builds a SubjectPublicKeyInfo DER blob for a P-256 JWK, which is what
     * OpenSSL expects inside a PEM public key.
     *
     * SEQUENCE {
     *   SEQUENCE { OID ecPublicKey, OID prime256v1 }
     *   BIT STRING 0x00 { 0x04 || X || Y }
     * }
     *
     * @param array<string, mixed> $jwk
     */
    private function ecJwkToDer(array $jwk): ?string
    {
        if (($jwk['crv'] ?? null) !== 'P-256') {
            return null;
        }

        $x = $this->base64UrlDecode($jwk['x']);
        $y = $this->base64UrlDecode($jwk['y']);

        // Uncompressed P-256 points are exactly 32 bytes per coordinate.
        if (strlen($x) !== 32 || strlen($y) !== 32) {
            return null;
        }

        // 1.2.840.10045.2.1 (ecPublicKey) + 1.2.840.10045.3.1.7 (prime256v1)
        $algorithm = (string) hex2bin('301306072a8648ce3d020106082a8648ce3d030107');

        $point = "\x04".$x.$y;          // 65 bytes
        $bitString = "\x00".$point;      // leading 0x00 = "no unused bits"

        // 0x59 = 89 bytes total: 2 + 13 + 2 + 66 + 2 header
        return "\x30\x59".$algorithm."\x03\x42".$bitString;
    }

    private function base64UrlDecode(string $value): string
    {
        $remainder = strlen($value) % 4;
        if ($remainder !== 0) {
            $value .= str_repeat('=', 4 - $remainder);
        }

        return (string) base64_decode(strtr($value, '-_', '+/'), false);
    }

    private function unauthorized(): Response
    {
        return response()->json(
            ['status' => 'error', 'message' => 'Unauthorized request'],
            401
        );
    }
}
