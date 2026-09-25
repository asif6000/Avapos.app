<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\Device;
use App\Models\Installment;
use App\Models\SupportTicket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Reading, for staff.
 *
 * The panel asks the same API the customer app does, with its own session, and
 * this server decides what it may see. Nothing here trusts the request: every
 * list is scoped by the admin's own authorisation (already checked by
 * `RequireAdmin`) and every record is returned with the fields a support agent
 * genuinely needs — not a dump of the database.
 *
 * Money is always presented with the customer, because a transaction id on its
 * own is useless to a person trying to help someone at a counter, and a customer
 * on its own is useless to a person chasing money.
 */
class AdminReadController extends Controller
{
    /** Who is asking, and what they are allowed to be. */
    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'email' => $request->attributes->get('admin_email'),
            'role' => $request->attributes->get('admin_role'),
            'canWrite' => true,
        ]);
    }

    public function dashboard(Request $request): JsonResponse
    {
        $customers = Customer::query()->count();
        $devices = Device::query()->count();
        $restricted = Device::query()->whereIn('state', ['RESTRICTED', 'SUSPENDED'])->count();
        $openTickets = SupportTicket::query()->where('status', 'OPEN')->count();
        $outstanding = (float) Installment::query()
            ->where('status', '!=', 'PAID')
            ->sum(\DB::raw('amount - paid_amount'));
        $pendingPayments = CustomerPayment::query()->where('status', 'PENDING')->count();

        return response()->json([
            'customers' => $customers,
            'devices' => $devices,
            'restrictedDevices' => $restricted,
            'openTickets' => $openTickets,
            'pendingPayments' => $pendingPayments,
            'outstandingAmount' => $outstanding,
            'recentPayments' => CustomerPayment::query()
                ->orderByDesc('created_at')
                ->limit(8)
                ->get()
                ->map(fn ($p) => $this->payment($p))
                ->all(),
            'deviceStates' => Device::query()
                ->select('state', DB::raw('count(*) as total'))
                ->groupBy('state')
                ->pluck('total', 'state')
                ->all(),
        ]);
    }

    public function customers(Request $request): JsonResponse
    {
        $query = Customer::query()->orderBy('full_name');

        // A search box that a person can use: name, address or phone.
        if ($term = trim((string) $request->query('q', ''))) {
            $like = '%' . $term . '%';
            $query->where(function ($q) use ($like) {
                $q->where('full_name', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('phone_number', 'like', $like)
                    ->orWhere('id', 'like', $like);
            });
        }

        return response()->json([
            'items' => $query->limit((int) $request->integer('perPage', 50))->get()
                ->map(fn ($c) => $this->customerSummary($c))
                ->all(),
            'total' => $query->count(),
        ]);
    }

    /** Everything about one customer, in one place: the whole support call. */
    public function customer(Request $request, string $id): JsonResponse
    {
        $customer = Customer::query()->where('id', $id)->first();

        if (! $customer) {
            return response()->json(['status' => 'error', 'message' => 'No such customer.'], 404);
        }

        $installments = Installment::query()
            ->where('customer_key', $customer->getKey())
            ->orderBy('number')
            ->get();

        $device = Device::query()->where('customer_key', $customer->getKey())->first();

        $paid = (float) $installments->sum('paid_amount');
        $total = (float) $installments->sum('amount');

        return response()->json([
            'customer' => $this->customerSummary($customer),
            'device' => $device ? $this->device($device) : null,
            'installments' => $installments->map(fn ($i) => $this->installment($i))->all(),
            'payments' => CustomerPayment::query()
                ->where('customer_key', $customer->getKey())
                ->orderByDesc('date')
                ->get()
                ->map(fn ($p) => $this->payment($p))
                ->all(),
            'tickets' => SupportTicket::query()
                ->where('customer_key', $customer->getKey())
                ->orderByDesc('created_at')
                ->get()
                ->map(fn ($t) => $this->ticket($t))
                ->all(),
            'totals' => [
                'totalPrice' => $total,
                'paidAmount' => $paid,
                'outstandingAmount' => max(0, $total - $paid),
                'paidInstallments' => $installments->where('status', 'PAID')->count(),
                'totalInstallments' => $installments->count(),
            ],
        ]);
    }

    public function payments(Request $request): JsonResponse
    {
        $query = CustomerPayment::query()->orderByDesc('created_at');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($customer = $request->query('customer')) {
            $query->where('customer_key', $customer);
        }

        return response()->json([
            'items' => $query->limit((int) $request->integer('perPage', 50))->get()
                ->map(fn ($p) => $this->payment($p))
                ->all(),
        ]);
    }

    public function devices(Request $request): JsonResponse
    {
        $query = Device::query()->orderBy('id');

        if ($state = $request->query('state')) {
            $query->where('state', $state);
        }

        return response()->json([
            'items' => $query->limit((int) $request->integer('perPage', 100))->get()
                ->map(fn ($d) => $this->device($d))
                ->all(),
        ]);
    }

    public function tickets(Request $request): JsonResponse
    {
        $query = SupportTicket::query()->orderByDesc('created_at');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        return response()->json([
            'items' => $query->limit((int) $request->integer('perPage', 50))->get()
                ->map(fn ($t) => $this->ticket($t))
                ->all(),
        ]);
    }

    public function notifications(Request $request): JsonResponse
    {
        return response()->json([
            'items' => DB::table('notifications')
                ->orderByDesc('created_at')
                ->limit((int) $request->integer('perPage', 50))
                ->get()
                ->map(fn ($n) => [
                    'id' => $n->id,
                    'customerKey' => $n->customer_key,
                    'type' => $n->type,
                    'title' => $n->title,
                    'message' => $n->message,
                    'isRead' => (bool) $n->is_read,
                    'createdAt' => $n->created_at,
                ])
                ->all(),
        ]);
    }

    /**
     * Who did what.
     *
     * An admin can release a phone and cancel money, so the trail is part of the
     * feature rather than a nicety: an action with no record of who took it is
     * indistinguishable from a bug.
     */
    public function audit(Request $request): JsonResponse
    {
        return response()->json([
            'items' => DB::table('admin_audit')
                ->orderByDesc('created_at')
                ->limit((int) $request->integer('perPage', 50))
                ->get()
                ->map(fn ($a) => [
                    'id' => $a->id,
                    'adminEmail' => $a->admin_email,
                    'action' => $a->action,
                    'subject' => $a->subject,
                    'reason' => $a->reason,
                    'createdAt' => $a->created_at,
                ])
                ->all(),
        ]);
    }

    // ---- presenters: one place, so a field cannot mean two things ---------

    private function customerSummary(Customer $customer): array
    {
        return [
            'id' => $customer->getKey(),
            'fullName' => $customer->full_name,
            'email' => $customer->email,
            'phone' => $customer->phone_number,
            'language' => $customer->language,
            'enrolled' => (bool) ($customer->is_enrolled ?? false),
            'createdAt' => $customer->created_at?->toIso8601String(),
        ];
    }

    private function installment(Installment $installment): array
    {
        return [
            'id' => $installment->id,
            'number' => $installment->number,
            'amount' => (float) $installment->amount,
            'paidAmount' => (float) $installment->paid_amount,
            'outstanding' => max(0, (float) $installment->amount - (float) $installment->paid_amount),
            'status' => $installment->status,
            'dueDate' => $installment->due_date?->toDateString(),
            'paidAt' => $installment->paid_at?->toIso8601String(),
        ];
    }

    private function payment(CustomerPayment $payment): array
    {
        return [
            'id' => $payment->transaction_id,
            'customerKey' => $payment->customer_key,
            'installmentNumber' => $payment->installment_number,
            'amount' => (float) $payment->amount,
            'status' => strtoupper((string) $payment->status),
            'method' => $payment->payment_method,
            'gatewayReference' => $payment->receipt_url,
            'paidAt' => $payment->date?->toIso8601String(),
            'createdAt' => $payment->created_at?->toIso8601String(),
        ];
    }

    private function device(Device $device): array
    {
        return [
            'id' => $device->id,
            'customerKey' => $device->customer_key,
            'name' => $device->device_name,
            'manufacturer' => $device->manufacturer,
            'model' => $device->model,
            'androidVersion' => $device->android_version,
            'state' => $device->state,
            'enrollmentStatus' => $device->enrollment_status,
            'managementStatus' => $device->management_status,
            'isManaged' => (bool) $device->is_managed,
            'contractId' => $device->contract_id,
            'lastSyncAt' => $device->last_sync_time?->toIso8601String(),
        ];
    }

    private function ticket(SupportTicket $ticket): array
    {
        return [
            'id' => $ticket->id,
            'customerKey' => $ticket->customer_key,
            'subject' => $ticket->subject,
            'message' => $ticket->message,
            'category' => $ticket->category,
            'status' => $ticket->status,
            'response' => $ticket->admin_response,
            'createdAt' => $ticket->created_at?->toIso8601String(),
        ];
    }
}
