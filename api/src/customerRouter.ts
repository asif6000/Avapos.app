/**
 * The `/customer` routes.
 *
 * Every response shape here is copied from `mock-server/server.mjs`, which is the
 * reference the app already renders against. Matching it exactly is the point: a
 * customer switching from the mock to this service must not see a single screen
 * change, so no screen in the app needed changing and none was changed.
 *
 * Read-only, and that is enforced in two places. Only GET is routed, and the
 * router installs a guard that answers 405 to anything else — so a POST to
 * `payments/create` cannot reach a handler even if one is added later by mistake.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';

import { acceptAgreement, AgreementError, readCurrentAgreement } from './agreements.js';
import { authenticate, type CustomerRecord } from './auth.js';
import { config } from './supabase.js';
import {
  countOpenTickets,
  countUnreadNotifications,
  readDevice,
  readNotifications,
  readPayments,
  readPlan,
  readTickets,
} from './reads.js';
import type { DeviceRow, NotificationRow, PaymentRow, TicketRow } from './supabase.js';

/** `req.customer` is set by `requireCustomer` and nowhere else. */
interface AuthedRequest extends Request {
  customer?: CustomerRecord;
}

function customerOf(req: Request): CustomerRecord {
  const customer = (req as AuthedRequest).customer;
  if (!customer) throw new Error('requireCustomer did not run');
  return customer;
}

/** Response shapes, matching the mock exactly. */

function presentDevice(device: DeviceRow) {
  return {
    id: device.id,
    name: device.device_name ?? 'Device',
    manufacturer: device.manufacturer ?? '',
    model: device.model ?? '',
    androidVersion: device.android_version,
    enrollmentStatus: device.enrollment_status ?? 'NOT_ENROLLED',
    managementStatus: device.management_status ?? 'NOT_ENROLLED',
    deviceState: device.state ?? 'UNKNOWN',
    lastSyncedAt: device.last_sync_time,
    contractId: device.contract_id ?? '',
    agreementVersion: null,
    agreementAcceptedAt: null,
    enterpriseManaged: false,
  };
}

function presentPayment(payment: PaymentRow) {
  // `src/types/domain.ts` → `Payment`. The mock spreads raw columns here, which
  // does not produce this shape; the TypeScript interface is the contract the app
  // compiles against, so it is the one followed here.
  return {
    id: payment.transaction_id,
    transactionId: payment.transaction_id,
    installmentId: null,
    installmentNumber: payment.installment_number ?? null,
    amount: Number(payment.amount),
    currency: 'BDT',
    status: payment.status,
    method: payment.payment_method ?? 'CARD',
    paidAt: payment.status === 'SUCCESS' ? payment.date : null,
    createdAt: payment.created_at ?? '',
    gateway: 'UDDOKTAPAY',
  };
}

function presentTicket(ticket: TicketRow) {
  return {
    id: ticket.id,
    subject: ticket.subject ?? '',
    message: ticket.message ?? '',
    category: ticket.category ?? 'GENERAL',
    status: ticket.status ?? 'OPEN',
    createdAt: ticket.created_at ?? '',
    updatedAt: ticket.created_at ?? '',
    response: ticket.admin_response ?? null,
    respondedAt: ticket.admin_response ? ticket.created_at : null,
  };
}

function presentNotification(note: NotificationRow) {
  return {
    id: note.id,
    type: note.type ?? 'GENERAL',
    title: note.title ?? '',
    message: note.message ?? '',
    isRead: note.is_read === true,
    createdAt: note.created_at ?? '',
    referenceId: note.reference_id ?? null,
  };
}

function presentCustomer(customer: CustomerRecord) {
  return {
    id: customer.id,
    fullName: customer.fullName || 'New customer',
    phone: customer.phone,
    email: customer.email,
    photoUrl: null,
    language: customer.language,
    verifiedAt: customer.createdAt,
    createdAt: customer.createdAt,
  };
}

/**
 * Authenticate, and answer with the right status for each failure.
 *
 * The statuses are not interchangeable. 401 is "this token is not usable, sign in
 * again". 403 is "the token is perfectly good, but there is no customer behind
 * it" — a link made when a phone is sold. The app shows a different screen for
 * each, and collapsing them into one is what made the deployed service's 401
 * impossible to tell apart from a real missing customer.
 */
async function requireCustomer(req: Request, res: Response): Promise<boolean> {
  const result = await authenticate(req.headers.authorization, config.projectRef);

  if (!result.ok) {
    if (result.reason === 'no_customer') {
      res.status(403).json({
        status: 'error',
        code: 'customer_not_found',
        message: 'This sign-in has no customer record. The link is made when a device is sold.',
      });
      return false;
    }
    res.status(401).json({ status: 'error', code: result.reason, message: 'Unauthorized request' });
    return false;
  }

  (req as AuthedRequest).customer = result.customer;
  return true;
}

export function customerRouter(): Router {
  const router = Router();

  // Read-only, with exactly one documented exception.
  //
  // `router.use`, not `router.all('*')` — Express 5's path-to-regexp rejects a
  // bare `*` and throws while the router is being built, which the route test
  // caught before a deploy would have.
  //
  // The exception is the customer's own consent. Everything else here is a read,
  // and in particular every money and device-state write stays off this service:
  // the request to mark a payment paid or a device released comes from the
  // gateway and the panel, not from a phone.
  router.use((req: Request, res: Response, next: NextFunction) => {
    const isConsent = req.path === '/agreements/device-management/accept';

    if (req.method !== 'GET' && req.method !== 'HEAD' && !(isConsent && req.method === 'POST')) {
      res.status(405).json({
        status: 'error',
        code: 'read_only',
        message: 'This service does not handle that write. Payments and device state are not changed here.',
      });
      return;
    }
    next();
  });

  router.get('/', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      const customer = customerOf(req);
      res.json({ ok: true, id: customer.id });
    } catch (error) {
      next(error);
    }
  });

  router.get('/profile', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      res.json(presentCustomer(customerOf(req)));
    } catch (error) {
      next(error);
    }
  });

  /**
   * The consent the customer has already given, or null.
   *
   * Null is a normal answer and the enrollment screen has to be able to render it
   * without treating it as a failure.
   */
  router.get('/agreements/device-management/current', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      const agreement = await readCurrentAgreement(customerOf(req));
      // The shape the app reads is a record, so a customer with none gets a
      // 404-shaped answer the enrollment screen already handles.
      if (!agreement) {
        res.status(404).json({
          status: 'error',
          code: 'no_agreement',
          message: 'The device management agreement has not been accepted yet.',
        });
        return;
      }
      res.json(agreement);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Record the customer's acceptance.
   *
   * The only write a customer can make, and the only one that is theirs to make.
   * `customer_key` comes from the verified session, never from the body.
   */
  router.post('/agreements/device-management/accept', async (req: Request, res: Response, next: NextFunction) => {
    // Authenticate first. An earlier version of this handler read `req.customer`
    // directly and so never verified anything: with no session it threw, surfaced
    // as 503, and with a session it would have written a consent record against
    // whoever the request happened to arrive for. `requireCustomer` is the only
    // thing that sets `req.customer`, so it has to run on every route.
    if (!(await requireCustomer(req, res))) return;
    const customer = customerOf(req);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

    try {
      const result = await acceptAgreement(customer, {
        agreementVersion: asText(body.agreementVersion),
        acceptedByName: asText(body.acceptedByName ?? body.fullName),
      });
      res.status(result.created ? 201 : 200).json(result.agreement);
    } catch (error) {
      if (error instanceof AgreementError) {
        res.status(422).json({
          status: 'error',
          code: 'invalid_agreement',
          field: error.field,
          message: error.message,
        });
        return;
      }
      next(error);
    }
  });

  router.get('/settings', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      const customer = customerOf(req);
      const plan = await readPlan(customer);
      res.json({
        language: customer.language ?? 'en',
        pushNotifications: true,
        overdueReminders: true,
        nextDueDate: plan?.nextDueDate ?? null,
        supportPhone: '09612-000000',
        agreementVersion: '1.0.0',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * The whole Home screen, assembled here.
   *
   * One request, not six. The phone is not allowed to assemble its own home
   * screen from separate reads: six partial failures produce a dashboard that is
   * half real, which is worse than an error.
   */
  router.get('/dashboard', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      const customer = customerOf(req);

      const [plan, device, unread, openTickets] = await Promise.all([
        readPlan(customer),
        readDevice(customer),
        countUnreadNotifications(customer),
        countOpenTickets(customer),
      ]);

      const nextInstallment = plan?.installments.find((i) => i.status !== 'PAID') ?? null;
      const outstanding = plan ? plan.remainingAmount : 0;

      res.json({
        customer: presentCustomer(customer),
        device: device ? presentDevice(device) : null,
        plan: plan
          ? {
              contractId: plan.contractId,
              status: plan.status,
              totalPrice: plan.totalPrice,
              downPayment: plan.downPayment,
              paidAmount: plan.paidAmount,
              remainingAmount: plan.remainingAmount,
              installmentAmount: plan.installmentAmount,
              totalInstallments: plan.totalInstallments,
              paidInstallments: plan.paidInstallments,
              remainingInstallments: plan.remainingInstallments,
              nextDueDate: plan.nextDueDate,
              nextInstallmentId: plan.nextInstallmentId,
              currency: plan.currency,
              scheduleSource: plan.scheduleSource,
              scheduleNote: plan.scheduleNote,
            }
          : null,
        nextInstallment,
        deviceStatus: device
          ? {
              deviceState: device.state ?? 'UNKNOWN',
              enrollmentStatus: device.enrollment_status ?? 'NOT_ENROLLED',
              managementStatus: device.management_status ?? 'NOT_ENROLLED',
              lastSyncedAt: device.last_sync_time,
              serverTime: new Date().toISOString(),
              outstandingAmount: outstanding,
              dueDate: plan?.nextDueDate ?? null,
              restrictionReason: null,
              unlockAuthorizedAt: null,
            }
          : null,
        unreadNotificationCount: unread,
        openTicketCount: openTickets,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/installments', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      const plan = await readPlan(customerOf(req));
      res.json(plan?.installments ?? []);
    } catch (error) {
      next(error);
    }
  });

  router.get('/installments/plan', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      const plan = await readPlan(customerOf(req));
      if (!plan) {
        res.status(404).json({ status: 'error', code: 'not_found', message: 'No installment plan' });
        return;
      }
      const { installments, scheduleNote, scheduleSource, ...rest } = plan;
      res.json({ ...rest, scheduleSource, scheduleNote });
    } catch (error) {
      next(error);
    }
  });

  router.get('/devices/me', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      const device = await readDevice(customerOf(req));
      if (!device) {
        res.status(404).json({ status: 'error', code: 'not_found', message: 'Not Found' });
        return;
      }
      res.json(presentDevice(device));
    } catch (error) {
      next(error);
    }
  });

  router.get('/devices/me/status', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      const customer = customerOf(req);
      const [device, plan] = await Promise.all([readDevice(customer), readPlan(customer)]);
      if (!device) {
        res.status(404).json({ status: 'error', code: 'not_found', message: 'Not Found' });
        return;
      }
      res.json({
        deviceState: device.state ?? 'UNKNOWN',
        enrollmentStatus: device.enrollment_status ?? 'NOT_ENROLLED',
        managementStatus: device.management_status ?? 'NOT_ENROLLED',
        lastSyncedAt: device.last_sync_time,
        serverTime: new Date().toISOString(),
        outstandingAmount: plan?.remainingAmount ?? 0,
        dueDate: plan?.nextDueDate ?? null,
        restrictionReason: null,
        unlockAuthorizedAt: null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/payments', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      const payments = await readPayments(customerOf(req));
      res.json({ items: payments.map(presentPayment) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/support/tickets', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      const tickets = await readTickets(customerOf(req));
      res.json({ items: tickets.map(presentTicket) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/notifications', async (req, res, next) => {
    try {
      if (!(await requireCustomer(req, res))) return;
      const notes = await readNotifications(customerOf(req));
      const items = notes.map(presentNotification);
      // The envelope the app's `Paginated<T>` expects. A list without it is a
      // list the notification centre cannot page.
      res.json({ items, page: 1, perPage: 20, total: items.length, hasMore: false });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
