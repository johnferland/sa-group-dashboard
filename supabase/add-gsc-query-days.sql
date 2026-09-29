-- Unique Search Console queries by day, used for all-time keyword totals.
create table if not exists gsc_query_days (
  brand_id uuid not null references brands(id) on delete cascade,
  date date not null,
  query text not null,
  position numeric,
  primary key (brand_id, date, query)
);

create index if not exists gsc_query_days_brand_date on gsc_query_days (brand_id, date);

alter table gsc_query_days enable row level security;
