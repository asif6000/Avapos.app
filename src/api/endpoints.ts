import { apiClient, type ApiClient } from './client';
import type {
  AuthSession,
  CreatePaymentRequest,
  CreateTicketRequest,
  OtpChallenge,
  OtpRequest,
  OtpVerifyRequest,
  Paginated,
  RegisterRequest,
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
 * Every path lives in this single file. If the backend exposes different routes,
 * change them here — screens never build URLs themselves, and no endpoint is
 * duplicated across modules.
 */
export function createEndpoints(client: ApiClient) {
  return {
    // Passwordless. The app never handles a password: it asks for a code, the
    // backend mails it, and the code is exchanged for a session. Sign-up and
    // sign-in are the same two calls — a new address simply creates the account
    // on first successful verify.
    auth: {
      requestOtp: (payload: OtpRequest) =>
        client.post<OtpChallenge>('/auth/otp/request', payload, { anonymous: true }),
      verifyOtp: (payload: OtpVerifyRequest) =>
        client.post<AuthSession>('/auth/otp/verify', payload, { anonymous: true }),
      resendOtp: (payload: OtpRequest) =>
        client.post<OtpChallenge>('/auth/otp/resend', payload, { anonymous: true }),
      registerProfile: (payload: Pick<RegisterRequest, 'fullName' | 'deviceName'>) =>
        client.post<Pick<AuthSession, 'fullName'>>('/customer/profile', payload),
    },

    customer: {
      profile: () => client.get<Customer>('/customer/profile'),
      updateProfile: (payload: Partial<Pick<Customer, 'fullName' | 'email' | 'language'>>) =>
        client.patch<Customer>('/customer/profile', payload),
      dashboard: () => client.get<DashboardSummary>('/customer/dashboard'),
      settings: () => client.get<AppSettings>('/customer/settings'),
      updateSettings: (payload: Partial<AppSettings>) =>
        client.patch<AppSettings>('/customer/settings', payload),
    },

    device: {
      get: () => client.get<Device>('/devices/me'),
      status: () => client.get<DeviceStatus>('/devices/me/status'),
      enroll: (payload: { agreementVersion: string; signatureName: string; acceptedAt: string }) =>
        client.post<Device>('/devices/me/enroll', payload),
      sync: () => client.post<DeviceStatus>('/devices/me/sync'),
    },

    agreements: {
      current: () => client.get<AgreementRecord>('/agreements/device-management/current'),
      accept: (payload: AgreementAcceptance) =>
        client.post<AgreementRecord>('/agreements/device-management/accept', payload),
    },

    installments: {
      list: () => client.get<Installment[]>('/installments'),
      plan: () => client.get<InstallmentPlan>('/installments/plan'),
      detail: (id: string) => client.get<Installment>(`/installments/${encodeURIComponent(id)}`),
    },

    payments: {
      create: (payload: CreatePaymentRequest) =>
        client.post<PaymentSession>('/payments/create', payload),
      status: (id: string) =>
        client.get<Payment>(`/payments/${encodeURIComponent(id)}/status`, { retries: 0 }),
      history: (page = 1) =>
        client.get<Paginated<Payment>>('/payments', { query: { page, perPage: 20 } }),
    },

    notifications: {
      list: (page = 1) =>
        client.get<Paginated<AppNotification>>('/notifications', { query: { page, perPage: 20 } }),
      markRead: (id: string) =>
        client.post<{ id: string }>(`/notifications/${encodeURIComponent(id)}/read`),
      markAllRead: () => client.post<{ count: number }>('/notifications/read-all'),
      registerDevice: (payload: { token: string; platform: string; deviceId: string }) =>
        client.post<{ registered: boolean }>('/notifications/devices', payload),
    },

    support: {
      list: (page = 1) =>
        client.get<Paginated<SupportTicket>>('/support/tickets', { query: { page, perPage: 20 } }),
      create: (payload: CreateTicketRequest) =>
        client.post<SupportTicket>('/support/tickets', payload),
      detail: (id: string) =>
        client.get<SupportTicket>(`/support/tickets/${encodeURIComponent(id)}`),
    },
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;

/** Shared instance used by the running app. Tests construct their own. */
export const endpoints: Endpoints = createEndpoints(apiClient);
