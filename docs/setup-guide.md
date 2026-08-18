# SA Group Dashboard — Setup Guide (do this in order)

A working starter scaffold is attached (`sa-group-dashboard-starter.zip`) — it already has the
Supabase schema, Clerk auth wiring, role-based routing, and the Google OAuth consent flow
built and verified (installs, typechecks, and builds cleanly). This guide gets it live.

## 1. Unzip and push to a new repo on your personal GitHub (same account as ppg-suite)

No company org access needed for this — this is a brand-new, standalone repo (not a fork of
ppg-suite, not inside its monorepo) living alongside it under your personal account. Since
it's the same account already authenticated on your machine, there's no credential juggling
at all.

1. In your browser, create a new, empty repo under your personal account (e.g.
   `sa-group-dashboard`) — don't initialize it with a README, the scaffold already has one.
2. Unzip the starter, then from inside that folder:
   ```
   git init
   git remote add origin https://github.com/<your-username>/sa-group-dashboard.git
   git add -A
   git commit -m "Initial scaffold"
   git branch -M main
   git push -u origin main
   ```
   Your existing git credentials (the ones ppg-suite already uses) authenticate this push —
   nothing new to set up.

One thing worth flagging for later, not blocking today: this app will end up living under a
personal account rather than a company-owned one. If it's worth transferring to a company
GitHub org once you have access to create one there, that's a straightforward repo transfer
(same as discussed for ppg-suite) — full history moves with it, and it's a five-minute step
whenever you're ready, not something to solve now.

## 2. Supabase

1. Create a new Supabase project.
2. Project Settings → API Keys — copy the Project URL, and from the **Secret keys** section
   copy the `sb_secret_...` key (not the `sb_publishable_...` one — this project uses
   Supabase's new key system, and the secret key is the direct successor to the old
   service_role key). Both go in `.env.local`.
3. SQL Editor — paste the full contents of `supabase/schema.sql` and run it. This creates
   every table and seeds the four brands.

## 3. Clerk

1. Create a new Clerk application (separate from the old project's).
2. Turn on whichever sign-in method you want (email/password is simplest to start).
3. API Keys page — copy the Publishable key and Secret key.
4. Webhooks — add an endpoint for `user.created` pointed at
   `https://<your-vercel-domain>/api/webhooks/clerk` (do this after step 6, once you have a
   domain) and copy the signing secret.

## 4. Google Cloud — GA4 + Search Console

1. Create a Google Cloud project (or use an existing unused one).
2. APIs & Services → Library — enable **Google Analytics Data API** and
   **Google Search Console API**.
3. APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.
   Add redirect URI `http://localhost:3000/api/admin/google-oauth/callback` for now (add the
   production URL after deploying).
4. OAuth consent screen — set to Internal if your Workspace allows it, add scopes
   `analytics.readonly` and `webmasters.readonly`.
5. Copy the Client ID/Secret into `.env.local` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
6. Once the app is running (step 7) and you're signed in as a `super_admin`, log into
   `access@hueston.co` in the browser and visit `/api/admin/google-oauth/start`. Approving that
   consent screen mints one shared refresh token covering all four brands' GA4 + GSC data and
   saves it straight to `shared_credentials` — no per-brand step needed.

## 5. Google Ads + Meta

1. **Google Ads** — check whether the developer token from the previous build is tied to the
   manager (MCC) account that will oversee these four brands' Ads accounts. If yes, reuse it
   directly. If no, apply for a new one now — approval can take 1–2 weeks. Either way, put the
   token + login customer ID in `.env.local`.
2. **Meta** — create a new Meta App (Business type) in Meta for Developers, confirm Marketing
   API access under the Business Manager that already manages these ad accounts, and generate
   a fresh long-lived System User token for this app. Put the App ID/secret + token in
   `.env.local`.

## 6. Vercel

1. Import the GitHub repo as a new Vercel project.
2. Add every variable from `.env.example` (with real values) under Project Settings →
   Environment Variables.
3. Deploy.
4. Go back and add the production versions of the Clerk webhook URL and the Google OAuth
   redirect URI alongside the localhost ones you set up in steps 3–4.

## 7. Run it locally in Cursor

1. Open the unzipped (now git-tracked) folder in Cursor.
2. `cp .env.example .env.local` and fill in the real values from steps 2–5.
3. `npm install`
4. `npm run dev`, visit `http://localhost:3000`.
5. You'll be bounced to sign-in. After signing in via Clerk, there's no `users` row for you
   yet, so nothing will render correctly — manually insert your own `super_admin` row in
   Supabase's table editor for now (matching email; `clerk_user_id` from the Clerk dashboard).
   A real invite flow is a Phase 0/1 build item, not done yet.

## What's already working vs. what's next

**Working now:** schema deployed and seeded, Clerk auth wired up, role-based landing
redirect (exec/super_admin → rollup stub, lab_manager → their brand), brand-scoped access
checks, the one-time Google consent flow, cron route skeletons, RLS enabled (default-deny —
everything goes through the service-role client), the CSS token shell.

**Next, in Cursor, per the project plan's phases:** the actual GA4/GSC/Ads/Meta fetcher logic
(stubbed with TODOs in `lib/integrations/`), the real dashboard UI (time-range picker,
graph/number-card toggle, metric cards), manual entry forms (weekly lead count, closed-won,
revenue, social SQLs), the leaderboard scoring UI, and the executive rollup screen.
