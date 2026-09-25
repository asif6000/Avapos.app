<?php

namespace App\Models;

use Laravel\Sanctum\HasApiTokens;

/**
 * A customer account.
 *
 * IMPORTANT — read before you wire this up: this skeleton is written against
 * the `profiles` table because that is the table that actually exists on the
 * deployed database, with these exact columns:
 *
 *   id, full_name, phone_number, email, is_enrolled, language,
 *   created_at, updated_at
 *
 * `id` is a text key like `CUST-23839`, NOT a uuid. If your canonical customer
 * table is called something else, change `$table` and the column names to match
 * — nothing else in this file assumes a specific identifier format.
 *
 * @property string $id
 * @property string $full_name
 * @property string|null $phone_number
 * @property string|null $email
 * @property bool $is_enrolled
 */
class Customer extends \Illuminate\Foundation\Auth\User
{
    use HasApiTokens;

    protected $table = 'profiles';

    protected $fillable = [
        'full_name',
        'phone_number',
        'email',
        'language',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'is_enrolled' => 'boolean',
        ];
    }

    public function authCodes()
    {
        return $this->hasMany(CustomerAuthCode::class, 'email', 'email');
    }

    public function refreshTokens()
    {
        return $this->hasMany(CustomerRefreshToken::class, 'customer_id');
    }

    /**
     * Addresses are matched case-insensitively and trimmed, so
     * `Ayesha@Example.com` and `ayesha@example.com` are one account.
     */
    public static function normalizeEmail(string $email): string
    {
        return mb_strtolower(trim($email));
    }

    public function findByEmail(string $email): ?self
    {
        return static::query()->where('email', static::normalizeEmail($email))->first();
    }

    public function newCustomerId(): string
    {
        do {
            $candidate = 'CUST-'.random_int(10000, 99999);
        } while (static::query()->whereKey($candidate)->exists());

        return $candidate;
    }
}
