# Connect Dog Discovery to Supabase

The application uses Supabase PostgreSQL, Supabase Auth (email/password, Google, GitHub), and Supabase Storage for new photos. Express still enforces listing ownership, conversation privacy, and adoption transactions. The OAuth callback uses PKCE and HttpOnly cookies; no service-role key or database password is sent to React.

## 1. Create your project

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and sign in.
2. Create a project named **Dog Discovery** in your organization. Choose a region near you and the free plan if that is your preference. Save the database password privately.
3. Wait for the project to finish provisioning.
4. From the project's **Connect** dialog, copy the **Session pooler** PostgreSQL connection URI (port 5432). This works with IPv4 connections. Replace the password placeholder; percent-encode special characters in the password.
5. From the project's API settings, copy its **Project URL** and **publishable key** (`sb_publishable_...`). The older anon key is also supported. Do not use a secret or service-role key for this setting.
6. Add the settings from [.env.supabase.example](.env.supabase.example) to your local `.env`. Preserve the existing `MYSQL_*` lines until the import is complete. Never paste the database password into chat or commit `.env`.

`DATABASE_URL` and `SUPABASE_URL` must refer to the **same project**. Remote database connections verify TLS certificates. If required, download the database root certificate from Supabase and set `PGSSLROOTCERT` to its local path; do not disable certificate verification.

## 2. Configure authentication URLs

In **Authentication → URL Configuration**, set:

- Site URL: `http://localhost:3000`
- Redirect allowlist: `http://localhost:3000/api/auth/callback`

Use `localhost` consistently when opening the app. If you deliberately use `127.0.0.1`, update `APP_ORIGIN` and add its callback URL too. For deployment, set your HTTPS production origin and add the corresponding `/api/auth/callback` URL.

Keep email/password authentication enabled. Email-confirmation sign-ups show a “check your inbox” state; they do not pretend the user is signed in. With PKCE email confirmation, open the confirmation link in the browser that initiated registration. Configure your own SMTP provider before accepting real public sign-ups; Supabase's default email service has restrictions.

## 3. Enable Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/), create or choose a project.
2. Configure the OAuth consent screen with the required app information and add test users if the app is in testing mode.
3. Create an **OAuth client ID → Web application**.
4. Set the authorized redirect URI to the exact callback URL shown in Supabase's Google provider settings, usually:
   `https://PROJECT_REF.supabase.co/auth/v1/callback`
5. In **Supabase → Authentication → Sign In / Providers → Google**, enable Google and enter the Google client ID and client secret. Save.

The Google redirect goes to **Supabase**. Supabase then redirects to **your app** at `/api/auth/callback`. These are two different URLs.

## 4. Enable GitHub OAuth

1. Open [GitHub OAuth Apps](https://github.com/settings/developers) and register a new OAuth application.
2. Application name: **Dog Discovery**. Homepage URL: `http://localhost:3000` for local development.
3. Authorization callback URL: the exact Supabase callback URL, usually:
   `https://PROJECT_REF.supabase.co/auth/v1/callback`
4. Generate a client secret. In **Supabase → Authentication → Sign In / Providers → GitHub**, enable GitHub and save the client ID and secret.

Google/GitHub client secrets belong in Supabase's provider settings. The application does not need them in `.env`. OAuth requires an email address that Supabase confirms; legacy profiles are never linked using unverified metadata.

## 5. Create tables and the photo bucket

```sh
npm run db:migrate
```

This creates the private `dog_discovery` schema, tables, indexes, and constraints. Browser roles have no access to those tables, and row-level security is enabled. Use the database owner connection for the Express server. Do **not** add `dog_discovery` to the exposed Data API schemas.

Then open the Supabase SQL Editor and run [supabase/storage.sql](supabase/storage.sql). It creates the `dog-photos` public-read bucket with a 5 MB limit. Authenticated users can write only under their own UUID folder. New uploads are validated and converted to WebP by Express before upload. Public dog photos and profile photos are intentionally publicly readable.

## 6. Preserve existing data

Stop the old running application before importing. Keep the source MySQL instance running on port 3307, then run:

```sh
npm run db:import-mysql
```

The importer refuses a nonempty PostgreSQL target, keeps IDs and relationships, checks counts, and commits everything in one transaction. It does not alter MySQL. It excludes old password hashes and sessions: Supabase Auth now manages credentials. Existing users should sign in through Google/GitHub with the same verified email, or create and confirm a Supabase email/password account with the same email. The verified identity is linked to the preserved profile on first sign-in. Old MySQL passwords do not automatically become Supabase passwords.

Old `/uploads/` URLs continue to work from this server; retain the `uploads/` folder. Before moving to a different host, copy that folder or migrate those assets to Storage. The database import does not silently upload old files to a third party.

## 7. Run and verify

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Test:

- Email sign-up, confirmation, and sign-in.
- Continue with Google and Continue with GitHub.
- Sign-out and returning to the app.
- Existing profile and saved dogs after first verified sign-in.
- New photo upload, listing creation, messaging, and adoption approval.

Provider setup and live OAuth cannot be validated until the project and provider apps exist. Local automated tests use real PostgreSQL and a test-only Supabase Auth HTTP fixture; they do not contact Google or GitHub.

Official references: [PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [GitHub](https://supabase.com/docs/guides/auth/social-sign-in/auth-github), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Storage access policies](https://supabase.com/docs/guides/storage/security/access-control).
