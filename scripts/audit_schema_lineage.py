"""Offline migration lineage audit. No database credentials or connection support."""
import argparse,json
from pathlib import Path
LEGACY={'V3__calendar_sync','V4__custom_dish_receipts','V5__assistant_recipe_provenance','V6__shopping_prices'}
V4={'V3__meal_workflow','V4__meal_workspace','V5__shopping_prices'}
def audit(schema,manifest):
 rows=schema.get('migrations',[]);names={r['version'] for r in rows};known={r['version']:r['checksumSha256'] for r in manifest['migrations']};blockers=[]
 if not names and not schema.get('tables'):lineage='fresh'
 elif names&LEGACY and not names&V4:lineage='legacy_local'
 elif names&V4 and not names&LEGACY:lineage='v4_workspace'
 else:lineage='mixed_or_unknown';blockers.append('Migration lineage is mixed or unknown')
 if len(rows)!=len(names):blockers.append('Duplicate migration versions')
 for name in sorted(names-known.keys()-LEGACY):blockers.append('Unknown migration: '+name)
 # A V4 export carrying explicitly declared legacy-only objects needs a bridge.
 if lineage=='v4_workspace' and schema.get('legacyObjects'):blockers.append('Legacy objects require an explicit bridge: '+','.join(schema['legacyObjects']))
 for row in rows:
  if row['version'] in known and row.get('checksum')!=known[row['version']]:blockers.append('Checksum mismatch: '+row['version'])
 if lineage=='legacy_local':blockers.append('An explicit bridge is required; never run V4 scripts over the legacy lineage')
 return {'lineage':lineage,'safe':not blockers,'blockers':blockers,'versions':sorted(names)}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--schema-json',required=True);p.add_argument('--manifest',required=True);p.add_argument('--out',required=True);a=p.parse_args();result=audit(json.loads(Path(a.schema_json).read_text(encoding='utf-8')),json.loads(Path(a.manifest).read_text(encoding='utf-8')));Path(a.out).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result));raise SystemExit(0 if result['safe'] else 1)
