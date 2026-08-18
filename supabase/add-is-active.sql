-- Additive: existing projects that already ran schema.sql.
-- Safe to run once in the Supabase SQL editor.

alter table brands
  add column if not exists is_active boolean not null default true;
