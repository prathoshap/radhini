# Portal emails

| File | Supabase template | Suggested subject |
|---|---|---|
| `magic-link.html` | **Magic Link** | `Your sign-in link · Kalaashaala` |
| `invite.html` | **Invite user** | `Your Kalaashaala student portal` |

Authentication → **Emails** → pick the tab → replace the **Message body**.

`invite.html` is the one families see first, when Radhini adds them. It
explains what the portal is and that there is no password, because for most
of them this will be the only explanation they get.

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
