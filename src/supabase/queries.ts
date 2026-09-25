import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { canReadDirectly, getSupabaseClient } from './client';
import type {
  Database,
  DeviceRow,
  NotificationRow,
  PaymentRow,
  ProfileRow,
  SupportTicketRow,
} from './types';
import type { AppNotification, Customer, Device, Payment, SupportTicket } from '@/types/domain';

/**
 * Read-only Supabase queries against the real schema.
 *
 * Ownership is decided by the RLS policy, never by a query argument, so there is
 * no customerId to tamper with: the SQL below filters on nothing, and the
 * database returns only the signed-in customer's rows.
 *
 * These hooks stay disabled whenever the client is unavailable (unconfigured,
 * reads not enabled, or a privileged key supplied), and the screens fall back to
 * the REST API. Table names match the live PostgREST schema: profiles, devices,
 * payments, notifications, support_tickets.
 *
 * Nothing here writes. `devices.state` and `support_tickets.admin_response` in
 * particular are server-authoritative.
 */

/**
 * Queries are gated on `canReadDirectly()`, not merely on having a client: a
 * signed-in Supabase session makes `auth.uid()` available, which is necessary
 * for RLS to work, but it is not sufficient — the policies have to exist.
 */
function useSupabase() {
  return canReadDirectly() ? getSupabaseClient() : null;
}

export function useSupabaseProfile(): UseQueryResult<Customer | null, Error> {
  const client = useSupabase();
  return useQuery<Customer | null, Error>({
    queryKey: ['supabase', 'profile'],
    enabled: client !== null,
    queryFn: async () => {
      if (!client) return null;
      const { data, error } = await client.from('profiles').select('*').maybeSingle();
      if (error) throw error;
      return data ? mapProfile(data as ProfileRow) : null;
    },
  });
}

export function useSupabaseDevice(): UseQueryResult<Device | null, Error> {
  const client = useSupabase();
  return useQuery<Device | null, Error>({
    queryKey: ['supabase', 'device'],
    enabled: client !== null,
    queryFn: async () => {
      if (!client) return null;
      const { data, error } = await client.from('devices').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data ? mapDevice(data as DeviceRow) : null;
    },
  });
}

export function useSupabasePayments(): UseQueryResult<Payment[], Error> {
  const client = useSupabase();
  return useQuery<Payment[], Error>({
    queryKey: ['supabase', 'payments'],
    enabled: client !== null,
    queryFn: async () => {
      if (!client) return [];
      const { data, error } = await client
        .from('payments')
        .select('*')
        .order('date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => mapPayment(row as PaymentRow));
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

export function useSupabaseTickets(): UseQueryResult<SupportTicket[], Error> {
  const client = useSupabase();
  return useQuery<SupportTicket[], Error>({
    queryKey: ['supabase', 'tickets'],
    enabled: client !== null,
    queryFn: async () => {
      if (!client) return [];
      const { data, error } = await client
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => mapTicket(row as SupportTicketRow));
    },
  });
}

function mapProfile(row: ProfileRow): Customer {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email ?? row.phone_number,
    phone: null,
    photoUrl: null,
    language: row.language === 'bn' ? 'bn' : 'en',
    verifiedAt: null,
    createdAt: row.created_at,
  };
}

function mapDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.device_name,
    manufacturer: row.manufacturer,
    model: row.model,
    androidVersion: row.android_version,
    enrollmentStatus: row.enrollment_status as Device['enrollmentStatus'],
    managementStatus: row.management_status as Device['managementStatus'],
    deviceState: row.state as Device['deviceState'],
    lastSyncedAt: row.last_sync_time,
    contractId: row.contract_id,
    // The agreement record lives in the backend; this table does not carry the
    // accepted version.
    agreementVersion: null,
    agreementAcceptedAt: null,
    enterpriseManaged: row.is_managed,
  };
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.transaction_id,
    transactionId: row.transaction_id,
    installmentId: null,
    installmentNumber: row.installment_number,
    amount: row.amount,
    currency: 'BDT',
    status: row.status as Payment['status'],
    method: row.payment_method ?? '—',
    paidAt: row.date,
    createdAt: row.created_at,
    gateway: row.payment_method ?? '—',
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

function mapTicket(row: SupportTicketRow): SupportTicket {
  return {
    id: row.id,
    subject: row.subject,
    message: row.message,
    category: row.category as SupportTicket['category'],
    status: row.status as SupportTicket['status'],
    createdAt: row.created_at,
    updatedAt: row.created_at,
    response: row.admin_response,
    respondedAt: row.admin_response ? row.created_at : null,
  };
}

export { mapProfile, mapDevice, mapPayment, mapNotification, mapTicket };
export type { Database };
