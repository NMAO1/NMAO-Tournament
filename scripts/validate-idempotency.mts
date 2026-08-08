// DB-layer idempotency + multi-pod persistence (real Postgres via PGlite).
// Seeds a 24-entry advanced division (which SPLITS into 2 pods), then runs the
// saveDivisioning writes TWICE and asserts the row counts are identical — proving
// a re-fired `divide` (retry/double-click) can't duplicate divisions/pods/seats.
//   npm run validate:idempotency
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runDivisioning } from '../supabase/functions/_shared/divisioning.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPA = join(ROOT, 'supabase');
const strip = (s: string) => s.replace(/create extension if not exists pgcrypto;?/gi, '--');
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const AXES = `[
  {"key":"age","type":"bracket","active":true,"mergeable":true,"brackets":[
    {"key":"7_9","min":7,"max":9},{"key":"10_12","min":10,"max":12},{"key":"13_15","min":13,"max":15},
    {"key":"16_17","min":16,"max":17},{"key":"18_plus","min":18,"max":200}]},
  {"key":"rank","type":"tier","active":true,"mergeable":true,"tiers":["beginner","intermediate","advanced"]},
  {"key":"event","type":"category","active":true,"mergeable":false,"values":["trad_forms","open_forms","trad_weapons","open_weapons"]}
]`;

// mirrors supabaseStore.saveDivisioning writes
async function persistDivide(db: PGlite, roundId: string, result: any) {
  const divIdByKey = new Map<string, string>();
  for (const d of result.divisions) {
    const r = await db.query<{ id: string }>(
      `insert into divisions (round_id,event,age_key,rank_key,is_collapsed,collapsed_from,entry_count)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (round_id,event,age_key,rank_key) do update set
         is_collapsed=excluded.is_collapsed, collapsed_from=excluded.collapsed_from, entry_count=excluded.entry_count
       returning id`,
      [roundId, d.event, d.ageKey, d.rankKey, d.isCollapsed, JSON.stringify(d.collapsedFrom), d.entries.length]);
    divIdByKey.set(d.key, r.rows[0].id);
  }
  const podIdByDivSeq = new Map<string, string>();
  for (const p of result.pods) {
    const divisionId = divIdByKey.get(p.divisionKey)!;
    const r = await db.query<{ id: string }>(
      `insert into pods (division_id,seq,size,judge_count,state) values ($1,$2,$3,$4,'forming')
       on conflict (division_id,seq) do update set size=excluded.size, judge_count=excluded.judge_count
       returning id`,
      [divisionId, p.seq, p.entries.length, p.judgeCount]);
    podIdByDivSeq.set(`${divisionId}:${p.seq}`, r.rows[0].id);
  }
  for (const p of result.pods) {
    const divisionId = divIdByKey.get(p.divisionKey)!;
    const podId = podIdByDivSeq.get(`${divisionId}:${p.seq}`)!;
    for (const e of p.entries) await db.query(`update entries set division_id=$1, pod_id=$2 where id=$3`, [divisionId, podId, e.id]);
  }
}

async function main() {
  const db = new PGlite();
  await db.exec(`
    do $$ begin
      if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  await db.exec(strip(readFileSync(join(SUPA, 'reset_and_apply.sql'), 'utf8')));
  await db.exec(`create schema if not exists auth; create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);

  // seed: one closed round, 24 advanced entries in a single division (will split 12/12)
  await db.exec(`
    do $$
    declare v_season uuid; v_scheme uuid; v_round uuid; v_school uuid; c uuid; i int;
    begin
      insert into seasons(name,status) values('Idem Season','active') returning id into v_season;
      insert into division_schemes(season_id,version,axes,pod_cap,pod_split_threshold,pod_floor,collapse_order,locked)
        values(v_season,1,'${AXES}'::jsonb,20,22,6,'["rank","age"]'::jsonb,true) returning id into v_scheme;
      insert into rounds(season_id,seq,scheme_id,state) values(v_season,1,v_scheme,'closed') returning id into v_round;
      insert into schools(name,slug) values('Idem Dojo','idem-dojo') returning id into v_school;
      for i in 1..24 loop
        insert into competitors(school_id,first_name,last_name,dob,declared_rank,status)
          values(v_school,'Adv',i::text,date '2015-06-01','advanced','active') returning id into c;
        insert into skill_ratings(competitor_id,rating,events_count,provisional) values(c,50+i,5,false);
        insert into entries(round_id,competitor_id,event,age_bracket,declared_rank,rating_at_entry,status)
          values(v_round,c,'trad_forms','10_12','advanced',50+i,'valid');
      end loop;
    end $$;`);

  const round = (await db.query<{ id: string; scheme_id: string }>(
    `select r.id, r.scheme_id from rounds r join seasons s on s.id=r.season_id where s.name='Idem Season'`)).rows[0];
  const sc = (await db.query<any>(`select axes,pod_cap,pod_split_threshold,pod_floor,collapse_order from division_schemes where id=$1`, [round.scheme_id])).rows[0];
  const scheme = { axes: sc.axes, podCap: sc.pod_cap, podSplitThreshold: sc.pod_split_threshold, podFloor: sc.pod_floor, collapseOrder: sc.collapse_order };
  const entries = (await db.query<any>(`select id,event,age_bracket,declared_rank,rating_at_entry from entries where round_id=$1 and status='valid'`, [round.id]))
    .rows.map((e: any) => ({ id: e.id, event: e.event, ageBracket: e.age_bracket, rank: e.declared_rank, rating: Number(e.rating_at_entry) }));

  const result = runDivisioning(entries, scheme);
  ok(result.divisions.length === 1 && result.pods.length === 2, '24 advanced -> 1 division, 2 pods (split)');
  ok(result.pods.every((p: any) => p.entries.length === 12 && p.judgeCount === 3), 'pods 12/12, 3 judges each');

  const counts = async () => ({
    div: Number((await db.query<any>(`select count(*) c from divisions where round_id=$1`, [round.id])).rows[0].c),
    pod: Number((await db.query<any>(`select count(*) c from pods p join divisions d on d.id=p.division_id where d.round_id=$1`, [round.id])).rows[0].c),
    seated: Number((await db.query<any>(`select count(*) c from entries where round_id=$1 and pod_id is not null`, [round.id])).rows[0].c),
  });

  await persistDivide(db, round.id, result);
  const a = await counts();
  ok(a.div === 1 && a.pod === 2 && a.seated === 24, `run 1 persists 1 div / 2 pods / 24 seated (got ${JSON.stringify(a)})`);

  await persistDivide(db, round.id, result); // re-fire (retry / double-click)
  const b = await counts();
  ok(b.div === 1 && b.pod === 2 && b.seated === 24, `run 2 is idempotent — identical counts (got ${JSON.stringify(b)})`);

  const c1 = (await db.query<any>(`select claim_step($1,'divide') as v`, [round.id])).rows[0].v;
  const c2 = (await db.query<any>(`select claim_step($1,'divide') as v`, [round.id])).rows[0].v;
  ok(c1 === true && c2 === false, 'claim_step guards a concurrent second divide');

  console.log(`\n${pass} passed, ${fail} failed`);
  await db.close();
  if (fail) process.exit(1); else console.log('DB-layer idempotency + split persistence OK.');
}
main().catch((e) => { console.error(e); process.exit(1); });
