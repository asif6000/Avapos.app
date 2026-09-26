package io.paymently.srabontelecom.devicemanagement

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Read-only Android device-management status reporting.
 *
 * SCOPE — this module only reports what Android itself reports:
 *   - whether this app is the device owner or a profile owner
 *   - whether a profile owner / device owner exists on the device at all
 *   - non-sensitive build and identity fields used to match a phone to a contract
 *
 * It grants nothing and enforces nothing. Every action that can change what a phone
 * is lives in [SrabonDevicePolicyModule], behind a device-owner guard, and is driven
 * by a command the backend issued.
 *
 * NOTE ON THE PAIR OF THEM
 *   This class and `SrabonDevicePolicyModule` are deliberately separate. Asking
 *   "what does Android say about this phone?" and changing what the phone does are
 *   different questions with different risk, and merging them is how a status reporter
 *   quietly grows a `wipeData`. Keeping the reader free of mutators means this file
 *   can be read top to bottom to answer "what can this app learn about a customer?" —
 *   the answer being: what Android already shows any app.
 *
 * WHAT NEITHER MODULE DOES
 *   - no wipeData, no wipeDataAndEscape, no resetPassword from a server-supplied value
 *   - no root, no su, no shell, no hidden API, no reflection into internals
 *   - no AccessibilityService, no NotificationListenerService
 *   - no camera disable, no app suspension, no app inventory, no location
 *
 * Android grants device owner / profile owner status only to an app that an
 * enterprise DPC (or a test harness provisioning a fully-managed device) has
 * provisioned as such. A customer app installed from a store can never hold that
 * status. On such a phone `isDeviceManaged()` is simply false and the JavaScript
 * layer reports NOT_ENROLLED / UNSUPPORTED, which is a correct answer and not an
 * error to work around.
 *
 * Enforcement decisions (restrict, unlock, release) are made by the backend, which
 * verifies payment state server-side. Neither module holds or applies device state of
 * its own, and the local restriction it records is bounded by a lease that expires
 * without the server — see [SrabonDevicePolicy].
 */
class SrabonDeviceManagementModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context unavailable")

  private val devicePolicyManager: DevicePolicyManager
    get() = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  private fun statusFor(managed: Boolean, hasProfileOwner: Boolean): String = when {
    managed -> "MANAGED_BY_ENTERPRISE"
    hasProfileOwner -> "ENROLLED"
    else -> "NOT_ENROLLED"
  }

  /**
   * Whether *any* device admin is registered on this phone, ours or somebody else's.
   *
   * Built from `getActiveAdmins()` rather than from `DevicePolicyManager.getDeviceOwner()`.
   * That getter is not part of the public SDK — it needs the signature-level
   * `MANAGE_USERS` permission, so it is absent from `android.jar` and will not resolve
   * at `compileSdk` 36. A normal app is not entitled to ask who the device owner is, and
   * the honest answer to "is this phone managed by somebody?" is the registered admin
   * list, which every app may read.
   *
   * An empty list is the answer on an ordinary phone, and `isNotEmpty()` is what makes
   * that answerable: the list is never null, so testing it for null was always true and
   * reported a device admin on every handset regardless of what Android actually had.
   */
  private fun hasRegisteredAdmin(): Boolean = devicePolicyManager.activeAdmins?.isNotEmpty() == true

  override fun definition() = ModuleDefinition {
    Name("SrabonDeviceManagement")

    AsyncFunction("isDeviceManaged") {
      devicePolicyManager.isDeviceOwnerApp(context.packageName) ||
        devicePolicyManager.isProfileOwnerApp(context.packageName)
    }

    AsyncFunction("isDeviceOwner") {
      devicePolicyManager.isDeviceOwnerApp(context.packageName)
    }

    AsyncFunction("getDeviceOwnerPackage") {
      if (devicePolicyManager.isDeviceOwnerApp(context.packageName)) {
        context.packageName
      } else {
        // Deliberately `null` rather than somebody else's package name. Identifying
        // the current device owner requires `MANAGE_USERS`, which a customer app does
        // not hold and should not ask for, so when the owner is not this app the only
        // truthful answer is that this app cannot see who it is.
        null
      }
    }

    AsyncFunction("hasActiveProfileOwner") {
      devicePolicyManager.isProfileOwnerApp(context.packageName) || hasRegisteredAdmin()
    }

    AsyncFunction("getManagementStatus") {
      val managed = devicePolicyManager.isDeviceOwnerApp(context.packageName) ||
        devicePolicyManager.isProfileOwnerApp(context.packageName)
      statusFor(managed, hasRegisteredAdmin())
    }

    AsyncFunction("getEnrollmentStatus") {
      val managed = devicePolicyManager.isDeviceOwnerApp(context.packageName) ||
        devicePolicyManager.isProfileOwnerApp(context.packageName)
      if (managed) "ENROLLED" else "NOT_ENROLLED"
    }

    /**
     * Whether a device admin is registered, now that one is.
     *
     * This used to be permanently inert, and had to be: there was no receiver, so
     * there was nothing to enable and reporting `supported: false` was the only
     * honest answer. It can no longer be inert, because
     * `SrabonDeviceAdminReceiver` exists.
     *
     * What it still will not do is *ask*. There is no code path here that opens a
     * system dialog to grant device-admin rights, because a customer must not be
     * able to hand an app this much power by tapping through a screen that looks
     * like it is part of the app. Device-owner status is granted by the store's
     * provisioning, and the only thing this reports is whether that happened.
     */
    AsyncFunction("requestDeviceAdminEnable") {
      mapOf(
        "supported" to true,
        "enabled" to devicePolicyManager.isAdminActive(
          android.content.ComponentName(context, SrabonDeviceAdminReceiver::class.java),
        )
      )
    }

    AsyncFunction("getDeviceIdentifiers") {
      mapOf(
        "androidId" to Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID),
        "manufacturer" to (Build.MANUFACTURER ?: "Unknown"),
        "model" to (Build.MODEL ?: "Unknown"),
        "androidVersion" to Build.VERSION.RELEASE,
        "sdkInt" to Build.VERSION.SDK_INT,
        "securityPatch" to Build.VERSION.SECURITY_PATCH
      )
    }
  }
}
