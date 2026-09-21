-- ============================================================================
-- Fix: my_competitor_school must live in PUBLIC so the app's supabase.rpc()
-- finds it (compete_dashboard / claim_round_entry are public and work; the app
-- client defaults to the public schema, so the nmao-schema copy was unreachable
-- via .rpc()). Drop the nmao copy, recreate identically in public.
-- ============================================================================

drop function if exists nmao.my_competitor_school(uuid);

create or replace function public.my_competitor_school(p_competitor uuid)
returns jsonb
language plpgsql security definer set search_path = public, nmao as $$
declare
  v_uid uuid := auth.uid();
  v_school_id uuid;
  v_name text;
begin
  if not exists (
    select 1 from public.competitors c where c.id = p_competitor and c.auth_user_id = v_uid
    union
    select 1 from public.guardian_competitors gc
      join public.guardians g on g.id = gc.guardian_id
     where gc.competitor_id = p_competitor and g.auth_user_id = v_uid
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select school_id into v_school_id from public.competitors where id = p_competitor;
  if v_school_id is not null then
    select name into v_name from public.schools where id = v_school_id;
    return jsonb_build_object('status', 'confirmed', 'school_name', v_name);
  end if;

  select s.name into v_name
    from public.school_affiliation_requests r
    join public.schools s on s.id = r.school_id
   where r.competitor_id = p_competitor and r.status = 'pending'
   limit 1;
  if v_name is not null then
    return jsonb_build_object('status', 'pending', 'school_name', v_name);
  end if;

  return jsonb_build_object('status', 'none');
end $$;
revoke all on function public.my_competitor_school(uuid) from public, anon;
grant execute on function public.my_competitor_school(uuid) to authenticated, service_role;
