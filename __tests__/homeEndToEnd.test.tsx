import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DashboardScreen from '../app/(tabs)/index';
import { lightTheme } from '@/theme/theme';

/**
 * Home, end to end, over the real client.
 *
 * The other Home suites mock `useDashboard`, which is exactly why the reported bug
 * survived all of them: the message the customer saw was produced by
 * `ApiClient.buildHttpError` from a real 404 body, three layers below the mock,
 * and every test above it asserted a hand-written `ApiError` instead. A test that
 * constructs its own error cannot catch an error constructed wrongly.
 *
 * So nothing here mocks the client, the error classification, the state machine
 * or the screen. Only two things are stubbed, and both are outside the app's
 * logic: the network, and the session.
 *
 * The 404 body below is copied byte for byte from the live server:
 *
 *   GET https://srabontelecom.paymently.io/customer/dashboard
 *   → 404  {"status":"error","message":"Not Found"}
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));

/** The bearer the real client would send. Never a real credential. */
jest.mock('@/supabase/auth', () => ({
  getAccessToken: async () => 'supabase-jwt',
  getSession: async () => ({
    userId: 'auth-uuid-1',
    email: 'asifghe78@gmail.com',
    accessToken: 'supabase-jwt',
  }),
}));

jest.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      status: 'authenticated',
      profile: { userId: 'auth-uuid-1' },
      signOut: jest.fn(async () => undefined),
    }),
}));

/** The real `useDashboard` this time, and with it the real `ApiClient`. */
function respondWith(status: number, body: unknown) {
  (globalThis.fetch as jest.Mock).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
}

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

async function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
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

describe('Home against the real API client', () => {
  it('does not blame the customer for a 404 the server could not route', async () => {
    respondWith(404, { status: 'error', message: 'Not Found' });

    const view = await renderScreen();

    // The sentence in the bug report. If this ever comes back, the classification
    // has regressed, and it will be the live server that says so.
    await waitFor(() => expect(view.queryByText('The requested information was not found.')).toBeNull());
    expect(view.queryByText('Something went wrong. Please try again.')).toBeNull();

    expect(view.getByText('Not available yet')).toBeTruthy();
    expect(
      view.getByText(/This part of your account is not available on our service at the moment/),
    ).toBeTruthy();
    // Still an error with a way out, never a silently empty account.
    expect(view.getByTestId('error-retry')).toBeTruthy();
    expect(view.getByTestId('error-sign-out')).toBeTruthy();
  });

  it('requests exactly the one endpoint the contract names', async () => {
    respondWith(404, { status: 'error', message: 'Not Found' });
    await renderScreen();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/customer\/dashboard$/);
    // The screen is not allowed to compensate with a second read.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer supabase-jwt');
  });

  it('still says a record was not found when the server names one', async () => {
    respondWith(404, { message: 'No such contract for this customer.' });

    const view = await renderScreen();

    expect(await view.findByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(view.getByText('The requested information was not found.')).toBeTruthy();
  });

  it('renders the account the server assembled', async () => {
    respondWith(200, {
      customer: {
        id: 'CUST-23839',
        fullName: 'Asif Hossain',
        email: 'asifghe78@gmail.com',
        phone: null,
        photoUrl: null,
        language: 'en',
        verifiedAt: null,
        createdAt: '2026-01-04T09:12:00.000Z',
      },
      device: {
        id: 'DEV-SAM-A15-098',
        name: 'Samsung Galaxy A15 5G',
        manufacturer: 'Samsung',
        model: 'Galaxy A15 5G',
        androidVersion: '14',
        enrollmentStatus: 'ENROLLED',
        managementStatus: 'FULLY_MANAGED',
        deviceState: 'ACTIVE',
        lastSyncedAt: '2026-09-25T09:00:00.000Z',
        contractId: 'CONTRACT-BD-2026-902',
        agreementVersion: '1.0.0',
        agreementAcceptedAt: null,
        enterpriseManaged: true,
      },
      plan: {
        contractId: 'CONTRACT-BD-2026-902',
        status: 'OVERDUE',
        totalPrice: 13500,
        downPayment: 5000,
        paidAmount: 7150,
        remainingAmount: 6350,
        installmentAmount: 2500,
        totalInstallments: 5,
        paidInstallments: 2,
        remainingInstallments: 3,
        nextDueDate: '2026-07-04',
        nextInstallmentId: 'inst-CUST-23839-3',
        currency: 'BDT',
      },
      nextInstallment: {
        id: 'inst-CUST-23839-3',
        contractId: 'CONTRACT-BD-2026-902',
        number: 3,
        amount: 2500,
        paidAmount: 1150,
        status: 'DUE',
        dueDate: '2026-07-04',
        paidAt: null,
      },
      deviceStatus: null,
      unreadNotificationCount: 1,
      openTicketCount: 1,
    });

    const view = await renderScreen();

    expect(await view.findByText('Assalamu alaikum, Asif Hossain')).toBeTruthy();
    expect(view.getByTestId('dashboard-remaining').props.children).toBe('৳6,350');
    expect(view.getByTestId('dashboard-next-amount').props.children).toBe('৳2,500');
    expect(view.getByText('Samsung Galaxy A15 5G')).toBeTruthy();
  });

  it('shows an empty account as a screen, not an error', async () => {
    // What the mock answers for a customer created moments ago, and what the
    // deployed `DashboardController` answers for one with no schedule and no
    // phone: a 200 with nulls. It is the case the brief called out by name.
    respondWith(200, {
      customer: {
        id: 'CUST-74139',
        fullName: 'Tanvir Ahmed',
        email: 'tanvir@example.com',
        phone: null,
        photoUrl: null,
        language: 'en',
        verifiedAt: null,
        createdAt: '2026-03-02T14:45:00.000Z',
      },
      device: null,
      plan: null,
      nextInstallment: null,
      deviceStatus: null,
      unreadNotificationCount: 0,
      openTicketCount: 0,
    });

    const view = await renderScreen();

    expect(await view.findByText('Assalamu alaikum, Tanvir Ahmed')).toBeTruthy();
    expect(view.getByText('No active installment plan.')).toBeTruthy();
    expect(view.getByText('No device is linked to this account yet.')).toBeTruthy();
    expect(view.queryByTestId('error-retry')).toBeNull();
    expect(view.queryByTestId('error-sign-out')).toBeNull();
    // And never a balance of zero, which is a claim about money.
    expect(view.queryByText('৳0')).toBeNull();
  });

  it('reports a network failure without inventing an account', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

    const view = await renderScreen();

    // A dead network is retried by the client itself — two attempts, 500ms then
    // 1000ms of backoff — so this is a slow answer by design, not a hang.
    expect(
      await view.findByText('We could not reach our servers', undefined, {
        timeout: 5_000,
      }),
    ).toBeTruthy();
    expect(view.getByText('Unable to reach our servers. Please try again.')).toBeTruthy();
    expect(view.queryByText('No active installment plan.')).toBeNull();
  });
});
