-- =====================================================================
-- Make YOUR auth account NMAO staff (operator) so Mission Control +
-- round-controller authorize you. Edit v_email, then run. Safe to re-run.
-- A user can be staff + judge + competitor at once (separate tables).
-- =====================================================================
do $$
declare
  v_email text := 'REPLACE_WITH_YOUR_TOURNAMENT_AUTH_EMAIL';   -- <-- EDIT THIS
  v_uid   uuid;
  v_staff uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then raise exception 'No auth user with email %.', v_email; end if;

  select id into v_staff from staff where auth_user_id = v_uid;
  if v_staff is not null then raise notice 'Already staff (%).', v_staff; return; end if;

  select id into v_staff from staff where email_norm = lower(trim(v_email));
  if v_staff is not null then
    update staff set auth_user_id = v_uid where id = v_staff;
  else
    insert into staff(first_name, last_name, email, role, auth_user_id)
    values ('NMAO', 'Operator', v_email, 'owner', v_uid) returning id into v_staff;
  end if;
  raise notice 'Staff % linked to %.', v_staff, v_email;
end $$;

select first_name, last_name, role, email from staff where auth_user_id is not null;
