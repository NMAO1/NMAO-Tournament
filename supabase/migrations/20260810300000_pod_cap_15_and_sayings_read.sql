-- =====================================================================
-- Pod cap 20 -> 15, split 22 -> 16. Smaller pods = more podiums = more
-- winners/motivation (judging is now per-competitor, so pod size is free).
-- Applies to FUTURE schemes (column default) + the global reference settings;
-- existing/locked schemes are unchanged.
-- Also: make motivational_sayings readable by signed-in users (Reveal ceremony).
-- =====================================================================

update app_settings set value = '15'::jsonb where key = 'pod_cap';
update app_settings set value = '16'::jsonb where key = 'pod_split_threshold';

alter table division_schemes alter column pod_cap set default 15;
alter table division_schemes alter column pod_split_threshold set default 16;

alter table motivational_sayings enable row level security;
drop policy if exists saying_read on motivational_sayings;
create policy saying_read on motivational_sayings for select to authenticated using (active);
