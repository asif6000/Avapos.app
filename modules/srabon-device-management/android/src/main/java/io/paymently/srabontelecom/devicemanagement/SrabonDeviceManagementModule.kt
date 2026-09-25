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
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *   - no lockNow(), no wipeData(), no resetPassword(), no setPasswordQuality()
 *   - no DeviceAdminReceiver, no BIND_DEVICE_ADMIN permission
 *   - no root, no su, no shell, no hidden API, no reflection into internals
 *   - no AccessibilityService, no NotificationListenerService
 *
 * Android grants device owner / profile owner status only to an app that an
 * enterprise DPC (or a test harness provisioning a fully-managed device) has
 * provisioned as such. A customer app installed from a store can never hold that
 * status, and this module does not attempt to acquire it. On a retail device
 * `isDeviceManaged()` is simply false and the JavaScript layer reports
 * NOT_ENROLLED / UNSUPPORTED, which is a correct answer.
 *
 * Enforcement decisions (restrict, unlock, suspend) are made by the backend,
 * which verifies payment state server-side. This module never holds or applies
 * device state of its own.
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
        devicePolicyManager.deviceOwner?.packageName
      }
    }

    AsyncFunction("hasActiveProfileOwner") {
      devicePolicyManager.isProfileOwnerApp(context.packageName) ||
        devicePolicyManager.deviceOwner != null ||
        devicePolicyManager.activeAdmins != null
    }

    AsyncFunction("getManagementStatus") {
      val managed = devicePolicyManager.isDeviceOwnerApp(context.packageName) ||
        devicePolicyManager.isProfileOwnerApp(context.packageName)
      statusFor(managed, devicePolicyManager.deviceOwner != null)
    }

    AsyncFunction("getEnrollmentStatus") {
      val managed = devicePolicyManager.isDeviceOwnerApp(context.packageName) ||
        devicePolicyManager.isProfileOwnerApp(context.packageName)
      if (managed) "ENROLLED" else "NOT_ENROLLED"
    }

    /**
     * `requestDeviceAdminEnable` is intentionally inert. The module does not
     * register an admin receiver, so there is nothing to enable; it reports
     * `supported=false` rather than pretending a flow exists.
     */
    AsyncFunction("requestDeviceAdminEnable") {
      mapOf(
        "supported" to false,
        "enabled" to false
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
