-- Bump school revenue share 30% -> 35% so live payouts honor the "up to 35%"
-- claim on join.nmao.us. Revenue ladder is now 15% / 25% / 35% (applied as a
-- flat top rate in code today; per-school tiering still TBD).
insert into public.app_settings (key, value)
values ('school_share_pct', to_jsonb(0.35))
on conflict (key) do update set value = excluded.value;
