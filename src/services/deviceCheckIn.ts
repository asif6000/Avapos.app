import { endpoints } from '@/api/endpoints';
import {
  hasEnforcementCapability,
  nativeDevicePolicy,
  type DevicePolicyReport,
  type PolicyOutcome,
} from '@/native/deviceManagement';
import type { DeviceCommandAction, PendingDeviceCommand } from '@/types/domain';

/**
 * DeviceCheckIn
 *
 * This is the half of the device-management system that was missing. The backend
 * could already record that staff asked a phone to lock, unlock, release or hand
 * itself back, and it stored every one of those as `REQUESTED` — but nothing ever
 * picked them up, so `reportOutcome()` had no caller and "locked" in the panel would
 * have sat at REQUESTED forever.
 *
 * This closes that loop, and the shape of it is the whole design:
 *
 *   1. **Expire first, before anything else, and without the network.** An
 *      authorisation that has run out releases the phone whether or not the server
 *      is reachable. This runs before the fetch on purpose: the moment a customer
 *      most needs their phone back is the moment the server is least likely to answer,
 *      and waiting for a network round-trip to notice a lease had expired would make
 *      the fail-open guarantee depend on the thing it exists to survive.
 *   2. **Ask the server what to do.** The list comes from
 *      `GET /customer/device/commands`, scoped by this session. No device id is sent,
 *      so there is nothing here for a modified request to point somewhere else.
 *   3. **Apply each one, and report what happened — including the failures.**
 *      `NOT_DEVICE_OWNER` and `FAILED` are reported as themselves. The one thing
 *      this file will not do is report `APPLIED` for something it did not do, because
 *      that is the single sentence the whole panel's trustworthiness rests on.
 *
 * ## What it will not do
 *
 * There is no `wipe` branch, and no dispatch table an unknown action could fall
 * through into a default. An action this build does not recognise is reported as
 * `FAILED` and nothing else happens, so a server that grows a new command cannot
 * accidentally grant this app a new capability.
 *
 * ## Why there is no polling loop here
 *
 * A `setInterval` that locks phones is a thing that keeps running when nobody is
 * looking. Check-in is called from a foreground action — opening the app, pulling to
 * refresh, the sync button — and from a background task the OS schedules itself. The
 * frequency is the operating system's decision, which is both the only honest answer
 * and the one that does not cost a customer's battery to serve a store's dashboard.
 */
export interface CheckInResult {
  /** Whether this build can enforce anything at all. */
  capable: boolean;
  /** Whether an expired authorisation was released before the call. */
  expiredLeaseReleased: boolean;
  /** What the phone says about itself, for the UI. Never a server value. */
  report: DevicePolicyReport | null;
  /** One entry per command the server had, including the ones refused. */
  outcomes: CheckInOutcome[];
  /** Set when the phone has nothing to do, which is the common case. */
  note: string | null;
}

export interface CheckInOutcome {
  id: string;
  action: DeviceCommandAction;
  /** What the phone reported, verbatim. */
  outcome: 'APPLIED' | 'FAILED' | 'REFUSED';
  note: string;
}

/**
 * A `LOCK` is only ever applied for this long, and the phone then unlocks itself.
 *
 * The server sends its own expiry in `leaseExpiresAt`; this is the ceiling applied on
 * arrival, so a server that sends a lease a year long still cannot lock a phone for a
 * year. A store that wants a customer locked for longer than a day has to renew it
 * every day, in the open, with the reason on the record — and the customer can pay.
 *
 * A day is chosen because it is longer than any grace period this business offers
 * and shorter than "I cannot use my phone at all". It is a ceiling, not a default:
 * the server's own, shorter, value wins whenever it sends one.
 */
export const MAX_LOCK_LEASE_MS = 24 * 60 * 60 * 1000;

/** Actions this build knows how to carry out. Anything else is refused, not guessed. */
const SUPPORTED: ReadonlySet<string> = new Set(['LOCK', 'UNLOCK', 'RELEASE', 'UNINSTALL']);

class DeviceCheckInImpl {
  /**
   * Applies a command to this phone and reports the result.
   *
   * Split out from {@link run} so a single command can be replayed, and so the
   * dispatch is one readable switch rather than something assembled dynamically.
   */
  private async apply(command: PendingDeviceCommand): Promise<CheckInOutcome> {
    const refuse = (note: string): CheckInOutcome => ({
      id: command.id,
      action: command.action,
      outcome: 'REFUSED',
      note,
    });

    if (!SUPPORTED.has(command.action)) {
      return refuse(
        'This version of the app does not know how to carry out that command, so it did not try. ' +
          'Update the app, or ask the shop to raise it.',
      );
    }

    if (!nativeDevicePolicy) {
      return refuse(
        'This build of the app cannot manage the phone, because the device-management module is not ' +
          'in it. Nothing was changed.',
      );
    }

    if (!(await nativeDevicePolicy.isDeviceOwner())) {
      // The honest and very common answer: a phone bought in a shop was never
      // provisioned as a device owner, so there is no agent here to carry anything
      // out. Reported rather than swallowed, because the panel needs to know that a
      // request it made is going nowhere.
      return refuse(
        'Android does not report this app as the owner of this phone, so it cannot act on the ' +
          'request. A phone has to be provisioned as a device owner by the shop at the point of sale.',
      );
    }

    let result: PolicyOutcome;
    switch (command.action) {
      case 'LOCK':
        result = await this.applyLock(command);
        break;
      case 'UNLOCK':
        result = await nativeDevicePolicy.releaseLock();
        break;
      case 'RELEASE':
        result = await nativeDevicePolicy.clearDeviceOwner();
        break;
      case 'UNINSTALL':
        result = await nativeDevicePolicy.removeActiveAdmin();
        break;
      default:
        return refuse('Unrecognised command.');
    }

    return {
      id: command.id,
      action: command.action,
      // The phone's own status, mapped onto the three outcomes the server accepts.
      // `NOT_DEVICE_OWNER` is unreachable past the guard above, but is mapped rather
      // than defaulted so that a future guard change cannot turn a refusal into a
      // success.
      outcome: result.status === 'OK' ? 'APPLIED' : result.status === 'NOT_DEVICE_OWNER' ? 'REFUSED' : 'FAILED',
      note: result.message ?? 'The phone did not say why.',
    };
  }

  /**
   * A lock, bounded twice.
   *
   * The server's lease is used when it sends one that is in the future, and the
   * ceiling in {@link MAX_LOCK_LEASE_MS} is applied on top either way. A `LOCK` with
   * no usable lease is refused: an open-ended lock is the one thing this whole design
   * exists to make impossible, and a command that cannot say when it ends is exactly
   * that.
   */
  private async applyLock(command: PendingDeviceCommand): Promise<PolicyOutcome> {
    const now = Date.now();
    const requested = command.leaseExpiresAt;
    const usable = typeof requested === 'number' && requested > now;
    const expiresAt = usable ? Math.min(requested, now + MAX_LOCK_LEASE_MS) : 0;

    if (expiresAt === 0) {
      return {
        status: 'FAILED',
        message:
          'The request to lock this phone did not say when the lock would end, so it was not applied. ' +
          'No lock is ever open-ended.',
        leaseExpiresAt: null,
        restrictedSince: null,
        wasRestricted: null,
      };
    }

    return nativeDevicePolicy!.applyLock(expiresAt);
  }

  /**
   * One full check-in.
   *
   * Never throws: a check-in that fails must leave the app usable and the phone in a
   * state it can explain, so every failure below becomes a `note` and an empty
   * outcome list rather than an exception.
   */
  async run(): Promise<CheckInResult> {
    const capable = hasEnforcementCapability();

    // Step 1, deliberately offline and first. See the class docblock.
    let expiredLeaseReleased = false;
    try {
      expiredLeaseReleased = (await nativeDevicePolicy?.expireLeaseIfDue()) ?? false;
    } catch {
      // A lease we could not expire is worth knowing about, but it is not a reason to
      // refuse to do anything else.
      expiredLeaseReleased = false;
    }

    const report = await this.report();

    if (!capable) {
      return {
        capable: false,
        expiredLeaseReleased,
        report,
        outcomes: [],
        note: 'This build cannot manage the phone. Nothing was changed.',
      };
    }

    let pending: PendingDeviceCommand[];
    try {
      pending = await endpoints.device.pendingCommands();
    } catch {
      return {
        capable: true,
        expiredLeaseReleased,
        report,
        outcomes: [],
        note:
          expiredLeaseReleased
            ? 'The lock on this phone had ended and has been released. The shop could not be reached.'
            : 'The shop could not be reached, so nothing was changed.',
      };
    }

    const outcomes: CheckInOutcome[] = [];
    for (const command of pending) {
      // The phone's answer is sent even when the command failed, because a command
      // stuck at REQUESTED forever is the thing this system exists to avoid. If the
      // report itself fails, the next check-in sees the command again, because the
      // server only advances it on a successful report.
      const outcome = await this.apply(command).catch((error: unknown) => ({
        id: command.id,
        action: command.action,
        outcome: 'FAILED' as const,
        note: `The phone could not carry this out: ${describe(error)}`,
      }));

      outcomes.push(outcome);

      try {
        await endpoints.device.reportCommandOutcome(command.id, {
          outcome: outcome.outcome,
          note: outcome.note,
        });
      } catch {
        // Left REQUESTED on purpose. The next check-in retries, and the panel keeps
        // showing REQUESTED, which is the truth: we do not know that this happened.
      }
    }

    return {
      capable: true,
      expiredLeaseReleased,
      report: await this.report(),
      outcomes,
      note: outcomes.length === 0 ? 'Nothing to do.' : null,
    };
  }

  private async report(): Promise<DevicePolicyReport | null> {
    try {
      return (await nativeDevicePolicy?.report()) ?? null;
    } catch {
      return null;
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'an unknown error';
}

export const deviceCheckIn = new DeviceCheckInImpl();
