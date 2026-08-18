-- ============================================================
-- Judge pay — per-video model. A judge earns a flat rate for each video (entry)
-- they submit a score on. Earnings are recorded per (judge, round) in
-- judge_payments; disbursement is a Stripe transfer to the judge's connected
-- account (pay-judges EF), gated on the platform's transfers-only approval.
-- Rate is config (app_settings.judge_video_rate_cents) so it's tunable.
-- ============================================================

-- Default rate: $1.25 / video (≈ $37.50/hr at ~2 min/video). Tune anytime.
insert into app_settings (key, value)
values ('judge_video_rate_cents', '125'::jsonb)
on conflict (key) do nothing;

create table if not exists judge_payments (
  id                uuid primary key default gen_random_uuid(),
  judge_id          uuid not null references judges(id) on delete cascade,
  round_id          uuid references rounds(id) on delete set null,
  videos_judged     int  not null default 0,
  rate_cents        int  not null,
  amount_cents      int  not null,
  currency          text not null default 'usd',
  status            text not null default 'pending' check (status in ('pending','paid','failed')),
  stripe_transfer_id text,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  updated_at        timestamptz not null default now(),
  unique (judge_id, round_id)          -- one earnings record per judge per round
);
create index if not exists judge_payments_judge on judge_payments(judge_id);
create index if not exists judge_payments_round on judge_payments(round_id);

-- RLS: a judge reads their OWN payments; staff read all. Writes only via the
-- service-role disbursement EF (no write policy).
alter table judge_payments enable row level security;
grant select on judge_payments to authenticated;
drop policy if exists judge_payments_read on judge_payments;
create policy judge_payments_read on judge_payments for select to authenticated
  using (
    nmao.is_staff()
    or judge_id in (select id from judges where auth_user_id = auth.uid())
  );

-- Recompute + upsert this round's earnings for every judge who submitted scores.
-- Never touches rows already marked 'paid' (idempotent, re-run safe). Returns the
-- number of judge rows written.
create or replace function public.record_round_judge_payments(p_round uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_rate int := coalesce((select (value)::text::int from app_settings where key = 'judge_video_rate_cents'), 125);
  v_n int := 0; r record;
begin
  for r in
    select ja.judge_id, count(*)::int as videos
    from judge_assignments ja
    join pods p on p.id = ja.pod_id
    join divisions d on d.id = p.division_id
    where d.round_id = p_round and ja.state = 'submitted' and ja.score is not null
    group by ja.judge_id
  loop
    insert into judge_payments (judge_id, round_id, videos_judged, rate_cents, amount_cents, status, updated_at)
    values (r.judge_id, p_round, r.videos, v_rate, r.videos * v_rate, 'pending', now())
    on conflict (judge_id, round_id) do update
      set videos_judged = excluded.videos_judged,
          rate_cents    = excluded.rate_cents,
          amount_cents  = excluded.amount_cents,
          updated_at    = now()
      where judge_payments.status <> 'paid';   -- never rewrite a settled payment
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.record_round_judge_payments(uuid) from public;
grant execute on function public.record_round_judge_payments(uuid) to service_role;
