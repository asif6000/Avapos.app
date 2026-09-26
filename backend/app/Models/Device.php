<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The phone a customer bought on a plan.
 *
 * `state` is the authoritative device state the app reads from
 * `GET /devices/me/status`. It is written by staff through the admin panel and by
 * a **verified** payment, and by nothing else. In particular no phone can report
 * its way into a state: a device that says `ENROLLED` has still not been
 * enrolled, because enrolment is the store's provisioning and this column records
 * what the store's enterprise DPC did.
 *
 * `source` records where the descriptive columns came from — `DEMO` for a seeded
 * row, `PHONE` once a handset has reported in. A panel that shows a fabricated
 * model beside a real one has to say which is which on the row, and this is how.
 */
class Device extends Model
{
    protected $table = 'devices';

    protected $fillable = [
        'customer_key',
        'contract_id',
        'device_name',
        'manufacturer',
        'model',
        'android_version',
        'android_sdk',
        'android_id',
        'enrollment_status',
        'management_status',
        'state',
        'last_sync_time',
        'source',
        'is_managed',
        'reported_at',
        'reported_by',
    ];

    protected $casts = [
        'is_managed' => 'boolean',
        'android_sdk' => 'integer',
        'last_sync_time' => 'datetime',
        'reported_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_key', 'id');
    }

    /**
     * Whether this app may act on this phone at all.
     *
     * Android grants device-owner status only to an app an enterprise DPC
     * provisioned as such. A phone bought in a shop and installed from a store
     * never is, so this is normally false and the honest answer is
     * `NOT_ENROLLED` — not an error to work around.
     */
    public function isManaged(): bool
    {
        return (bool) $this->is_managed;
    }

    /**
     * The shape the app's `Device` type expects.
     *
     * @return array<string, mixed>
     */
    public function present(?CustomerAgreement $agreement = null): array
    {
        return [
            'id' => $this->getKey(),
            'name' => $this->device_name,
            'manufacturer' => $this->manufacturer,
            'model' => $this->model,
            'androidVersion' => $this->android_version,
            'enrollmentStatus' => $this->enrollment_status,
            'managementStatus' => $this->management_status,
            'deviceState' => $this->state,
            'lastSyncedAt' => optional($this->last_sync_time)->toIso8601String(),
            'contractId' => $this->contract_id,
            'agreementVersion' => $agreement?->agreement_version ?? '1.0.0',
            'agreementAcceptedAt' => $agreement?->accepted_at?->toIso8601String(),
            'enterpriseManaged' => (bool) $this->is_managed,
        ];
    }
}
