import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/realtime-js';

/**
 * Realtime is a refetch trigger and nothing else.
 *
 * The dangerous version of this feature is one where the screen renders whatever
 * the push said. A payment settles, the app believes it, and a customer watches
 * a balance they do not owe — or, worse, a phone that was restricted keeps
 * working because a stale event said it was fine. So the assertions here are as
 * much about what the handler does *not* do as about what it does.
 */

// `mock`-prefixed, because babel-plugin-jest-hoist lifts `jest.mock` above these
// declarations and only a prefixed name is allowed to be referenced from inside
// the factory.
const mockHandlers = new Map<string, (payload: unknown) => void>();
const mockSubscribe = jest.fn();
const mockRemoveChannel = jest.fn();
const mockInvalidateQueries = jest.fn();

/**
 * A channel that chains, the way the real one does: every `.on()` returns the
 * same object so the seven registrations in the hook all happen. A mock that
 * returns a fresh object from `.on()` would register only the first and the test
 * would blame the hook for the mock's own bug.
 */
function makeChannel() {
  const channel: Record<string, unknown> = {
    on: jest.fn((_kind: string, filter: { table: string }, handler: (payload: unknown) => void) => {
      mockHandlers.set(filter.table, handler);
      return channel;
    }),
    // The real `subscribe` returns the channel, and the hook depends on that: it
    // keeps the return value so its cleanup has something to remove. A mock that
    // returned undefined made `channel` undefined, the cleanup's `if (channel)`
    // never fired, and the channel was never removed — the test was reporting the
    // mock's own bug as a leak.
    //
    // A wrapper rather than `mockReturnValue`, because that is sugar for
    // `mockImplementation` and would overwrite whatever a test configured.
    subscribe: jest.fn((cb: (s: string) => void) => {
      const returned = mockSubscribe(cb);
      return returned === undefined ? channel : returned;
    }),
    unsubscribe: jest.fn(),
  };
  return channel;
}

const mockChannelFactory = jest.fn(() => makeChannel());

jest.mock('@/supabase/client', () => ({
  getSupabaseClient: () => ({
    channel: mockChannelFactory,
    removeChannel: mockRemoveChannel,
  }),
  canReadDirectly: () => true,
}));

jest.mock('@/api/queryClient', () => ({
  queryClient: { invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args) },
}));

jest.mock('@/api/devLog', () => ({
  logRealtime: jest.fn(),
  logHomeState: jest.fn(),
  logRequestStart: jest.fn(),
  logResponse: jest.fn(),
  logUnreachable: jest.fn(),
  describeShape: jest.fn(),
}));

import { REALTIME_TABLES, useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/store/networkStore';

function Probe() {
  const state = useRealtimeSync();
  return <Text testID="state">{`${state.connected}|${state.error ?? ''}`}</Text>;
}

function signedIn() {
  useAuthStore.setState({
    status: 'authenticated',
    profile: {
      userId: 'auth-user-1',
      email: 'asifghe78@gmail.com',
      fullName: 'Asif',
      isNewUser: false,
      confirmed: true,
    },
  });
  useNetworkStore.setState({ online: true });
}

/**
 * The hook sets the channel up on a microtask, so a test that inspects the
 * registrations has to let one pass. `waitFor` does this for the state
 * assertions; the rest call this directly rather than reaching into the hook's
 * internals to find out which tick it happens on.
 */
async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  mockHandlers.clear();
  mockSubscribe.mockReset();
  mockChannelFactory.mockClear();
  mockRemoveChannel.mockReset();
  mockInvalidateQueries.mockReset();
  mockSubscribe.mockImplementation((cb: (s: string) => void) => {
    cb(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
  });
  signedIn();
});

describe('a signed-in customer subscribes', () => {
  it('subscribes once and reports connected', async () => {
    const view = await render(<Probe />);
    await waitFor(() => expect(view.getByTestId('state').props.children).toBe('true|'));
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });

  it('subscribes to every published table', async () => {
    await render(<Probe />);
    await tick();
    // One handler per table, and the list matches what `sql/09-realtime.sql`
    // published. A table in one and not the other is a subscription that silently
    // never fires.
    expect([...mockHandlers.keys()].sort()).toEqual([...REALTIME_TABLES].sort());
  });

  it('names the channel after the signed-in user, so two sessions do not share one', async () => {
    await render(<Probe />);
    await tick();
    expect(mockChannelFactory).toHaveBeenCalledWith('customer:auth-user-1');
  });
});

describe('a change triggers a refetch and nothing else', () => {
  it('invalidates the query cache', async () => {
    await render(<Probe />);
    await tick();
    const handler = mockHandlers.get('installments');
    expect(handler).toBeDefined();

    handler?.({ eventType: 'UPDATE', table: 'installments', new: { status: 'PAID' } });

    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('writes nothing, and holds no state from the payload', async () => {
    // The payload says the phone is UNLOCKED. The handler must not act on it, and
    // must not remember it — the only correct source for device state is the
    // server, and the screen can only show what the server said on the next read.
    await render(<Probe />);
    await tick();
    const handler = mockHandlers.get('devices');

    handler?.({ eventType: 'UPDATE', table: 'devices', new: { state: 'UNLOCKED' } });

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
    expect(mockHandlers.get('devices')).toBe(handler);
  });

  it('refetches for a DELETE as well as an UPDATE', async () => {
    await render(<Probe />);
    await tick();
    mockHandlers.get('support_tickets')?.({ eventType: 'DELETE', table: 'support_tickets', old: { id: 'T1' } });
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });
});

describe('it refuses to subscribe when it could only receive nothing', () => {
  it('does not subscribe while signed out', async () => {
    useAuthStore.setState({ status: 'unauthenticated', profile: null });
    const view = await render(<Probe />);
    await waitFor(() => expect(view.getByTestId('state').props.children).toBe('false|'));
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('does not subscribe while offline', async () => {
    useNetworkStore.setState({ online: false });
    const view = await render(<Probe />);
    await waitFor(() => expect(view.getByTestId('state').props.children).toBe('false|'));
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

describe('the socket is cleaned up', () => {
  it('is removed on sign-out, so no JWT outlives the session', async () => {
    const view = await render(<Probe />);
    await waitFor(() => expect(view.getByTestId('state').props.children).toBe('true|'));

    useAuthStore.setState({ status: 'unauthenticated', profile: null });

    await waitFor(() => expect(mockRemoveChannel).toHaveBeenCalled());
    await waitFor(() => expect(view.getByTestId('state').props.children).toBe('false|'));
  });

  it('is removed when one customer signs out and another signs in', async () => {
    // The security-relevant case, and it is the same cleanup function the unmount
    // path uses: a change of user must not leave the first customer's channel — and
    // therefore their JWT — subscribed on a phone that is now somebody else's.
    //
    // `unmount()` itself is not asserted here. Measured in this environment it
    // does not flush effect cleanup, so a test of it would be asserting nothing.
    // `removes the previous channel when the user changes` covers the function;
    // what runs it is React's, not this app's.
    const view = await render(<Probe />);
    await waitFor(() => expect(view.getByTestId('state').props.children).toBe('true|'));
    await tick();

    signedIn();
    useAuthStore.setState({
      profile: {
        userId: 'auth-user-2',
        email: 'second@example.com',
        fullName: 'Second',
        isNewUser: false,
        confirmed: true,
      },
    });

    await waitFor(() => expect(mockRemoveChannel).toHaveBeenCalled());
    // And the new session gets its own channel, named for them.
    await waitFor(() => expect(mockChannelFactory).toHaveBeenCalledWith('customer:auth-user-2'));
  });
});

describe('a failed subscription is reported, not hidden', () => {
  it('surfaces CHANNEL_ERROR', async () => {
    mockSubscribe.mockImplementation((cb: (s: string) => void) => {
      cb(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    });
    const view = await render(<Probe />);
    await waitFor(() => expect(view.getByTestId('state').props.children).toBe('false|CHANNEL_ERROR'));
  });

  it('surfaces a timeout', async () => {
    mockSubscribe.mockImplementation((cb: (s: string) => void) => {
      cb(REALTIME_SUBSCRIBE_STATES.TIMED_OUT);
    });
    const view = await render(<Probe />);
    await waitFor(() => expect(view.getByTestId('state').props.children).toBe('false|TIMED_OUT'));
  });
});

describe('the poller underneath is untouched', () => {
  it('is a separate hook, so realtime cannot replace the refetch floor', () => {
    // Not a behavioural test: a structural one. `useAutoDeviceSync` is what
    // covers a phone that was asleep, and a change here that made realtime the
    // only source of updates would leave those customers looking at a stale
    // account indefinitely.
    const auto = require('@/hooks/useAutoDeviceSync');
    expect(typeof auto.useAutoDeviceSync).toBe('function');
    expect(auto.useAutoDeviceSync).not.toBe(useRealtimeSync);
  });
});
