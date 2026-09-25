import { create } from 'zustand';

import type { PaymentSession } from '@/types/domain';

interface PaymentFlowState {
  session: PaymentSession | null;
  installmentId: string | null;
  amount: number | null;
  setSession: (session: PaymentSession, installmentId: string, amount: number) => void;
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
  setSession: (session, installmentId, amount) => set({ session, installmentId, amount }),
  clear: () => set({ session: null, installmentId: null, amount: null }),
}));
