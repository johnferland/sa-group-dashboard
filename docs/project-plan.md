# SA Group Multi-Brand Reporting Dashboard — Project Plan

**Prepared for:** Mish / Williamsmedia
**Live-by date:** October 31, 2026
**Prepared:** August 14, 2026

---

## 1. Decisions locked in from your answers

- **No Ahrefs anywhere in this build.** SEO runs strictly on Google Search Console + GA4 organic, matching your current dashboard. AI Visibility runs strictly on GA4 AI-referral traffic (ChatGPT, Gemini, Claude, Perplexity, Copilot, Bing) — no citation/Brand Radar tracking.
- **Fresh, standalone repo** in your agency's GitHub account. This is not a fork of ppg-suite and not part of that monorepo. We will hand-port specific *patterns* (auth/role scoping, the GA4/GSC/Ads integration approach, the period-comparison aggregation logic, the CSS-token theming system) into new code, rewritten to fit three roles and four brands instead of ppg-suite's agency-with-many-clients model.
- **Three roles:**
  - **Super Admin** (your team) — full read/write across all four brands, manages credentials, manual data entry, sync, and configuration.
  - **Exec** (SA Group leadership) — read-only. Lands on the four-brand rollup with the leaderboard, can drill into any single brand's full dashboard, cannot edit anything.
  - **Lab Manager** — read-only for their own brand's dashboard, with one narrow exception: each week, a designated point person at the lab logs a single aggregate number — total leads received that week (these are offline/non-website leads, not attributed to a source or logged individually). That number feeds the manual-leads rollup used in the brand dashboard and the executive leaderboard. Everything else for this role stays read-only.

## 2. Open items I'm flagging (proceeding with a default, please confirm or correct)

These aren't blockers to starting, but they shape a few build decisions and I'd rather surface them now than assume silently:

1. **Weekly compliance-reminder loop** — now that the weekly lead count is logged by a point person at each lab (a Lab Manager, presumably), I'm assuming the reminder targets that point person directly, by email, if they haven't logged the week's number yet. Closed-won deals, revenue, and social outreach SQLs are separate manual-entry fields still assumed to be Super Admin-only — flag if that's wrong. If the point person is a different person than the Lab Manager account itself, let me know.
2. **Credentials readiness** — the plan assumes each brand already has, or can get, its own GA4 property, GSC verified property, Google Ads account/customer ID, and Meta ad account. If any brand shares an account with another (e.g. one Google Ads account running all four brands' campaigns), the ad-spend rollup logic needs to split by campaign/brand rather than by account — worth confirming per brand before Phase 2.
3. **Brand assets** — accent colors and logo files for all four brands, ready to drop into the token system.

None of these block Phase 0/1 work below; they matter starting around Phase 2.

## 3. Architecture overview

A single Next.js 15 (App Router) application — not a monorepo, since there's only one app. Clerk for auth, Supabase (Postgres) for data, Vercel for hosting and cron. Recharts for charting, date-fns for date math — both proven in ppg-suite and worth keeping.

```
sa-group-dashboard/
  app/
    (auth)/                 → Clerk sign-in/sign-up
    (dashboard)/
      page.tsx              → role-based landing: exec → rollup, lab manager → their brand
      brand/[brandSlug]/    → single-brand dashboard (SEO, GA4, Ads, AI visibility, leads)
      admin/                → super-admin only: credentials, manual entry, user management, sync status
    api/
      cron/                 → weekly GA4/GSC/Ads sync jobs (Vercel Cron)
      webhooks/clerk/       → user provisioning
      admin/...             → manual-entry endpoints, credential management
  lib/
    auth.ts                 → requireRole(), requireBrandAccess() — the scoping primitives
    integrations/           → ga4.ts, gsc.ts, google-ads.ts, meta-ads.ts
    aggregation.ts          → weighted-average + period-comparison rollup (ported pattern from ppg-suite)
    leaderboard.ts          → gold/silver/bronze scoring logic (new)
  components/
    metric-card.tsx, chart-toggle.tsx, time-range-picker.tsx, leaderboard.tsx, brand-theme-provider.tsx
  packages/tokens/          → per-brand CSS custom-property sets
```

## 4. Data model (Supabase, no RLS gap this time)

Unlike ppg-suite, this schema should use **Supabase Row Level Security from day one**, since it's a much smaller, higher-stakes tenant set (four brands, real executives looking at it) and RLS costs little to add up front.

- `brands` — id, slug, name, domain, accent_color, logo_url, is_active (default true — see §10 on adding/closing brands)
- `users` — id, clerk_user_id, role (`super_admin` | `exec` | `lab_manager`), brand_id (null for super_admin/exec)
- `brand_credentials` — brand_id, ga4_property_id, gsc_site_url, google_ads_customer_id, meta_ad_account_id, tokens/secrets
- `ga4_metrics` — brand_id, date, sessions, conversions, ai_referral_breakdown (jsonb, by platform)
- `gsc_metrics` — brand_id, date, clicks, impressions, ctr, avg_position
- `ads_metrics` — brand_id, date, source (`google` | `meta`), spend, leads, clicks
- `manual_leads` — brand_id, week_start_date, lead_count, entered_by (a single weekly aggregate number per brand from the lab's point person — not per-lead records, and not attributed to source since these are explicitly non-website leads)
- `manual_deals` — brand_id, date, status (`closed_won`), revenue, entered_by
- `social_sqls` — brand_id (constrained to ODL + SA Appliances at the application layer), date, count, entered_by
- `leaderboard_snapshots` — period, brand_id, rank, score breakdown (computed and cached weekly, not recomputed live)
- `sync_logs` — brand_id, source, status, run_at

## 5. What's reused vs. rebuilt from ppg-suite

**Reused as a pattern (rewritten, not copy-pasted):**
- Clerk + Supabase role-scoping approach (`requireAppUser`-style helpers), adapted to three roles instead of one binary
- GA4 / GSC / Google Ads / Meta Ads fetcher structure and the per-client OAuth credential pattern
- The GA4 AI-referral-traffic session-source filter (already built for exactly this)
- Weighted-average + current-vs-previous-window aggregation logic
- CSS custom-property token system for theming
- Vercel Cron sync-job structure

**Built new:**
- Exec-vs-brand landing/routing logic (didn't exist in ppg-suite)
- Real multi-role, single-brand-scoped permission model with RLS
- Gold/silver/bronze leaderboard on your five metrics (leads generated, leads closed, organic traffic, leads per dollar, revenue)
- Manual entry UI: a simple one-field weekly form for Lab Managers to log their lab's aggregate lead count, plus a Super Admin entry UI for closed-won deals, revenue, and social outreach SQLs (brand-restricted)
- Graph vs. number-card display toggle (didn't exist — ppg-suite dashboard is chart-only)
- Multi-brand token switching (shell stays SA Appliances-branded, brand pages swap accent + logo)
- Weekly compliance-reminder job
- GSC-only SEO section (ppg-suite's SEO section depended on Ahrefs, being dropped)

## 6. Time controls & comparison (applies everywhere)

Every dashboard view gets: Week / Month / Quarter / Custom range selector, with the equivalent prior period automatically queried and shown as a % change — always on, not optional. This mirrors ppg-suite's current-window-vs-previous-window query pattern, generalized into a single reusable hook (`useMetricPeriod`) rather than duplicated per section.

## 7. Graph vs. number-card toggle

A single UI-level toggle component wrapping each metric section, backed by the same underlying data — number-card view shows the metric + delta, graph view shows the trend line for the selected period. This is new engineering (ppg-suite only ever renders charts) but straightforward given Recharts is already the charting library.

## 8. Executive rollup & leaderboard

Exec landing page: four-brand rollup with the gold/silver/bronze leaderboard scored across leads generated, leads closed, organic traffic, leads per dollar, and revenue, plus the ability to click into any single brand's full dashboard in read-only mode. The leaderboard scoring logic is new (needs a decision on equal-weighting vs. weighted metrics — flag if you have a preference, otherwise I'll default to equal weighting across the five metrics for V1).

## 9. Build phases (Aug 14 → Oct 31, ~11 weeks)

**Phase 0 — Foundations (Aug 14–28)**
Repo setup, Clerk + Supabase wiring, RLS policies, three-role auth model, brand/user schema, base token theming shell, Vercel project + cron scaffolding.

**Phase 1 — Core brand dashboards (Aug 28–Sep 18)**
GA4, GSC, Google Ads + Meta Ads rollup sections; time-range controls with period comparison; graph/number-card toggle; per-brand theming live on real brand pages.

**Phase 2 — Manual entry & AI visibility (Sep 18–Oct 2)**
Weekly lead-count entry form for Lab Managers; Super Admin entry forms for closed-won/revenue/social SQLs (brand-restricted logic for social SQLs); GA4 AI-referral traffic section; brand credentials management UI for Super Admin.

**Phase 3 — Executive rollup & leaderboard (Oct 2–16)**
Exec landing page, four-brand aggregate views, gold/silver/bronze leaderboard, drill-in navigation from rollup into brand dashboards.

**Phase 4 — Compliance loop, hardening, QA (Oct 16–30)**
Weekly compliance-reminder job, RLS policy audit, credential-security review, cross-browser/role QA pass, content/copy pass on brand theming.

**Oct 31 — Launch.**

V2 (explicitly out of this build): organic social section.

## 10. Brand lifecycle: adding/closing sub-companies

SA Group is an acquirer, and the brand list won't stay fixed at four — a Super Admin needs to be able to add a newly acquired brand or retire a closed one without a code change. Two things this requires, added to the schema/build:

- `brands` gets an `is_active` boolean (default `true`) rather than supporting hard deletion. Closing a brand flips this to `false`; it drops out of the active leaderboard, exec rollup, and Lab Manager routing, but its historical `ga4_metrics`/`gsc_metrics`/`manual_leads`/etc. rows stay intact and queryable — mirrors the archive-not-delete pattern ppg-suite already uses for client offboarding, just simplified (no cold-storage export needed at this scale).
- A Super Admin "Manage Brands" screen: add a brand (name, slug, domain, accent color, logo, plus its GA4/GSC/Ads/Meta credentials — a brand isn't functional until those exist either), and a deactivate/reactivate toggle per existing brand.
- Leaderboard and exec rollup queries filter to `is_active = true` by default.

This slots into Phase 2 alongside the credentials admin UI, since both are Super Admin brand-management surfaces.

## 11. Risks to watch

- Ad account structure per brand (shared vs. dedicated) isn't confirmed yet — affects Phase 1 scope for the Ads rollup.
- RLS is new ground compared to ppg-suite (which has none) — budget real review time in Phase 4, not just a final pass.
