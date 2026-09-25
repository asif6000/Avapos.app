<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_auth_codes', function (Blueprint $table) {
            $table->id();
            $table->string('email', 255)->index();
            $table->uuid('challenge_id')->unique();

            // Only the hash is stored. A database leak must not be replayable
            // against the sign-in endpoint.
            $table->string('code_hash', 64);

            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();

            $table->index(['email', 'consumed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_auth_codes');
    }
};
