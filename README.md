# SA Group Multi-Brand Reporting Dashboard

Starter scaffold for the SA Group dashboard (SA Appliances, ODL Ortho, IDA, EDL). See the
project plan and launch prep checklist docs from the Claude session for full context.

## First run

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in real values (Clerk, Supabase, Google, Meta —
   see the setup guide for exactly where each value comes from).
3. Run `supabase/schema.sql` against your new Supabase project (SQL editor, paste and run).
4. `npm run dev`

## Structure

- `app/(auth)` — Clerk sign-in/sign-up
- `app/(dashboard)` — role-based landing (`page.tsx`), single-brand view (`brand/[brandSlug]`),
  and super-admin tools (`admin/`)
- `app/api/cron` — weekly GA4/GSC/Google Ads/Meta sync jobs (wired up in `vercel.json`)
- `app/api/webhooks/clerk` — provisions/reconciles `users` rows on sign-up
- `lib/integrations` — one file per data source (ga4, gsc, google-ads, meta-ads)
- `lib/aggregation.ts` — period rollup + previous-period comparison logic
- `lib/leaderboard.ts` — gold/silver/bronze scoring across the five exec metrics
- `packages/tokens/tokens.css` — per-brand CSS custom properties (accent color, logo) plus the
  shared SA Appliances shell tokens

## Roles

`super_admin` (full read/write, all brands) · `exec` (read-only, all brands + leaderboard) ·
`lab_manager` (read-only own brand, plus weekly lead-count entry)

## Not built yet

Everything past the schema/auth/theming skeleton — GA4/GSC/Ads/Meta fetchers, the sync cron
jobs, dashboard UI, manual entry forms, the leaderboard, and the exec rollup are all stubbed
with TODOs. This is Phase 0 only.
