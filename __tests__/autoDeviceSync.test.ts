import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useAutoDeviceSync, useLiveSync } from '@/hooks/useAutoDeviceSync';

/**
 * The phone describing itself, and the app keeping itself current.
 *
 * Both were manual: nothing told the server what a handset was until a customer
 * opened the Device tab and pressed a button, and nothing refreshed the app while
 * it was open. The panel was therefore full of `DEMO` rows it had marked as demo
 * precisely because no real phone had ever reported in, and a staff action taken
 * in the panel reached the customer's screen only on a pull-to-refresh.
 */

/** Set per test; the hooks read the stores through these selectors. */
const mockAuthState = { status: 'authenticated' as 'authenticated' | 'unauthenticated', userId: 'auth-1' };
const mockNetState = { online: true };

jest.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      status: mockAuthState.status,
      profile: mockAuthState.userId ? { userId: mockAuthState.userId } : null,
    }),
}));

jest.mock('@/store/networkStore', () => ({
  useNetworkStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ online: mockNetState.online }),
}));

const mockMutateAsync = jest.fn(async () => ({
  deviceState: 'ACTIVE',
  enrollmentStatus: 'NOT_ENROLLED',
  managementStatus: 'UNMANAGED',
  lastSyncedAt: '2026-09-26T00:00:00.000Z',
  serverTime: '2026-09-26T00:00:00.000Z',
  outstandingAmount: 0,
  dueDate: null,
  restrictionReason: null,
  unlockAuthorizedAt: null,
}));

jest.mock('@/hooks/queries', () => ({
  useSyncDevice: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const mockInvalidate = jest.fn();
jest.mock('@/api/queryClient', () => ({
  queryClient: { invalidateQueries: (...args: unknown[]) => mockInvalidate(...args) },
}));

/**
 * `AppState` is spied on rather than the `react-native` module mocked wholesale:
 * spreading `requireActual` over it pulls in `DevMenu`, which does not exist
 * outside a native binary, and every suite that mocks it fails to load.
 */
const mockAppStateListeners: ((state: AppStateStatus) => void)[] = [];
const mockRemove = jest.fn();

beforeEach(() => {
  mockAuthState.status = 'authenticated';
  mockAuthState.userId = 'auth-1';
  mockNetState.online = true;
  mockMutateAsync.mockClear();
  mockInvalidate.mockClear();
  mockAppStateListeners.length = 0;
  mockRemove.mockClear();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, handler) => {
      mockAppStateListeners.push(handler);
      return { remove: mockRemove } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useAutoDeviceSync', () => {
  it('reports the handset as soon as there is a session', async () => {
    await renderHook(() => useAutoDeviceSync());

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  });

  it('reports once per signed-in session, not on every render', async () => {
    const { rerender } = await renderHook(() => useAutoDeviceSync());
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

    await rerender({});
    await rerender({});
    await act(async () => undefined);

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('reports again after a sign-out and a fresh sign-in', async () => {
    const { rerender } = await renderHook(() => useAutoDeviceSync());
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

    mockAuthState.status = 'unauthenticated';
    mockAuthState.userId = '';
    await rerender({});

    mockAuthState.status = 'authenticated';
    mockAuthState.userId = 'auth-2';
    await rerender({});

    // A different phone, a different install: it has never described itself here.
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));
  });

  it('does not attempt a report while offline', async () => {
    mockNetState.online = false;
    await renderHook(() => useAutoDeviceSync());

    await act(async () => undefined);

    // There is nothing to report to, and firing anyway would log a failure for a
    // phone that is behaving correctly.
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('never throws when the report fails', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('network down'));
    await renderHook(() => useAutoDeviceSync());

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    // A failed first attempt must not take the app down or spin a retry loop:
    // the next launch tries again, and "Sync now" is there in between.
    await act(async () => undefined);
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });
});

describe('useLiveSync', () => {
  it('refetches the dashboard and the device when the app comes to the foreground', async () => {
    await renderHook(() => useLiveSync());

    await act(async () => {
      mockAppStateListeners.forEach((listener) => listener('active'));
    });

    const keys = mockInvalidate.mock.calls.map((call) => JSON.stringify(call[0].queryKey));
    expect(keys).toContain(JSON.stringify(['customer', 'dashboard']));
    expect(keys).toContain(JSON.stringify(['device']));
  });

  it('does not poll while signed out', async () => {
    mockAuthState.status = 'unauthenticated';
    await renderHook(() => useLiveSync());

    await act(async () => {
      mockAppStateListeners.forEach((listener) => listener('active'));
    });

    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('does not poll while offline', async () => {
    mockNetState.online = false;
    await renderHook(() => useLiveSync());

    await act(async () => {
      mockAppStateListeners.forEach((listener) => listener('active'));
    });

    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('stops listening when it goes away, so a signed-out app is not a poller', async () => {
    const { unmount } = await renderHook(() => useLiveSync());
    await unmount();

    expect(mockRemove).toHaveBeenCalled();
  });
});
