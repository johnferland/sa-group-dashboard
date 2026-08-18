-- SA Group Dashboard — initial schema
-- Run once against a fresh Supabase project (SQL editor).

create extension if not exists "pgcrypto";

create table brands (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  domain text not null,
  accent_color text not null,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique,
  email text not null,
  role text not null check (role in ('super_admin', 'exec', 'lab_manager')),
  brand_id uuid references brands(id), -- null for super_admin/exec
  created_at timestamptz not null default now()
);

-- Single shared credential set per provider (access@hueston.co consent covers all brands).
create table shared_credentials (
  provider text primary key check (provider in ('google', 'meta')),
  refresh_token text,
  access_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table brand_credentials (
  brand_id uuid primary key references brands(id),
  ga4_property_id text,
  gsc_site_url text,
  google_ads_customer_id text,
  meta_ad_account_id text,
  updated_at timestamptz not null default now()
);

create table ga4_metrics (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  date date not null,
  sessions integer not null default 0,
  conversions integer not null default 0,
  ai_referral_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (brand_id, date)
);

create table gsc_metrics (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  date date not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric not null default 0,
  avg_position numeric,
  created_at timestamptz not null default now(),
  unique (brand_id, date)
);

create table ads_metrics (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  date date not null,
  source text not null check (source in ('google', 'meta')),
  spend numeric not null default 0,
  leads integer not null default 0,
  clicks integer not null default 0,
  created_at timestamptz not null default now(),
  unique (brand_id, date, source)
);

-- Weekly aggregate only — a lab's point person logs one number per week, not per-lead records.
create table manual_leads (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  week_start_date date not null,
  lead_count integer not null default 0,
  entered_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (brand_id, week_start_date)
);

create table manual_deals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  date date not null,
  status text not null default 'closed_won',
  revenue numeric not null default 0,
  entered_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- App-layer restricted to ODL Ortho + SA Appliances only — enforce in the entry form/route,
-- not the schema, since brand membership may change.
create table social_sqls (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  date date not null,
  count integer not null default 0,
  entered_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  brand_id uuid not null references brands(id),
  rank integer not null,
  score numeric not null,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (period_start, period_end, brand_id)
);

create table sync_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  source text not null,
  status text not null check (status in ('success', 'error')),
  message text,
  run_at timestamptz not null default now()
);

-- RLS: default-deny for anon/authenticated. All app reads/writes go through the server-side
-- Supabase service-role client (same pattern ppg-suite uses), which bypasses RLS entirely.
-- This blocks any accidental direct client-side access rather than relying on app code alone.
-- Tightening this to real per-role/per-brand policies (keyed off Clerk JWT claims) is a good
-- Phase 4 hardening step once the Clerk-Supabase JWT integration is wired up.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'brands', 'users', 'shared_credentials', 'brand_credentials', 'ga4_metrics',
    'gsc_metrics', 'ads_metrics', 'manual_leads', 'manual_deals', 'social_sqls',
    'leaderboard_snapshots', 'sync_logs'
  ])
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Seed the four brands (edit accent_color/logo_url once brand assets are ready).
insert into brands (slug, name, domain, accent_color) values
  ('sa-appliances', 'SA Appliances', 'specialtyappliances.com', '#0F62FE'),
  ('odl-ortho', 'ODL Ortho', 'odlortho.com', '#0F62FE'),
  ('ida', 'International Dental Arts', 'idasmiles.com', '#0F62FE'),
  ('edl', 'EDL', 'xdentallab.com', '#0F62FE');
