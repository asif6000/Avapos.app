<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The tables the assembled customer views are built from.
 *
 * WHY EVERY STATEMENT HERE IS GUARDED
 *
 * This project is not starting from an empty database. `profiles`, `payments`,
 * `devices`, `notifications` and `support_tickets` already exist on the live
 * Supabase project — `sql/01-stop-the-bleed.sql` revokes anonymous access to
 * exactly those five, which is only possible if they are there.
 *
 * So this migration is written to be run against a database that already has
 * them. It creates what is missing and adds the columns the controllers read,
 * and it does nothing at all for anything already present. An unguarded
 * `create` would fail on the live project and take every statement after it
 * with it, which is the worst possible outcome for a migration whose whole job
 * is to unblock a deploy.
 *
 * It is therefore safe to run on a fresh database, on the live one, and twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ---- installments ---------------------------------------------------
        // The schedule a device was sold on. This is the table the Installments
        // tab and the dashboard's money figures are both derived from, and it is
        // keyed by `customer_key` (a readable string, matching `profiles.id`)
        // rather than by a uuid, because that is the column
        // `sql/04-link-demo-customer.sql` backfills.
        if (! Schema::hasTable('installments')) {
            Schema::create('installments', function (Blueprint $table) {
                $table->string('id')->primary();
                $table->string('customer_key')->index();
                $table->string('contract_id')->index();
                $table->unsignedInteger('number');
                $table->decimal('amount', 12, 2);
                $table->decimal('paid_amount', 12, 2)->default(0);
                $table->string('status', 16)->default('UPCOMING');
                $table->date('due_date');
                $table->timestamp('paid_at')->nullable();
                $table->timestamps();

                $table->unique(['customer_key', 'number']);
            });
        }

        Schema::table('installments', function (Blueprint $table) {
            foreach ([
                'customer_key' => fn ($t) => $t->string('customer_key')->nullable(),
                'contract_id' => fn ($t) => $t->string('contract_id')->nullable(),
                'number' => fn ($t) => $t->unsignedInteger('number')->nullable(),
                'amount' => fn ($t) => $t->decimal('amount', 12, 2)->nullable(),
                'paid_amount' => fn ($t) => $t->decimal('paid_amount', 12, 2)->default(0),
                'status' => fn ($t) => $t->string('status', 16)->default('UPCOMING'),
                'due_date' => fn ($t) => $t->date('due_date')->nullable(),
                'paid_at' => fn ($t) => $t->timestamp('paid_at')->nullable(),
            ] as $column => $add) {
                if (! Schema::hasColumn('installments', $column)) {
                    $add($table);
                }
            }
        });

        // ---- customer_agreements -------------------------------------------
        // The signed device-management agreement.
        //
        // Recorded BEFORE any enrollment is attempted, and never by the phone
        // writing its own consent: `accepted_at` and `signature_name` arrive
        // with the request, and the row exists so a later dispute can be
        // answered with a version and a timestamp rather than an assertion.
        if (! Schema::hasTable('customer_agreements')) {
            Schema::create('customer_agreements', function (Blueprint $table) {
                $table->id();
                $table->string('customer_key')->unique();
                $table->string('contract_id')->nullable();
                $table->string('agreement_version');
                $table->string('signature_name');
                $table->string('device_name')->nullable();
                $table->timestamp('accepted_at');
                $table->timestamps();
            });
        }

        // ---- customer_settings ----------------------------------------------
        // Notification preferences and theme. Nothing about money or device
        // state lives here: a customer may change how the app looks and when it
        // speaks to them, and nothing else about their account.
        if (! Schema::hasTable('customer_settings')) {
            Schema::create('customer_settings', function (Blueprint $table) {
                $table->id();
                $table->string('customer_key')->unique();
                $table->boolean('notifications_enabled')->default(true);
                $table->boolean('payment_reminders_enabled')->default(true);
                $table->boolean('device_status_alerts_enabled')->default(true);
                $table->boolean('marketing_enabled')->default(false);
                $table->string('theme', 8)->default('system');
                $table->timestamps();
            });
        }

        // ---- devices: the columns the report lands in ------------------------
        // `sql/06-device-report.sql` adds these by hand. They are declared here
        // as well, guarded, so a fresh database does not need a second script
        // and the live one is left exactly as 06 made it.
        Schema::table('devices', function (Blueprint $table) {
            if (! Schema::hasColumn('devices', 'android_id')) {
                $table->string('android_id')->nullable()->index();
            }
            if (! Schema::hasColumn('devices', 'android_sdk')) {
                $table->unsignedInteger('android_sdk')->nullable();
            }
            if (! Schema::hasColumn('devices', 'source')) {
                $table->string('source', 16)->default('DEMO');
            }
            if (! Schema::hasColumn('devices', 'is_managed')) {
                $table->boolean('is_managed')->default(false);
            }
            if (! Schema::hasColumn('devices', 'reported_at')) {
                $table->timestamp('reported_at')->nullable();
            }
            if (! Schema::hasColumn('devices', 'reported_by')) {
                $table->string('reported_by')->nullable();
            }
        });
    }

    public function down(): void
    {
        // Only the tables this migration is certain it created are dropped.
        // The columns added to a pre-existing `devices` are left alone: dropping
        // them would destroy the difference between what a phone reported and
        // what a seed file claimed, which is the one piece of evidence the
        // device panel has.
        Schema::dropIfExists('customer_agreements');
        Schema::dropIfExists('customer_settings');
    }
};
