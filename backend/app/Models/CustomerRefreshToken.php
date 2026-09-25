<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * A long-lived token used to mint new access tokens without a new email code.
 *
 * Only a hash is stored, and rotation is enforced: refreshing revokes the token
 * that was used and issues a new one, so a stolen refresh token is usable at
 * most once before it is dead and auditable.
 */
class CustomerRefreshToken extends Model
{
    protected $table = 'customer_refresh_tokens';

    protected $fillable = ['customer_id', 'token_hash', 'expires_at', 'revoked_at'];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public static function issue(Customer $customer, int $days = 30): array
    {
        $plain = bin2hex(random_bytes(32));

        static::query()->create([
            'customer_id' => $customer->getKey(),
            'token_hash' => hash('sha256', $plain),
            'expires_at' => Carbon::now()->addDays($days),
        ]);

        return ['plain' => $plain, 'days' => $days];
    }

    public static function findUsable(string $plain): ?self
    {
        $token = static::query()
            ->where('token_hash', hash('sha256', $plain))
            ->first();

        if (! $token || $token->revoked_at !== null || $token->expires_at->isPast()) {
            return null;
        }

        return $token;
    }

    public function revoke(): void
    {
        $this->forceFill(['revoked_at' => now()])->save();
    }
}
