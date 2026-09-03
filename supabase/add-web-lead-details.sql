-- Extra fields for inbound form leads. Safe to re-run.

alter table web_leads add column if not exists first_name text;
alter table web_leads add column if not exists last_name text;
alter table web_leads add column if not exists email text;
alter table web_leads add column if not exists submitted_at timestamptz;
