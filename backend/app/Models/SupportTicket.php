<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A support ticket a customer raised.
 *
 * `admin_response` is written by staff through the panel and is read-only to the
 * customer: there is no route by which a phone can answer its own ticket, and no
 * field in `POST /support/tickets` that would let it try.
 */
class SupportTicket extends Model
{
    protected $table = 'support_tickets';

    /** `TICK-…`, not an auto-incrementing integer. */
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'customer_key',
        'subject',
        'message',
        'category',
        'status',
        'admin_response',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_key', 'id');
    }

    /**
     * The shape the app's `SupportTicket` type expects.
     *
     * @return array<string, mixed>
     */
    public function present(): array
    {
        $created = optional($this->created_at)->toIso8601String();

        return [
            'id' => $this->getKey(),
            'subject' => $this->subject,
            'message' => $this->message,
            'category' => $this->category ?: 'OTHER',
            'status' => $this->status ?: 'OPEN',
            'createdAt' => $created,
            'updatedAt' => optional($this->updated_at)->toIso8601String() ?? $created,
            'response' => $this->admin_response,
            'respondedAt' => $this->admin_response ? $created : null,
        ];
    }
}
