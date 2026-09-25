import type { ApiClient } from './client';
import { apiClient } from './instance';
import type {
  CreatePaymentRequest,
  CreateTicketRequest,
  Paginated,
} from '@/types/api';
import type {
  AgreementAcceptance,
  AgreementRecord,
  AppNotification,
  AppSettings,
  Customer,
  DashboardSummary,
  Device,
  DeviceStatus,
  Installment,
  InstallmentPlan,
  Payment,
  PaymentSession,
  SupportTicket,
} from '@/types/domain';

/**
 * Typed endpoint bindings.
 *
 * Base path is `/customer` — NOT `/api/customer`. The Laravel app serves the
 * customer API from that prefix; `/api/*` has no routes registered at all.
 *
 * Each path is marked:
 *   [live]  confirmed to exist on the deployed server
 *   [todo]  not implemented on the backend yet — see docs/api-contract.md
 *
 * Every path lives in this one file. Screens never build URLs themselves.
 */
export function createEndpoints(client: ApiClient) {
  return {
    // Authentication is Supabase Auth's job — see `src/supabase/auth.ts`. The
    // app posts no credentials here at all; it holds a Supabase session and
    // sends that JWT as the bearer. No password exists in this app.
    auth: {
      /** [live] Revokes the Supabase session. */
      signOut: () => client.post<{ revoked: boolean }>('/logout'),
    },

    customer: {
      /** [todo] */
      profile: () => client.get<Customer>('/profile'),
      /** [todo] */
      updateProfile: (payload: Partial<Pick<Customer, 'fullName' | 'email' | 'language'>>) =>
        client.patch<Customer>('/profile', payload),
      /** [todo] */
      dashboard: () => client.get<DashboardSummary>('/dashboard'),
      /** [todo] */
      settings: () => client.get<AppSettings>('/settings'),
      /** [todo] */
      updateSettings: (payload: Partial<AppSettings>) =>
        client.patch<AppSettings>('/settings', payload),
    },

    device: {
      /** [todo] */
      get: () => client.get<Device>('/devices/me'),
      /** [todo] Authoritative device state. Never inferred on the device. */
      status: () => client.get<DeviceStatus>('/devices/me/status'),
      /** [todo] */
      enroll: (payload: { agreementVersion: string; signatureName: string; acceptedAt: string }) =>
        client.post<Device>('/devices/me/enroll', payload),
      /** [todo] */
      sync: () => client.post<DeviceStatus>('/devices/me/sync'),
    },

    agreements: {
      /** [todo] */
      current: () => client.get<AgreementRecord>('/agreements/device-management/current'),
      /** [todo] */
      accept: (payload: AgreementAcceptance) =>
        client.post<AgreementRecord>('/agreements/device-management/accept', payload),
    },

    installments: {
      /** [todo] */
      list: () => client.get<Installment[]>('/installments'),
      /** [todo] */
      plan: () => client.get<InstallmentPlan>('/installments/plan'),
      /** [todo] */
      detail: (id: string) => client.get<Installment>(`/installments/${encodeURIComponent(id)}`),
    },

    payments: {
      /** [live] */
      history: (page = 1) =>
        client.get<Paginated<Payment>>('/payments', { query: { page, perPage: 20 } }),
      /** [live] */
      create: (payload: CreatePaymentRequest) =>
        client.post<PaymentSession>('/payments/create', payload),
      /** [todo] Must reflect the backend's own verification of the gateway. */
      status: (id: string) =>
        client.get<Payment>(`/payments/${encodeURIComponent(id)}/status`, { retries: 0 }),
    },

    notifications: {
      /** [todo] */
      list: (page = 1) =>
        client.get<Paginated<AppNotification>>('/notifications', { query: { page, perPage: 20 } }),
      /** [todo] */
      markRead: (id: string) =>
        client.post<{ id: string }>(`/notifications/${encodeURIComponent(id)}/read`),
      /** [todo] */
      markAllRead: () => client.post<{ count: number }>('/notifications/read-all'),
      /** [todo] */
      registerDevice: (payload: { token: string; platform: string; deviceId: string }) =>
        client.post<{ registered: boolean }>('/notifications/devices', payload),
    },

    support: {
      /** [todo] */
      list: (page = 1) =>
        client.get<Paginated<SupportTicket>>('/support/tickets', { query: { page, perPage: 20 } }),
      /** [todo] */
      create: (payload: CreateTicketRequest) =>
        client.post<SupportTicket>('/support/tickets', payload),
      /** [todo] */
      detail: (id: string) =>
        client.get<SupportTicket>(`/support/tickets/${encodeURIComponent(id)}`),
    },
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;

/** Shared instance used by the running app. Tests construct their own. */
export const endpoints: Endpoints = createEndpoints(apiClient);
