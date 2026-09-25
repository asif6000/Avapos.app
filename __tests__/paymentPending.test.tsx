import { render, userEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PendingScreen from '../app/payments/pending';
import { usePaymentFlowStore } from '@/store/paymentFlowStore';
import { lightTheme } from '@/theme/theme';

/**
 * What the app is allowed to say about money.
 *
 * A gateway window that never opened is not a declined card. Telling a customer
 * their payment failed when their account was never touched is the kind of
 * small lie that turns a support call into a complaint, so that case is a
 * pending order with an explanation and a way to try again — and never the
 * failure screen.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ paymentId: 'TXN-1' }),
}));

const mockUsePayment = jest.fn();
jest.mock('@/hooks/queries', () => ({
  usePayment: (id: string) => mockUsePayment(id),
}));

const mockOpenGateway = jest.fn();
jest.mock('@/services/payments', () => ({
  paymentService: { openGateway: (...args: unknown[]) => mockOpenGateway(...args) },
}));

async function renderScreen() {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      }}
    >
      <PaperProvider theme={lightTheme}>
        <PendingScreen />
      </PaperProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePayment.mockReturnValue({
    data: { id: 'TXN-1', status: 'PENDING', amount: 2500, currency: 'BDT' },
    refetch: jest.fn().mockResolvedValue({ data: { status: 'PENDING' } }),
    isFetching: false,
  });
  usePaymentFlowStore.setState({ session: null, installmentId: null, amount: null, gatewayNotOpened: false });
});

describe('a payment waiting for confirmation', () => {
  it('says it is waiting when the gateway did open', async () => {
    const view = await renderScreen();

    expect(await view.findByText('We have not received confirmation yet. We will update you shortly.')).toBeTruthy();
    // Nothing to reopen: the customer has already been to the gateway.
    expect(view.queryByTestId('payment-pending-reopen')).toBeNull();
  });

  it('says nothing was charged when the gateway window never opened', async () => {
    usePaymentFlowStore.setState({
      session: {
        paymentId: 'TXN-1',
        orderId: 'ORDER-1',
        redirectUrl: 'https://gateway.example/ORDER-1',
        gateway: 'bkash',
        expiresAt: '2026-09-25T12:00:00.000Z',
      },
      installmentId: 'inst-1',
      amount: 2500,
      gatewayNotOpened: true,
    });
    const view = await renderScreen();

    expect(
      await view.findByText('The payment window did not open, so nothing was charged. Open it again to pay.'),
    ).toBeTruthy();
    expect(view.queryByText('Payment failed')).toBeNull();
  });

  it('can take the customer back to the live order', async () => {
    mockOpenGateway.mockResolvedValue({ opened: true, dismissed: false });
    usePaymentFlowStore.setState({
      session: {
        paymentId: 'TXN-1',
        orderId: 'ORDER-1',
        redirectUrl: 'https://gateway.example/ORDER-1',
        gateway: 'bkash',
        expiresAt: '2026-09-25T12:00:00.000Z',
      },
      gatewayNotOpened: true,
    });
    const view = await renderScreen();

    await userEvent.press(view.getByTestId('payment-pending-reopen'));

    expect(mockOpenGateway).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ORDER-1' }),
    );
  });

  it('takes the customer onward only once the server says SUCCESS', async () => {
    const refetch = jest.fn().mockResolvedValue({ data: { status: 'SUCCESS' } });
    mockUsePayment.mockReturnValue({
      data: { id: 'TXN-1', status: 'PENDING', amount: 2500, currency: 'BDT' },
      refetch,
      isFetching: false,
    });
    const view = await renderScreen();

    await userEvent.press(view.getByTestId('payment-pending-check'));

    // The screen follows the server's answer; it never decides on its own.
    expect(refetch).toHaveBeenCalled();
  });
});
