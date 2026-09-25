<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_refresh_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('customer_id', 64)->index();

            // Hashed, like the sign-in code: the plaintext only ever exists in
            // the response the customer receives.
            $table->string('token_hash', 64)->unique();

            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });

        // Opportunistic cleanup of dead rows.
        Schema::table('customer_refresh_tokens', function (Blueprint $table) {
            $table->index(['expires_at', 'revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_refresh_tokens');
    }
};
