import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DashboardScreen from '../app/(tabs)/index';
import { lightTheme } from '@/theme/theme';
import type { DashboardSummary } from '@/types/domain';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));

const dashboard: DashboardSummary = {
  customer: {
    id: 'c1',
    fullName: 'Ayesha Rahman',
    email: 'ayesha@example.com',
    phone: null,
    photoUrl: null,
    language: 'en',
    verifiedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  device: {
    id: 'd1',
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

jest.mock('@/hooks/queries', () => ({
  useDashboard: jest.fn(),
}));

const { useDashboard } = require('@/hooks/queries') as { useDashboard: jest.Mock };

async function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

describe('Dashboard screen', () => {
  beforeEach(() => {
    useDashboard.mockReset();
  });

  it('shows the greeting, remaining balance and next installment from the API', async () => {
    useDashboard.mockReturnValue({
      data: dashboard,
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const view = await renderScreen();

    expect(await view.findByText('Assalamu alaikum, Ayesha Rahman')).toBeTruthy();
    expect(view.getByTestId('dashboard-remaining').props.children).toBe('৳18,500');
    expect(view.getByText('৳2,500')).toBeTruthy();
    expect(view.getByText('Samsung Galaxy A15')).toBeTruthy();
  });

  it('labels the device state using the server-provided value', async () => {
    useDashboard.mockReturnValue({
      data: dashboard,
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const view = await renderScreen();

    expect(await view.findByText('PAYMENT DUE')).toBeTruthy();
  });

  it('shows an empty state when no device is linked', async () => {
    useDashboard.mockReturnValue({
      data: { ...dashboard, device: null, plan: null, nextInstallment: null },
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const view = await renderScreen();

    expect(
      await view.findByText('No device is linked to this account yet.'),
    ).toBeTruthy();
  });

  it('shows skeletons while loading', async () => {
    useDashboard.mockReturnValue({
      data: undefined,
      isLoading: true,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const view = await renderScreen();

    await waitFor(() => expect(view.getByText('Srabon Telecom')).toBeTruthy());
  });
});
