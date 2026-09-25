/**
 * Supabase table types for the read-only client.
 *
 * RECONCILE THIS FILE against the real schema before relying on it:
 *   supabase gen types typescript --project-id <project-ref> > src/supabase/types.ts
 *
 * The shape below is inferred from the domain model in `src/types/domain.ts`, not
 * from the live database — the schema is not reachable from this environment, so
 * the column names are assumptions. If a column differs, TypeScript will fail
 * loudly at the query site rather than silently returning wrong data.
 *
 * Every table here is expected to carry a `customer_id` column that RLS ties to
 * `auth.uid()`. `npm run verify:rls` proves that assumption before any read is
 * allowed.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface CustomerRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  photo_url: string | null;
  language: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface DeviceRow {
  id: string;
  customer_id: string;
  name: string;
  manufacturer: string;
  model: string;
  android_version: string | null;
  enrollment_status: string;
  management_status: string;
  last_synced_at: string | null;
  contract_id: string;
  agreement_version: string | null;
  agreement_accepted_at: string | null;
  enterprise_managed: boolean;
}

export interface InstallmentRow {
  id: string;
  customer_id: string;
  contract_id: string;
  number: number;
  amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  paid_at: string | null;
}

export interface ContractRow {
  id: string;
  customer_id: string;
  status: string;
  total_price: number;
  down_payment: number;
  paid_amount: number;
  installment_amount: number;
  total_installments: number;
  started_at: string | null;
  currency: string;
}

export interface NotificationRow {
  id: string;
  customer_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  reference_id: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      customers: { Row: CustomerRow; Insert: never; Update: never };
      devices: { Row: DeviceRow; Insert: never; Update: never };
      installments: { Row: InstallmentRow; Insert: never; Update: never };
      contracts: { Row: ContractRow; Insert: never; Update: never };
      notifications: { Row: NotificationRow; Insert: never; Update: never };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
