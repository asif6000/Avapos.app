import { create } from 'zustand';

import type { PaymentSession } from '@/types/domain';

interface PaymentFlowState {
  session: PaymentSession | null;
  installmentId: string | null;
  amount: number | null;
  /**
   * Set when the gateway window could not be opened at all.
   *
   * A payment the customer never sent is not a *failed* payment: their account
   * was not debited and the order is still alive. Saying "payment failed" here
   * is the kind of small lie a money app must not tell, so the pending screen
   * explains what actually happened and offers to open the gateway again.
   */
  gatewayNotOpened: boolean;
  setSession: (session: PaymentSession, installmentId: string, amount: number) => void;
  markGatewayNotOpened: () => void;
  clear: () => void;
}

/**
 * Holds the in-flight payment session while the customer is in the gateway.
 * Cleared as soon as the outcome is known so nothing sensitive lingers.
 */
export const usePaymentFlowStore = create<PaymentFlowState>((set) => ({
  session: null,
  installmentId: null,
  amount: null,
  gatewayNotOpened: false,
  setSession: (session, installmentId, amount) =>
    set({ session, installmentId, amount, gatewayNotOpened: false }),
  markGatewayNotOpened: () => set({ gatewayNotOpened: true }),
  clear: () => set({ session: null, installmentId: null, amount: null, gatewayNotOpened: false }),
}));
