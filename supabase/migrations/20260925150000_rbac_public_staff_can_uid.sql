-- RBAC hotfix (2026-09-25): the Edge Functions call svc.rpc("staff_can_uid"),
-- which PostgREST resolves in the `public` schema — but staff_can_uid lives in
-- `nmao`, so the call 404'd and every EF capability gate denied everyone
-- (owner included). Add a public wrapper so svc.rpc("staff_can_uid") resolves.
create or replace function public.staff_can_uid(p_uid uuid, p_slice text, p_level text default 'full')
returns boolean language sql stable security definer set search_path = public, nmao as $$
  select nmao.staff_can_uid(p_uid, p_slice, p_level);
$$;
revoke all on function public.staff_can_uid(uuid, text, text) from public, anon;
grant execute on function public.staff_can_uid(uuid, text, text) to authenticated, service_role;
