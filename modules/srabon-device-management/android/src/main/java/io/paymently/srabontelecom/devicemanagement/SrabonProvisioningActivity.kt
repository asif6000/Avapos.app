package io.paymently.srabontelecom.devicemanagement

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.os.Bundle

/**
 * The provisioning handshake, and the only activity in this module.
 *
 * Android sends `android.app.action.PROVISIONING_DEVICE_ADMIN` to whichever package
 * the enrolling DPC named. Two things matter about how this is handled.
 *
 * **It asks the customer for nothing.** No dialog, no checkbox, no "grant
 * permissions?". The consent for device management in this project is collected
 * earlier and in the customer's own words — the agreement, with a version, a
 * timestamp and a typed signature, recorded server-side before this activity could
 * ever run (`app/device/enrollment.tsx`). Re-asking here, in a system-styled
 * screen the customer did not ask for, would be asking twice and looking like
 * something else. The enrolment is the store's act, at the point of sale, on a
 * phone the customer is buying; the agreement is ours.
 *
 * **It does not interfere.** If the intent names a different package — some other
 * DPC enrolling the same device — this activity finishes immediately and touches
 * nothing. It is not our provisioning, and it is not ours to obstruct.
 *
 * The result is a screen the customer never sees: either Android provisions us and
 * the app reports `ENROLLED` on its next read, or it does not and the app reports
 * `NOT_ENROLLED`. Both are honest answers, and neither is manufactured here.
 */
class SrabonProvisioningActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val requestedPackage = intent?.getStringExtra(DevicePolicyManager.EXTRA_PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME)

    if (requestedPackage == packageName) {
      // Android is about to grant this app device-owner status. Nothing to do and
      // nothing to ask: the store already asked, and the customer already agreed in
      // the app. Recording it means the very first read after provisioning can tell
      // the truth about what happened.
      SrabonDevicePolicy.markProvisioningRequested(this)
    }

    // Either way this activity's job is finished. Showing anything at all would mean
    // inventing a screen the customer did not ask for.
    finish()
  }

  override fun onResume() {
    super.onResume()
    // Belt and braces: if anything above threw, the activity must still not sit on
    // the back stack as a blank page in the customer's hand.
    if (!isFinishing) {
      finish()
    }
  }
}
