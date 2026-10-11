"""Create a local evidence manifest; never deploys, publishes or enables the feature."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def source_manifest(paths):
    return {str(p.relative_to(ROOT)).replace('\\','/'):digest(p) for p in sorted(set(paths)) if p.is_file()}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--jar',required=True);parser.add_argument('--acceptance',required=True);parser.add_argument('--output',required=True);parser.add_argument('--live-report');args=parser.parse_args()
    jar=Path(args.jar).resolve();acceptance=Path(args.acceptance).resolve();checks=json.loads(acceptance.read_text(encoding='utf-8'))
    if checks.get('jarSha256')!=digest(jar):raise SystemExit('Acceptance was not performed against this JAR')
    source=source_manifest((ROOT/'recommend-service').glob('*.py'))
    if checks.get('sourceHashes')!=source:raise SystemExit('Python source changed after acceptance')
    if checks.get('contractSha256')!=digest(ROOT/'contracts/assistant-v4.json'):raise SystemExit('Contract changed after acceptance')
    backend=source_manifest(p for p in (ROOT/'backend/src/main').rglob('*') if p.name!='application.yml')
    if checks.get('backendSourceHashes')!=backend:raise SystemExit('Backend source changed after acceptance')
    sql=[ROOT/'backend/db/migrations/V8__assistant_v4_conversations.sql',ROOT/'backend/db/migrations/V8_10__assistant_shopping_scope_aliases.sql']
    frontend=list((ROOT/'utils').glob('assistant*.js'))+list((ROOT/'pages/chat').glob('*'))+list((ROOT/'components/assistant-card').glob('*'))+[ROOT/'utils/api.js',ROOT/'utils/meal-workspace-page.js',ROOT/'templates/meal-workspace.wxml',ROOT/'pages/calendar-detail/calendar-detail.js',ROOT/'pages/calendar-detail/calendar-detail.wxml']
    payload={'kind':'local-unreleased-candidate','gitSha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'workingTreeStatus':subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).splitlines(),
        'jarSha256':digest(jar),'backend':backend,'python':source,'frontend':source_manifest(frontend),'contractVersion':'assistant.v4.1','contractSha256':digest(ROOT/'contracts/assistant-v4.json'),
        'additiveMigrations':source_manifest(sql),'migrationManifestSha256':digest(ROOT/'backend/db/migration-manifest.json'),
        'acceptanceSha256':digest(acceptance),'mockBusinessCases':{'passed':checks.get('passed'),'total':checks.get('total')},
        'liveProviderEvidence':None if not args.live_report else {'sha256':digest(Path(args.live_report))},
        'releaseFlag':{'ASSISTANT_V4_ENABLED':False,'existingMealWorkspaceUnaffected':True},
        'nativeDeviceGate':'Requires separate final-source WeChat and real-device evidence',
        'rollback':'Disable ASSISTANT_V4_ENABLED; restore matching application artifacts/configuration; preserve additive assistant tables, procurement aliases and all business receipts. No automatic DROP, domain rollback or old migration replay.'}
    Path(args.output).write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'candidateWritten':True,'gitSha':payload['gitSha'],'jarSha256':payload['jarSha256'],'enabled':False}))
if __name__=='__main__':main()
