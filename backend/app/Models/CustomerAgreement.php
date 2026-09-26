<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The device-management agreement a customer signed, and when.
 *
 * Recorded by `POST /agreements/device-management/accept` BEFORE any enrollment
 * is attempted, and never as a side effect of one. That ordering is the whole
 * point: if the store provisions a phone and the customer then declines, there is
 * an agreement and no enrollment, which is a different situation from an
 * enrollment nobody asked for, and only the first one is defensible.
 *
 * `agreement_version` is stored rather than read from the app's current constant.
 * A signed agreement is a historical fact about a particular text, and an
 * amendment to `DEVICE_MANAGEMENT_AGREEMENT_VERSION` must not retroactively
 * change what this customer agreed to.
 */
class CustomerAgreement extends Model
{
    protected $table = 'customer_agreements';

    protected $fillable = [
        'customer_key',
        'contract_id',
        'agreement_version',
        'signature_name',
        'device_name',
        'accepted_at',
    ];

    protected $casts = [
        'accepted_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_key', 'id');
    }

    /**
     * The shape the app's `AgreementRecord` type expects.
     *
     * @return array<string, mixed>
     */
    public function present(): array
    {
        return [
            'id' => (string) $this->getKey(),
            'agreementVersion' => $this->agreement_version,
            'acceptedAt' => optional($this->accepted_at)->toIso8601String(),
            'customerName' => $this->signature_name,
            'contractId' => (string) $this->contract_id,
        ];
    }
}
