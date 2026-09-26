<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A payment, and the gateway's verdict on it.
 *
 * THE PRIMARY KEY IS THE TRANSACTION ID
 *
 * `transaction_id` is this table's key because it is the one identifier the
 * gateway and this server both hold. It is what `GET /payments/{id}/status`
 * looks up, and what a customer sees quoted back to them.
 *
 * `status` is set to `SUCCESS` in exactly one place: `PaymentProcessor`, after
 * this server has asked the gateway what happened and matched the answer to a
 * verified invoice. Nothing in the app can write it, nothing in this model can
 * write it, and there is no admin route that sets it — a financing app's ledger
 * is only worth something if the money in it is the money that arrived.
 */
class CustomerPayment extends Model
{
    protected $table = 'payments';

    protected $primaryKey = 'transaction_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'customer_key',
        'installment_number',
        'amount',
        'date',
        'payment_method',
        'status',
        'receipt_url',
        'gateway_order_id',
    ];

    protected $casts = [
        'installment_number' => 'integer',
        'amount' => 'float',
        'date' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_key', 'id');
    }

    /**
     * Whether this server has verified that the money arrived.
     *
     * A gateway "success" page is not this. Only a verified callback is.
     */
    public function isSettled(): bool
    {
        return strtoupper((string) $this->status) === 'SUCCESS';
    }
}
