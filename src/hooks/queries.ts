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
import type { CreatePaymentRequest, CreateTicketRequest, Paginated } from '@/types/api';
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

function useSafeQuery<T>(
  queryKey: readonly unknown[],
  fetcher: () => Promise<T>,
  options: { enabled?: boolean } = {},
): UseQueryResult<T, ApiError> {
  return useQuery<T, ApiError>({
    queryKey,
    queryFn: fetcher,
    enabled: options.enabled ?? true,
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

export const useDevice = (enabled = true) =>
  useSafeQuery<Device>(queryKeys.device, () => endpoints.device.get(), { enabled });

export const useDeviceStatus = (enabled = true) =>
  useSafeQuery<DeviceStatus>(queryKeys.deviceStatus, () => endpoints.device.status(), { enabled });

export const useSyncDevice = (): UseMutationResult<DeviceStatus, ApiError, void> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => endpoints.device.sync(),
    onSuccess: (data) => {
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

export const useEnrollDevice = (): UseMutationResult<Device, ApiError, AgreementAcceptance> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      endpoints.device.enroll({
        agreementVersion: payload.agreementVersion,
        signatureName: payload.signatureName,
        acceptedAt: payload.acceptedAt,
      }),
    onSuccess: (data) => {
      client.setQueryData(queryKeys.device, data);
      void client.invalidateQueries({ queryKey: queryKeys.deviceStatus });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
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
