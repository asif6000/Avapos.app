package io.paymently.srabontelecom.devicemanagement

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * The device policy agent.
 *
 * This receiver exists so Android has something to hand device-owner status to. It
 * is intentionally almost empty: a `DeviceAdminReceiver` is a callback surface, and
 * every dangerous thing that could be done on a customer's phone is done in
 * [SrabonDevicePolicyModule] instead, where each call is guarded by
 * `isDeviceOwnerApp()` and driven by a command the *server* issued.
 *
 * Why so little here:
 *
 * - `onEnabled` records that Android granted device-admin rights. It does not lock
 *   anything, does not set a screen lock, and does not touch the customer's data.
 *   The only way to get here on a real phone is an enterprise DPC provisioning this
 *   device; a store-installed app cannot reach it.
 * - `onDisabled` records that Android took the rights away. That is always the
 *   customer's or the store's decision to make, and this class treats it as final:
 *   it clears the local restriction lease so a released phone is genuinely free.
 * - `onPasswordChanged` / `onPasswordFailed` / `onPasswordSucceeded` are recorded
 *   and nothing more. A customer mistyping their own PIN six times must never cause
 *   this app to wipe or lock anything as a result.
 *
 * There is no `wipeData`, no `wipeDataAndEscape`, no `setCameraDisabled`, no
 * `setPackagesSuspended`, and no `AccessibilityService`. A missed installment is a
 * debt to be collected, not a reason to destroy somebody's photographs.
 */
class SrabonDeviceAdminReceiver : DeviceAdminReceiver() {

  override fun onEnabled(context: Context, intent: Intent) {
    super.onEnabled(context, intent)
    // The store provisioned this phone. Note it and stop; enforcement is the
    // server's decision, made separately and visibly.
    SrabonDevicePolicy.markAdminEnabled(context)
  }

  override fun onDisabled(context: Context, intent: Intent) {
    super.onDisabled(context, intent)
    // Android has revoked our rights — the customer disabled it, or the device was
    // released or wiped. There is nothing left to enforce, so the local record of a
    // restriction must go with it. Leaving a stale "locked" flag here would make a
    // freed phone still believe it is locked.
    SrabonDevicePolicy.markAdminDisabled(context)
  }

  override fun onPasswordChanged(context: Context, intent: Intent) {
    super.onPasswordChanged(context, intent)
    Log.d(TAG, "The device credential was changed outside this app.")
  }

  override fun onPasswordFailed(context: Context, intent: Intent) {
    super.onPasswordFailed(context, intent)
    // Counted so the app can show a helpful screen, and nothing else. In particular
    // this does not escalate: repeated failures never trigger a wipe.
    val attempts = SrabonDevicePolicy.recordFailedAttempt(context)
    Log.d(TAG, "Credential attempt failed (count=$attempts).")
  }

  override fun onPasswordSucceeded(context: Context, intent: Intent) {
    super.onPasswordSucceeded(context, intent)
    SrabonDevicePolicy.recordSuccessfulAttempt(context)
  }

  private companion object {
    const val TAG = "SrabonDeviceAdmin"
  }
}
