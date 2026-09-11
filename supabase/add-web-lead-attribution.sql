-- Web leads: marketing attribution from the form / Zapier.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table web_leads add column if not exists attribution text;

-- If the dashboard still shows blank attribution after this, reload PostgREST:
-- notify pgrst, 'reload schema';
