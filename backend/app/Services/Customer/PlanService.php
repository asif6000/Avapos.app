<?php

namespace App\Services\Customer;

use App\Models\Installment;
use Illuminate\Support\Collection;

/**
 * Turns a customer's installment rows into the plan the app renders.
 *
 * WHY THIS IS A SEPARATE CLASS
 *
 * The dashboard and `GET /installments/plan` both need the same eleven figures,
 * and they were computed twice. Two computations of "what is still owed" is two
 * chances for the Home screen and the Installments screen to disagree about a
 * customer's debt, which is the one thing a financing app must never do. There is
 * one implementation and both routes call it.
 *
 * EVERY FIGURE COMES FROM THE CONTRACT
 *
 * Nothing here is derived from what the phone says, from a cached total, or from
 * what the app last displayed. The input is the `installments` table and nothing
 * else, and `paid_amount` is only ever advanced by a payment this server
 * verified through the gateway.
 */
class PlanService
{
    /**
     * The next installment a customer still owes, earliest first.
     *
     * `PAID` is the only status that means there is nothing left to pay on that
     * row. A `PARTIAL` one is still owed — that is the whole meaning of partial —
     * so it is included here and shows up as the thing to pay next.
     *
     * @param  Collection<int, Installment>  $installments
     */
    public function nextInstallment(Collection $installments): ?Installment
    {
        return $installments
            ->filter(fn (Installment $i) => $i->status !== 'PAID')
            ->sortBy('number')
            ->first();
    }

    /**
     * Total still owed across the whole schedule.
     *
     * @param  Collection<int, Installment>  $installments
     */
    public function outstanding(Collection $installments): float
    {
        return round($installments->sum(
            fn (Installment $i) => max(0.0, (float) $i->amount - (float) $i->paid_amount)
        ), 2);
    }

    /**
     * The shape the app's `InstallmentPlan` type expects, or null when the
     * customer has no schedule at all.
     *
     * Null rather than a zeroed plan: a customer with no contract has no plan,
     * and rendering `totalPrice: 0` on the Installments tab would tell them their
     * phone costs nothing.
     *
     * @param  Collection<int, Installment>  $installments
     * @return array<string, mixed>|null
     */
    public function present(Collection $installments): ?array
    {
        if ($installments->isEmpty()) {
            return null;
        }

        $sorted = $installments->sortBy('number')->values();
        $first = $sorted->first();
        $next = $this->nextInstallment($sorted);

        $paid = (float) $sorted->sum('paid_amount');
        $total = (float) $sorted->sum('amount');
        $paidCount = $sorted->where('status', 'PAID')->count();

        return [
            'contractId' => $first->contract_id,
            'status' => $this->contractStatus($sorted),
            'totalPrice' => round($total, 2),
            // The first row of a seeded schedule is the down payment, which is why
            // it is larger than the installments that follow it.
            'downPayment' => (float) $first->amount,
            'paidAmount' => round($paid, 2),
            'remainingAmount' => $this->outstanding($sorted),
            'installmentAmount' => (float) ($sorted->count() > 1 ? $sorted[1]->amount : $first->amount),
            'totalInstallments' => $sorted->count(),
            'paidInstallments' => $paidCount,
            'remainingInstallments' => $sorted->count() - $paidCount,
            'nextDueDate' => $next?->due_date?->toDateString(),
            'nextInstallmentId' => $next?->getKey(),
            'currency' => 'BDT',
        ];
    }

    /**
     * The contract's own status, derived from the schedule.
     *
     * Derived rather than stored, so it cannot disagree with the rows it is
     * computed from. `OVERDUE` is a fact about a due date that has passed with
     * money outstanding — it is not a judgement about the customer, and it is
     * reversed by paying, which is the entire point of the product.
     *
     * @param  Collection<int, Installment>  $installments
     */
    public function contractStatus(Collection $installments): string
    {
        if ($installments->isEmpty()) {
            return 'CANCELLED';
        }

        if ($installments->every(fn (Installment $i) => $i->status === 'PAID')) {
            return 'COMPLETED';
        }

        $today = now()->startOfDay();
        $hasOverdue = $installments->contains(
            fn (Installment $i) => $i->status !== 'PAID'
                && $i->due_date?->startOfDay()->isBefore($today)
        );

        return $hasOverdue ? 'OVERDUE' : 'ACTIVE';
    }
}
