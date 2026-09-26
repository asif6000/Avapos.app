/**
 * The `/admin` routes.
 *
 * Separate router, separate authentication, mounted at a prefix that the phone
 * never calls. `admin/src/lib/api.ts` already posts to `/admin/api/*`, so the
 * panel reaches these without a rebuild.
 *
 * Read paths live in the Laravel service until it is retired; this router is
 * where the *write* paths live, because the Express service is the one that can
 * be deployed. The one that exists today is a sale.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';

import { recordSale, SaleInputError } from './sales.js';
import { authenticateStaff, type Staff } from './staffAuth.js';

interface StaffedRequest extends Request {
  staff?: Staff;
}

export function adminRouter(): Router {
  const router = Router();

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    const result = await authenticateStaff(req.headers.authorization);
    if (!result.ok) {
      // 403, not 401, for a valid customer token: re-authenticating will not
      // help, and the panel should not offer a sign-in that changes nothing.
      const status = result.reason === 'not_staff' ? 403 : 401;
      res.status(status).json({ status: 'error', code: result.reason, message: 'Staff access required' });
      return;
    }
    (req as StaffedRequest).staff = result.staff;
    next();
  });

  router.get('/me', (req: Request, res: Response) => {
    const staff = (req as StaffedRequest).staff;
    res.json({ id: staff?.id, email: staff?.email });
  });

  /**
   * Sell a device on an installment plan.
   *
   * The request carries the store's figures and nothing else. The schedule is
   * computed here — see `sales.ts` — and the response reports what was actually
   * scheduled, including any rounding difference, so a figure the panel did not
   * expect is visible at the moment of the sale rather than in a customer's
   * statement next month.
   */
  router.post('/sales', async (req: Request, res: Response, next: NextFunction) => {
    const staff = (req as StaffedRequest).staff;
    if (!staff) {
      res.status(401).json({ status: 'error', code: 'no_token', message: 'Unauthorized request' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const customer = (body.customer ?? {}) as Record<string, unknown>;
    const device = (body.device ?? {}) as Record<string, unknown>;

    const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
    const asNumber = (value: unknown): number =>
      typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));

    try {
      const result = await recordSale(
        {
          customer: {
            id: asText(customer.id) || undefined,
            fullName: asText(customer.fullName),
            phone: asText(customer.phone),
            email: asText(customer.email).toLowerCase(),
          },
          device: {
            name: asText(device.name),
            manufacturer: asText(device.manufacturer),
            model: asText(device.model),
            androidVersion: asText(device.androidVersion) || null,
          },
          totalPrice: asNumber(body.totalPrice),
          downPayment: asNumber(body.downPayment),
          installmentCount: asNumber(body.installmentCount),
          firstDueDate: asText(body.firstDueDate),
        },
        staff,
      );

      res.status(201).json({ status: 'created', ...result });
    } catch (error) {
      if (error instanceof SaleInputError) {
        // 422, and the offending field, because this is a form the store is
        // filling in and it can be corrected rather than reported.
        res.status(422).json({
          status: 'error',
          code: 'invalid_sale',
          field: error.field,
          message: error.message,
        });
        return;
      }
      next(error);
    }
  });

  return router;
}
