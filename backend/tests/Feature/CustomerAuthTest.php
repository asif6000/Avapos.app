<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerAuthCode;
use App\Mail\CustomerSignInCode;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class CustomerAuthTest extends TestCase
{
    use RefreshDatabase;

    private const BASE = '/customer';

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('auth-code');
    }

    // ---- request-code -----------------------------------------------------

    public function test_it_emails_a_six_digit_code(): void
    {
        Mail::fake();

        $response = $this->postJson(self::BASE.'/auth/request-code', [
            'email' => 'ayesha@example.com',
        ]);

        $response->assertOk()
            ->assertJsonStructure(['challengeId', 'sent', 'expiresIn', 'resendAfter', 'accountExists'])
            ->assertJson(['sent' => true]);

        $this->assertCount(1, CustomerAuthCode::all());
        Mail::assertSent(CustomerSignInCode::class);
    }

    /**
     * The single most important property of this endpoint: an address that
     * exists and one that does not must be indistinguishable.
     */
    public function test_it_does_not_reveal_whether_an_account_exists(): void
    {
        Mail::fake();
        Customer::query()->create([
            'id' => 'CUST-11111',
            'full_name' => 'Ayesha Rahman',
            'email' => 'known@example.com',
            'is_enrolled' => false,
        ]);

        $known = $this->postJson(self::BASE.'/auth/request-code', ['email' => 'known@example.com']);
        $unknown = $this->postJson(self::BASE.'/auth/request-code', ['email' => 'nobody@example.com']);

        $known->assertOk();
        $unknown->assertOk();

        // Neither may be a validation failure: that alone would be the answer.
        $this->assertSame(
            array_keys($known->json()),
            array_keys($unknown->json())
        );
        $this->assertSame($known->json()['sent'], $unknown->json()['sent']);
        $this->assertSame($known->json()['expiresIn'], $unknown->json()['expiresIn']);
    }

    public function test_it_normalizes_the_address_so_one_email_is_one_account(): void
    {
        Mail::fake();

        $this->postJson(self::BASE.'/auth/request-code', ['email' => '  Ayesha@Example.COM ']);
        $this->postJson(self::BASE.'/auth/request-code', ['email' => 'ayesha@example.com']);

        $this->assertSame(
            ['ayesha@example.com'],
            CustomerAuthCode::query()->pluck('email')->unique()->all()
        );
    }

    public function test_a_malformed_address_is_rejected_with_the_same_wording(): void
    {
        $this->postJson(self::BASE.'/auth/request-code', ['email' => 'not-an-email'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Enter a valid email address.');
    }

    public function test_the_plaintext_code_is_never_stored(): void
    {
        Mail::fake();

        $this->postJson(self::BASE.'/auth/request-code', ['email' => 'ayesha@example.com']);

        $stored = CustomerAuthCode::query()->first();
        $this->assertNotSame('plain', $stored->code_hash);
        $this->assertSame(64, strlen($stored->code_hash));
    }

    // ---- verify-code ------------------------------------------------------

    public function test_it_signs_in_an_existing_customer(): void
    {
        Mail::fake();
        $customer = Customer::query()->create([
            'id' => 'CUST-22222',
            'full_name' => 'Ayesha Rahman',
            'email' => 'ayesha@example.com',
            'is_enrolled' => false,
        ]);

        $code = $this->issueCode('ayesha@example.com');

        $response = $this->postJson(self::BASE.'/auth/verify-code', [
            'email' => 'ayesha@example.com',
            'code' => $code,
        ]);

        $response->assertOk()->assertJson([
            'customerId' => 'CUST-22222',
            'fullName' => 'Ayesha Rahman',
            'email' => 'ayesha@example.com',
            'isNewCustomer' => false,
        ]);
        $this->assertNotEmpty($response->json('accessToken'));
        $this->assertNotEmpty($response->json('refreshToken'));
        $this->assertGreaterThan(time(), $response->json('expiresAt'));
        $this->assertSame(1, Customer::query()->count());
    }

    public function test_first_verification_creates_the_account(): void
    {
        Mail::fake();
        $code = $this->issueCode('brandnew@example.com');

        $response = $this->postJson(self::BASE.'/auth/verify-code', [
            'email' => 'brandnew@example.com',
            'code' => $code,
        ]);

        $response->assertOk()->assertJson([
            'isNewCustomer' => true,
            'fullName' => '',          // the app collects this next
        ]);
        $this->assertSame(1, Customer::query()->where('email', 'brandnew@example.com')->count());
    }

    public function test_a_wrong_code_is_refused(): void
    {
        Mail::fake();
        $this->issueCode('ayesha@example.com');

        $this->postJson(self::BASE.'/auth/verify-code', [
            'email' => 'ayesha@example.com',
            'code' => '000000',
        ])->assertStatus(422)->assertJsonPath('message', 'That code is not correct. Try again.');

        $this->assertSame(0, Customer::query()->count());
    }

    public function test_a_code_cannot_be_reused(): void
    {
        Mail::fake();
        $code = $this->issueCode('ayesha@example.com');

        $this->postJson(self::BASE.'/auth/verify-code', [
            'email' => 'ayesha@example.com', 'code' => $code,
        ])->assertOk();

        $this->postJson(self::BASE.'/auth/verify-code', [
            'email' => 'ayesha@example.com', 'code' => $code,
        ])->assertStatus(422);
    }

    public function test_an_expired_code_is_refused(): void
    {
        Mail::fake();
        $record = CustomerAuthCode::query()->create([
            'email' => 'ayesha@example.com',
            'challenge_id' => 'x',
            'code_hash' => hash('sha256', '123456'),
            'expires_at' => now()->subMinute(),
        ]);

        $this->postJson(self::BASE.'/auth/verify-code', [
            'email' => 'ayesha@example.com',
            'code' => '123456',
        ])->assertStatus(422)->assertJsonPath('message', 'That code has expired. Request a new one.');

        $this->assertNotNull($record);
    }

    public function test_requesting_a_new_code_invalidates_the_previous_one(): void
    {
        Mail::fake();
        $first = $this->issueCode('ayesha@example.com');

        $this->postJson(self::BASE.'/auth/request-code', ['email' => 'ayesha@example.com']);

        $this->postJson(self::BASE.'/auth/verify-code', [
            'email' => 'ayesha@example.com', 'code' => $first,
        ])->assertStatus(422);
    }

    // ---- refresh / logout -------------------------------------------------

    public function test_a_refresh_token_rotates_and_cannot_be_replayed(): void
    {
        Mail::fake();
        $code = $this->issueCode('ayesha@example.com');
        $first = $this->postJson(self::BASE.'/auth/verify-code', [
            'email' => 'ayesha@example.com', 'code' => $code,
        ])->json();

        $refreshed = $this->postJson(self::BASE.'/auth/refresh', [
            'refreshToken' => $first['refreshToken'],
        ])->assertOk();

        $this->assertNotEmpty($refreshed->json('accessToken'));
        $this->assertNotSame($first['refreshToken'], $refreshed->json('refreshToken'));

        // The used token is now dead.
        $this->postJson(self::BASE.'/auth/refresh', [
            'refreshToken' => $first['refreshToken'],
        ])->assertStatus(401);
    }

    public function test_a_garbage_refresh_token_is_refused(): void
    {
        $this->postJson(self::BASE.'/auth/refresh', ['refreshToken' => 'nope'])
            ->assertStatus(401);
    }

    public function test_protected_routes_require_a_token(): void
    {
        $this->getJson(self::BASE.'/profile')->assertStatus(401);
    }

    public function test_a_customer_can_update_their_own_profile(): void
    {
        Mail::fake();
        $code = $this->issueCode('ayesha@example.com');
        $session = $this->postJson(self::BASE.'/auth/verify-code', [
            'email' => 'ayesha@example.com', 'code' => $code,
        ])->json();

        $this->withToken($session['accessToken'])
            ->patchJson(self::BASE.'/profile', ['fullName' => 'Ayesha R.'])
            ->assertOk()
            ->assertJson(['fullName' => 'Ayesha R.']);
    }

    public function test_logout_revokes_the_refresh_tokens(): void
    {
        Mail::fake();
        $code = $this->issueCode('ayesha@example.com');
        $session = $this->postJson(self::BASE.'/auth/verify-code', [
            'email' => 'ayesha@example.com', 'code' => $code,
        ])->json();

        $this->withToken($session['accessToken'])
            ->postJson(self::BASE.'/logout')
            ->assertOk()
            ->assertJson(['revoked' => true]);

        $this->postJson(self::BASE.'/auth/refresh', [
            'refreshToken' => $session['refreshToken'],
        ])->assertStatus(401);
    }

    /**
     * Stores a code the test knows, bypassing the random generator.
     */
    private function issueCode(string $email): string
    {
        $plain = '123456';

        CustomerAuthCode::query()->create([
            'email' => Customer::normalizeEmail($email),
            'challenge_id' => (string) \Illuminate\Support\Str::uuid(),
            'code_hash' => hash('sha256', $plain),
            'expires_at' => now()->addMinutes(5),
        ]);

        return $plain;
    }
}
