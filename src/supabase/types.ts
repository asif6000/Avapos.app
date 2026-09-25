/**
 * Supabase table types for the read-only client.
 *
 * REGENERATE against the live schema — this file was corrected by hand from the
 * real PostgREST responses, and will drift:
 *
 *   supabase gen types typescript --project-id vslediphrlrlhrormmxh \
 *     > src/supabase/types.ts
 *
 * Security notes that the generator will not tell you:
 *
 * - `devices.state`, `enrollment_status`, `management_status`, `is_managed` and
 *   `contract_id` are server-authoritative. The app reads them; it must never
 *   write them. There is deliberately no update policy on `devices`.
 * - `payments` and `support_tickets` had no owner column at the time of writing.
 *   `sql/fix-rls.sql` adds `customer_id` to both; RLS cannot scope a table with
 *   no owner. If `customer_id` is missing below, the fix has not been applied.
 * - Every table is expected to be RLS-scoped to `auth.uid()`. `npm run verify:rls`
 *   must pass before `EXPO_PUBLIC_SUPABASE_READS_ENABLED` may be set to "true".
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface ProfileRow {
  id: string;
  full_name: string;
  phone_number: string;
  email: string | null;
  is_enrolled: boolean;
  language: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceRow {
  id: string;
  device_name: string;
  manufacturer: string;
  model: string;
  android_version: string;
  contract_id: string;
  enrollment_status: string;
  management_status: string;
  state: string;
  last_sync_time: string | null;
  is_managed: boolean;
  created_at: string;
}

export interface PaymentRow {
  transaction_id: string;
  /** Added by sql/fix-rls.sql — required for RLS to scope this table. */
  customer_id?: string | null;
  installment_number: number | null;
  amount: number;
  date: string | null;
  payment_method: string | null;
  status: string;
  receipt_url: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  /** Added by sql/fix-rls.sql — required for RLS to scope this table. */
  customer_id?: string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  reference_id: string | null;
  created_at: string;
}

export interface SupportTicketRow {
  id: string;
  /** Added by sql/fix-rls.sql — required for RLS to scope this table. */
  customer_id?: string | null;
  subject: string;
  message: string;
  category: string;
  status: string;
  created_at: string;
  /** Server-written. A client-writable response field would be forgeable. */
  admin_response: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: never; Update: never };
      devices: { Row: DeviceRow; Insert: never; Update: never };
      payments: { Row: PaymentRow; Insert: never; Update: never };
      notifications: { Row: NotificationRow; Insert: never; Update: never };
      support_tickets: { Row: SupportTicketRow; Insert: never; Update: never };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
