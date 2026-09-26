package io.paymently.srabontelecom.devicemanagement

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JavaScript face of the policy agent.
 *
 * This is the only place the app can ask the phone to change what the phone is, and
 * it does exactly four things, one per command the backend can issue:
 *
 *   applyLock(leaseExpiresAt)   ← LOCK      (bounded by a lease, never open-ended)
 *   releaseLock()               ← UNLOCK
 *   clearDeviceOwner()          ← RELEASE
 *   removeActiveAdmin()         ← UNINSTALL
 *
 * Two things are worth noticing about that list, and both are deliberate.
 *
 * **There is no `wipe`, and there never will be.** Not a parameter, not a hidden
 * flag, not a code path behind a capability. The reasoning is in
 * [SrabonDevicePolicy], and it is not a technical one: destroying a customer's
 * photographs and messages over a missed installment is not a collection method.
 *
 * **Nothing here decides anything.** The caller is `DeviceCheckIn`, which got these
 * from `GET /customer/device/commands` — a list the server built from commands staff
 * requested with a reason attached, and which the server scoped to this customer's
 * own device. This module cannot widen that list, cannot act on a command for
 * another phone, and cannot act at all unless Android says it is the device owner.
 * A phone that reports `NOT_DEVICE_OWNER` is the normal, correct answer on a phone
 * bought in a shop, and the app reports it rather than working around it.
 *
 * Every function returns `{ status, message }` where status is one of `OK`,
 * `NOT_DEVICE_OWNER`, `FAILED` or `NO_LEASE`, plus whatever fields are relevant. The
 * caller is expected to send that status to the server as the command's outcome: the
 * panel must show what the phone said, not what the request hoped for.
 */
class SrabonDevicePolicyModule : Module() {

  private val context
    get() = appContext.reactContext ?: throw IllegalStateException("React context unavailable")

  override fun definition() = ModuleDefinition {
    Name("SrabonDevicePolicy")

    /**
     * Whether this app may act at all. Read by the app before it shows a
     * restriction screen, so the screen can be honest about whether anything is
     * enforcing it.
     */
    AsyncFunction("isDeviceOwner") {
      SrabonDevicePolicy.isDeviceOwner(context)
    }

    /** Everything the app needs to describe this phone's management state. */
    AsyncFunction("report") {
      SrabonDevicePolicy.report(context)
    }

    /**
     * Releases an expired authorisation on its own, with no server involved.
     *
     * Called on every app start and on every check-in, before anything else, so a
     * phone whose server has been unreachable for a lease period unlocks itself
     * rather than waiting for the network to come back.
     */
    AsyncFunction("expireLeaseIfDue") {
      SrabonDevicePolicy.expireLeaseIfDue(context)
    }

    /** LOCK. `leaseExpiresAt` is epoch millis, and must be in the future. */
    AsyncFunction("applyLock") { leaseExpiresAt: Double ->
      SrabonDevicePolicy.applyLock(context, leaseExpiresAt.toLong())
    }

    /** UNLOCK. */
    AsyncFunction("releaseLock") {
      SrabonDevicePolicy.releaseLock(context)
    }

    /**
     * The customer's own screen PIN, set once at enrollment to a value they chose.
     *
     * The app never sends a PIN to this that the customer did not type, and no
     * server ever supplies one. A restriction must be something a customer can
     * identify themselves through, not something that can deny them their own data.
     */
    AsyncFunction("setCustomerCredential") { pin: String ->
      SrabonDevicePolicy.setCustomerCredential(context, pin)
    }

    /** Removes the screen PIN. Server-authorised only; never self-service. */
    AsyncFunction("clearCustomerCredential") {
      SrabonDevicePolicy.clearCustomerCredential(context)
    }

    /** RELEASE. Gives up device-owner status permanently. */
    AsyncFunction("clearDeviceOwner") {
      SrabonDevicePolicy.clearDeviceOwner(context)
    }

    /** UNINSTALL. Removes the policy agent so the app can be uninstalled normally. */
    AsyncFunction("removeActiveAdmin") {
      SrabonDevicePolicy.removeActiveAdmin(context)
    }
  }
}
