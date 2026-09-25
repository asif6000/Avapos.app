<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The emailed sign-in code. The app has no password field, so this email is
 * the only way in — it must not be filtered into spam.
 */
class CustomerSignInCode extends Mailable
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public string $code,
        public string $challengeId,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your Srabon Telecom sign-in code');
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'emails.sign-in-code',
            with: [
                'code' => $this->code,
                'challengeId' => $this->challengeId,
                'minutes' => 5,
            ],
        );
    }
}
