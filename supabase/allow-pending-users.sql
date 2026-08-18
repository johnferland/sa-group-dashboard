-- Allow inviting people before they have signed in with Clerk.
-- Safe to run once in the Supabase SQL editor.

alter table users
  alter column clerk_user_id drop not null;
