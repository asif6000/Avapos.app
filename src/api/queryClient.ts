import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';

/**
 * Server state lives in TanStack Query only. It is never copied into a Zustand
 * store, so a mutation always produces a single refetch rather than two sources
 * of truth drifting apart.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if (error.kind === 'unauthorized' || error.kind === 'forbidden') return false;
          return failureCount < 2 && error.isRetryable;
        }
        return failureCount < 1;
      },
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      // Financial and device state is never cached across a hard app restart.
      networkMode: 'always',
    },
    mutations: {
      retry: false,
      networkMode: 'always',
    },
  },
});

export const queryKeys = {
  profile: (['customer', 'profile'] as const),
  dashboard: (['customer', 'dashboard'] as const),
  settings: (['customer', 'settings'] as const),
  device: (['device', 'me'] as const),
  deviceStatus: (['device', 'me', 'status'] as const),
  agreement: (['agreements', 'device-management', 'current'] as const),
  installments: (['installments'] as const),
  installmentPlan: (['installments', 'plan'] as const),
  installment: (id: string) => ['installments', 'detail', id] as const,
  payments: (page: number) => ['payments', page] as const,
  payment: (id: string) => ['payments', 'status', id] as const,
  notifications: (page: number) => ['notifications', page] as const,
  tickets: (page: number) => ['support', 'tickets', page] as const,
  ticket: (id: string) => ['support', 'tickets', 'detail', id] as const,
};
