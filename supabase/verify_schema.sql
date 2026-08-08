-- =====================================================================
-- Verify the divisioning/distribute + idempotency schema is applied.
-- Run in the Supabase SQL Editor against the target project. Every row
-- should read present = true. If any is false, re-run reset_and_apply.sql
-- (safe on a project with no real data) or the specific migration.
-- =====================================================================
select 'claim_step() function'                as item,
       exists(select 1 from pg_proc where proname='claim_step') as present
union all
select 'rating_history unique index (entry_id)',
       exists(select 1 from pg_indexes where indexname='rating_history_entry_uk')
union all
select 'division_schemes.axes column',
       exists(select 1 from information_schema.columns where table_name='division_schemes' and column_name='axes')
union all
select 'division_schemes.pod_cap column',
       exists(select 1 from information_schema.columns where table_name='division_schemes' and column_name='pod_cap')
union all
select 'division_schemes.collapse_order column',
       exists(select 1 from information_schema.columns where table_name='division_schemes' and column_name='collapse_order')
union all
select 'divisions UNIQUE(round_id,event,age_key,rank_key)',
       exists(select 1 from pg_constraint
              where conrelid='divisions'::regclass and contype='u'
                and pg_get_constraintdef(oid) like '%(round_id, event, age_key, rank_key)%')
union all
select 'pods UNIQUE(division_id,seq)',
       exists(select 1 from pg_constraint
              where conrelid='pods'::regclass and contype='u'
                and pg_get_constraintdef(oid) like '%(division_id, seq)%')
union all
select 'medals table',
       exists(select 1 from information_schema.tables where table_name='medals')
union all
select 'medal_shipments table + UNIQUE(round_id,school_id)',
       exists(select 1 from information_schema.tables where table_name='medal_shipments')
   and exists(select 1 from pg_constraint
              where conrelid='medal_shipments'::regclass and contype='u'
                and pg_get_constraintdef(oid) like '%(round_id, school_id)%')
union all
select 'rounds.state column',
       exists(select 1 from information_schema.columns where table_name='rounds' and column_name='state')
union all
select 'round_state enum has classified/podded/distributed',
       (select count(*) from pg_enum where enumtypid='round_state'::regtype
          and enumlabel in ('classified','podded','distributed')) = 3
order by item;
