import { useInstallments as useApiInstallments, useNotifications as useApiNotifications } from './queries';
import { useSupabaseNotifications } from '@/supabase/queries';
import type { AppNotification, Installment } from '@/types/domain';

/**
 * Data-source preference for screens whose data can come from either place.
 *
 * Supabase is preferred when the RLS-verified publishable key is configured,
 * otherwise the REST API. Both paths are scoped to the signed-in customer, so
 * this is a latency choice, not an authorization choice.
 *
 * The installment *schedule* deliberately stays on the API: the live schema has
 * no `installments` table, and the contract totals that drive money must come
 * from the backend regardless. Notifications come from Supabase.
 */

export interface DataSource<T> {
  data: T;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  /** Where the rows came from, so the UI and the logs are never ambiguous. */
  source: 'supabase' | 'api';
}

export function useInstallmentSource(): DataSource<Installment[]> {
  const api = useApiInstallments();
  return {
    data: api.data ?? [],
    isLoading: api.isLoading,
    error: api.error,
    refetch: () => {
      void api.refetch();
    },
    source: 'api',
  };
}

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
