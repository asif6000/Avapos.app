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
 * Contract with the Kotlin module in `modules/device-management`.
 *
 * The module is strictly read-only with respect to device state. It reports
 * what Android itself reports and nothing more. There is deliberately no
 * method that locks, wipes, resets, or unlocks a device: those actions require
 * an enterprise device-owner provisioning that a consumer-installed app cannot
 * and must not perform on its own.
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
  requestDeviceAdminEnable(): Promise<{ supported: boolean; enabled: boolean }>;
}

export const DeviceManagementModuleName = 'SrabonDeviceManagement';

export const nativeDeviceManagement: DeviceManagementNativeModule | null =
  requireOptionalNativeModule<DeviceManagementNativeModule>(DeviceManagementModuleName);

/** True when running inside a development build that includes the Kotlin module. */
export function hasNativeDeviceManagement(): boolean {
  return nativeDeviceManagement !== null;
}
