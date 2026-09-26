<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One scheduled installment on a device-financing contract.
 *
 * WHAT THIS TABLE IS AUTHORITATIVE FOR
 *
 * The money. `amount` is what the contract says is owed and `paid_amount` is what
 * has actually been settled, and the difference between them is the figure the
 * dashboard, the restriction screen and the payment sheet all read.
 *
 * It is deliberately NOT derived from `payments`. A payment row is a record of
 * something that happened at a gateway; an installment is an obligation. They
 * disagree whenever a payment lands late, is partial, or is refunded, and the
 * obligation is the thing a customer is judged by.
 *
 * `status` is stored rather than computed, so an operator can read the schedule
 * off the screen and see the same answer the app will show. `PaymentProcessor`
 * is what advances it, and only from a gateway this server verified.
 */
class Installment extends Model
{
    protected $table = 'installments';

    /** `inst-CUST-23839-4`, not an auto-incrementing integer. */
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'customer_key',
        'contract_id',
        'number',
        'amount',
        'paid_amount',
        'status',
        'due_date',
        'paid_at',
    ];

    protected $casts = [
        'number' => 'integer',
        'amount' => 'float',
        'paid_amount' => 'float',
        'due_date' => 'date',
        'paid_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_key', 'id');
    }

    /** What is still owed on this installment. Never negative. */
    public function outstanding(): float
    {
        return max(0.0, (float) $this->amount - (float) $this->paid_amount);
    }

    /**
     * The shape the app's `Installment` type expects.
     *
     * @return array<string, mixed>
     */
    public function present(): array
    {
        return [
            'id' => $this->getKey(),
            'contractId' => $this->contract_id,
            'number' => (int) $this->number,
            'amount' => (float) $this->amount,
            'paidAmount' => (float) $this->paid_amount,
            'status' => $this->status,
            'dueDate' => optional($this->due_date)->toDateString(),
            'paidAt' => optional($this->paid_at)->toIso8601String(),
        ];
    }
}
