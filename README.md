# Dog Discovery

A responsive React application backed by Express, **Supabase PostgreSQL**, **Supabase Auth**, and **Supabase Storage**. Email/password, Google, and GitHub sign-in are supported. The repository is prepared for Supabase; live sign-in requires your project and OAuth provider configuration.

## First-time setup

Requires Node.js 24 or newer and a Supabase project. Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for project creation, credentials, Google/GitHub provider setup, redirects, data import, and deployment notes.

```sh
npm install
# Add the settings from .env.supabase.example to .env.
# Keep existing MYSQL_* settings until importing old records.
npm run db:migrate -- --storage
# Optional: copy existing MySQL records into an EMPTY PostgreSQL target.
npm run db:import-mysql
npm run dev
```

Open **http://localhost:3000**. Express serves the API and Vite serves React on the same origin. Vite's WebSocket shares port 3000; it does not require port 24678. Keep `APP_ORIGIN` consistent with the URL you use.

OAuth provider client secrets belong in Supabase's provider settings. The database connection string and Supabase publishable key are read server-side from `.env`. No service-role key is required. The client contains no database credentials or Supabase session tokens.

## Features

- Search and filter dogs by name, breed, city, age, size, and sex.
- Save dogs and maintain a profile.
- Upload photos, create listings, edit or pause them, and delete non-adopted listings.
- Send adoption introductions and review incoming requests.
- Accept an adoption atomically: the dog becomes adopted and competing requests close.
- Private conversations between an adopter and the listing owner; messages refresh every five seconds while the page is visible.
- Email-confirmation, cancelled OAuth, and expired callback recovery states.

Sample dogs may be seeded with `SEED_DEMO=true` on an empty database. Sample rescue/adopter profiles have no hard-coded production passwords. Sign in using an actual Supabase account. All initial dog listings are fictional examples. Unsplash photos and Google Fonts have local UI fallbacks if unavailable.

## Authentication and data access

React calls Express. Express creates a separate Supabase SSR client per request and stores sessions in HttpOnly, SameSite=Lax cookies (Secure on HTTPS). It verifies identity with Supabase `getUser()` before allowing protected actions. Google/GitHub callbacks exchange one-time codes with PKCE; return URLs are fixed, and no session tokens are placed in app URLs or browser localStorage.

The private PostgreSQL `dog_discovery` schema holds profiles, dogs, images, favorites, adoptions, conversations, and messages. Application tables have row-level security enabled and no browser-role grants. They are accessed through the trusted Express backend, which enforces ownership and participant permissions. Do not expose this schema through Supabase's Data API. The `auth_user_id` column maps a profile to a Supabase UUID; sign-in methods and passwords remain managed by Supabase Auth.

Each transaction gets its own pooled PostgreSQL connection. Listing edits and adoption decisions lock the dog row. A partial unique index also prevents more than one accepted adoption per dog. Prepared parameters keep user input separate from SQL. UTC timestamps are preserved across the API.

New photos are validated, resized, and converted to WebP before upload to Supabase's `dog-photos` bucket under the verified user's UUID. Photos are public-read; upload policies allow writes only to the user's own folder. There is no overwrite/delete policy. Existing `/uploads/` files remain usable from this server and must be retained when moving hosts. `UPLOAD_STORAGE=local` is available for local development and tests.

Supabase logout clears the app session and revokes the refresh token. As with other JWT systems, previously issued access tokens may remain valid until expiry. Set session lifetimes in Supabase for your needs.

## Preserve existing MySQL data

The importer requires an empty target and never modifies MySQL. It preserves IDs, relationships, timestamps, profile content, and photo references, resets PostgreSQL sequences, and verifies counts before committing. A failure rolls back the import. MySQL's old password hashes and session records are deliberately excluded.

Existing users can sign in through OAuth with the same verified email or register and confirm a new Supabase email/password account with that email. Only a verified Supabase identity may claim an imported profile. Old MySQL passwords do not automatically work in Supabase.

The pre-migration source and local configuration were preserved under the ignored `data/backups/` directory. Those backups are for local recovery and must not be committed or shared because the configuration backup contains credentials.

## Verification

API tests use an isolated local PostgreSQL database and the real Supabase SDK against a **test-only Auth HTTP fixture**. Browser tests also use that fixture; they do not perform real Google/GitHub login. Production code cannot enable the fixture through an environment flag.

```sh
# macOS, if you need PostgreSQL for tests:
brew install postgresql@17
npm run db:test:start
# Leave that terminal running. In another terminal:
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`db:test:start` creates an isolated test server on localhost:5433 and stores a generated test password in ignored `.env.test`. Tests create unique databases and remove them afterward; they do not reset application data. You may instead provide `TEST_DATABASE_URL` for an existing local test PostgreSQL server with database-creation permission.

Checks cover search, authorization, uploads, private messaging, concurrent adoption decisions, rollback, import integrity, verified identity linking, PKCE callbacks, code replay, missing verifiers, email confirmation, and browser navigation. A real project still needs live provider verification after its configuration is complete.

## Structure

```text
src/                     React components, shared state, API client, styling
server/app.js            Express endpoints and middleware
server/auth.js           Supabase sessions, identity linking, email and OAuth routes
server/database.js       PostgreSQL pool, parameterized access, transactions
server/schema.sql        Private application schema and constraints
server/services.js       Listing, adoption and conversation business rules
server/validation.js     Request validation
server/seed.js           Optional sample dog listings
supabase/storage.sql     Photo bucket and ownership policies
scripts/migrate.js       PostgreSQL and optional Storage setup
scripts/import-mysql.js  Non-destructive MySQL-to-PostgreSQL import
scripts/postgres-test.js Isolated local PostgreSQL test server
tests/                   Database, API, migration and browser checks
```

## Production

```sh
npm run build
npm start
```

Configure `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_ORIGIN`, and OAuth redirect allowlists for the production environment. Use HTTPS, verified PostgreSQL TLS, a production email provider, and persistent storage for any retained local uploads. Set `SEED_DEMO=false`. Never commit `.env` or place secret values in `VITE_*` variables.

This is a portfolio application. Password-recovery UI, moderation, push notifications, and cleanup of unattached photos are not included. The application has not been deployed by this setup.
