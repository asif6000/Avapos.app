<?php

namespace App\Services\Devices;

use App\Models\Device;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Issuing a command to a customer's phone.
 *
 * A phone sold on a plan is managed by an **enterprise** DPC that the store
 * provisioned at the point of sale. Not by the customer app: a store-installed app
 * cannot make itself device owner, and this service does not pretend otherwise. It
 * records a request, and the phone's own policy agent does the work.
 *
 * That one fact decides the whole shape of this class, and it is why the answers
 * are worded the way they are:
 *
 * 1. **An unmanaged device is refused, not faked.** A shop phone that was never
 *    provisioned reports `NOT_ENROLLED`, and Android will not let anyone lock,
 *    uninstall or hand it back to the store. Recording "locked" anyway would put a
 *    false statement in a ledger a customer can be shown later.
 * 2. **Nothing here reports an outcome.** A command is recorded `REQUESTED` and
 *    stops there. The device applies it on its next check-in and reports what
 *    happened, in its own words, with its own timestamp. A phone that is switched
 *    off, out of coverage, or on a hotel wi-fi does not unlock because somebody in
 *    an office pressed a key, and this class will not pretend that it did.
 *
 *    There is deliberately **no** admin method that sets an outcome, for the same
 *    reason there is no "mark this payment paid": the panel may ask, and the phone
 *    may answer, and nobody may answer on the phone's behalf.
 * 3. **A lock is a lease, never a switch.** Every `LOCK` is written with a
 *    `lease_expires_at` capped at [MAX_LEASE_HOURS], and at that moment the phone
 *    unlocks itself whether or not this service is running. A server outage, a
 *    mistake, or a company that no longer exists cannot leave a customer's phone
 *    locked, because the lock was never open-ended to begin with. The expiry is
 *    stored rather than computed at fetch time so that "locked until" is a thing
 *    staff can read off the screen they pressed the button on.
 * 4. **The two irreversible commands cost more to press.** `RELEASE` and
 *    `UNINSTALL` end the customer's ability to be helped by this system at all, so
 *    both need a reason *and* the device id typed back, which is the difference
 *    between a decision and a slip of the mouse.
 *
 * There is no `WIPE`. Not refused, not behind a flag — absent, and it is meant to
 * stay absent. Nothing in this system erases a customer's data over a missed
 * installment, and the device agent has no code path that could ask it to.
 */
class DeviceCommandService
{
    /**
     * What may be asked of a phone, and what each one costs to ask.
     *
     * `needs_confirmation` means the caller has to repeat the device id. It is not
     * a speed bump for its own sake: these two cannot be undone from this screen,
     * or from any screen.
     */
    public const COMMANDS = [
        'LOCK' => ['label' => 'Lock the screen', 'needs_confirmation' => false, 'destructive' => false],
        'UNLOCK' => ['label' => 'Unlock the device', 'needs_confirmation' => false, 'destructive' => false],
        'RELEASE' => ['label' => 'Release the device', 'needs_confirmation' => true, 'destructive' => true],
        'UNINSTALL' => ['label' => 'Uninstall device management', 'needs_confirmation' => true, 'destructive' => true],
    ];

    /**
     * The longest a lock this service will ever authorise.
     *
     * A `LOCK` is a lease, not a switch: it says "locked until this moment", and at
     * that moment the phone unlocks itself whether or not this service is running,
     * reachable, or still in business. The agent enforces the same ceiling
     * independently (`MAX_LOCK_LEASE_MS` in `src/services/deviceCheckIn.ts`), so a
     * bug here cannot produce an open-ended lock either.
     *
     * A day is longer than any grace period this business offers and shorter than
     * "I cannot use my phone at all". It is a ceiling, not a default — `lease_hours`
     * may ask for less.
     */
    public const MAX_LEASE_HOURS = 24;

    /**
     * Records a request for a device to do something.
     *
     * @return array{status: string, message: string, command?: array<string, mixed>}
     */
    public function issue(
        Device $device,
        string $action,
        ?string $reason,
        ?string $confirmation,
        int $leaseHours = self::MAX_LEASE_HOURS,
    ): array {
        $blocker = $this->blockerFor($device);

        if ($blocker !== null) {
            // Refused, and said why, in the customer's own terms rather than a
            // status code nobody in a shop can act on.
            return [
                'status' => 'refused',
                'message' => $blocker,
            ];
        }

        $command = self::COMMANDS[$action];

        if ($command['needs_confirmation'] && ! $this->confirms($confirmation, $device)) {
            return [
                'status' => 'refused',
                'message' => 'Type the device id to confirm this one. It cannot be undone from here.',
            ];
        }

        // A lock gets its expiry now, at request time, and it is written to the row.
        // That is deliberate: an expiry invented when the phone fetches the command
        // would be an expiry the office never saw, and "locked until" has to be
        // something a member of staff can read off the screen they pressed it on.
        $leaseExpiresAt = $action === 'LOCK'
            ? now()->addHours(max(1, min($leaseHours, self::MAX_LEASE_HOURS)))
            : null;

        // The id is built here rather than taken from the database, because it is a
        // text primary key: `insertGetId()` reads a serial that does not exist on
        // this table and would hand back 0.
        $id = 'cmd-' . bin2hex(random_bytes(8));

        DB::table('device_commands')->insert([
            'id' => $id,
            'device_id' => $device->getKey(),
            'action' => $action,
            // REQUESTED, never APPLIED. See the class docblock: the phone reports
            // the outcome, not this service and not the person who pressed it.
            'outcome' => 'REQUESTED',
            'reason' => $reason,
            'lease_expires_at' => $leaseExpiresAt,
            'outcome_note' => null,
            'reported_by' => null,
            'requested_at' => now(),
            'outcome_at' => null,
        ]);

        Log::info('A device command was requested', [
            'device' => $device->getKey(),
            'action' => $action,
            'command' => $id,
            'lease_expires_at' => $leaseExpiresAt,
        ]);

        return [
            'status' => 'ok',
            'message' => $command['destructive']
                ? 'Requested, and it cannot be taken back from here. The phone applies this on its next check-in and reports back when it has.'
                : ($action === 'LOCK'
                    ? 'Requested. The phone locks on its next check-in and unlocks itself when this authorisation ends, whether or not we are reachable.'
                    : 'Requested. The phone applies this on its next check-in, and reports back when it has.'),
            'command' => $this->present($id),
        ];
    }

    /**
     * The commands this phone has been asked to carry out and has not answered.
     *
     * Called by the device's own check-in and by nothing else. There is no `?id=`
     * and no client-supplied device key: the caller is the customer, and the device
     * is resolved from their session, so a modified request cannot ask what somebody
     * else's handset has been told to do.
     *
     * Each `LOCK` carries the expiry that was recorded when staff requested it, so
     * the phone applies the lease they were granted rather than one it made up.
     */
    public function pendingFor(Device $device): array
    {
        return DB::table('device_commands')
            ->where('device_id', $device->getKey())
            ->where('outcome', 'REQUESTED')
            ->orderBy('id')
            ->get()
            ->map(fn ($row) => $this->pendingRow((array) $row))
            ->all();
    }

    /**
     * Why this device cannot be asked to do anything, or null when it can.
     *
     * The order matters. A phone that was wiped and re-provisioned can report a
     * state the panel recognises while having no management agent behind it, so
     * the agent is checked first and the paperwork second.
     */
    public function blockerFor(Device $device): ?string
    {
        // A device is only askable when a policy agent is actually installed and
        // enrolled. Both have to be true: a phone that was wiped and re-provisioned
        // can still report a familiar state while having no agent behind it, so the
        // agent is checked first and the paperwork second.
        $hasAgent = (bool) ($device->is_managed ?? false)
            || strtoupper((string) ($device->management_status ?? '')) === 'MANAGED_BY_ENTERPRISE';

        if (! $hasAgent) {
            return 'This phone is not managed, so it cannot be asked to do anything. '
                . 'Android only allows this to a device the store provisioned as a device owner, '
                . 'and a customer app cannot do that to itself.';
        }

        if (strtoupper((string) $device->enrollment_status) !== 'ENROLLED') {
            return 'This phone has a management agent but is not enrolled, so there is nothing to carry the request.';
        }

        return null;
    }

    /** Whether a device may be asked anything at all. */
    public function canCommand(Device $device): bool
    {
        return $this->blockerFor($device) === null;
    }

    /**
     * The device's own answer to the last few requests.
     *
     * The panel reads this so it can show what the phone said, rather than what it
     * hoped. `REQUESTED` on its own is a perfectly honest answer and the common
     * one, because a phone is usually somewhere else when a button is pressed.
     */
    public function history(Device $device, int $limit = 10): array
    {
        return DB::table('device_commands')
            ->where('device_id', $device->getKey())
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => $this->present((string) $row->id, (array) $row))
            ->all();
    }

    /** The last thing the phone said about itself, which is the only true one. */
    public function latestOutcome(Device $device): ?array
    {
        $rows = $this->history($device, 1);

        return $rows[0] ?? null;
    }

    /**
     * Writes what the device reported.
     *
     * Not reachable from the admin API, and that is the point: the only caller is
     * the device's own check-in, and it names itself in `reported_by`. The same shape
     * as a gateway callback — believed when it is verified, never when it is merely
     * asserted by whoever asked.
     *
     * Two things are checked that a naive version would not be:
     *
     * - The command has to belong to **this** device. Without that, a customer with
     *   a valid session could post an outcome onto a command aimed at somebody else's
     *   phone and make the panel say that phone was released.
     * - The command has to still be `REQUESTED`. A second report is ignored rather
     *   than overwriting the first, so a retried check-in cannot rewrite history with
     *   a different answer.
     */
    public function reportOutcome(
        Device $device,
        string $commandId,
        string $outcome,
        ?string $note,
        string $reportedBy,
    ): bool {
        return DB::table('device_commands')
            ->where('id', $commandId)
            ->where('device_id', $device->getKey())
            ->where('outcome', 'REQUESTED')
            ->update([
                'outcome' => $outcome,
                'outcome_note' => $note,
                'reported_by' => $reportedBy,
                'outcome_at' => now(),
            ]) > 0;
    }

    private function confirms(?string $confirmation, Device $device): bool
    {
        return trim((string) $confirmation) === (string) $device->getKey();
    }

    /**
     * A command as the phone receives it.
     *
     * `leaseExpiresAt` is epoch millis because the phone compares it against its own
     * clock, and it is `null` for everything except `LOCK` — so a command that is not
     * a lock cannot accidentally be read as one that has an end date.
     */
    private function pendingRow(array $row): array
    {
        $lease = $row['lease_expires_at'] ?? null;

        return [
            'id' => (string) ($row['id'] ?? ''),
            'action' => (string) ($row['action'] ?? ''),
            'reason' => $row['reason'] ?? null,
            'requestedAt' => isset($row['requested_at']) ? (string) $row['requested_at'] : null,
            'leaseExpiresAt' => $lease ? (int) round(((strtotime((string) $lease)) * 1000)) : null,
        ];
    }

    private function present(string $id, ?array $row = null): array
    {
        $row ??= (array) DB::table('device_commands')->where('id', $id)->first();

        $lease = $row['lease_expires_at'] ?? null;

        return [
            'id' => $row['id'] ?? null,
            'action' => $row['action'] ?? null,
            'outcome' => $row['outcome'] ?? 'REQUESTED',
            'reason' => $row['reason'] ?? null,
            'requestedAt' => isset($row['requested_at']) ? (string) $row['requested_at'] : null,
            // Shown in the panel next to a lock, so staff can see when the phone will
            // unlock itself without anybody asking.
            'leaseExpiresAt' => $lease ? (int) round(((strtotime((string) $lease)) * 1000)) : null,
            // Null until the phone answers, and never filled in by the requester.
            'outcomeAt' => isset($row['outcome_at']) ? (string) $row['outcome_at'] : null,
            'outcomeNote' => $row['outcome_note'] ?? null,
            'reportedBy' => $row['reported_by'] ?? null,
        ];
    }
}
