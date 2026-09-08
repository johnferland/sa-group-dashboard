-- Offline leads: social media source.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table manual_leads
  add column if not exists social_media_leads integer not null default 0;
