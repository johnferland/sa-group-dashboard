-- Lead cards: split offline sources + inbound web-form events.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table brand_credentials
  add column if not exists web_leads_webhook_secret text;

alter table manual_leads
  add column if not exists phone_leads integer not null default 0;

alter table manual_leads
  add column if not exists email_leads integer not null default 0;

alter table manual_leads
  add column if not exists referral_leads integer not null default 0;

alter table manual_leads
  add column if not exists trade_show_leads integer not null default 0;

create table if not exists web_leads (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  received_at timestamptz not null default now(),
  count integer not null default 1 check (count > 0),
  source text,
  created_at timestamptz not null default now()
);

create index if not exists web_leads_brand_received_idx on web_leads (brand_id, received_at);

alter table web_leads enable row level security;
