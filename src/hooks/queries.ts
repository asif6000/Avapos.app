import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { endpoints } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryClient';
import { deviceManagementService } from '@/services/deviceManagement';
import type { CreatePaymentRequest, CreateTicketRequest, Paginated } from '@/types/api';
import type {
  AgreementAcceptance,
  AgreementRecord,
  AppNotification,
  AppSettings,
  Customer,
  DashboardSummary,
  Device,
  DeviceState,
  DeviceStatus,
  EnrollmentStatus,
  Installment,
  InstallmentPlan,
  Payment,
  PaymentSession,
  SupportTicket,
} from '@/types/domain';

/**
 * Every read in the app goes through here.
 *
 * The options are forwarded rather than cherry-picked. This used to accept
 * `{ enabled }` and drop everything else on the floor, which meant a caller could
 * pass `refetchInterval`, get no type error and no polling either — the option
 * that exists precisely because the device screen is a view of something that
 * changes on the server while you are looking at it.
 *
 * Polling is a decision for the caller, never a default: money and device state
 * are read on entry, on pull-to-refresh, and on a push, and a background tab
 * re-reading every four seconds is how a battery goes flat on a customer's phone.
 */
function useSafeQuery<T>(
  queryKey: readonly unknown[],
  fetcher: () => Promise<T>,
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
): UseQueryResult<T, ApiError> {
  return useQuery<T, ApiError>({
    queryKey,
    queryFn: fetcher,
    enabled: options.enabled ?? true,
    // `false` is a real value here — it means "never", which is not the same as
    // omitting it.
    ...(options.refetchInterval !== undefined
      ? { refetchInterval: options.refetchInterval }
      : {}),
  });
}

export const useProfile = () =>
  useSafeQuery<Customer>(queryKeys.profile, () => endpoints.customer.profile());

export const useDashboard = (enabled = true) =>
  useSafeQuery<DashboardSummary>(queryKeys.dashboard, () => endpoints.customer.dashboard(), {
    enabled,
  });

export const useSettings = () =>
  useSafeQuery<AppSettings>(queryKeys.settings, () => endpoints.customer.settings());

export const useUpdateSettings = (): UseMutationResult<
  AppSettings,
  ApiError,
  Partial<AppSettings>
> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload) => endpoints.customer.updateSettings(payload),
    onSuccess: (data) => {
      client.setQueryData(queryKeys.settings, data);
    },
  });
};

export const useUpdateProfile = (): UseMutationResult<
  Customer,
  ApiError,
  Partial<Pick<Customer, 'fullName' | 'email' | 'language'>>
> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload) => endpoints.customer.updateProfile(payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.profile });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
};

/**
 * How often the device screens re-read themselves.
 *
 * The device's state is decided on the server, usually by a payment landing, and
 * the customer is looking at a screen that must not lie about it. Fifteen seconds
 * is a compromise: long enough not to drain a battery, short enough that nobody
 * watches a restriction appear under their finger. TanStack Query stops the
 * interval when the screen is not being observed, so it costs nothing in a
 * background tab.
 */
const DEVICE_POLL_MS = 15_000;

/** The slower of the two, for the record that only changes at enrollment. */
const DEVICE_RECORD_POLL_MS = 60_000;

export const useDevice = (enabled = true) =>
  useSafeQuery<Device>(queryKeys.device, () => endpoints.device.get(), {
    enabled,
    refetchInterval: enabled ? DEVICE_RECORD_POLL_MS : false,
  });

export const useDeviceStatus = (enabled = true) =>
  useSafeQuery<DeviceStatus>(queryKeys.deviceStatus, () => endpoints.device.status(), {
    enabled,
    refetchInterval: enabled ? DEVICE_POLL_MS : false,
  });

/**
 * Tells the server what this phone is, then re-reads its own state.
 *
 * Through the service rather than the endpoint directly, because the report is
 * built there — this hook used to call `endpoints.device.sync()` with no body at
 * all, which is how a handset could be sold a contract and never once say what it
 * was.
 */
export const useSyncDevice = (): UseMutationResult<DeviceStatus | null, ApiError, void> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => deviceManagementService.syncDeviceStatus(),
    onSuccess: (data) => {
      if (!data) return;
      client.setQueryData(queryKeys.deviceStatus, data);
      void client.invalidateQueries({ queryKey: queryKeys.device });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
};

export const useCurrentAgreement = (enabled = true) =>
  useSafeQuery<AgreementRecord>(
    queryKeys.agreement,
    () => endpoints.agreements.current(),
    { enabled },
  );

export const useAcceptAgreement = (): UseMutationResult<
  AgreementRecord,
  ApiError,
  AgreementAcceptance
> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload) => endpoints.agreements.accept(payload),
    onSuccess: (data) => {
      client.setQueryData(queryKeys.agreement, data);
      void client.invalidateQueries({ queryKey: queryKeys.device });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
};

/**
 * Records the agreement and asks the phone to enrol, reporting what Android said.
 *
 * The result is deliberately not a `Device`: the service answers with what Android
 * reports and what the server then says, because a phone that claims to be
 * enrolled is not evidence that it is, and a screen that showed a `Device` here
 * would be showing the customer's own claim back to them.
 */
export const useEnrollDevice = (): UseMutationResult<
  { deviceState: DeviceState | null; nativeOutcome: EnrollmentStatus },
  ApiError,
  AgreementAcceptance
> => {
  const client = useQueryClient();
  return useMutation({
    // Through the service, so the phone's own report of itself travels with the
    // agreement rather than being left behind in the app.
    mutationFn: (payload) =>
      deviceManagementService.requestEnrollment({
        agreementVersion: payload.agreementVersion,
        signatureName: payload.signatureName,
        acceptedAt: payload.acceptedAt,
      }),
    onSuccess: (_result, payload) => {
      void client.invalidateQueries({ queryKey: queryKeys.device });
      void client.invalidateQueries({ queryKey: queryKeys.deviceStatus });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
      void client.invalidateQueries({ queryKey: queryKeys.agreement });
      return payload;
    },
  });
};

export const useInstallments = (enabled = true) =>
  useSafeQuery<Installment[]>(queryKeys.installments, () => endpoints.installments.list(), {
    enabled,
  });

export const useInstallmentPlan = (enabled = true) =>
  useSafeQuery<InstallmentPlan>(queryKeys.installmentPlan, () => endpoints.installments.plan(), {
    enabled,
  });

export const useInstallment = (id: string | undefined) =>
  useSafeQuery<Installment>(
    queryKeys.installment(id ?? ''),
    () => endpoints.installments.detail(id as string),
    { enabled: Boolean(id) },
  );

export const usePayments = (page = 1, enabled = true) =>
  useSafeQuery<Paginated<Payment>>(queryKeys.payments(page), () => endpoints.payments.history(page), {
    enabled,
  });

export const usePayment = (id: string | undefined, options?: { refetchInterval?: number }) =>
  useSafeQuery<Payment>(
    queryKeys.payment(id ?? ''),
    () => endpoints.payments.status(id as string),
    { enabled: Boolean(id), ...options },
  );

export const useCreatePayment = (): UseMutationResult<PaymentSession, ApiError, CreatePaymentRequest> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload) => endpoints.payments.create(payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['payments'] });
    },
  });
};

export const useNotifications = (page = 1, enabled = true) =>
  useSafeQuery<Paginated<AppNotification>>(
    queryKeys.notifications(page),
    () => endpoints.notifications.list(page),
    { enabled },
  );

export const useMarkNotificationRead = (): UseMutationResult<{ id: string }, ApiError, string> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id) => endpoints.notifications.markRead(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['notifications'] });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
};

export const useMarkAllNotificationsRead = (): UseMutationResult<{ count: number }, ApiError, void> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => endpoints.notifications.markAllRead(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['notifications'] });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
};

export const useTickets = (page = 1, enabled = true) =>
  useSafeQuery<Paginated<SupportTicket>>(
    queryKeys.tickets(page),
    () => endpoints.support.list(page),
    { enabled },
  );

export const useTicket = (id: string | undefined) =>
  useSafeQuery<SupportTicket>(
    queryKeys.ticket(id ?? ''),
    () => endpoints.support.detail(id as string),
    { enabled: Boolean(id) },
  );

export const useCreateTicket = (): UseMutationResult<SupportTicket, ApiError, CreateTicketRequest> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload) => endpoints.support.create(payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['support'] });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
};
