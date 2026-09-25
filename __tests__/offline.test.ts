import { ApiClient } from '@/api/client';
import { deviceManagementService } from '@/services/deviceManagement';
import { currentNetworkState, useNetworkStore } from '@/store/networkStore';
import * as Network from 'expo-network';

const BASE = 'https://api.test.local/customer';

const jwt = 'supabase-jwt';

describe('offline behaviour', () => {
  afterEach(() => {
    useNetworkStore.getState().setOnline(true);
  });

  it('classifies a network error as offline-safe rather than unauthorized', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const client = new ApiClient({
      baseUrl: BASE,
      getToken: async () => jwt,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => undefined,
    });

    const error = await client.get('/customer/dashboard').catch((e: unknown) => e);

    expect(error).toMatchObject({ kind: 'network' });
    expect((error as { isAuthError: boolean }).isAuthError).toBe(false);
  });

  it('classifies an aborted request as a timeout', async () => {
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (init?.signal?.aborted) {
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }
      return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
    });
    const client = new ApiClient({
      baseUrl: BASE,
      getToken: async () => jwt,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => undefined,
    });

    await expect(client.get('/devices/me', { timeoutMs: 5 })).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('reports the device as offline only when there is no connection', async () => {
    (Network.getNetworkStateAsync as jest.Mock).mockResolvedValueOnce({
      type: 'NONE',
      isConnected: false,
      isInternetReachable: false,
    });

    await expect(currentNetworkState()).resolves.toEqual({ online: false, expensive: false });
  });

  it('never invents device state when the backend is unreachable', async () => {
    const { deviceState } = await deviceManagementService.getSnapshot();
    expect(deviceState).toBeNull();
  });
});

describe('device management capability reporting', () => {
  it('reports NOT_ENROLLED / UNSUPPORTED rather than pretending to be managed', async () => {
    // No native module is linked in the test runtime, which mirrors Expo Go and
    // any consumer device that is not enterprise-provisioned.
    await expect(deviceManagementService.isDeviceManaged()).resolves.toBe(false);
    await expect(deviceManagementService.getManagementStatus()).resolves.toBe('UNSUPPORTED');
    await expect(deviceManagementService.getEnrollmentStatus()).resolves.toBe('UNSUPPORTED');
  });

  it('reads device state only from the server response', () => {
    const state = deviceManagementService.handleServerState({
      deviceState: 'RESTRICTED',
      enrollmentStatus: 'ENROLLED',
      managementStatus: 'MANAGED_BY_ENTERPRISE',
      lastSyncedAt: null,
      serverTime: '2026-01-01T00:00:00.000Z',
      outstandingAmount: 2500,
      dueDate: null,
      restrictionReason: null,
      unlockAuthorizedAt: null,
    });

    expect(state).toBe('RESTRICTED');
  });
});
