<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A message in the notification centre.
 *
 * A notification is a **pointer**, never a decision. It may tell a customer an
 * installment is due, but nothing in the app treats a notification as authority
 * to unlock a phone or mark a bill paid — the app refetches on receipt and
 * believes the server, not the push.
 *
 * The app can also read this table straight from Supabase through PostgREST,
 * scoped by the customer's JWT and constrained by the RLS policies in
 * `sql/03-owner-policies.sql`. That is why `customer_key` is the owner column
 * those policies key on.
 */
class AppNotification extends Model
{
    protected $table = 'notifications';

    /** `notif-1`, not an auto-incrementing integer. */
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'customer_key',
        'type',
        'title',
        'message',
        'is_read',
        'reference_id',
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_key', 'id');
    }

    /**
     * The shape the app's `AppNotification` type expects.
     *
     * @return array<string, mixed>
     */
    public function present(): array
    {
        return [
            'id' => $this->getKey(),
            'type' => $this->type,
            'title' => $this->title,
            'message' => $this->message,
            'isRead' => (bool) $this->is_read,
            'referenceId' => $this->reference_id,
            'createdAt' => optional($this->created_at)->toIso8601String(),
        ];
    }
}
