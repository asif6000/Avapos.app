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

export interface LoginRequest {
  phone: string;
  password?: string;
}

export interface OtpRequest {
  phone: string;
}

export interface OtpVerifyRequest {
  phone: string;
  code: string;
}

export interface RegisterRequest {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  deviceName: string;
  agreementVersion: string;
}

export interface AuthSession extends AuthTokens {
  customerId: string;
  fullName: string;
  phone: string;
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
