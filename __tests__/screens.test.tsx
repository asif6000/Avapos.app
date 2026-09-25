import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DeviceScreen from '../app/(tabs)/device';
import InstallmentsScreen from '../app/(tabs)/installments';
import NotificationsScreen from '../app/notifications/index';
import PaymentsScreen from '../app/(tabs)/payments';
import SupportScreen from '../app/(tabs)/support';
import { lightTheme } from '@/theme/theme';

/**
 * Every list screen, rendered.
 *
 * A refactor that renames an import or drops a style does not fail the type
 * checker — it fails when a customer opens the tab. Rendering each of them with
 * realistic data is the cheapest place to catch that.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/hooks/queries', () => ({
  useDashboard: jest.fn(),
  useInstallmentPlan: jest.fn(),
  usePayments: jest.fn(),
  useTickets: jest.fn(),
  useDevice: jest.fn(),
  useDeviceStatus: jest.fn(),
  useSyncDevice: jest.fn(),
  useMarkAllNotificationsRead: jest.fn(),
}));

jest.mock('@/hooks/useDataSources', () => ({
  useInstallmentSource: () => ({
    data: [
      {
        id: 'inst-1',
        contractId: 'CTR-1',
        number: 1,
        amount: 2500,
        paidAmount: 2500,
        status: 'PAID',
        dueDate: '2026-08-10',
        paidAt: '2026-08-10',
      },
      {
        id: 'inst-2',
        contractId: 'CTR-1',
        number: 2,
        amount: 2500,
        paidAmount: 0,
        status: 'DUE',
        dueDate: '2026-10-10',
        paidAt: null,
      },
    ],
    isLoading: false,
    refetch: jest.fn(),
  }),
  useNotificationSource: () => ({ data: [], isLoading: false, refetch: jest.fn(), error: null }),
}));

// The hooks are replaced wholesale below, so the mocks are deliberately loose:
// a real `UseMutationResult` has twenty fields a test has no reason to fill in.
const mock = (name: string): jest.Mock =>
  require('@/hooks/queries')[name] as jest.Mock;

const device = {
  id: 'd1',
  name: 'Samsung Galaxy A15 5G',
  manufacturer: 'Samsung',
  model: 'Galaxy A15 5G',
  androidVersion: 'Android 14',
  enrollmentStatus: 'ENROLLED',
  managementStatus: 'MANAGED_BY_ENTERPRISE',
  deviceState: 'ACTIVE',
  lastSyncedAt: '2026-09-25T10:00:00.000Z',
  contractId: 'CTR-1',
  agreementVersion: '1.0.0',
  agreementAcceptedAt: '2026-01-02T09:00:00.000Z',
  enterpriseManaged: true,
};

const plan = {
  contractId: 'CTR-1',
  status: 'ACTIVE',
  totalPrice: 30000,
  downPayment: 5000,
  paidAmount: 5000,
  remainingAmount: 25000,
  installmentAmount: 2500,
  totalInstallments: 10,
  paidInstallments: 2,
  remainingInstallments: 8,
  nextDueDate: '2026-10-10',
  nextInstallmentId: 'inst-2',
  currency: 'BDT',
};

beforeEach(() => {
  mock('useInstallmentPlan').mockReturnValue({ data: plan, isLoading: false, isRefetching: false, error: null, refetch: jest.fn() });
  mock('usePayments').mockReturnValue({
    data: {
      items: [
        {
          id: 'pay-1',
          transactionId: 'TXN-9',
          installmentId: 'inst-1',
          installmentNumber: 1,
          amount: 2500,
          currency: 'BDT',
          status: 'SUCCESS',
          method: 'BKASH',
          paidAt: '2026-08-10T10:00:00.000Z',
          createdAt: '2026-08-10T10:00:00.000Z',
          gateway: 'bkash',
        },
      ],
    },
    isLoading: false,
    isRefetching: false,
    error: null,
    refetch: jest.fn(),
  });
  mock('useTickets').mockReturnValue({
    data: {
      items: [
        {
          id: 'TICK-1',
          subject: 'Installment date query',
          message: 'Can I pay the next installment late?',
          category: 'Payments',
          status: 'OPEN',
          createdAt: '2026-09-11T10:00:00.000Z',
          adminResponse: null,
        },
      ],
    },
    isLoading: false,
    isRefetching: false,
    error: null,
    refetch: jest.fn(),
  });
  mock('useDevice').mockReturnValue({ data: device, isLoading: false, refetch: jest.fn() });
  mock('useDeviceStatus').mockReturnValue({
    data: {
      deviceState: 'ACTIVE',
      enrollmentStatus: 'ENROLLED',
      managementStatus: 'MANAGED_BY_ENTERPRISE',
      lastSyncedAt: '2026-09-25T10:00:00.000Z',
      serverTime: '2026-09-25T10:00:00.000Z',
      outstandingAmount: 25000,
      dueDate: '2026-10-10',
      restrictionReason: null,
      unlockAuthorizedAt: null,
    },
    isLoading: false,
    refetch: jest.fn(),
  });
  mock('useSyncDevice').mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  mock('useMarkAllNotificationsRead').mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
});

async function renderScreen(ui: React.ReactElement) {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      }}
    >
      <PaperProvider theme={lightTheme}>{ui}</PaperProvider>
    </SafeAreaProvider>,
  );
}

describe('the list screens render', () => {
  it('installments, with a row per installment', async () => {
    const view = await renderScreen(<InstallmentsScreen />);

    expect(await view.findByText('Installments 1')).toBeTruthy();
    expect(view.getByText('Installments 2')).toBeTruthy();
    // The status is a translated label, not a raw enum in capitals.
    expect(view.getAllByText('Paid').length).toBeGreaterThan(0);
    expect(view.getByText('Due')).toBeTruthy();
  });

  it('payments, with the amount as the headline', async () => {
    const view = await renderScreen(<PaymentsScreen />);

    expect(await view.findByText('৳2,500')).toBeTruthy();
    expect(view.getByText('Paid')).toBeTruthy();
  });

  it('support, with the ticket and its subject', async () => {
    const view = await renderScreen(<SupportScreen />);

    expect(await view.findByText('Installment date query')).toBeTruthy();
  });

  it('device, with the phone and its state', async () => {
    const view = await renderScreen(<DeviceScreen />);

    expect(await view.findByText('Samsung Galaxy A15 5G')).toBeTruthy();
    expect(view.getByText('Active')).toBeTruthy();
  });

  it('notifications, empty rather than broken', async () => {
    mock('usePayments').mockReturnValue({
      data: { items: [], page: 1, perPage: 20, total: 0, hasMore: false },
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
    const view = await renderScreen(<NotificationsScreen />);

    expect(await view.findByText('No notifications.')).toBeTruthy();
  });
});
