// DB-layer validation for the two operator actions: finalize + rollback
// (real Postgres via PGlite, so FK ordering + rating math are exercised for real).
//
// Like validate-idempotency.mts, this MIRRORS the supabaseStore functions
// (finalizeRound / rollbackRound) as raw SQL — the same approach that file uses
// for saveDivisioning. It validates the DB-level logic (what gets cleared, the
// FK-safe delete order, the rating reversal, the state reset, and the
// later-round safety guard). It does not exercise the supabase-js query builder
// itself; the deploy bundle already proves that compiles.
//   npm run validate:rollback
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_RATING_CONFIG } from '../supabase/functions/_shared/rating.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPA = join(ROOT, 'supabase');
const strip = (s: string) => s.replace(/create extension if not exists pgcrypto;?/gi, '--');
const PROV = DEFAULT_RATING_CONFIG.provisionalRounds;
const PIPELINE = ['divide', 'assign_judges', 'resolve', 'distribute'] as const;
type Step = (typeof PIPELINE)[number];

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const AXES = `[
  {"key":"age","type":"bracket","active":true,"mergeable":true,"brackets":[
    {"key":"18_plus","min":18,"max":200}]},
  {"key":"rank","type":"tier","active":true,"mergeable":true,"tiers":["beginner","intermediate","advanced"]},
  {"key":"event","type":"category","active":true,"mergeable":false,"values":["trad_forms"]}
]`;

// -------- tiny query helpers --------
let DB: PGlite;
const q = (sql: string, params: any[] = []) => DB.query<any>(sql, params);
const q1 = async (sql: string, params: any[] = []) => (await q(sql, params)).rows[0];
const id1 = async (sql: string, params: any[] = []) => (await q1(sql, params)).id as string;
const count = async (sql: string, params: any[] = []) => Number((await q1(sql, params)).c);
const lit = (arr: string[]) => arr.map((s) => `'${s}'`).join(',');

// -------- seed helpers --------
async function newSeason(name: string) {
  const season = await id1(`insert into seasons(name,status) values($1,'active') returning id`, [name]);
  const scheme = await id1(
    `insert into division_schemes(season_id,version,axes,pod_cap,pod_split_threshold,pod_floor,collapse_order,locked)
     values($1,1,'${AXES}'::jsonb,20,22,6,'["rank","age"]'::jsonb,false) returning id`, [season]);
  const school = await id1(`insert into schools(name,slug) values($1,$2) returning id`, [name + ' Dojo', name.toLowerCase().replace(/\s+/g, '-')]);
  const judge = await id1(`insert into judges(school_id,background_check_status,status) values($1,'cleared','active') returning id`, [school]);
  return { season, scheme, school, judge };
}
// A competitor whose CURRENT skill_ratings reflects `ratingNow` after `events` rated rounds.
async function addCompetitor(school: string, ratingNow: number, events: number) {
  const c = await id1(
    `insert into competitors(school_id,first_name,last_name,dob,declared_rank,status)
     values($1,'C',$2,date '2010-01-01','advanced','active') returning id`, [school, Math.random().toString(36).slice(2, 7)]);
  await q(`insert into skill_ratings(competitor_id,rating,events_count,provisional) values($1,$2,$3,$4)`,
    [c, ratingNow, events, events < PROV]);
  return c;
}
type Comp = { id: string; before: number; after: number; place: number; medal: string };
// Seed one fully-distributed round (division/pod/entries/judge_assignments/results/
// rating_history/medals/shipment + all 4 step_runs 'done').
async function addRound(ctx: { season: string; scheme: string; school: string; judge: string }, seq: number, state: string, comps: Comp[]) {
  const round = await id1(`insert into rounds(season_id,seq,scheme_id,state) values($1,$2,$3,$4) returning id`, [ctx.season, seq, ctx.scheme, state]);
  const division = await id1(`insert into divisions(round_id,event,age_key,rank_key,is_collapsed,entry_count) values($1,'trad_forms','18_plus','advanced',false,$2) returning id`, [round, comps.length]);
  const pod = await id1(`insert into pods(division_id,seq,size,judge_count,state) values($1,1,$2,1,'resolved') returning id`, [division, comps.length]);
  for (const c of comps) {
    const entry = await id1(
      `insert into entries(round_id,competitor_id,event,age_bracket,declared_rank,rating_at_entry,status,division_id,pod_id)
       values($1,$2,'trad_forms','18_plus','advanced',$3,'valid',$4,$5) returning id`, [round, c.id, c.before, division, pod]);
    await q(`insert into judge_assignments(pod_id,entry_id,judge_id,role,state,score,submitted_at) values($1,$2,$3,'sole','submitted',$4,now())`, [pod, entry, ctx.judge, c.after]);
    await q(`insert into results(entry_id,pod_id,score,placement,rating_delta,rating_after) values($1,$2,80,$3,$4,$5)`, [entry, pod, c.place, c.after - c.before, c.after]);
    await q(`insert into rating_history(competitor_id,round_id,entry_id,rating_before,rating_after,rating_delta,opponents,k_factor) values($1,$2,$3,$4,$5,$6,1,8)`, [c.id, round, entry, c.before, c.after, c.after - c.before]);
    await q(`insert into medals(round_id,competitor_id,event,medal_type,placement) values($1,$2,'trad_forms',$3,$4)`, [round, c.id, c.medal, c.place <= 3 ? c.place : null]);
  }
  await q(`insert into medal_shipments(round_id,school_id,item_count,manifest) values($1,$2,$3,'{}'::jsonb)`, [round, ctx.school, comps.length]);
  for (const s of PIPELINE) await q(`insert into round_step_runs(round_id,step,status,completed_at) values($1,$2,'done',now())`, [round, s]);
  return round;
}

// -------- mirrors of supabaseStore.finalizeRound / rollbackRound --------
async function finalizeMirror(round: string) {
  const r = await q1(`select state, scheme_id from rounds where id=$1`, [round]);
  if (r.state === 'finalized') return { ran: false };
  if (r.state !== 'distributed') throw new Error(`Cannot finalize: round is '${r.state}'.`);
  await q(`update division_schemes set locked=true where id=$1`, [r.scheme_id]);
  await q(`update rounds set state='finalized', locked_at=now(), updated_at=now() where id=$1`, [round]);
  await q(`insert into engine_audit(round_id,action,before,after) values($1,'finalize','{"state":"distributed"}'::jsonb,'{"state":"finalized"}'::jsonb)`, [round]);
  return { ran: true };
}
async function rollbackMirror(round: string, to: Step) {
  const toIdx = PIPELINE.indexOf(to);
  const clearAssignments = toIdx <= PIPELINE.indexOf('assign_judges');
  const clearResults = toIdx <= PIPELINE.indexOf('resolve');
  const clearDivide = to === 'divide';
  const rd = await q1(`select state, season_id, seq from rounds where id=$1`, [round]);
  if (rd.state === 'finalized') throw new Error('Round is finalized; cannot roll back.');

  if (clearResults) {
    const later = (await q(`select id from rounds where season_id=$1 and seq>$2`, [rd.season_id, rd.seq])).rows.map((r: any) => r.id);
    if (later.length) {
      const c = await count(`select count(*) c from rating_history where round_id in (${lit(later)})`);
      if (c > 0) throw new Error('Cannot roll back ratings: a later round already has ratings.');
    }
    const hist = (await q(`select competitor_id, rating_before from rating_history where round_id=$1`, [round])).rows;
    await q(`delete from results where entry_id in (select id from entries where round_id=$1)`, [round]);
    await q(`delete from rating_history where round_id=$1`, [round]);
    for (const h of hist) {
      const events = await count(`select count(*) c from rating_history where competitor_id=$1`, [h.competitor_id]);
      await q(`update skill_ratings set rating=$1, events_count=$2, provisional=$3, updated_at=now() where competitor_id=$4`,
        [h.rating_before, events, events < PROV, h.competitor_id]);
    }
  }
  await q(`delete from medals where round_id=$1`, [round]);
  await q(`delete from medal_shipments where round_id=$1`, [round]);
  if (clearAssignments) await q(`delete from judge_assignments where entry_id in (select id from entries where round_id=$1)`, [round]);
  if (clearDivide) {
    await q(`update entries set division_id=null, pod_id=null where round_id=$1`, [round]);
    await q(`delete from pods where division_id in (select id from divisions where round_id=$1)`, [round]);
    await q(`delete from divisions where round_id=$1`, [round]);
  }
  const stepsCleared = PIPELINE.slice(toIdx);
  await q(`delete from round_step_runs where round_id=$1 and step in (${lit(stepsCleared as unknown as string[])})`, [round]);
  const targetState = clearDivide ? 'closed' : 'podded';
  await q(`update rounds set state=$1, locked_at=null, updated_at=now() where id=$2`, [targetState, round]);
  await q(`insert into engine_audit(round_id,action,before,after) values($1,'rollback',$2::jsonb,$3::jsonb)`,
    [round, JSON.stringify({ state: rd.state }), JSON.stringify({ state: targetState, to })]);
}

async function main() {
  DB = new PGlite();
  await DB.exec(`
    do $$ begin
      if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  await DB.exec(strip(readFileSync(join(SUPA, 'reset_and_apply.sql'), 'utf8')));
  await DB.exec(`create schema if not exists auth; create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);

  // ---- A) finalize: distributed -> finalized, scheme locked, idempotent ----
  {
    const ctx = await newSeason('Finalize');
    const round = await addRound(ctx, 1, 'distributed', [{ id: await addCompetitor(ctx.school, 60, 1), before: 50, after: 60, place: 1, medal: 'gold' }]);
    await finalizeMirror(round);
    const r = await q1(`select state, locked_at from rounds where id=$1`, [round]);
    const locked = await q1(`select locked from division_schemes where id=$1`, [ctx.scheme]);
    ok(r.state === 'finalized', 'finalize -> round state finalized');
    ok(r.locked_at != null, 'finalize -> round locked_at stamped');
    ok(locked.locked === true, 'finalize -> scheme version frozen (locked)');
    const again = await finalizeMirror(round);
    ok(again.ran === false, 'finalize is idempotent (already finalized -> no-op)');
  }

  // ---- B) rollback to resolve: reverts ratings, keeps pods/judges ----
  {
    const ctx = await newSeason('RB Resolve');
    const c = await addCompetitor(ctx.school, 60, 2); // current rating 60 after 2 rated rounds
    await addRound(ctx, 1, 'finalized', [{ id: c, before: 50, after: 56, place: 1, medal: 'gold' }]);       // round 1: 50 -> 56
    const r2 = await addRound(ctx, 2, 'distributed', [{ id: c, before: 56, after: 60, place: 1, medal: 'gold' }]); // round 2: 56 -> 60
    await rollbackMirror(r2, 'resolve');
    const sr = await q1(`select rating, events_count from skill_ratings where competitor_id=$1`, [c]);
    ok(Number(sr.rating) === 56, `rollback(resolve) restores rating to pre-round 56 (got ${sr.rating})`);
    ok(Number(sr.events_count) === 1, `rollback(resolve) recounts events to 1 (got ${sr.events_count})`);
    ok(await count(`select count(*) c from results r join entries e on e.id=r.entry_id where e.round_id=$1`, [r2]) === 0, 'rollback(resolve) clears results');
    ok(await count(`select count(*) c from rating_history where round_id=$1`, [r2]) === 0, 'rollback(resolve) clears this round rating_history');
    ok(await count(`select count(*) c from rating_history where round_id!=$1 and competitor_id=$2`, [r2, c]) === 1, 'rollback(resolve) leaves the prior round history intact');
    ok(await count(`select count(*) c from medals where round_id=$1`, [r2]) === 0, 'rollback(resolve) clears medals');
    ok(await count(`select count(*) c from judge_assignments ja join entries e on e.id=ja.entry_id where e.round_id=$1`, [r2]) > 0, 'rollback(resolve) KEEPS judge assignments');
    ok(await count(`select count(*) c from divisions where round_id=$1`, [r2]) > 0, 'rollback(resolve) KEEPS divisions/pods');
    ok(await count(`select count(*) c from round_step_runs where round_id=$1 and step in ('resolve','distribute')`, [r2]) === 0, 'rollback(resolve) clears resolve+distribute step runs');
    ok(await count(`select count(*) c from round_step_runs where round_id=$1 and step in ('divide','assign_judges')`, [r2]) === 2, 'rollback(resolve) keeps divide+assign_judges step runs');
    ok((await q1(`select state from rounds where id=$1`, [r2])).state === 'podded', 'rollback(resolve) resets state to podded');
  }

  // ---- C) rollback to divide: full clear + FK-ordered deletes + unstamp ----
  {
    const ctx = await newSeason('RB Divide');
    const round = await addRound(ctx, 1, 'distributed', [
      { id: await addCompetitor(ctx.school, 60, 1), before: 50, after: 60, place: 1, medal: 'gold' },
      { id: await addCompetitor(ctx.school, 48, 1), before: 50, after: 48, place: 2, medal: 'silver' },
    ]);
    await rollbackMirror(round, 'divide');
    ok(await count(`select count(*) c from divisions where round_id=$1`, [round]) === 0, 'rollback(divide) deletes divisions');
    ok(await count(`select count(*) c from pods p join divisions d on d.id=p.division_id where d.round_id=$1`, [round]) === 0, 'rollback(divide) deletes pods');
    ok(await count(`select count(*) c from entries where round_id=$1 and (division_id is not null or pod_id is not null)`, [round]) === 0, 'rollback(divide) unstamps entries');
    ok(await count(`select count(*) c from judge_assignments ja join entries e on e.id=ja.entry_id where e.round_id=$1`, [round]) === 0, 'rollback(divide) deletes judge assignments');
    ok(await count(`select count(*) c from results r join entries e on e.id=r.entry_id where e.round_id=$1`, [round]) === 0, 'rollback(divide) deletes results');
    ok(await count(`select count(*) c from medals where round_id=$1`, [round]) === 0, 'rollback(divide) deletes medals');
    ok(await count(`select count(*) c from round_step_runs where round_id=$1`, [round]) === 0, 'rollback(divide) clears all step runs');
    ok((await q1(`select state from rounds where id=$1`, [round])).state === 'closed', 'rollback(divide) resets state to closed');
    ok(await count(`select count(*) c from entries where round_id=$1`, [round]) === 2, 'rollback(divide) keeps the entries themselves');
  }

  // ---- D) safety guard: refuse when a LATER round already has ratings ----
  {
    const ctx = await newSeason('Guard');
    const c = await addCompetitor(ctx.school, 60, 2);
    const r1 = await addRound(ctx, 1, 'distributed', [{ id: c, before: 50, after: 56, place: 1, medal: 'gold' }]);
    await addRound(ctx, 2, 'distributed', [{ id: c, before: 56, after: 60, place: 1, medal: 'gold' }]); // later round has ratings
    let threw = false;
    try { await rollbackMirror(r1, 'resolve'); } catch { threw = true; }
    ok(threw, 'rollback refuses when a later round already carries ratings');
    ok(await count(`select count(*) c from rating_history where round_id=$1`, [r1]) === 1, 'guard leaves the earlier round untouched on refusal');
  }

  // ---- E) rollback to distribute: clear medals only; keep results + ratings ----
  {
    const ctx = await newSeason('RB Distribute');
    const c = await addCompetitor(ctx.school, 60, 1);
    const round = await addRound(ctx, 1, 'distributed', [{ id: c, before: 50, after: 60, place: 1, medal: 'gold' }]);
    await rollbackMirror(round, 'distribute');
    ok(await count(`select count(*) c from medals where round_id=$1`, [round]) === 0, 'rollback(distribute) clears medals');
    ok(await count(`select count(*) c from medal_shipments where round_id=$1`, [round]) === 0, 'rollback(distribute) clears shipments');
    ok(await count(`select count(*) c from results r join entries e on e.id=r.entry_id where e.round_id=$1`, [round]) === 1, 'rollback(distribute) KEEPS results');
    ok(await count(`select count(*) c from rating_history where round_id=$1`, [round]) === 1, 'rollback(distribute) KEEPS rating_history');
    ok(Number((await q1(`select rating from skill_ratings where competitor_id=$1`, [c])).rating) === 60, 'rollback(distribute) leaves ratings untouched (still 60)');
    ok(await count(`select count(*) c from round_step_runs where round_id=$1 and step='distribute'`, [round]) === 0, 'rollback(distribute) clears only the distribute step run');
    ok(await count(`select count(*) c from round_step_runs where round_id=$1 and step in ('divide','assign_judges','resolve')`, [round]) === 3, 'rollback(distribute) keeps earlier step runs');
    ok((await q1(`select state from rounds where id=$1`, [round])).state === 'podded', 'rollback(distribute) resets state to podded');
  }

  // ---- F) rollback to assign_judges: clear judges+results+ratings; keep pods ----
  {
    const ctx = await newSeason('RB Assign');
    const c = await addCompetitor(ctx.school, 60, 1);
    const round = await addRound(ctx, 1, 'distributed', [{ id: c, before: 50, after: 60, place: 1, medal: 'gold' }]);
    await rollbackMirror(round, 'assign_judges');
    ok(await count(`select count(*) c from judge_assignments ja join entries e on e.id=ja.entry_id where e.round_id=$1`, [round]) === 0, 'rollback(assign_judges) clears judge assignments');
    ok(await count(`select count(*) c from results r join entries e on e.id=r.entry_id where e.round_id=$1`, [round]) === 0, 'rollback(assign_judges) clears results');
    ok(Number((await q1(`select rating from skill_ratings where competitor_id=$1`, [c])).rating) === 50, 'rollback(assign_judges) reverts rating to 50');
    ok(await count(`select count(*) c from divisions where round_id=$1`, [round]) > 0, 'rollback(assign_judges) KEEPS divisions/pods');
    ok(await count(`select count(*) c from round_step_runs where round_id=$1 and step='divide'`, [round]) === 1, 'rollback(assign_judges) keeps the divide step run');
    ok(await count(`select count(*) c from round_step_runs where round_id=$1 and step in ('assign_judges','resolve','distribute')`, [round]) === 0, 'rollback(assign_judges) clears assign/resolve/distribute step runs');
    ok((await q1(`select state from rounds where id=$1`, [round])).state === 'podded', 'rollback(assign_judges) resets state to podded');
  }

  // ---- G) finalize guard: refuse when the round is not distributed ----
  {
    const ctx = await newSeason('Finalize Guard');
    const round = await addRound(ctx, 1, 'podded', [{ id: await addCompetitor(ctx.school, 60, 1), before: 50, after: 60, place: 1, medal: 'gold' }]);
    let threw = false;
    try { await finalizeMirror(round); } catch { threw = true; }
    ok(threw, 'finalize refuses when round is not distributed');
    ok((await q1(`select state from rounds where id=$1`, [round])).state === 'podded', 'finalize guard leaves state unchanged');
  }

  // ---- H) rollback allowed with NO later round + multi-competitor recompute ----
  {
    const ctx = await newSeason('RB Multi');
    const a = await addCompetitor(ctx.school, 62, 2);
    const b = await addCompetitor(ctx.school, 44, 2);
    await addRound(ctx, 1, 'finalized', [
      { id: a, before: 50, after: 55, place: 1, medal: 'gold' },
      { id: b, before: 50, after: 47, place: 2, medal: 'silver' },
    ]);
    const r2 = await addRound(ctx, 2, 'distributed', [
      { id: a, before: 55, after: 62, place: 1, medal: 'gold' },
      { id: b, before: 47, after: 44, place: 2, medal: 'silver' },
    ]);
    await rollbackMirror(r2, 'resolve'); // latest rated round -> allowed, no throw
    ok(Number((await q1(`select rating from skill_ratings where competitor_id=$1`, [a])).rating) === 55, 'multi: competitor A restored to 55');
    ok(Number((await q1(`select rating from skill_ratings where competitor_id=$1`, [b])).rating) === 47, 'multi: competitor B restored to 47');
    ok(Number((await q1(`select events_count from skill_ratings where competitor_id=$1`, [a])).events_count) === 1, 'multi: A events recount to 1');
    ok(Number((await q1(`select events_count from skill_ratings where competitor_id=$1`, [b])).events_count) === 1, 'multi: B events recount to 1');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await DB.close();
  if (fail) process.exit(1); else console.log('Operator actions (finalize + rollback) OK.');
}
main().catch((e) => { console.error(e); process.exit(1); });
