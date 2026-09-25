import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getSupabaseClient } from './client';
import type {
  ContractRow,
  Database,
  DeviceRow,
  InstallmentRow,
  NotificationRow,
} from './types';
import type { AppNotification, Device, Installment } from '@/types/domain';

/**
 * Read-only Supabase queries.
 *
 * Every query is scoped by the authenticated Supabase user's JWT, which RLS
 * turns into a `customer_id` filter. The app never sends a customerId: there is
 * no parameter to forge, because ownership is decided by the database policy.
 *
 * When Supabase reads are unconfigured or blocked, these hooks stay disabled and
 * the app falls back to the REST API, so the app remains usable in a build that
 * ships without the publishable key.
 */

function useSupabase() {
  return getSupabaseClient();
}

export function useSupabaseDevice(): UseQueryResult<Device | null, Error> {
  const client = useSupabase();
  return useQuery<Device | null, Error>({
    queryKey: ['supabase', 'device'],
    enabled: client !== null,
    queryFn: async () => {
      if (!client) return null;
      const { data, error } = await client
        .from('devices')
        .select('*')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapDevice(data as DeviceRow) : null;
    },
  });
}

export function useSupabaseInstallments(): UseQueryResult<Installment[], Error> {
  const client = useSupabase();
  return useQuery<Installment[], Error>({
    queryKey: ['supabase', 'installments'],
    enabled: client !== null,
    queryFn: async () => {
      if (!client) return [];
      const { data, error } = await client
        .from('installments')
        .select('*')
        .order('number', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapInstallment(row as InstallmentRow));
    },
  });
}

export function useSupabaseContract(): UseQueryResult<ContractRow | null, Error> {
  const client = useSupabase();
  return useQuery<ContractRow | null, Error>({
    queryKey: ['supabase', 'contract'],
    enabled: client !== null,
    queryFn: async () => {
      if (!client) return null;
      const { data, error } = await client
        .from('contracts')
        .select('*')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ContractRow | null) ?? null;
    },
  });
}

export function useSupabaseNotifications(): UseQueryResult<AppNotification[], Error> {
  const client = useSupabase();
  return useQuery<AppNotification[], Error>({
    queryKey: ['supabase', 'notifications'],
    enabled: client !== null,
    queryFn: async () => {
      if (!client) return [];
      const { data, error } = await client
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => mapNotification(row as NotificationRow));
    },
  });
}

function mapDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    model: row.model,
    androidVersion: row.android_version,
    enrollmentStatus: row.enrollment_status as Device['enrollmentStatus'],
    managementStatus: row.management_status as Device['managementStatus'],
    // `device_state` is deliberately absent: authoritative device state is only
    // ever read from the backend, which verifies payment before changing it.
    deviceState: 'ACTIVE',
    lastSyncedAt: row.last_synced_at,
    contractId: row.contract_id,
    agreementVersion: row.agreement_version,
    agreementAcceptedAt: row.agreement_accepted_at,
    enterpriseManaged: row.enterprise_managed,
  };
}

function mapInstallment(row: InstallmentRow): Installment {
  return {
    id: row.id,
    contractId: row.contract_id,
    number: row.number,
    amount: row.amount,
    paidAmount: row.paid_amount,
    status: row.status as Installment['status'],
    dueDate: row.due_date,
    paidAt: row.paid_at,
  };
}

function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type as AppNotification['type'],
    title: row.title,
    message: row.message,
    isRead: row.is_read,
    createdAt: row.created_at,
    referenceId: row.reference_id,
  };
}

export type { Database };
