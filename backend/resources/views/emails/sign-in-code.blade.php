@component('mail::message')
# Your sign-in code

Your Srabon Telecom code is **{{ $code }}**.

It expires in {{ $minutes }} minutes. If you did not ask for it, you can
safely ignore this email — nothing has changed on your account.

@component('mail::subcopy')
This is a one-time code for signing in. Srabon Telecom will never ask you for it
by phone or chat, and will never ask for your password — you do not have one.
@endcomponent
@endcomponent
