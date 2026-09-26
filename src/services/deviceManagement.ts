import * as Application from 'expo-application';
import * as Device from 'expo-device';

import { endpoints } from '@/api/endpoints';
import {
  hasEnforcementCapability,
  hasNativeDeviceManagement,
  nativeDeviceManagement,
  nativeDevicePolicy,
  type NativeEnrollmentStatus,
  type NativeManagementStatus,
} from '@/native/deviceManagement';
import { deviceCheckIn, type CheckInResult } from '@/services/deviceCheckIn';
import type {
  DeviceReport,
  DeviceState,
  DeviceStatus,
  EnrollmentStatus,
  ManagementStatus,
} from '@/types/domain';

export interface DeviceIdentity {
  appId: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  /** Non-sensitive install identity used to match this phone to its contract. */
  androidId: string;
  /** Android's API level. Part of "which Android", and not a separate secret. */
  sdkInt: number | null;
}

export interface DeviceManagementSnapshot {
  identity: DeviceIdentity;
  nativeAvailable: boolean;
  managed: boolean;
  managementStatus: ManagementStatus;
  enrollmentStatus: EnrollmentStatus;
  /** Always server-provided. Never derived on the device. */
  deviceState: DeviceState | null;
  lastSyncedAt: string | null;
  serverTime: string | null;
}

const UNSUPPORTED: DeviceManagementSnapshot['managementStatus'] = 'UNSUPPORTED';

/**
 * DeviceManagementService
 *
 * Owns every question about the local device's management capability. Three rules
 * are enforced here:
 *
 * 1. Local inspection may only ever report capability. Granting, restricting and
 *    releasing are in `deviceCheckIn`, behind a device-owner guard, and only ever on
 *    a command the server issued.
 * 2. `deviceState` is whatever the backend last reported. A stale or missing
 *    server value is surfaced as `null`, never guessed.
 * 3. Capability is never overstated. {@link canEnforce} needs the module *and* the
 *    device-owner status, and anything less reports `false`.
 */
class DeviceManagementServiceImpl {
  async getIdentity(): Promise<DeviceIdentity> {
    if (nativeDeviceManagement) {
      try {
        const identifiers = await nativeDeviceManagement.getDeviceIdentifiers();
        return {
          appId: Application.applicationId ?? 'unknown',
          manufacturer: identifiers.manufacturer || Device.manufacturer || 'Unknown',
          model: identifiers.model || Device.modelName || 'Unknown',
          androidVersion:
            identifiers.androidVersion || String(Device.osVersion ?? 'unknown'),
          androidId: identifiers.androidId,
          sdkInt: typeof identifiers.sdkInt === 'number' ? identifiers.sdkInt : null,
        };
      } catch {
        // fall through to the JavaScript path
      }
    }
    return {
      appId: Application.applicationId ?? 'unknown',
      manufacturer: Device.manufacturer ?? 'Unknown',
      model: Device.modelName ?? 'Unknown',
      androidVersion: String(Device.osVersion ?? 'unknown'),
      androidId: '',
      // Without the native module there is no API level to report, and guessing one
      // from a version string would be inventing a fact about the phone.
      sdkInt: null,
    };
  }

  /**
   * Whether Android reports this app as a device owner / profile owner. On a
   * retail phone this is always false, and that is a legitimate answer.
   */
  async isDeviceManaged(): Promise<boolean> {
    if (!nativeDeviceManagement) return false;
    try {
      return await nativeDeviceManagement.isDeviceManaged();
    } catch {
      return false;
    }
  }

  async getManagementStatus(): Promise<ManagementStatus> {
    if (!nativeDeviceManagement) return UNSUPPORTED;
    try {
      const status: NativeManagementStatus = await nativeDeviceManagement.getManagementStatus();
      return status;
    } catch {
      return UNSUPPORTED;
    }
  }

  async getEnrollmentStatus(): Promise<EnrollmentStatus> {
    if (!nativeDeviceManagement) return 'UNSUPPORTED';
    try {
      const status: NativeEnrollmentStatus = await nativeDeviceManagement.getEnrollmentStatus();
      return status;
    } catch {
      return 'UNSUPPORTED';
    }
  }

  /** The authoritative state always comes from the backend. */
  async getDeviceState(): Promise<DeviceState | null> {
    try {
      const status = await endpoints.device.status();
      return status.deviceState;
    } catch {
      return null;
    }
  }

  /**
   * Tells the server what this phone is and what Android says about it.
   *
   * This is the only path by which the handset's real model, Android version and
   * identifier reach the backend, and it is the reason an operator looking at a
   * device is looking at *a phone* rather than a row somebody typed. The report
   * grants nothing: the server revalidates the contract and answers second, so a
   * phone is never the thing that grades itself.
   *
   * It always returns a report. When the native module is missing — Expo Go, or a
   * device where Android would not answer — the unknown fields say so, because a
   * phone that could not describe itself is worth more in the record than a phone
   * that was never asked.
   */
  async reportSelf(): Promise<DeviceReport> {
    const [identity, managed, managementStatus, enrollmentStatus] = await Promise.all([
      this.getIdentity(),
      this.isDeviceManaged(),
      this.getManagementStatus(),
      this.getEnrollmentStatus(),
    ]);

    return {
      androidId: identity.androidId,
      manufacturer: identity.manufacturer,
      model: identity.model,
      androidVersion: identity.androidVersion,
      sdkInt: identity.sdkInt,
      managed,
      managementStatus,
      enrollmentStatus,
    };
  }

  async syncDeviceStatus(): Promise<DeviceStatus | null> {
    try {
      return await endpoints.device.sync(await this.reportSelf());
    } catch {
      return null;
    }
  }

  /**
   * Enrollment is a two-part operation: the server records the signed agreement,
   * then Android enrollment is attempted. On a consumer device the Android half
   * is unavailable and we report that honestly rather than pretending.
   */
  async requestEnrollment(input: {
    agreementVersion: string;
    signatureName: string;
    acceptedAt: string;
  }): Promise<{ deviceState: DeviceState | null; nativeOutcome: EnrollmentStatus }> {
    // The report goes with the agreement, so the phone that was consented on is
    // the phone the server knows about from the first request onwards.
    await endpoints.device.enroll({ ...input, report: await this.reportSelf() });
    const nativeOutcome = await this.getEnrollmentStatus();
    const status = await endpoints.device.status().catch(() => null);
    return { deviceState: status?.deviceState ?? null, nativeOutcome };
  }

  /**
   * Applies a server status payload to the UI model. The payload is the only
   * input; nothing is inferred from local state or from a notification body.
   */
  handleServerState(status: DeviceStatus): DeviceManagementSnapshot['deviceState'] {
    return status.deviceState;
  }

  async getSnapshot(): Promise<DeviceManagementSnapshot> {
    const [identity, managed, managementStatus, enrollmentStatus] = await Promise.all([
      this.getIdentity(),
      this.isDeviceManaged(),
      this.getManagementStatus(),
      this.getEnrollmentStatus(),
    ]);

    let status: DeviceStatus | null = null;
    try {
      status = await endpoints.device.status();
    } catch {
      status = null;
    }

    return {
      identity,
      nativeAvailable: hasNativeDeviceManagement(),
      managed,
      managementStatus,
      enrollmentStatus,
      deviceState: status?.deviceState ?? null,
      lastSyncedAt: status?.lastSyncedAt ?? null,
      serverTime: status?.serverTime ?? null,
    };
  }

  /**
   * Whether this build can actually enforce anything on this phone.
   *
   * Both things have to be true: the policy module has to be in the build, and
   * Android has to say this app is the device owner. A development build on a retail
   * phone has the first and not the second, and that combination has to report
   * `false` — otherwise a screen would promise a restriction the phone is not
   * actually under, which is the one thing this feature must never do.
   */
  async canEnforce(): Promise<boolean> {
    if (!hasEnforcementCapability()) return false;
    try {
      return await nativeDevicePolicy!.isDeviceOwner();
    } catch {
      return false;
    }
  }

  /**
   * Runs one check-in: release an expired authorisation, then apply whatever the
   * server has asked of this phone and report what happened.
   *
   * Thin on purpose. All of the judgement is in {@link deviceCheckIn}, and this exists
   * so the screens have one call to make and one shape to render.
   */
  async checkIn(): Promise<CheckInResult> {
    return deviceCheckIn.run();
  }
}

export const deviceManagementService = new DeviceManagementServiceImpl();

export type { DeviceManagementServiceImpl };
