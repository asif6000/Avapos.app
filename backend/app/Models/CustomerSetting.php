<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * What a customer has chosen about how the app behaves.
 *
 * Scoped on purpose to things that change no entitlement: whether to be
 * reminded about money, whether to hear about the device, a theme. There is no
 * setting here that can unlock a phone, settle a debt, hide an overdue
 * installment, or alter an agreement, and `updateSettings` rejects any key not
 * listed in {@see self::WRITABLE}.
 */
class CustomerSetting extends Model
{
    protected $table = 'customer_settings';

    protected $fillable = [
        'customer_key',
        'notifications_enabled',
        'payment_reminders_enabled',
        'device_status_alerts_enabled',
        'marketing_enabled',
        'theme',
    ];

    protected $casts = [
        'notifications_enabled' => 'boolean',
        'payment_reminders_enabled' => 'boolean',
        'device_status_alerts_enabled' => 'boolean',
        'marketing_enabled' => 'boolean',
    ];

    /**
     * The only keys a phone may write.
     *
     * Enforced as an allow-list rather than a deny-list so that a column added to
     * this table later is not writable by the client until somebody decides it
     * should be.
     */
    public const WRITABLE = [
        'notificationsEnabled' => 'notifications_enabled',
        'paymentRemindersEnabled' => 'payment_reminders_enabled',
        'deviceStatusAlertsEnabled' => 'device_status_alerts_enabled',
        'marketingEnabled' => 'marketing_enabled',
        'theme' => 'theme',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_key', 'id');
    }

    /**
     * The defaults a customer gets before they have opened Settings once.
     *
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'notificationsEnabled' => true,
            'paymentRemindersEnabled' => true,
            'deviceStatusAlertsEnabled' => true,
            'marketingEnabled' => false,
            // Language is a property of the customer, not of this table, so it is
            // read from the profile and passed in by the caller.
            'theme' => 'system',
        ];
    }

    /**
     * The shape the app's `AppSettings` type expects.
     *
     * @return array<string, mixed>
     */
    public function present(string $language = 'en'): array
    {
        return [
            'notificationsEnabled' => (bool) $this->notifications_enabled,
            'paymentRemindersEnabled' => (bool) $this->payment_reminders_enabled,
            'deviceStatusAlertsEnabled' => (bool) $this->device_status_alerts_enabled,
            'marketingEnabled' => (bool) $this->marketing_enabled,
            'language' => in_array($language, ['en', 'bn'], true) ? $language : 'en',
            'theme' => in_array($this->theme, ['system', 'light', 'dark'], true)
                ? $this->theme
                : 'system',
        ];
    }
}
