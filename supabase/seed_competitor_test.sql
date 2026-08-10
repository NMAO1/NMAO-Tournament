-- =====================================================================
-- COMPETITOR-APP test seed (tournament project oxzuavpyoetchwebdejp)
-- Opens the demo round for entries + links a demo competitor to YOUR auth user
-- so the Compete screen has a profile to submit as.
--
-- PREREQ: use the SAME auth user you made for the Judge app
--   (Dashboard > Authentication > Users). A user can be both judge + competitor.
-- Edit v_email, then run. Safe to re-run. Reversible (see cleanup at bottom).
-- =====================================================================
do $$
declare
  v_email text := 'REPLACE_WITH_YOUR_TOURNAMENT_AUTH_EMAIL';   -- <-- EDIT THIS
  v_uid   uuid;
  v_comp  uuid;
  v_round uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'No auth user with email %. Create one in Dashboard > Authentication first.', v_email;
  end if;

  -- open the demo round so submit-entry will accept entries
  update rounds r set state = 'open'
    from seasons s where s.id = r.season_id and s.name = 'Demo Season 2026'
    returning r.id into v_round;

  -- link one demo competitor to you (competitor RLS then returns it in the app)
  select c.id into v_comp
    from competitors c
    where c.email like 'demo-comp-%@nmao.us' and c.declared_rank is not null
    order by c.email limit 1;

  if v_comp is null then
    raise notice 'No demo competitors found. Run supabase/seed_demo.sql first, then re-run this.';
  else
    update competitors set auth_user_id = v_uid where id = v_comp;
    raise notice 'Linked competitor % to %. Round % is OPEN. Sign into the Compete app.', v_comp, v_email, v_round;
  end if;
end $$;

-- Who you'll submit as:
select first_name, last_name, declared_rank, dob
from competitors where auth_user_id is not null and email like 'demo-comp-%@nmao.us';

-- -----------------------------------------------------------------
-- CLEANUP when done:
--   update competitors set auth_user_id = null where email like 'demo-comp-%@nmao.us';
--   update rounds r set state='closed' from seasons s where s.id=r.season_id and s.name='Demo Season 2026';
-- -----------------------------------------------------------------
