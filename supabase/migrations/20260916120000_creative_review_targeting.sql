-- Fold targeting into the reveal-creative review panel. Two refinements now that
-- targeting is editable alongside the creative:
--
-- 1) Narrow the auto-revert trigger to CONFIG (creative) changes only. Review
--    approves *what* is shown (art/color/copy); targeting is *who* sees it — a
--    commercial dial. Re-pointing an approved creative at a new segment should
--    not force re-approval of unchanged creative, so a targeting edit no longer
--    trips the revert.
-- 2) admin_creative_queue also returns `events` so the panel's targeting editor
--    can round-trip it (otherwise saving targeting from the panel would wipe it).

create or replace function nmao.entitlement_review_reset() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_at := now(); new.approved_at := null; new.approved_by := null;
    return new;
  end if;
  if new.config is distinct from old.config then
    new.approved_at := null; new.approved_by := null; new.submitted_at := now();
  end if;
  return new;
end $$;

drop function if exists public.admin_creative_queue();
create function public.admin_creative_queue()
returns table (
  entitlement_id uuid, sponsor_id uuid, company_name text, sponsor_status text,
  logo_url text, tagline text, website text, config jsonb, active boolean,
  age_brackets text[], states text[], regions text[], ranks text[], events text[],
  submitted_at timestamptz, approved_at timestamptz, review_notes text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select e.id, sp.id, sp.company_name, sp.status,
           sp.logo_url, sp.tagline, sp.website, e.config, e.active,
           e.age_brackets, e.states, e.regions, e.ranks, e.events,
           e.submitted_at, e.approved_at, e.review_notes
    from public.sponsor_entitlements e
    join public.sponsors sp on sp.id = e.sponsor_id
    where e.offering_code = 'reveal_sponsor'
    order by (e.approved_at is not null), e.submitted_at desc;
end $$;

grant execute on function public.admin_creative_queue() to authenticated;
