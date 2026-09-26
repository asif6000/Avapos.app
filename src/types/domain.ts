/**
 * Core domain types.
 *
 * The backend is the single source of truth for every value in this file. The
 * app never derives financial or device-management state locally.
 */

export type DeviceState =
  | 'ACTIVE'
  | 'PAYMENT_DUE'
  | 'GRACE_PERIOD'
  | 'RESTRICTED'
  | 'UNLOCK_PENDING'
  | 'UNLOCKED'
  | 'SUSPENDED';

export const DEVICE_STATES: readonly DeviceState[] = [
  'ACTIVE',
  'PAYMENT_DUE',
  'GRACE_PERIOD',
  'RESTRICTED',
  'UNLOCK_PENDING',
  'UNLOCKED',
  'SUSPENDED',
] as const;

/** States in which the app must present the restriction experience. */
export const RESTRICTED_STATES: readonly DeviceState[] = [
  'RESTRICTED',
  'SUSPENDED',
] as const;

export function isDeviceState(value: unknown): value is DeviceState {
  return typeof value === 'string' && (DEVICE_STATES as readonly string[]).includes(value);
}

export type EnrollmentStatus =
  | 'NOT_ENROLLED'
  | 'PENDING'
  | 'ENROLLED'
  | 'ENROLLMENT_FAILED'
  | 'UNSUPPORTED';

export type ManagementStatus =
  | 'UNSUPPORTED'
  | 'NOT_ENROLLED'
  | 'ENROLLED'
  | 'MANAGED_BY_ENTERPRISE';

export type ContractStatus =
  | 'ACTIVE'
  | 'OVERDUE'
  | 'COMPLETED'
  | 'DEFAULTED'
  | 'CANCELLED';

export type InstallmentStatus = 'PAID' | 'DUE' | 'OVERDUE' | 'UPCOMING' | 'PARTIAL';

export type PaymentStatus = 'SUCCESS' | 'PENDING' | 'FAILED' | 'REFUNDED';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type TicketCategory =
  | 'PAYMENT'
  | 'DEVICE'
  | 'INSTALLMENT'
  | 'ACCOUNT'
  | 'OTHER';

export type NotificationType =
  | 'INSTALLMENT_DUE_SOON'
  | 'PAYMENT_DUE_TODAY'
  | 'PAYMENT_OVERDUE'
  | 'PAYMENT_SUCCESSFUL'
  | 'DEVICE_STATUS_CHANGED'
  | 'DEVICE_RESTRICTION_NOTICE'
  | 'DEVICE_ACCESS_RESTORED'
  | 'SUPPORT_RESPONSE'
  | 'GENERAL';

export interface Customer {
  id: string;
  fullName: string;
  email: string;
  /** The address the customer is verified against. */
  phone: string | null;
  photoUrl: string | null;
  language: 'en' | 'bn';
  verifiedAt: string | null;
  createdAt: string;
}

export interface Device {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  androidVersion: string | null;
  enrollmentStatus: EnrollmentStatus;
  managementStatus: ManagementStatus;
  deviceState: DeviceState;
  lastSyncedAt: string | null;
  contractId: string;
  agreementVersion: string | null;
  agreementAcceptedAt: string | null;
  /** Only ever present for devices managed by an enterprise DPC. */
  enterpriseManaged: boolean;
}

export interface DeviceStatus {
  deviceState: DeviceState;
  enrollmentStatus: EnrollmentStatus;
  managementStatus: ManagementStatus;
  lastSyncedAt: string | null;
  serverTime: string;
  outstandingAmount: number | null;
  dueDate: string | null;
  restrictionReason: string | null;
  unlockAuthorizedAt: string | null;
}

/**
 * What this phone says about itself.
 *
 * Every field is Android's own answer, forwarded so the server can match the phone
 * to the contract it was sold on — and so an operator looking at a device knows
 * which handset they are actually looking at rather than a row somebody typed.
 * These are exactly the fields the consent screen lists, and no more: there is no
 * IMEI, no serial, no advertising id, and no location.
 *
 * A report is a **report**. It grants nothing. The server revalidates the contract
 * and decides access on its own; a phone that reports `ENROLLED` does not thereby
 * become enrolled, and one that reports `NOT_ENROLLED` is not accused of anything.
 */
export interface DeviceReport {
  androidId: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  /** Android's API level. Part of "which Android", and not a separate secret. */
  sdkInt: number | null;
  /** What Android says about who manages this phone. A fact about the phone. */
  managed: boolean;
  managementStatus: ManagementStatus;
  enrollmentStatus: EnrollmentStatus;
}

export interface Installment {
  id: string;
  contractId: string;
  number: number;
  amount: number;
  paidAmount: number;
  status: InstallmentStatus;
  dueDate: string;
  paidAt: string | null;
}

export interface InstallmentPlan {
  contractId: string;
  status: ContractStatus;
  totalPrice: number;
  downPayment: number;
  paidAmount: number;
  remainingAmount: number;
  installmentAmount: number;
  totalInstallments: number;
  paidInstallments: number;
  remainingInstallments: number;
  nextDueDate: string | null;
  nextInstallmentId: string | null;
  currency: string;
}

export interface Payment {
  id: string;
  transactionId: string;
  installmentId: string | null;
  installmentNumber: number | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: string;
  paidAt: string | null;
  createdAt: string;
  gateway: string;
}

export interface PaymentSession {
  paymentId: string;
  orderId: string;
  /** Gateway-hosted URL. Contains no secret material. */
  redirectUrl: string;
  gateway: string;
  expiresAt: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  referenceId: string | null;
}

export interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  category: TicketCategory;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  response: string | null;
  respondedAt: string | null;
}

export interface DashboardSummary {
  customer: Customer;
  device: Device | null;
  plan: InstallmentPlan | null;
  nextInstallment: Installment | null;
  deviceStatus: DeviceStatus | null;
  unreadNotificationCount: number;
  openTicketCount: number;
}

export interface AgreementRecord {
  id: string;
  agreementVersion: string;
  acceptedAt: string;
  customerName: string;
  contractId: string;
}

export interface AgreementAcceptance {
  agreementVersion: string;
  accepted: true;
  acceptedAt: string;
  signatureName: string;
  deviceName: string;
}

export interface AppSettings {
  notificationsEnabled: boolean;
  paymentRemindersEnabled: boolean;
  deviceStatusAlertsEnabled: boolean;
  marketingEnabled: boolean;
  language: 'en' | 'bn';
  theme: 'system' | 'light' | 'dark';
}
