-- Lightweight per-key rate limiter for public Edge Functions (sponsor-signup /
-- sponsor-upload-url were unauthenticated with no throttle → spam risk). The EF
-- calls rate_ok(bucket, ip, max, window) via the service role; it records the hit
-- and returns whether the caller is still under the limit. service_role only.
create table if not exists public.ef_rate_limit (
  bucket text not null,
  key    text not null,
  at     timestamptz not null default now()
);
create index if not exists idx_ef_rate on public.ef_rate_limit(bucket, key, at);
alter table public.ef_rate_limit enable row level security;  -- no policies; service_role bypasses

create or replace function public.rate_ok(p_bucket text, p_key text, p_max int, p_window_secs int)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  -- opportunistic cleanup of this bucket's expired rows
  delete from public.ef_rate_limit where bucket = p_bucket and at < now() - make_interval(secs => p_window_secs);
  insert into public.ef_rate_limit (bucket, key) values (p_bucket, p_key);
  select count(*) into n from public.ef_rate_limit
    where bucket = p_bucket and key = p_key and at >= now() - make_interval(secs => p_window_secs);
  return n <= p_max;
end $$;

revoke all on function public.rate_ok(text, text, int, int) from public, anon, authenticated;
grant execute on function public.rate_ok(text, text, int, int) to service_role;
