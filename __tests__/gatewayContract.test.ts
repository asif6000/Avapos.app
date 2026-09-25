import { createEndpoints } from '@/api/endpoints';
import { ApiError } from '@/api/errors';

/**
 * What the phone is allowed to say about a payment.
 *
 * The chain is fixed by the backend, and this test is what keeps the app from
 * quietly becoming part of it:
 *
 * - the create request carries an installment id, a method and a display amount,
 *   and nothing that identifies the server to the gateway
 * - the app never holds a gateway key, a merchant id or a callback secret
 * - a 501 from an unconfigured provider reads as "not available", not as a failed
 *   payment, because no money has moved
 */

const post = jest.fn();
const get = jest.fn();

const client = {
  post,
  get,
  patch: jest.fn(),
  getStream: jest.fn(),
  setToken: jest.fn(),
  clearCache: jest.fn(),
  setUnauthorizedHandler: jest.fn(),
} as never;

const api = createEndpoints(client);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('creating a payment', () => {
  it('sends an installment, a method and a display amount — and nothing else', async () => {
    post.mockResolvedValue({
      paymentId: 'TXN-ABC123',
      orderId: 'VBaF49hl9jLZ24BrCLnV1ZUXbDQe0ulgpZfZIn7Y',
      redirectUrl: 'https://srabontelecom.paymently.io/checkout/VBaF49hl9jLZ24BrCLnV1ZUXbDQe0ulgpZfZIn7Y',
      gateway: 'bkash',
      expiresAt: null,
    });

    await api.payments.create({ installmentId: 'inst-1', gateway: 'bkash', amount: 2500 });

    const [path, payload] = post.mock.calls[0];
    expect(path).toBe('/payments/create');
    expect(Object.keys(payload).sort()).toEqual(['amount', 'gateway', 'installmentId']);
    // Nothing that would let a phone charge a card or sign a gateway request.
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toMatch(/api[_-]?key|secret|token|signature|merchant/i);
  });

  it('returns only what the customer needs: a reference and a place to pay', async () => {
    post.mockResolvedValue({
      paymentId: 'TXN-ABC123',
      orderId: 'tok',
      redirectUrl: 'https://srabontelecom.paymently.io/checkout/tok',
      gateway: 'bkash',
      expiresAt: null,
    });

    const session = await api.payments.create({ installmentId: 'inst-1', gateway: 'bkash', amount: 2500 });

    expect(Object.keys(session).sort()).toEqual([
      'expiresAt',
      'gateway',
      'orderId',
      'paymentId',
      'redirectUrl',
    ]);
  });
});

describe('an unavailable payment provider', () => {
  it('is not reported as a failed payment', () => {
    // The server answers 501 while no gateway key is configured. Nobody has been
    // charged, so the app must not tell the customer their payment failed.
    const error = new ApiError({
      kind: 'server',
      message: 'The payment provider could not start this payment.',
    });

    expect(error.kind).not.toBe('network');
    expect(error.message).toMatch(/provider/i);
  });
});

describe('polling a payment', () => {
  it('asks the server, with the payment id, and does not retry', async () => {
    get.mockResolvedValue({ id: 'TXN-ABC123', status: 'PENDING' });

    await api.payments.status('TXN-ABC123');

    const [path, options] = get.mock.calls[0];
    expect(path).toBe('/payments/TXN-ABC123/status');
    expect(options.retries).toBe(0);
  });
});
