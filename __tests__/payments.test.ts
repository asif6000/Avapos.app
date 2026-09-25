import { endpoints } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { paymentService } from '@/services/payments';
import type { Payment } from '@/types/domain';

jest.mock('@/api/endpoints', () => ({
  endpoints: {
    payments: {
      create: jest.fn(),
      status: jest.fn(),
    },
  },
}));

const mocked = endpoints.payments as jest.Mocked<typeof endpoints.payments>;

function payment(status: Payment['status']): Payment {
  return {
    id: 'pay-1',
    transactionId: 'TXN-9',
    installmentId: 'inst-1',
    installmentNumber: 3,
    amount: 2500,
    currency: 'BDT',
    status,
    method: 'BKASH',
    paidAt: status === 'SUCCESS' ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
    gateway: 'bkash',
  };
}

describe('payment service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates the order on the backend rather than trusting a local amount', async () => {
    mocked.create.mockResolvedValue({
      paymentId: 'pay-1',
      orderId: 'ORDER-1',
      redirectUrl: 'https://gateway.test/checkout/ORDER-1',
      gateway: 'bkash',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });

    const session = await paymentService.createSession({
      installmentId: 'inst-1',
      gateway: 'bkash',
      amount: 1,
    });

    expect(mocked.create).toHaveBeenCalledWith({
      installmentId: 'inst-1',
      gateway: 'bkash',
      amount: 1,
    });
    expect(session.paymentId).toBe('pay-1');
  });

  it('rejects a malformed gateway session instead of opening it', async () => {
    mocked.create.mockResolvedValue({
      paymentId: '',
      orderId: '',
      redirectUrl: '',
      gateway: '',
      expiresAt: '',
    });

    await expect(
      paymentService.createSession({ installmentId: 'inst-1', gateway: 'bkash', amount: 2500 }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('reports SUCCESS only when the backend verified the transaction', async () => {
    mocked.status.mockResolvedValue(payment('SUCCESS'));

    const outcome = await paymentService.waitForOutcome('pay-1', {
      attempts: 3,
      sleep: async () => undefined,
    });

    expect(outcome).toBe('SUCCESS');
    expect(mocked.status).toHaveBeenCalledWith('pay-1');
  });

  it('treats a client-side success as PENDING, never SUCCESS', async () => {
    // The gateway may have shown a success page, but the backend has not
    // confirmed anything, so the only honest answer is PENDING.
    mocked.status.mockResolvedValue(payment('PENDING'));

    const outcome = await paymentService.waitForOutcome('pay-1', {
      attempts: 2,
      sleep: async () => undefined,
    });

    expect(outcome).toBe('PENDING');
  });

  it('reports FAILED only after the backend rejects the transaction', async () => {
    mocked.status.mockResolvedValue(payment('FAILED'));

    const outcome = await paymentService.waitForOutcome('pay-1', {
      attempts: 2,
      sleep: async () => undefined,
    });

    expect(outcome).toBe('FAILED');
  });

  it('stays PENDING when the status endpoint is unreachable', async () => {
    mocked.status.mockRejectedValue(new ApiError({ kind: 'network', message: 'offline' }));

    const outcome = await paymentService.waitForOutcome('pay-1', {
      attempts: 3,
      sleep: async () => undefined,
    });

    expect(outcome).toBe('PENDING');
  });

  it('bounds polling so a stuck gateway cannot hang the customer', async () => {
    mocked.status.mockResolvedValue(payment('PENDING'));
    const sleep = jest.fn(async () => undefined);

    await paymentService.waitForOutcome('pay-1', { attempts: 4, intervalMs: 10, sleep });

    expect(mocked.status).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });
});
