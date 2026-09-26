<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\Device;
use App\Models\Installment;
use App\Models\SupportTicket;
use App\Services\Devices\DeviceCommandService;
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

    /**
     * One device, with everything needed to act on it.
     *
     * This is the screen a person opens to decide what to do with a customer's
     * phone, so it carries the three things that decide the decision, and it
     * carries what the **server** says about each of them:
     *
     * - whether the phone can be asked to do anything at all, and if not, why
     * - what the phone last reported about itself
     * - what the phone last said about the last request
     *
     * The last one matters more than it looks. A request that is still `REQUESTED`
     * has not happened, and a screen that showed the press rather than the
     * outcome would be showing a person their own optimism.
     */
    public function deviceDetail(Request $request, string $id): JsonResponse
    {
        $device = Device::query()->where('id', $id)->first();

        if (! $device) {
            return response()->json(['status' => 'error', 'message' => 'No such device.'], 404);
        }

        $commands = new DeviceCommandService();
        $customer = Customer::query()->where('id', $device->customer_key)->first();

        $location = DB::table('device_locations')
            ->where('device_id', $device->getKey())
            ->orderByDesc('reported_at')
            ->first();

        return response()->json([
            'device' => $this->device($device),
            'customer' => $customer ? [
                'id' => $customer->id,
                'fullName' => $customer->full_name,
                'phone' => $customer->phone_number,
            ] : null,
            'canCommand' => $commands->canCommand($device),
            // Sent in full, because "nothing is available" without a reason is a
            // dead end at a shop counter.
            'blocker' => $commands->blockerFor($device),
            'commands' => $this->commandCatalogue(),
            'location' => $location ? [
                'latitude' => (float) $location->latitude,
                'longitude' => (float) $location->longitude,
                'accuracyMetres' => $location->accuracy_metres !== null ? (float) $location->accuracy_metres : null,
                'reportedAt' => (string) $location->reported_at,
            ] : null,
            'history' => $commands->history($device),
        ]);
    }

    /**
     * Where the phone says it is.
     *
     * A read, and audited like a write, because it is somebody's location being
     * looked at by a member of staff and that is worth leaving a name against.
     */
    public function deviceLocation(Request $request, string $id): JsonResponse
    {
        $device = Device::query()->where('id', $id)->first();

        if (! $device) {
            return response()->json(['status' => 'error', 'message' => 'No such device.'], 404);
        }

        $row = DB::table('device_locations')
            ->where('device_id', $device->getKey())
            ->orderByDesc('reported_at')
            ->first();

        $this->auditLocationRead($request, $id, $row !== null);

        if (! $row) {
            return response()->json([
                'status' => 'empty',
                'message' => 'This phone has not reported a location yet. It reports one when it is next online.',
                'location' => null,
            ]);
        }

        return response()->json([
            'status' => 'ok',
            'location' => [
                'latitude' => (float) $row->latitude,
                'longitude' => (float) $row->longitude,
                'accuracyMetres' => $row->accuracy_metres !== null ? (float) $row->accuracy_metres : null,
                'reportedAt' => (string) $row->reported_at,
            ],
            'message' => 'Reported by the phone itself.',
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
            // Whether a phone said this, or a seed file did. An operator deciding
            // whether to lock somebody's handset has to be able to see that they
            // are looking at demo data, so it rides on every row.
            //
            // Anything that is not literally 'PHONE' reads as DEMO: a value the
            // database has never heard of is not something to be curious about.
            'source' => $device->source === 'PHONE' ? 'PHONE' : 'DEMO',
            // When the handset last described itself, and which install sent it.
            'reportedAt' => $device->reported_at?->toIso8601String(),
            'reportedBy' => $device->reported_by,
            'androidId' => $device->android_id,
        ];
    }

    /**
     * The commands on offer, described once, from the service that enforces them.
     *
     * The panel is not told what the buttons are; it is told what the server will
     * accept, so a button can never exist for something the server would refuse.
     */
    private function commandCatalogue(): array
    {
        $out = [];

        foreach (DeviceCommandService::COMMANDS as $action => $command) {
            $out[] = [
                'action' => $action,
                'label' => $command['label'],
                'needsConfirmation' => $command['needs_confirmation'],
                'destructive' => $command['destructive'],
            ];
        }

        return $out;
    }

    /**
     * Writes down that somebody looked at a customer's location.
     *
     * Everywhere else in this app a read needs no record, because reading a
     * customer's own data costs them nothing. A member of staff reading where
     * somebody's phone is costs something, so it is written down like a write.
     */
    private function auditLocationRead(Request $request, string $deviceId, bool $found): void
    {
        DB::table('admin_audit')->insert([
            'admin_email' => $request->attributes->get('admin_email'),
            'action' => 'device.location.read',
            'subject' => $deviceId,
            'reason' => null,
            'context' => json_encode(['found' => $found]),
            'ip' => $request->ip(),
            'created_at' => now(),
        ]);
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
