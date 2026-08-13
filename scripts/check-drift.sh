#!/usr/bin/env bash
# Schema drift check: every table/function a migration DECLARES must exist in the
# linked remote DB. Run anytime (esp. before shipping). Requires: supabase CLI linked.
#   ./scripts/check-drift.sh
set -euo pipefail
cd "$(dirname "$0")/.."
supabase db query --linked --output-format json \
  "select 't:'||tablename obj from pg_tables where schemaname='public'
   union all select 'f:'||n.nspname||'.'||p.proname from pg_proc p
     join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','nmao');" > /tmp/_live_objs.json
python3 - <<'PY'
import re, glob
raw=open('/tmp/_live_objs.json').read()
lt=set(); lf=set()
for m in re.finditer(r'"obj":"([^"]+)"', raw):
    v=m.group(1)
    if v.startswith('t:'): lt.add(v[2:].lower())
    elif v.startswith('f:'): lf.add(v[2:].lower()); lf.add(v[2:].lower().split('.')[-1])
dt=set(); df=set()
for f in glob.glob('supabase/migrations/*.sql'):
    s=open(f,encoding='utf-8',errors='replace').read()
    for m in re.finditer(r'create table (?:if not exists )?(?:public\.)?"?([a-z_][a-z0-9_]*)"?',s,re.I): dt.add(m.group(1).lower())
    for m in re.finditer(r'create (?:or replace )?function (?:(nmao|public)\.)?"?([a-z_][a-z0-9_]*)"?\s*\(',s,re.I):
        df.add(f"{(m.group(1) or 'public').lower()}.{m.group(2).lower()}")
mt=sorted(t for t in dt if t not in lt)
mf=sorted(f for f in df if f not in lf and f.split('.')[-1] not in lf)
print(f"tables declared {len(dt)} / live {len(lt)} — missing: {mt or 'none'}")
print(f"funcs declared {len(df)} / live — missing: {mf or 'none'}")
import sys; sys.exit(1 if (mt or mf) else 0)
PY
