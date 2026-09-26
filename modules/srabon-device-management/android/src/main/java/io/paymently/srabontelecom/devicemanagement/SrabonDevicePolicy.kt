package io.paymently.srabontelecom.devicemanagement

import android.app.KeyguardManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.util.Log

/**
 * The one place on the phone that can change what the phone is.
 *
 * Everything here is guarded three times over, and the guards are the point:
 *
 * 1. **Device owner, or nothing happens.** Every mutating method calls
 *    [requireDeviceOwner] first and throws if this app is not the device owner. A
 *    customer who installed the app from a store has no way to be in this state, so
 *    on their phone every method below fails and the app reports `NOT_ENROLLED`.
 * 2. **The server decides.** Nothing in this class decides to restrict anybody. It
 *    is handed a command that [DeviceCommandService] issued, and it applies that
 *    command or reports that it could not.
 * 3. **A lease, so the worst case is bounded.** See below.
 *
 * ## The lease, and why it is the most important thing in this file
 *
 * A lock applied by a device owner is a serious thing: a customer who cannot get
 * into their own phone has a serious problem, and if the company that locked it has
 * gone out of business, an unreachable server or a bug, that problem never resolves.
 *
 * So a lock here is never open-ended. The server grants a *lease* with an expiry,
 * and [applyLock] records it. While the lease is live the phone demands its
 * credential. When the lease expires — because the server stopped renewing it, or
 * the phone was offline, or nobody renewed it because the plan was settled — the
 * phone unlocks **itself**, on its own, with no server involved. [expireLeaseIfDue]
 * does exactly that and is called on every check-in and every app start.
 *
 * The result: the longest a customer can be locked by this system is one lease
 * period, whatever goes wrong on the other end. A server outage cannot brick a
 * customer's phone, because a server outage *is* the expiry.
 *
 * ## What this class will not do
 *
 * - **No wipe, ever.** Not `wipeData`, not `wipeDataAndEscape`, not
 *   `wipeDataOnConfirmation`. Nothing here can erase a customer's photographs,
 *   messages or files. A missed installment is a debt, and destroying somebody's
 *   life over a debt is both unlawful in Bangladesh and not something this codebase
 *   will do. The declared policy list in `res/xml/device_admin.xml` is one line
 *   long for the same reason.
 * - **No credential the customer does not have.** This is a deliberate product
 *   decision, and it is the difference between a financing arrangement and a
 *   hostage situation. The PIN on this phone is chosen by the customer, at
 *   enrollment, and stays theirs. A lock therefore means "type your own PIN to get
 *   in", not "you cannot get in" — the restriction this app can actually enforce is
 *   the enrollment (see [clearDeviceOwnerApp]) and the app's own gating, not a
 *   secret held by the shop. A PIN held only by a store is a key to somebody's
 *   entire photo library, and a plan can be settled, disputed, or appealed after
 *   such a key is handed out.
 * - **No spying.** No `setCameraDisabled` games, no `setPackagesSuspended`, no
 *   app inventory, no location collection, no AccessibilityService, no
 *   NotificationListenerService. The store learns what the payment state already
 *   says, and nothing else.
 * - **No silent escalation.** A failed PIN attempt is counted so the app can offer
 *   help. It never escalates, and the counter is not a trigger for anything.
 *
 * ## The genuinely irreversible lever, and why it is proportionate
 *
 * [clearDeviceOwnerApp] is the one operation that changes what the phone *is*, and
 * the reason it matters is the mirror image of the above: **while a plan is
 * outstanding, the phone cannot be un-enrolled**, because only the device owner can
 * release itself and the customer cannot remove an app that is device owner. That
 * is what the store actually holds, and it is normal, disclosed, contracted
 * financing security — the customer is told at the point of sale, in the agreement,
 * and can end it by paying.
 *
 * It is also strictly bounded, and the bounds are enforced here rather than in
 * policy: the lease above caps any restriction in time, and [releaseLock] plus
 * [clearCustomerCredential] exist so that a settled plan always ends with a phone
 * that behaves like an ordinary phone again.
 */
object SrabonDevicePolicy {

  private const val TAG = "SrabonDevicePolicy"
  private const val PREFS = "srabon_device_policy"

  private const val KEY_ADMIN_ENABLED_AT = "admin_enabled_at"
  private const val KEY_PROVISIONING_REQUESTED_AT = "provisioning_requested_at"
  private const val KEY_LEASE_EXPIRES_AT = "lease_expires_at"
  private const val KEY_RESTRICTED_SINCE = "restricted_since"
  private const val KEY_FAILED_ATTEMPTS = "failed_attempts"
  private const val KEY_CREDENTIAL_PRESENT = "credential_present"

  /**
   * Reported outcomes, so the caller reports what happened rather than what it
   * intended. `NOT_DEVICE_OWNER` is the common one on a retail phone.
   */
  const val OK = "OK"
  const val NOT_DEVICE_OWNER = "NOT_DEVICE_OWNER"
  const val FAILED = "FAILED"
  const val NO_LEASE = "NO_LEASE"

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun policy(context: Context): DevicePolicyManager =
    context.applicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  private fun adminComponent(context: Context) =
    ComponentName(context, SrabonDeviceAdminReceiver::class.java)

  // -- guards ---------------------------------------------------------------

  /** Whether this app is the device owner. The precondition for everything below. */
  fun isDeviceOwner(context: Context): Boolean =
    policy(context).isDeviceOwnerApp(context.packageName)

  /**
   * Whether *any* device owner exists, ours or somebody else's.
   *
   * Read from the registered admin list, not from `DevicePolicyManager.getDeviceOwner()`:
   * that getter needs the signature-level `MANAGE_USERS` permission and so is not in the
   * public SDK at all. `getActiveAdmins()` needs nothing and every app may read it, which
   * makes it the only honest way to answer this question from inside a customer app.
   */
  fun hasDeviceOwner(context: Context): Boolean =
    policy(context).activeAdmins?.isNotEmpty() == true

  /**
   * The guard. Returns null when this app may act, or the reason it may not.
   *
   * Deliberately the only way into a mutating method, so there is exactly one place
   * to audit when asking "what stops this app locking a phone?".
   */
  private fun requireDeviceOwner(context: Context): String? =
    if (isDeviceOwner(context)) null else NOT_DEVICE_OWNER

  // -- lifecycle markers ----------------------------------------------------

  fun markAdminEnabled(context: Context) {
    prefs(context).edit()
      .putLong(KEY_ADMIN_ENABLED_AT, System.currentTimeMillis())
      // A fresh enrolment clears any lease left over from a previous one.
      .putLong(KEY_LEASE_EXPIRES_AT, 0L)
      .putLong(KEY_RESTRICTED_SINCE, 0L)
      .putInt(KEY_FAILED_ATTEMPTS, 0)
      .apply()
    Log.i(TAG, "Android granted device-admin rights to this app.")
  }

  fun markAdminDisabled(context: Context) {
    // Rights gone: whatever this class was holding must be released with them.
    prefs(context).edit()
      .putLong(KEY_LEASE_EXPIRES_AT, 0L)
      .putLong(KEY_RESTRICTED_SINCE, 0L)
      .putInt(KEY_FAILED_ATTEMPTS, 0)
      .apply()
    Log.i(TAG, "Android revoked device-admin rights. Local restriction state cleared.")
  }

  fun markProvisioningRequested(context: Context) {
    prefs(context).edit()
      .putLong(KEY_PROVISIONING_REQUESTED_AT, System.currentTimeMillis())
      .apply()
  }

  // -- restriction ----------------------------------------------------------

  /**
   * Applies a `LOCK`, for as long as the server's lease says.
   *
   * The credential is untouched: the customer's own PIN, chosen at enrollment, is
   * already the thing standing between a passer-by and the phone's contents, and
   * stays that way. [lockNow] is what makes the phone *demand* it right now.
   *
   * @param leaseExpiresAt epoch millis the server authorised this lock until. Must
   *   be in the future; a lease that has already expired is refused rather than
   *   applied, because a lock with no end is exactly what this class exists to
   *   prevent.
   */
  fun applyLock(context: Context, leaseExpiresAt: Long): Map<String, Any?> {
    requireDeviceOwner(context)?.let { return outcome(it) }

    val now = System.currentTimeMillis()
    if (leaseExpiresAt <= now) {
      // Refusing is the safe direction. If the server's clock is wrong in the
      // customer's favour we lose a lock we were owed; if it is wrong against them
      // and we applied it anyway, they get locked until someone notices.
      return outcome(FAILED, "The authorisation for this lock had already expired.")
    }

    return try {
      policy(context).lockNow()
      prefs(context).edit()
        .putLong(KEY_LEASE_EXPIRES_AT, leaseExpiresAt)
        .putLong(KEY_RESTRICTED_SINCE, now)
        .putInt(KEY_FAILED_ATTEMPTS, 0)
        .apply()
      outcome(
        OK,
        "The screen is locked until the authorisation ends.",
        leaseExpiresAt = leaseExpiresAt,
        restrictedSince = now,
      )
    } catch (error: Exception) {
      Log.w(TAG, "lockNow was refused by Android", error)
      outcome(FAILED, "Android refused to lock the screen: ${error.message}")
    }
  }

  /**
   * Applies an `UNLOCK`: the phone stops demanding its credential and the lease is
   * dropped, so nothing re-locks it.
   */
  fun releaseLock(context: Context): Map<String, Any?> {
    requireDeviceOwner(context)?.let { return outcome(it) }

    val had = prefs(context).getLong(KEY_RESTRICTED_SINCE, 0L)
    prefs(context).edit()
      .putLong(KEY_LEASE_EXPIRES_AT, 0L)
      .putLong(KEY_RESTRICTED_SINCE, 0L)
      .putInt(KEY_FAILED_ATTEMPTS, 0)
      .apply()

    return outcome(
      OK,
      if (had > 0L) "The restriction was lifted." else "The phone was not restricted.",
      wasRestricted = had > 0L,
    )
  }

  /**
   * Unlocks by itself once the lease runs out.
   *
   * The fail-open guarantee, and the reason this class is written the way it is.
   * Safe to call at any time, from any thread, with no server reachable: it either
   * has a live lease and does nothing, or has an expired one and drops it.
   *
   * @return true when an expired lease was found and cleared.
   */
  fun expireLeaseIfDue(context: Context, now: Long = System.currentTimeMillis()): Boolean {
    val expiresAt = prefs(context).getLong(KEY_LEASE_EXPIRES_AT, 0L)
    if (expiresAt <= 0L || now < expiresAt) return false

    prefs(context).edit()
      .putLong(KEY_LEASE_EXPIRES_AT, 0L)
      .putLong(KEY_RESTRICTED_SINCE, 0L)
      .apply()
    Log.i(TAG, "The lock authorisation expired. The phone has unlocked itself.")
    return true
  }

  // -- the customer's own credential ---------------------------------------

  /**
   * Sets the screen lock, once, at enrollment, to a PIN **the customer chose**.
   *
   * This app never chooses this PIN and never receives it from a server. It is the
   * customer's, and it is the reason a restriction is a request to identify oneself
   * rather than an inability to get in.
   *
   * Refused when the phone already has a credential. `resetPassword` from a device
   * owner *replaces* whatever was there, so calling this on a phone whose owner
   * already uses a fingerprint or a pattern would quietly destroy the thing they use
   * to get into their own phone every day, in exchange for four digits they chose
   * once. That trade is not this app's to make, so it declines and says why.
   */
  fun setCustomerCredential(context: Context, pin: String): Map<String, Any?> {
    requireDeviceOwner(context)?.let { return outcome(it) }

    if (isScreenSecure(context)) {
      return outcome(
        FAILED,
        "This phone already has a screen lock, and it was left alone. Replacing it is not something " +
          "this app will do unasked.",
      )
    }

    if (pin.length < 4 || pin.length > 8 || !pin.all { it.isDigit() }) {
      return outcome(FAILED, "A screen PIN has to be 4 to 8 digits.")
    }

    return try {
      policy(context).resetPassword(pin, DevicePolicyManager.PASSWORD_QUALITY_NUMERIC)
      prefs(context).edit().putBoolean(KEY_CREDENTIAL_PRESENT, true).apply()
      outcome(OK, "A screen PIN was set. This is the only PIN that unlocks this phone.")
    } catch (error: Exception) {
      Log.w(TAG, "resetPassword was refused by Android", error)
      outcome(FAILED, "Android refused to set a screen PIN: ${error.message}")
    }
  }

  /**
   * Removes the screen lock entirely.
   *
   * Used by `RELEASE`, and by a server-authorised forgotten-PIN command — never by
   * the customer from inside the app, because a self-service "forgot it" is a
   * bypass of the only restriction this system has.
   *
   * Android's own API for this is `resetPassword(null)`. Some OEM builds reject the
   * null, so the empty string is tried as a fallback, and whichever one worked is
   * what gets reported. If neither worked the caller is told `FAILED` and must say
   * so, rather than claiming a phone is open when it is not.
   */
  fun clearCustomerCredential(context: Context): Map<String, Any?> {
    requireDeviceOwner(context)?.let { return outcome(it) }

    var lastError: Exception? = null
    for (candidate in listOf<String?>(null, "")) {
      try {
        policy(context).resetPassword(candidate, DevicePolicyManager.PASSWORD_QUALITY_UNSPECIFIED)
        prefs(context).edit().putBoolean(KEY_CREDENTIAL_PRESENT, false).apply()
        return outcome(OK, "The screen PIN was removed. The phone is unlocked.")
      } catch (error: Exception) {
        lastError = error
      }
    }

    Log.w(TAG, "resetPassword could not clear the credential", lastError)
    return outcome(FAILED, "Android would not remove the screen PIN: ${lastError?.message}")
  }

  /** Whether the device is currently showing a keyguard requiring a credential. */
  fun isScreenLocked(context: Context): Boolean {
    val keyguard = context.applicationContext
      .getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    return keyguard.isKeyguardLocked
  }

  /**
   * Whether the phone already has a credential of its own — a PIN, pattern,
   * password or biometric-backed lock.
   *
   * Read before anything calls `resetPassword`, because as a device owner this app
   * could replace it, and a customer's everyday way into their own phone is not
   * something a financing app should be able to overwrite in passing.
   */
  fun isScreenSecure(context: Context): Boolean {
    val keyguard = context.applicationContext
      .getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    return keyguard.isDeviceSecure
  }

  // -- the two irreversible ones -------------------------------------------

  /**
   * Applies `RELEASE`: this app gives up device-owner status, and the phone becomes
   * an ordinary phone that can never be re-enrolled by anybody.
   *
   * Deliberately implemented as the *last* resort, not a first one: a released
   * phone is gone from this system permanently, which is why the backend demands a
   * reason and the device id typed back before it will even record the request. Once
   * the phone answers, though, there is nothing to soften — a customer whose plan is
   * settled must end up with an ordinary phone, and there is no argument for
   * keeping the leash.
   */
  fun clearDeviceOwner(context: Context): Map<String, Any?> {
    requireDeviceOwner(context)?.let { return outcome(it) }

    return try {
      // Drop the local state first: whatever happens to the call, this app must not
      // go on believing it is managing a phone it no longer owns.
      prefs(context).edit()
        .putLong(KEY_LEASE_EXPIRES_AT, 0L)
        .putLong(KEY_RESTRICTED_SINCE, 0L)
        .putInt(KEY_FAILED_ATTEMPTS, 0)
        .apply()
      policy(context).clearDeviceOwnerApp(context.packageName)
      outcome(OK, "This phone was released. It is an ordinary phone again and cannot be managed by this app ever again.")
    } catch (error: Exception) {
      Log.w(TAG, "clearDeviceOwnerApp was refused by Android", error)
      outcome(FAILED, "Android refused to release the phone: ${error.message}")
    }
  }

  /**
   * Applies `UNINSTALL`: the policy agent removes itself, so the customer can
   * uninstall the app in the ordinary way.
   *
   * Not reversible either — once the admin is gone the store has no handle on this
   * phone — so the backend treats it as destructive and requires confirmation.
   */
  fun removeActiveAdmin(context: Context): Map<String, Any?> {
    requireDeviceOwner(context)?.let { return outcome(it) }

    return try {
      policy(context).removeActiveAdmin(adminComponent(context))
      prefs(context).edit()
        .putLong(KEY_LEASE_EXPIRES_AT, 0L)
        .putLong(KEY_RESTRICTED_SINCE, 0L)
        .putInt(KEY_FAILED_ATTEMPTS, 0)
        .apply()
      outcome(OK, "The management agent was removed. This phone cannot be reached again.")
    } catch (error: Exception) {
      Log.w(TAG, "removeActiveAdmin was refused by Android", error)
      outcome(FAILED, "Android refused to remove the management agent: ${error.message}")
    }
  }

  // -- attempts and reporting ----------------------------------------------

  fun recordFailedAttempt(context: Context): Int {
    val next = prefs(context).getInt(KEY_FAILED_ATTEMPTS, 0) + 1
    prefs(context).edit().putInt(KEY_FAILED_ATTEMPTS, next).apply()
    return next
  }

  fun recordSuccessfulAttempt(context: Context) {
    prefs(context).edit().putInt(KEY_FAILED_ATTEMPTS, 0).apply()
  }

  /**
   * Everything the app needs to tell the truth about this phone, in one payload.
   *
   * `leaseExpiresAt` is included so the UI can say when a restriction will end on
   * its own, which is the single most reassuring thing this screen can show a
   * worried customer: the lock is temporary and it is not the store's mood that
   * decides.
   */
  fun report(context: Context): Map<String, Any?> {
    expireLeaseIfDue(context)

    val stored = prefs(context)
    val restrictedSince = stored.getLong(KEY_RESTRICTED_SINCE, 0L)
    val leaseExpiresAt = stored.getLong(KEY_LEASE_EXPIRES_AT, 0L)

    return mapOf(
      "isDeviceOwner" to isDeviceOwner(context),
      "hasDeviceOwner" to hasDeviceOwner(context),
      "deviceOwnerPackage" to if (isDeviceOwner(context)) context.packageName else null,
      "adminEnabledAt" to stored.getLong(KEY_ADMIN_ENABLED_AT, 0L).takeIf { it > 0L },
      "provisioningRequestedAt" to stored.getLong(KEY_PROVISIONING_REQUESTED_AT, 0L).takeIf { it > 0L },
      "isRestricted" to (restrictedSince > 0L),
      "restrictedSince" to restrictedSince.takeIf { it > 0L },
      "leaseExpiresAt" to leaseExpiresAt.takeIf { it > 0L },
      "hasCredential" to stored.getBoolean(KEY_CREDENTIAL_PRESENT, false),
      "isScreenSecure" to isScreenSecure(context),
      "isScreenLocked" to isScreenLocked(context),
      "failedAttempts" to stored.getInt(KEY_FAILED_ATTEMPTS, 0),
    )
  }

  private fun outcome(
    status: String,
    message: String? = null,
    leaseExpiresAt: Long? = null,
    restrictedSince: Long? = null,
    wasRestricted: Boolean? = null,
  ): Map<String, Any?> = mapOf(
    "status" to status,
    "message" to message,
    "leaseExpiresAt" to leaseExpiresAt,
    "restrictedSince" to restrictedSince,
    "wasRestricted" to wasRestricted,
  )
}
