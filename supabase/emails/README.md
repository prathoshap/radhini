# Portal emails

`magic-link.html` → Supabase → Authentication → **Emails** → *Magic Link* →
replace the **Message body**.

Suggested subject:

    Your sign-in link · Kalaashaala

## Sender address

The template changes what the email says. It does **not** change who it comes
from — that stays `noreply@mail.app.supabase.io` until custom SMTP is set up
under Authentication → Emails → SMTP Settings.

The built-in sender is also rate limited to a handful of messages an hour and
is shared infrastructure, so deliverability is poor. Fine for testing, not for
a school full of families.

## Template variables

| Variable | Is |
|---|---|
| `{{ .ConfirmationURL }}` | the sign-in link |
| `{{ .Email }}` | recipient address |
| `{{ .SiteURL }}` | configured site URL |
| `{{ .Token }}` | 6-digit code, if you prefer codes to links |
