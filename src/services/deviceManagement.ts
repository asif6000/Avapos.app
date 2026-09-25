import * as Application from 'expo-application';
import * as Device from 'expo-device';

import { endpoints } from '@/api/endpoints';
import {
  hasNativeDeviceManagement,
  nativeDeviceManagement,
  type NativeEnrollmentStatus,
  type NativeManagementStatus,
} from '@/native/deviceManagement';
import type { DeviceState, DeviceStatus, EnrollmentStatus, ManagementStatus } from '@/types/domain';

export interface DeviceIdentity {
  appId: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  /** Non-sensitive install identity used to match this phone to its contract. */
  androidId: string;
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
 * Owns every question about the local device's management capability. Two
 * rules are enforced here:
 *
 * 1. Local inspection may only ever report capability. It can never grant,
 *    restrict, unlock or wipe anything.
 * 2. `deviceState` is whatever the backend last reported. A stale or missing
 *    server value is surfaced as `null`, never guessed.
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

  async syncDeviceStatus(): Promise<DeviceStatus | null> {
    try {
      return await endpoints.device.sync();
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
    await endpoints.device.enroll(input);
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
}

export const deviceManagementService = new DeviceManagementServiceImpl();

export type { DeviceManagementServiceImpl };
