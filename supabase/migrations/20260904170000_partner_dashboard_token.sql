-- =====================================================================
-- AMBASSADOR — partner-facing dashboard access token.
-- Each ambassador gets an unguessable token; their private read-only dashboard
-- link is partner.html?t=<token>. No login (external users, no accounts). Rotate
-- the token to revoke a leaked link. Read-only — exposes only their own schools
-- + earnings, never money movement.
-- =====================================================================
alter table public.partners add column if not exists dashboard_token text;

-- Backfill existing partners with a 64-hex-char token (two uuids, dashes stripped).
update public.partners
   set dashboard_token = replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
 where dashboard_token is null;

-- Future rows auto-mint one; enforce presence + uniqueness.
alter table public.partners
  alter column dashboard_token set default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''));
alter table public.partners alter column dashboard_token set not null;
create unique index if not exists partners_dashboard_token_key on public.partners (dashboard_token);
