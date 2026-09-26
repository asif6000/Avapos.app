import { useEffect, useRef } from 'react';

import { classifyHomeState, describeHomeSummary, type HomeState } from '@/api/dashboardState';
import { logHomeState } from '@/api/devLog';
import type { ApiError } from '@/api/errors';
import { useDashboard } from '@/hooks/queries';
import { useAuthStore } from '@/store/authStore';
import type { DashboardSummary } from '@/types/domain';

/**
 * The Home screen's data, and the state it is in.
 *
 * WHY A HOOK AND NOT MORE LOGIC IN THE SCREEN
 *
 * Two reasons, and the second is the one that matters.
 *
 * The first is that the screen renders seven states and the decision between them
 * is not presentation — it is a reading of a 401 and a session. Keeping it here
 * means `app/(tabs)/index.tsx` decides what a customer *sees* and nothing else.
 *
 * The second is that every one of those readings is logged with the identifiers
 * it was made from. A Home screen that fails produces a line naming the auth
 * user, the customer, the contract, the installment and the device, which is
 * what makes "which query failed, and whose account was it" answerable from a
 * device without a debugger attached.
 *
 * There is still exactly one request. This adds no endpoint, no second source of
 * truth and no fallback: `useDashboard` is the same read the screen already made.
 */
export interface HomeSummary {
  data: DashboardSummary | undefined;
  state: HomeState;
  isLoading: boolean;
  isRefetching: boolean;
  error: ApiError | null;
  refetch: () => void;
  /** The signed-in Supabase user, or null. Read for the log, never sent anywhere. */
  authUserId: string | null;
}

export function useHomeSummary(): HomeSummary {
  const query = useDashboard();
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.profile?.userId ?? null);

  // A session counts as live when the store says so. It is deliberately not
  // derived from the failed request: a 401 does not sign anybody out on its own,
  // and if it did, the one piece of evidence separating "your session expired"
  // from "we cannot find your customer" would be destroyed by the failure being
  // explained.
  const hasSession = status === 'authenticated';
  const state = classifyHomeState({
    data: query.data,
    error: query.error,
    isLoading: query.isLoading,
    hasSession,
  });

  const { customerId, contractId, installmentId, deviceId } = describeHomeSummary(query.data);

  // Logged on a change rather than on every render: this would otherwise run on
  // every frame of a pull-to-refresh, and a console that repeats itself is a
  // console nobody reads.
  const logged = useRef('');
  useEffect(() => {
    const line = [
      state,
      userId ?? 'no-auth-user',
      customerId ?? 'no-customer',
      contractId ?? 'no-contract',
      installmentId ?? 'no-installment',
      deviceId ?? 'no-device',
      query.error?.kind ?? '',
      query.error?.status ?? '',
    ].join('|');
    if (line === logged.current) return;
    logged.current = line;

    logHomeState({
      state,
      authUserId: userId,
      customerId,
      contractId,
      installmentId,
      deviceId,
      errorKind: query.error?.kind ?? null,
      errorStatus: query.error?.status ?? null,
    });
  }, [state, userId, customerId, contractId, installmentId, deviceId, query.error]);

  return {
    data: query.data,
    state,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: () => void query.refetch(),
    authUserId: userId,
  };
}
