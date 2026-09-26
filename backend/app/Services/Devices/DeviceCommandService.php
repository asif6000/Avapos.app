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
 * 3. **The two irreversible commands cost more to press.** `RELEASE` and
 *    `UNINSTALL` end the customer's ability to be helped by this system at all, so
 *    both need a reason *and* the device id typed back, which is the difference
 *    between a decision and a slip of the mouse.
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
     * Records a request for a device to do something.
     *
     * @return array{status: string, message: string, command?: array<string, mixed>}
     */
    public function issue(Device $device, string $action, ?string $reason, ?string $confirmation): array
    {
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

        $id = DB::table('device_commands')->insertGetId([
            'id' => 'cmd-' . bin2hex(random_bytes(8)),
            'device_id' => $device->getKey(),
            'action' => $action,
            // REQUESTED, never APPLIED. See the class docblock: the phone reports
            // the outcome, not this service and not the person who pressed it.
            'outcome' => 'REQUESTED',
            'reason' => $reason,
            'outcome_note' => null,
            'reported_by' => null,
            'requested_at' => now(),
            'outcome_at' => null,
        ]);

        Log::info('A device command was requested', [
            'device' => $device->getKey(),
            'action' => $action,
            'command' => $id,
        ]);

        return [
            'status' => 'ok',
            'message' => $command['destructive']
                ? 'Requested, and it cannot be taken back from here. The phone applies this on its next check-in and reports back when it has.'
                : 'Requested. The phone applies this on its next check-in, and reports back when it has.',
            'command' => $this->present($id),
        ];
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
            ->map(fn ($row) => $this->present((int) $row->id, (array) $row))
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
     * the device's own check-in, and it names itself in `reported_by`. The same
     * shape as a gateway callback — believed when it is verified, never when it is
     * merely asserted by whoever asked.
     */
    public function reportOutcome(int $commandId, string $outcome, ?string $note, string $reportedBy): void
    {
        DB::table('device_commands')
            ->where('id', $commandId)
            ->update([
                'outcome' => $outcome,
                'outcome_note' => $note,
                'reported_by' => $reportedBy,
                'outcome_at' => now(),
            ]);
    }

    private function confirms(?string $confirmation, Device $device): bool
    {
        return trim((string) $confirmation) === (string) $device->getKey();
    }

    private function present(int $id, ?array $row = null): array
    {
        $row ??= (array) DB::table('device_commands')->where('id', $id)->first();

        return [
            'id' => $row['id'] ?? null,
            'action' => $row['action'] ?? null,
            'outcome' => $row['outcome'] ?? 'REQUESTED',
            'reason' => $row['reason'] ?? null,
            'requestedAt' => isset($row['requested_at']) ? (string) $row['requested_at'] : null,
            // Null until the phone answers, and never filled in by the requester.
            'outcomeAt' => isset($row['outcome_at']) ? (string) $row['outcome_at'] : null,
            'outcomeNote' => $row['outcome_note'] ?? null,
            'reportedBy' => $row['reported_by'] ?? null,
        ];
    }
}
