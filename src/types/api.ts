export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFailure {
  success: false;
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/**
 * Authentication is passwordless: an emailed code, verified by the backend.
 * There is no password anywhere in the app, so none can be phished, reused or
 * leaked from a breached database.
 */
export interface OtpRequest {
  email: string;
}

export interface OtpVerifyRequest {
  email: string;
  code: string;
}

export interface OtpChallenge {
  /** Opaque handle for the challenge, echoed back on verify. */
  challengeId: string;
  sent: boolean;
  expiresIn: number;
  resendAfter: number;
  /** False when the address is unknown, so the UI can still avoid account enumeration. */
  accountExists: boolean;
}

/** Post-verification profile setup. The address is already verified by then. */
export interface RegisterRequest {
  fullName: string;
  deviceName: string;
  agreementVersion: string;
}

export interface AuthSession extends AuthTokens {
  customerId: string;
  fullName: string;
  email: string;
  /** Server's view of whether the address is confirmed. */
  emailVerified: boolean;
}

export interface CreatePaymentRequest {
  installmentId: string;
  gateway: string;
  /** Display amount only. The backend re-validates every amount. */
  amount: number;
}

export interface CreateTicketRequest {
  subject: string;
  message: string;
  category: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}
