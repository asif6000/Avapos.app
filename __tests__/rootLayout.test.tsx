import { queryClient } from '@/api/queryClient';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootLayout from '../app/_layout';

/**
 * The root layout, rendered.
 *
 * `_layout` is the one file that runs before any screen, so anything wrong in it
 * is not a broken screen — it is an app that does not open. It is also where the
 * device auto-sync and the foreground live-sync were wired, and neither has a
 * test of its own in a rendered tree: `useAutoDeviceSync` was covered in
 * isolation, where nothing else is mounted and nothing else can fail first.
 */

jest.mock('expo-router', () => ({
  Stack: () => null,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
  getPermissionsAsync: async () => ({ status: 'granted' }),
  requestPermissionsAsync: async () => ({ status: 'granted' }),
  setNotificationHandler: jest.fn(),
}));

jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn() }));

const mockAuthState = { status: 'authenticated' as 'authenticated' | 'unauthenticated', userId: 'auth-1' };
jest.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      status: mockAuthState.status,
      profile: mockAuthState.userId ? { userId: mockAuthState.userId } : null,
      signOut: jest.fn(async () => undefined),
      bootstrap: jest.fn(async () => undefined),
    }),
}));

const mockSetOnline = jest.fn();
jest.mock('@/store/networkStore', () => ({
  useNetworkStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ online: true }),
  startNetworkWatcher: () => jest.fn(),
  subscribeToNetwork: () => jest.fn(),
  currentNetworkState: async () => ({ online: true, expensive: false }),
  setOnline: mockSetOnline,
}));

const mockMutateAsync = jest.fn(async () => null);
jest.mock('@/hooks/queries', () => ({
  useSyncDevice: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useDashboard: () => ({ data: undefined, isLoading: false, isRefetching: false, error: null, refetch: jest.fn() }),
}));

/**
 * Spied rather than mocked: `_layout` passes this exact object to
 * `QueryClientProvider`, and a stand-in with only `invalidateQueries` on it is not
 * a client — `client.mount is not a function`, which is a test bug that looks
 * exactly like an app that will not boot.
 */
const mockInvalidate = jest.fn();

beforeEach(() => {
  mockAuthState.status = 'authenticated';
  mockAuthState.userId = 'auth-1';
  mockMutateAsync.mockClear();
  mockInvalidate.mockClear();
  jest.spyOn(queryClient, 'invalidateQueries').mockImplementation(mockInvalidate as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('mounts the root layout without throwing', async () => {
  const tree = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      }}
    >
      <PaperProvider>
        <RootLayout />
      </PaperProvider>
    </SafeAreaProvider>,
  );

  // A throw during mount is what "the app does not open" looks like from inside.
  await waitFor(() => expect(tree.toJSON()).toBeTruthy());
});

it('reports the handset once on a signed-in launch, and survives the report failing', async () => {
  mockMutateAsync.mockRejectedValue(new Error('no route'));

  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      }}
    >
      <PaperProvider>
        <RootLayout />
      </PaperProvider>
    </SafeAreaProvider>,
  );

  // The layout must not take the app down with it if the report cannot be sent —
  // a store demo on a bad network must still open.
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
});

it('mounts while signed out, before any session exists', async () => {
  mockAuthState.status = 'unauthenticated';
  mockAuthState.userId = '';

  const tree = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      }}
    >
      <PaperProvider>
        <RootLayout />
      </PaperProvider>
    </SafeAreaProvider>,
  );

  await waitFor(() => expect(tree.toJSON()).toBeTruthy());
  // No report may be sent for a session that does not exist.
  expect(mockMutateAsync).not.toHaveBeenCalled();
});
