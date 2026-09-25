<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A one-time emailed sign-in code.
 *
 * The code itself is never stored: only a SHA-256 hash, so a database leak
 * cannot be replayed against the login endpoint. `challenge_id` lets a client
 * distinguish two codes issued for the same address without revealing anything.
 */
class CustomerAuthCode extends Model
{
    protected $table = 'customer_auth_codes';

    protected $fillable = [
        'email',
        'challenge_id',
        'code_hash',
        'expires_at',
        'consumed_at',
    ];

    protected $hidden = ['code_hash'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
        ];
    }

    public function isUsable(): bool
    {
        return $this->consumed_at === null && $this->expires_at->isFuture();
    }
}
