-- Per-company Meta Instant Form webhook secret (parallel to Gravity Forms).
-- Run in the Supabase SQL editor. Safe to re-run.

alter table brand_credentials
  add column if not exists meta_leads_webhook_secret text;
