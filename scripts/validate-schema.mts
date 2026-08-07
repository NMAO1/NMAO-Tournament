// =====================================================================
// Schema + divisioning integration test (real Postgres via PGlite).
// Applies reset_and_apply.sql + seed_demo.sql, runs the pure runDivisioning
// against the seeded data, mirrors the saveDivisioning writes, and asserts
// the divisions/pods come out right. No Supabase project needed.
//   npm run validate:schema
// =====================================================================
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runDivisioning } from '../supabase/functions/_shared/divisioning.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPA = join(ROOT, 'supabase');
// PGlite has gen_random_uuid() in core; drop the pgcrypto extension line only.
const strip = (s: string) =>
  s.replace(/create extension if not exists pgcrypto;?/gi, '-- pgcrypto: gen_random_uuid is core in pglite');

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

async function main() {
  const db = new PGlite();

  // Supabase-only roles + auth.* helpers that PGlite doesn't ship.
  await db.exec(`
    do $$ begin
      if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema if not exists auth;
    create or replace function auth.uid()  returns uuid  language sql stable as $$ select null::uuid $$;
    create or replace function auth.role() returns text  language sql stable as $$ select 'service_role'::text $$;
    create or replace function auth.jwt()  returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  `);

  await db.exec(strip(readFileSync(join(SUPA, 'reset_and_apply.sql'), 'utf8')));
  await db.exec(`create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  await db.exec(strip(readFileSync(join(SUPA, 'seed_demo.sql'), 'utf8')));

  const cnt = async (sql: string) => Number((await db.query<{ c: string }>(sql)).rows[0].c);
  ok(await cnt(`select count(*) c from seasons where name='Demo Season 2026'`) === 1, 'one demo season');
  ok(await cnt(`select count(*) c from schools where slug like 'demo-dojo-%'`) === 4, '4 schools');
  ok(await cnt(`select count(*) c from judges where background_check_status='cleared' and status='active'`) === 8, '8 cleared judges');
  ok(await cnt(`select count(*) c from entries where status='valid'`) === 26, '26 valid entries');

  const round = (await db.query<{ id: string; scheme_id: string }>(
    `select r.id, r.scheme_id from rounds r join seasons s on s.id=r.season_id where s.name='Demo Season 2026'`)).rows[0];
  const sch = (await db.query<any>(
    `select axes, pod_cap, pod_split_threshold, pod_floor, collapse_order from division_schemes where id=$1`, [round.scheme_id])).rows[0];
  const scheme = { axes: sch.axes, podCap: sch.pod_cap, podSplitThreshold: sch.pod_split_threshold, podFloor: sch.pod_floor, collapseOrder: sch.collapse_order };
  const erows = (await db.query<any>(
    `select id, event, age_bracket, declared_rank, rating_at_entry from entries where round_id=$1 and status='valid'`, [round.id])).rows;
  const entries = erows.map((e: any) => ({ id: e.id, event: e.event, ageBracket: e.age_bracket, rank: e.declared_rank, rating: Number(e.rating_at_entry) }));

  const result = runDivisioning(entries, scheme);
  ok(result.divisions.length === 4, `4 divisions (got ${result.divisions.length})`);
  ok(result.pods.length === 4, `4 pods (got ${result.pods.length})`);
  const collapsed = result.divisions.find((d) => d.isCollapsed);
  ok(!!collapsed && collapsed.entries.length === 7 && collapsed.rankKey.includes('advanced'),
     `collapsed 13_15 division: 7 entries incl advanced (got ${collapsed?.entries.length}, ${collapsed?.rankKey})`);
  const advPod = result.pods.find((p) => result.divisions.find((d) => d.key === p.divisionKey)?.rankKey.includes('advanced'));
  ok(!!advPod && advPod.judgeCount === 3, 'advanced pod requires 3 judges');

  // mirror saveDivisioning writes against the real schema
  const divIdByKey = new Map<string, string>();
  for (const d of result.divisions) {
    const r = await db.query<{ id: string }>(
      `insert into divisions (round_id,event,age_key,rank_key,is_collapsed,collapsed_from,entry_count)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (round_id,event,age_key,rank_key) do update set
         is_collapsed=excluded.is_collapsed, collapsed_from=excluded.collapsed_from, entry_count=excluded.entry_count
       returning id`,
      [round.id, d.event, d.ageKey, d.rankKey, d.isCollapsed, JSON.stringify(d.collapsedFrom), d.entries.length]);
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
  let assigned = 0;
  for (const p of result.pods) {
    const divisionId = divIdByKey.get(p.divisionKey)!;
    const podId = podIdByDivSeq.get(`${divisionId}:${p.seq}`)!;
    for (const e of p.entries) { await db.query(`update entries set division_id=$1, pod_id=$2 where id=$3`, [divisionId, podId, e.id]); assigned++; }
  }
  await db.query(`update rounds set state='podded' where id=$1`, [round.id]);

  ok(await cnt(`select count(*) c from divisions where round_id='${round.id}'`) === 4, 'persisted 4 divisions');
  ok(await cnt(`select count(*) c from pods p join divisions d on d.id=p.division_id where d.round_id='${round.id}'`) === 4, 'persisted 4 pods');
  ok(await cnt(`select count(*) c from entries where round_id='${round.id}' and pod_id is not null`) === 26, 'all 26 entries seated');
  ok(await cnt(`select count(*) c from rounds where id='${round.id}' and state='podded'`) === 1, 'round advanced to podded');
  ok(assigned === 26, `assigned 26 (got ${assigned})`);

  const c1 = (await db.query<{ claim_step: boolean }>(`select claim_step('${round.id}','divide') as claim_step`)).rows[0].claim_step;
  const c2 = (await db.query<{ claim_step: boolean }>(`select claim_step('${round.id}','divide') as claim_step`)).rows[0].claim_step;
  ok(c1 === true && c2 === false, 'claim_step: first wins, second no-ops');

  console.log(`\n${pass} passed, ${fail} failed`);
  await db.close();
  if (fail) process.exit(1);
  else console.log('Schema + divisioning integration OK.');
}
main().catch((e) => { console.error(e); process.exit(1); });
