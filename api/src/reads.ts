/**
 * Every database read the service makes.
 *
 * The one rule in this file: no function accepts a customer id as a parameter the
 * caller could have chosen. Each takes a `CustomerRecord` that `authenticate`
 * produced from a verified session, so there is no request field, query
 * parameter or body value that can repoint a read at somebody else's account.
 */

import { db, type ContractRow, type DeviceRow, type NotificationRow, type PaymentRow, type TicketRow } from './supabase.js';
import { derivePlan, type DerivedPlan } from './schedule.js';
import type { CustomerRecord } from './auth.js';

export async function readContract(customer: CustomerRecord): Promise<ContractRow | null> {
  const { data, error } = await db()
    .from('installment_contracts')
    .select('*')
    .eq('customer_key', customer.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`contract read failed: ${error.message}`);
  return (data as ContractRow | null) ?? null;
}

export async function readPlan(customer: CustomerRecord): Promise<DerivedPlan | null> {
  return derivePlan(await readContract(customer));
}

export async function readDevice(customer: CustomerRecord): Promise<DeviceRow | null> {
  const { data, error } = await db()
    .from('devices')
    .select('*')
    .eq('customer_key', customer.id)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`device read failed: ${error.message}`);
  return (data as DeviceRow | null) ?? null;
}

export async function readPayments(customer: CustomerRecord): Promise<PaymentRow[]> {
  const { data, error } = await db()
    .from('payments')
    .select('*')
    .eq('customer_key', customer.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(`payments read failed: ${error.message}`);
  return (data as PaymentRow[] | null) ?? [];
}

export async function readTickets(customer: CustomerRecord): Promise<TicketRow[]> {
  const { data, error } = await db()
    .from('support_tickets')
    .select('*')
    .eq('customer_key', customer.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(`tickets read failed: ${error.message}`);
  return (data as TicketRow[] | null) ?? [];
}

export async function readNotifications(customer: CustomerRecord): Promise<NotificationRow[]> {
  const { data, error } = await db()
    .from('notifications')
    .select('*')
    .eq('customer_key', customer.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(`notifications read failed: ${error.message}`);
  return (data as NotificationRow[] | null) ?? [];
}

export async function countUnreadNotifications(customer: CustomerRecord): Promise<number> {
  const { count, error } = await db()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('customer_key', customer.id)
    .eq('is_read', false);

  if (error) throw new Error(`notification count failed: ${error.message}`);
  return count ?? 0;
}

export async function countOpenTickets(customer: CustomerRecord): Promise<number> {
  const { count, error } = await db()
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('customer_key', customer.id)
    .neq('status', 'CLOSED');

  if (error) throw new Error(`ticket count failed: ${error.message}`);
  return count ?? 0;
}
