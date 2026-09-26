import { requireOptionalNativeModule } from 'expo-modules-core';

export type NativeEnrollmentStatus =
  | 'NOT_ENROLLED'
  | 'PENDING'
  | 'ENROLLED'
  | 'ENROLLMENT_FAILED'
  | 'UNSUPPORTED';

export type NativeManagementStatus =
  | 'UNSUPPORTED'
  | 'NOT_ENROLLED'
  | 'ENROLLED'
  | 'MANAGED_BY_ENTERPRISE';

/**
 * Contract with the Kotlin modules in `modules/srabon-device-management`.
 *
 * Two modules, split on purpose:
 *
 * - `SrabonDeviceManagement` is a **reader**. It reports what Android reports and has
 *   no mutators, so reading it top to bottom answers "what can this app learn about
 *   a customer?" — which is: what Android already shows any app.
 * - `SrabonDevicePolicy` is the **agent**. It is the only thing that can change what
 *   the phone is, every call in it is refused unless Android says this app is the
 *   device owner, and there is deliberately no `wipe` in it at any level.
 *
 * The split exists because merging the two is how a status reporter quietly grows a
 * `wipeData`.
 *
 * Both are absent in Expo Go, which is why every caller treats `null` as
 * `UNSUPPORTED` rather than as an error.
 */
export interface DeviceManagementNativeModule {
  /** True only when Android reports this app as device owner or profile owner. */
  isDeviceManaged(): Promise<boolean>;
  isDeviceOwner(): Promise<boolean>;
  getDeviceOwnerPackage(): Promise<string | null>;
  getManagementStatus(): Promise<NativeManagementStatus>;
  getEnrollmentStatus(): Promise<NativeEnrollmentStatus>;
  getDeviceIdentifiers(): Promise<{
    androidId: string;
    manufacturer: string;
    model: string;
    androidVersion: string;
    sdkInt: number;
    securityPatch: string | null;
  }>;
  /** True when a system-enrolled device owner from an enterprise DPC exists. */
  hasActiveProfileOwner(): Promise<boolean>;
  /**
   * Whether a device admin is registered. Reports state; never opens a system dialog
   * to obtain one, because a customer must not be able to hand the app this much
   * power by tapping through a screen that looks like it belongs to the app.
   */
  requestDeviceAdminEnable(): Promise<{ supported: boolean; enabled: boolean }>;
}

/** What one policy call reports back. `status` is what the server is told. */
export type PolicyOutcomeStatus = 'OK' | 'NOT_DEVICE_OWNER' | 'FAILED' | 'NO_LEASE';

export interface PolicyOutcome {
  status: PolicyOutcomeStatus;
  message: string | null;
  /** Epoch millis the current lock authorisation runs until, when there is one. */
  leaseExpiresAt: number | null;
  /** Epoch millis the current restriction started, when there is one. */
  restrictedSince: number | null;
  /** Whether a restriction was actually lifted, for `UNLOCK`. */
  wasRestricted: boolean | null;
}

export interface DevicePolicyReport {
  isDeviceOwner: boolean;
  hasDeviceOwner: boolean;
  deviceOwnerPackage: string | null;
  adminEnabledAt: number | null;
  provisioningRequestedAt: number | null;
  isRestricted: boolean;
  restrictedSince: number | null;
  /**
   * When the current lock authorisation runs out. The phone unlocks itself at this
   * moment with no server involved, which is the bound on how long anybody can be
   * restricted by this system.
   */
  leaseExpiresAt: number | null;
  hasCredential: boolean;
  /**
   * Whether the phone already had a screen lock of its own. Read-only: this app will
   * not replace a customer's existing PIN, pattern or biometric lock, so a `true`
   * here means the restriction can use it and must leave it alone.
   */
  isScreenSecure: boolean;
  isScreenLocked: boolean;
  failedAttempts: number;
}

export interface DevicePolicyNativeModule {
  /** Whether this app may act at all. Read before showing any restriction screen. */
  isDeviceOwner(): Promise<boolean>;
  report(): Promise<DevicePolicyReport>;
  /** Releases an expired authorisation with no server reachable. Safe to call always. */
  expireLeaseIfDue(): Promise<boolean>;
  /** LOCK. `leaseExpiresAt` is epoch millis and must be in the future. */
  applyLock(leaseExpiresAt: number): Promise<PolicyOutcome>;
  /** UNLOCK. */
  releaseLock(): Promise<PolicyOutcome>;
  /** The customer's own screen PIN. Never a value a server supplied. */
  setCustomerCredential(pin: string): Promise<PolicyOutcome>;
  /** Server-authorised only — never self-service from the app. */
  clearCustomerCredential(): Promise<PolicyOutcome>;
  /** RELEASE. Gives up device-owner status, permanently. */
  clearDeviceOwner(): Promise<PolicyOutcome>;
  /** UNINSTALL. Removes the agent so the app can be uninstalled normally. */
  removeActiveAdmin(): Promise<PolicyOutcome>;
}

export const DeviceManagementModuleName = 'SrabonDeviceManagement';
export const DevicePolicyModuleName = 'SrabonDevicePolicy';

export const nativeDeviceManagement: DeviceManagementNativeModule | null =
  requireOptionalNativeModule<DeviceManagementNativeModule>(DeviceManagementModuleName);

export const nativeDevicePolicy: DevicePolicyNativeModule | null =
  requireOptionalNativeModule<DevicePolicyNativeModule>(DevicePolicyModuleName);

/** True when running inside a development build that includes the Kotlin modules. */
export function hasNativeDeviceManagement(): boolean {
  return nativeDeviceManagement !== null;
}

/**
 * True when this build can actually enforce anything.
 *
 * Both the module and the device-owner status are required. A development build on a
 * retail phone has the module and not the status, and that combination must report
 * `false` here — otherwise a screen would promise a restriction the phone is not
 * actually under.
 */
export function hasEnforcementCapability(): boolean {
  return nativeDevicePolicy !== null;
}
