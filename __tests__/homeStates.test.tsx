import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DashboardScreen from '../app/(tabs)/index';
import { ApiError } from '@/api/errors';
import { lightTheme } from '@/theme/theme';
import type { DashboardSummary } from '@/types/domain';

/**
 * The seven states Home owes a customer, each one rendered.
 *
 * The bug this suite exists for: `GET /customer/dashboard` answers 404 on any
 * server that route has not been deployed to, and the screen reported that as
 * "The requested information was not found." — a sentence about the customer's
 * own records, made by a server that had never looked at one. A customer with a
 * perfectly intact account was told their information did not exist.
 *
 * Two rules are asserted throughout, because they are the two ways this can go
 * wrong again:
 *
 *   1. An account with no installment, or no phone, or neither, is never an
 *      error. It renders the screen with an empty state in it.
 *   2. A real backend failure is never hidden, softened, or blamed on the
 *      customer's data.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/hooks/queries', () => ({ useDashboard: jest.fn() }));

/** Mutable, so a test can set "signed in" or "signed out" per case. */
const authState = { status: 'authenticated' as 'authenticated' | 'unauthenticated', userId: 'auth-uuid-1' };

jest.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      status: authState.status,
      profile: authState.userId ? { userId: authState.userId } : null,
      signOut: jest.fn(async () => undefined),
    }),
}));

const { useDashboard } = require('@/hooks/queries') as { useDashboard: jest.Mock };

/** Exactly what `DashboardController` and the mock server assemble. */
const active: DashboardSummary = {
  customer: {
    id: 'CUST-23839',
    fullName: 'Ayesha Rahman',
    email: 'ayesha@example.com',
    phone: null,
    photoUrl: null,
    language: 'en',
    verifiedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  device: {
    id: 'DEV-SAM-A15-098',
    name: 'Samsung Galaxy A15',
    manufacturer: 'Samsung',
    model: 'SM-A155F',
    androidVersion: '14',
    enrollmentStatus: 'ENROLLED',
    managementStatus: 'MANAGED_BY_ENTERPRISE',
    deviceState: 'PAYMENT_DUE',
    lastSyncedAt: '2026-09-20T10:00:00.000Z',
    contractId: 'CTR-1001',
    agreementVersion: '1.0.0',
    agreementAcceptedAt: '2026-01-02T09:00:00.000Z',
    enterpriseManaged: true,
  },
  plan: {
    contractId: 'CTR-1001',
    status: 'OVERDUE',
    totalPrice: 30000,
    downPayment: 5000,
    paidAmount: 11500,
    remainingAmount: 18500,
    installmentAmount: 2500,
    totalInstallments: 10,
    paidInstallments: 3,
    remainingInstallments: 7,
    nextDueDate: '2026-10-10',
    nextInstallmentId: 'inst-4',
    currency: 'BDT',
  },
  nextInstallment: {
    id: 'inst-4',
    contractId: 'CTR-1001',
    number: 4,
    amount: 2500,
    paidAmount: 0,
    status: 'DUE',
    dueDate: '2026-10-10',
    paidAt: null,
  },
  deviceStatus: {
    deviceState: 'PAYMENT_DUE',
    enrollmentStatus: 'ENROLLED',
    managementStatus: 'MANAGED_BY_ENTERPRISE',
    lastSyncedAt: '2026-09-20T10:00:00.000Z',
    serverTime: '2026-09-25T10:00:00.000Z',
    outstandingAmount: 18500,
    dueDate: '2026-10-10',
    restrictionReason: null,
    unlockAuthorizedAt: null,
  },
  unreadNotificationCount: 2,
  openTicketCount: 1,
};

function loading() {
  useDashboard.mockReturnValue({
    data: undefined,
    isLoading: true,
    isRefetching: false,
    error: null,
    refetch: jest.fn(),
  });
}

function loaded(data: DashboardSummary, refetch = jest.fn()) {
  useDashboard.mockReturnValue({
    data,
    isLoading: false,
    isRefetching: false,
    error: null,
    refetch,
  });
}

function failed(error: ApiError, refetch = jest.fn()) {
  useDashboard.mockReturnValue({
    data: undefined,
    isLoading: false,
    isRefetching: false,
    error,
    refetch,
  });
}

async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={lightTheme}>
          <DashboardScreen />
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  useDashboard.mockReset();
  authState.status = 'authenticated';
  authState.userId = 'auth-uuid-1';
});

describe('Home — state 1: loading', () => {
  it('shows the skeleton and the header, not an error', async () => {
    loading();
    const view = await renderScreen();

    expect(await view.findByText('Customer')).toBeTruthy();
    expect(view.queryByTestId('error-retry')).toBeNull();
  });
});

describe('Home — state 2: network / API error', () => {
  it('reports an unreachable server and offers Retry', async () => {
    failed(new ApiError({ kind: 'network', message: 'Unable to reach our servers. Please try again.' }));
    const view = await renderScreen();

    expect(await view.findByText('We could not reach our servers')).toBeTruthy();
    expect(view.getByText('Unable to reach our servers. Please try again.')).toBeTruthy();
    expect(view.getByTestId('error-retry')).toBeTruthy();
  });

  it('does not pretend a dead network means an empty account', async () => {
    failed(new ApiError({ kind: 'network', message: 'Unable to reach our servers. Please try again.' }));
    const view = await renderScreen();
    await view.findByText('We could not reach our servers');

    expect(view.queryByText('No active installment plan.')).toBeNull();
    expect(view.queryByTestId('dashboard-remaining')).toBeNull();
  });

  it('surfaces a 5xx rather than hiding it', async () => {
    // A real backend failure must stay visible. The point of the fix is that a
    // 404 is not *labelled* as the customer's fault, not that failures are hidden.
    failed(
      new ApiError({ kind: 'server', message: 'Our servers are having trouble. Please try again shortly.' }),
    );
    const view = await renderScreen();

    expect(await view.findByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(view.getByText('Our servers are having trouble. Please try again shortly.')).toBeTruthy();
  });
});

describe('Home — state 3: authentication error', () => {
  it('asks the customer to sign in again when there is no live session', async () => {
    authState.status = 'unauthenticated';
    authState.userId = '';
    failed(new ApiError({ kind: 'unauthorized', message: 'Your session has expired. Please sign in again.' }));

    const view = await renderScreen();

    expect(await view.findByText('Please sign in again')).toBeTruthy();
    expect(view.getByTestId('error-sign-out')).toBeTruthy();
  });
});

describe('Home — state 4: customer record not found', () => {
  it('blames the missing link, not the customer, when the session is live', async () => {
    // A 401 against a session Supabase still considers valid can only be the
    // server failing to find the customer behind it — `profiles.auth_uid` is
    // unset until sql/04-link-demo-customer.sql has been run. The old copy said
    // the session had expired, which is a different problem with a different fix.
    failed(new ApiError({ kind: 'unauthorized', message: 'Your session has expired. Please sign in again.' }));

    const view = await renderScreen();

    expect(await view.findByText('We could not find your account')).toBeTruthy();
    expect(
      view.getByText(/no account is linked to this sign-in yet/i),
    ).toBeTruthy();
    // It must not tell a signed-in customer their session expired.
    expect(view.queryByText('Please sign in again')).toBeNull();
  });
});

describe('Home — states 5 and 6: an account with nothing on it yet', () => {
  it('renders the screen for a customer with no installment plan', async () => {
    loaded({
      ...active,
      plan: null,
      nextInstallment: null,
      deviceStatus: null,
    });

    const view = await renderScreen();

    expect(await view.findByText('Assalamu alaikum, Ayesha Rahman')).toBeTruthy();
    expect(view.getByText('No active installment plan.')).toBeTruthy();
    // The greeting and the rest of the screen are still there: this is a real
    // account, not a failure.
    expect(view.getByText('Samsung Galaxy A15')).toBeTruthy();
    expect(view.queryByTestId('error-retry')).toBeNull();
  });

  it('renders the screen for a customer with no device', async () => {
    loaded({
      ...active,
      device: null,
      deviceStatus: null,
    });

    const view = await renderScreen();

    expect(await view.findByText('Assalamu alaikum, Ayesha Rahman')).toBeTruthy();
    // The plan is real, so the money is still shown.
    expect(view.getByTestId('dashboard-remaining').props.children).toBe('৳18,500');
    expect(view.getByText('No device is linked to this account yet.')).toBeTruthy();
    expect(view.queryByTestId('error-retry')).toBeNull();
  });

  it('renders the screen for an account with neither, and never says ৳0', async () => {
    loaded({
      ...active,
      device: null,
      plan: null,
      nextInstallment: null,
      deviceStatus: null,
      unreadNotificationCount: 0,
      openTicketCount: 0,
    });

    const view = await renderScreen();

    expect(await view.findByText('Assalamu alaikum, Ayesha Rahman')).toBeTruthy();
    expect(view.getByText('No active installment plan.')).toBeTruthy();
    // The largest, bluest number on the screen used to read "৳0" here. That is a
    // claim — that a customer with no contract owes nothing on a phone that costs
    // money — and it is the reason a fresh account looked like a finished one.
    expect(view.queryByTestId('dashboard-remaining')).toBeNull();
    expect(view.getByTestId('dashboard-no-plan')).toBeTruthy();
    expect(view.queryByText('৳0')).toBeNull();
    expect(view.queryByTestId('error-retry')).toBeNull();
  });
});

describe('Home — state 7: fully active customer', () => {
  it('shows the greeting, the balance, the next installment and the device', async () => {
    loaded(active);
    const view = await renderScreen();

    expect(await view.findByText('Assalamu alaikum, Ayesha Rahman')).toBeTruthy();
    expect(view.getByTestId('dashboard-remaining').props.children).toBe('৳18,500');
    expect(view.getByTestId('dashboard-next-amount').props.children).toBe('৳2,500');
    expect(view.getByText('Samsung Galaxy A15')).toBeTruthy();
    // The server's own word for the state, not one the app invented.
    expect(view.getByText('Payment due')).toBeTruthy();
  });
});

describe('Home — the reported failure: the dashboard route is not deployed', () => {
  it('never tells the customer their information was not found', async () => {
    // Measured against the live server with a valid session:
    //   GET /customer/dashboard -> 404 {"status":"error","message":"Not Found"}
    // That is the router saying it has no such route. It is a fact about the
    // server, and this is the exact copy the customer used to be shown.
    failed(
      new ApiError({ kind: 'unavailable', status: 404, message: 'This part of your account is not available right now. Please try again shortly.' }),
    );

    const view = await renderScreen();

    expect(await view.findByText('Not available yet')).toBeTruthy();
    expect(view.queryByText('The requested information was not found.')).toBeNull();
    expect(view.queryByText('Something went wrong. Please try again.')).toBeNull();
    // Still an error, with a way out — not silently rendered as an empty account.
    expect(view.getByTestId('error-retry')).toBeTruthy();
    expect(view.getByTestId('error-sign-out')).toBeTruthy();
  });
});

describe('Home — a 200 that is not the view we asked for', () => {
  it('is reported as a service failure, not as a customer who owes nothing', async () => {
    // A proxy error page or a sign-in redirect arrives as 200. Reading `plan` off
    // one of those yields nothing, which would tell a customer with a full
    // schedule that they owe nothing at all.
    useDashboard.mockReturnValue({
      data: { error: 'upstream connect error' },
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const view = await renderScreen();

    expect(await view.findByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(view.queryByText('Assalamu alaikum, Ayesha Rahman')).toBeNull();
  });
});

describe('Home — a failure must not become permanent', () => {
  it('renders the account once a retry succeeds, as after a restart or re-login', async () => {
    const refetch = jest.fn();
    failed(new ApiError({ kind: 'unavailable', status: 404, message: 'nope' }), refetch);

    const view = await renderScreen();
    await view.findByText('Not available yet');

    // A fresh launch, or a sign-out and back in, re-reads the same query.
    loaded(active, refetch);
    const second = await renderScreen();

    expect(await second.findByText('Assalamu alaikum, Ayesha Rahman')).toBeTruthy();
    expect(second.getByTestId('dashboard-remaining').props.children).toBe('৳18,500');
  });
});

describe('Home — development logging', () => {
  it('names the state and every identifier the decision was made from', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      loaded(active);
      await renderScreen();

      await waitFor(() => {
        const line = info.mock.calls.map((call) => String(call[0])).find((l) => l.startsWith('[api][home]'));
        expect(line).toBeDefined();
        // Both keys are printed, because they are two different joins and a
        // session that resolves to no customer is invisible unless both are.
        expect(line).toContain('state=active');
        expect(line).toContain('authUserId=auth-uuid-1');
        expect(line).toContain('customerId=CUST-23839');
        expect(line).toContain('contractId=CTR-1001');
        expect(line).toContain('installmentId=inst-4');
        expect(line).toContain('deviceId=DEV-SAM-A15-098');
      });
    } finally {
      info.mockRestore();
    }
  });

  it('names the failing request and the state it produced', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      failed(new ApiError({ kind: 'unavailable', status: 404, message: 'nope' }));
      await renderScreen();

      await waitFor(() => {
        const line = info.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith('[api][home]'));
        expect(line).toContain('state=service_error');
        expect(line).toContain('error=unavailable');
        expect(line).toContain('status=404');
        expect(line).toContain('authUserId=auth-uuid-1');
        expect(line).toContain('customerId=none');
      });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      warn.mockRestore();
    }
  });
});
