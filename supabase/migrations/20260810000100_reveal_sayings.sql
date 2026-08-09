-- =====================================================================
-- Reveal wiring for motivational sayings.
-- A competitor who did NOT place 1st/2nd/3rd (placement > 3) is shown a
-- motivational saying at reveal (docs/competitor-growth-and-badges.md §2).
-- The saying is assigned at DISTRIBUTE time and stored on results.saying_id,
-- so the reveal is stable (same words each open) and non-repeating per
-- competitor across the season.
-- =====================================================================

alter table results
  add column if not exists saying_id uuid references motivational_sayings(id);

-- Assign a fresh saying to every non-placer in a round who doesn't have one.
-- "Fresh" = an active saying the competitor has not been assigned in any prior
-- result. Falls back to any active saying if they've somehow seen them all.
create or replace function assign_reveal_sayings(p_round_id uuid)
returns int
language plpgsql
as $$
declare
  n int := 0;
  r record;
  sid uuid;
begin
  for r in
    select res.id as result_id, e.competitor_id
    from results res
    join entries e on e.id = res.entry_id
    where e.round_id = p_round_id
      and res.placement > 3
      and res.saying_id is null
  loop
    select ms.id into sid
    from motivational_sayings ms
    where ms.active
      and ms.id not in (
        select r2.saying_id
        from results r2
        join entries e2 on e2.id = r2.entry_id
        where e2.competitor_id = r.competitor_id
          and r2.saying_id is not null
      )
    order by random()
    limit 1;

    if sid is null then
      select ms.id into sid from motivational_sayings ms
      where ms.active order by random() limit 1;
    end if;

    update results set saying_id = sid where id = r.result_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

grant execute on function assign_reveal_sayings(uuid) to service_role;
