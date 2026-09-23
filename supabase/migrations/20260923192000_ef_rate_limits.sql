-- Shared rate-limit primitive for public (verify_jwt OFF) Edge Functions.
-- Atomic fixed-window counter; only the service role (EFs) may call it.

create table if not exists public.ef_rate_limits (
  bucket       text        not null,
  ident        text        not null,
  window_start timestamptz not null default now(),
  hits         int         not null default 0,
  primary key (bucket, ident)
);
alter table public.ef_rate_limits enable row level security;  -- no policies → no anon/authenticated access
revoke all on public.ef_rate_limits from anon, authenticated;

-- Returns TRUE when the call is within the limit, FALSE when it should be blocked.
-- Fixed window: once window_start ages past p_window_secs the counter resets.
create or replace function public.rate_limit_hit(
  p_bucket text, p_ident text, p_limit int, p_window_secs int
) returns boolean
language plpgsql
security definer
set search_path to public
as $$
declare
  v_now  timestamptz := now();
  v_hits int;
begin
  if p_ident is null or p_ident = '' then
    return true; -- nothing to key on → don't block
  end if;
  insert into public.ef_rate_limits as e (bucket, ident, window_start, hits)
    values (p_bucket, p_ident, v_now, 1)
  on conflict (bucket, ident) do update
    set hits = case when e.window_start < v_now - make_interval(secs => p_window_secs)
                    then 1 else e.hits + 1 end,
        window_start = case when e.window_start < v_now - make_interval(secs => p_window_secs)
                    then v_now else e.window_start end
  returning e.hits into v_hits;
  return v_hits <= p_limit;
end $$;

revoke execute on function public.rate_limit_hit(text, text, int, int) from public, anon, authenticated;
grant  execute on function public.rate_limit_hit(text, text, int, int) to service_role;
