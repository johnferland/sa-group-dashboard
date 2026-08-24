-- Extra daily fields so brand dashboards can match the source reporting app.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table ga4_metrics
  add column if not exists organic_sessions integer not null default 0;

alter table ga4_metrics
  add column if not exists new_users integer not null default 0;

alter table gsc_metrics
  add column if not exists keywords_top3 integer not null default 0;

alter table gsc_metrics
  add column if not exists total_keywords integer not null default 0;

alter table ads_metrics
  add column if not exists impressions integer not null default 0;
