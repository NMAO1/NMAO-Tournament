-- ============================================================================
-- Fix: the school-affiliation approval RPCs were defined in the `nmao` schema
-- (migration 20260907130000), but `nmao` is NOT an exposed PostgREST schema, so
-- the school portal's supabase.rpc("school_pending_affiliations" / "school_decide
-- _affiliation") calls fail (PGRST202) — the approve/decline queue never worked.
-- It went unnoticed because no affiliation request had ever been created. The new
-- join-code funnel now creates them, so move both RPCs to `public` (bodies
-- unchanged; they still delegate ownership to nmao.owned_school_ids()).
-- ============================================================================

drop function if exists nmao.school_pending_affiliations();
drop function if exists nmao.school_decide_affiliation(uuid, boolean);

create or replace function public.school_pending_affiliations()
returns table (request_id uuid, competitor_id uuid, first_name text, last_name text, dob date, requested_at timestamptz)
language sql security definer set search_path = public, nmao as $$
  select r.id, c.id, c.first_name, c.last_name, c.dob, r.created_at
  from public.school_affiliation_requests r
  join public.competitors c on c.id = r.competitor_id
  where r.status = 'pending'
    and r.school_id in (select nmao.owned_school_ids())
  order by r.created_at;
$$;
revoke all on function public.school_pending_affiliations() from public, anon;
grant execute on function public.school_pending_affiliations() to authenticated, service_role;

create or replace function public.school_decide_affiliation(p_request uuid, p_approve boolean)
returns jsonb
language plpgsql security definer set search_path = public, nmao as $$
declare r record;
begin
  select * into r from public.school_affiliation_requests where id = p_request and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'error', 'Request not found or already decided.'); end if;
  if r.school_id not in (select nmao.owned_school_ids()) then
    return jsonb_build_object('ok', false, 'error', 'Not your school.');
  end if;

  if p_approve then
    update public.competitors set school_id = r.school_id where id = r.competitor_id and school_id is null;
    update public.school_affiliation_requests set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = p_request;
  else
    update public.school_affiliation_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = p_request;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.school_decide_affiliation(uuid, boolean) from public, anon;
grant execute on function public.school_decide_affiliation(uuid, boolean) to authenticated, service_role;
