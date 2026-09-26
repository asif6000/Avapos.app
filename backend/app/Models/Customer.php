<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A customer, stored in the `profiles` table.
 *
 * WHY THE TABLE IS CALLED `profiles`
 *
 * It is pre-existing and shared, so it is not renamed. What the row means in
 * *this* application is a customer and a contract holder, and that is how it is
 * read everywhere else.
 *
 * THE PRIMARY KEY IS A STRING
 *
 * `id` is a readable value (`CUST-23839`), not a uuid and not an integer. It is
 * what `installments.customer_key`, `payments.customer_key`,
 * `devices.customer_key`, `notifications.customer_key` and
 * `support_tickets.customer_key` all point at, so it is the join key for the
 * entire customer domain. It is also what the seed data and
 * `sql/04-link-demo-customer.sql` use.
 *
 * WHY `auth_uid` IS THE ONLY WAY IN
 *
 * `auth_uid` links this row to a Supabase auth user, and
 * {@see \App\Http\Middleware\VerifySupabaseJwt} refuses any request whose token
 * resolves to no such link. A customer row is created by the backend, never by a
 * phone: signup mints an auth user and nothing else, because a trigger that
 * created a profile per signup would hand every stranger who can type an address
 * a signed-in session on a device they do not own.
 */
class Customer extends Model
{
    protected $table = 'profiles';

    protected $primaryKey = 'id';

    /** `CUST-23839`, not an auto-incrementing integer. */
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'full_name',
        'phone_number',
        'email',
        'language',
    ];

    protected $casts = [
        'is_enrolled' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function installments(): HasMany
    {
        return $this->hasMany(Installment::class, 'customer_key', 'id');
    }

    public function device(): HasOne
    {
        return $this->hasOne(Device::class, 'customer_key', 'id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(CustomerPayment::class, 'customer_key', 'id');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(AppNotification::class, 'customer_key', 'id');
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(SupportTicket::class, 'customer_key', 'id');
    }

    public function agreement(): HasOne
    {
        return $this->hasOne(CustomerAgreement::class, 'customer_key', 'id');
    }

    public function settings(): HasOne
    {
        return $this->hasOne(CustomerSetting::class, 'customer_key', 'id');
    }

    /**
     * The shape the app's `Customer` type expects.
     *
     * `photoUrl` is always null: this app never asks for a camera or a gallery,
     * so there is no avatar to show and no way for one to have been collected.
     *
     * @return array<string, mixed>
     */
    public function present(): array
    {
        return [
            'id' => $this->getKey(),
            'fullName' => $this->full_name ?: 'New customer',
            'phone' => $this->phone_number,
            'email' => $this->email,
            'photoUrl' => null,
            'language' => in_array($this->language, ['en', 'bn'], true) ? $this->language : 'en',
            'verifiedAt' => optional($this->created_at)->toIso8601String(),
            'createdAt' => optional($this->created_at)->toIso8601String(),
        ];
    }
}
