<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Services\Customer\PlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The installment schedule.
 *
 * Every read here is scoped to the customer resolved from the session token. No
 * route takes a customer id, and the single route that takes an installment id
 * (`show`) filters on `customer_key` as well as on the id — so a customer who
 * guesses or edits another customer's installment id gets a 404, not that
 * person's schedule.
 */
class InstallmentController extends Controller
{
    public function __construct(private readonly PlanService $plans) {}

    /**
     * The whole schedule, in order.
     *
     * Not paginated: a financing contract is a fixed, known-length list that a
     * customer is expected to be able to scroll through in full, and the app's
     * Installments tab renders it as one screen.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $installments = $customer->installments()
            ->orderBy('number')
            ->get()
            ->map(fn ($i) => $i->present())
            ->all();

        return response()->json($installments);
    }

    /**
     * The plan totals.
     *
     * Shares {@see PlanService} with the dashboard so the two screens cannot
     * compute a different answer to "how much do I owe".
     *
     * 404 rather than an empty plan when the customer has no schedule: a plan of
     * zeroes would tell somebody their phone costs nothing.
     */
    public function plan(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $installments = $customer->installments()->orderBy('number')->get();
        $plan = $this->plans->present($installments);

        if ($plan === null) {
            return response()->json(
                ['status' => 'error', 'message' => 'Not Found'],
                404
            );
        }

        return response()->json($plan);
    }

    /**
     * One installment, with the payments recorded against it.
     *
     * The payments are included because this screen is where a customer goes to
     * answer "did my last payment go to this?". They are read from this server's
     * own verified records — `status` here is what the gateway was asked and
     * confirmed, never what a redirect claimed.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $installment = $customer->installments()->where('id', $id)->first();

        if ($installment === null) {
            return response()->json(
                ['status' => 'error', 'message' => 'Not Found'],
                404
            );
        }

        $payments = CustomerPayment::query()
            ->where('customer_key', $customer->getKey())
            ->where('installment_number', $installment->number)
            ->orderByDesc('date')
            ->get()
            ->map(fn (CustomerPayment $p) => [
                'id' => $p->transaction_id,
                'transactionId' => $p->transaction_id,
                'installmentId' => $p->installment_number,
                'installmentNumber' => $p->installment_number,
                'amount' => (float) $p->amount,
                'currency' => 'BDT',
                'status' => strtoupper((string) $p->status),
                'method' => $p->payment_method,
                'paidAt' => optional($p->date)->toIso8601String(),
                'createdAt' => optional($p->created_at)->toIso8601String(),
                'gateway' => $p->payment_method,
            ])
            ->all();

        return response()->json([
            ...$installment->present(),
            'payments' => $payments,
        ]);
    }
}
