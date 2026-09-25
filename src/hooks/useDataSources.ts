import { useMemo } from 'react';

import { useInstallments as useApiInstallments, useNotifications as useApiNotifications } from './queries';
import {
  useSupabaseInstallments,
  useSupabaseNotifications,
} from '@/supabase/queries';
import type { AppNotification, Installment } from '@/types/domain';

export interface DataSource<T> {
  data: T;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  /** Where the rows came from, so the UI and the logs are never ambiguous. */
  source: 'supabase' | 'api';
}

/**
 * Installment schedule.
 *
 * Read straight from Supabase when the RLS-verified publishable key is
 * configured, otherwise from the REST API. Both paths are RLS/session scoped to
 * the signed-in customer, so this is a latency choice, not an authorization
 * choice — see `src/supabase/client.ts`.
 *
 * Note the deliberate split: the *schedule* is a read, but the money totals on
 * the contract and anything payment-related still come from the API, which
 * revalidates against the contract before showing a figure.
 */
export function useInstallmentSource(): DataSource<Installment[]> {
  const supabase = useSupabaseInstallments();
  const api = useApiInstallments(supabase.data === undefined);

  const useSupabase = supabase.isSuccess && supabase.data !== undefined;

  return {
    data: useSupabase ? supabase.data : (api.data ?? []),
    isLoading: useSupabase ? false : api.isLoading,
    error: useSupabase ? null : api.error,
    refetch: () => {
      if (useSupabase) void supabase.refetch();
      else void api.refetch();
    },
    source: useSupabase ? 'supabase' : 'api',
  };
}

/** Notification centre rows, same source preference as the schedule. */
export function useNotificationSource(): DataSource<AppNotification[]> {
  const supabase = useSupabaseNotifications();
  const api = useApiNotifications(1, supabase.data === undefined);

  const useSupabase = supabase.isSuccess && supabase.data !== undefined;

  return {
    data: useSupabase ? supabase.data : (api.data?.items ?? []),
    isLoading: useSupabase ? false : api.isLoading,
    error: useSupabase ? null : api.error,
    refetch: () => {
      if (useSupabase) void supabase.refetch();
      else void api.refetch();
    },
    source: useSupabase ? 'supabase' : 'api',
  };
}

/** Exposed for screens that want to show where their rows came from. */
export function useDataSourceLabel(source: DataSource<unknown>['source']): string {
  return useMemo(() => (source === 'supabase' ? 'Supabase (RLS)' : 'API'), [source]);
}
