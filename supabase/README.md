# Supabase

| Path | What it holds |
|---|---|
| `migrations/0001_init.sql` | Schema, RLS policies, storage bucket, sign-up trigger |
| `migrations/0002_seed_institutions.sql` | Nigerian universities, polytechnics and colleges of education for onboarding search (FR-PROF-02). Re-runnable. |

Apply with `supabase db push` (or any Postgres client; each file runs once, in order).

## Auth settings (dashboard)

The app signs students in with a **6-digit email code** and **Google** (FR-AUTH-01). These live in the
Supabase dashboard, not in migrations:

1. **Authentication → Emails → Magic Link template**: Supabase emails a link by default. Replace the
   body so it sends the code, for example:

   ```html
   <h2>Your Quizzly code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   <p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>
   ```

   Do the same for the **Confirm signup** template, which new students receive on their first sign-in.
2. **Authentication → Providers → Email**: email OTP length **6**, expiry **600** seconds.
3. **Authentication → Rate limits**: the built-in mailer sends only a few emails per hour. Set up custom
   SMTP (e.g. Resend) before testing with more than one or two people.
4. **Google** (optional until launch): **Authentication → Providers → Google** with a Google Cloud OAuth
   client, then add these to **Authentication → URL Configuration → Redirect URLs**:
   - `quizzly://auth-callback` (installed builds)
   - `exp://**` (Expo Go during development)
