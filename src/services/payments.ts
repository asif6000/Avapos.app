import * as WebBrowser from 'expo-web-browser';

import { endpoints } from '@/api/endpoints';
import { ApiError, defaultMessageFor } from '@/api/errors';
import type { PaymentSession } from '@/types/domain';
import type { CreatePaymentRequest } from '@/types/api';

export type PaymentOutcome = 'SUCCESS' | 'PENDING' | 'FAILED';

export interface GatewayLaunchResult {
  opened: boolean;
  /** The gateway redirected straight back, so no browser session was needed. */
  dismissed: boolean;
}

/**
 * Payment service.
 *
 * The client never decides that a payment succeeded. It asks the backend to
 * create an order, sends the customer to the gateway, then polls
 * `GET /payments/:id/status` until the backend — which verified the gateway
 * callback — reports a terminal state.
 */
class PaymentServiceImpl {
  async createSession(request: CreatePaymentRequest): Promise<PaymentSession> {
    const session = await endpoints.payments.create(request);
    if (!session?.redirectUrl || !session.paymentId) {
      throw new ApiError({ kind: 'server', message: defaultMessageFor('server') });
    }
    // The backend re-validates the amount against the contract regardless of
    // what the client sends, and the final state comes from its verification of
    // the gateway callback. The client never asserts an amount is correct.
    return session;
  }

  async openGateway(session: PaymentSession): Promise<GatewayLaunchResult> {
    try {
      const result = await WebBrowser.openBrowserAsync(session.redirectUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        enableBarCollapsing: true,
        showTitle: true,
      });
      return { opened: true, dismissed: result.type === 'dismiss' };
    } catch {
      return { opened: false, dismissed: true };
    }
  }

  async fetchStatus(paymentId: string) {
    return endpoints.payments.status(paymentId);
  }

  /**
   * Polls the backend for a verified result. Bounded by `attempts` so a stuck
   * gateway leaves the customer on a PENDING screen instead of hanging.
   */
  async waitForOutcome(
    paymentId: string,
    options: { attempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
  ): Promise<PaymentOutcome> {
    const attempts = options.attempts ?? 10;
    const intervalMs = options.intervalMs ?? 3000;
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

    let last: PaymentOutcome = 'PENDING';
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const payment = await this.fetchStatus(paymentId).catch(() => null);
      if (payment) {
        if (payment.status === 'SUCCESS') return 'SUCCESS';
        if (payment.status === 'FAILED' || payment.status === 'REFUNDED') return 'FAILED';
        last = 'PENDING';
      }
      if (attempt < attempts - 1) await sleep(intervalMs);
    }
    return last;
  }
}

export const paymentService = new PaymentServiceImpl();
