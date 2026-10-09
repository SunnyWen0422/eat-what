"""Create an immutable local DRAFT package from allowlisted public/runtime files."""
import argparse,hashlib,json,shutil,subprocess,zipfile
from pathlib import Path
from export_local_miniprogram import export

ROOT=Path(__file__).resolve().parents[1]


def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def package(bundle,out):
    bundle=Path(bundle).resolve();out=Path(out).resolve()
    if out.exists() or out.is_relative_to(ROOT):raise ValueError('Choose a new output directory outside the source repository')
    manifest=json.loads((bundle/'manifest.json').read_text(encoding='utf-8'))
    allowed={'manifest.json','recipes.csv','quality.jsonl','issues.csv','changes.jsonl','source-recipes.jsonl','review-candidates.csv','profile.json','audit.md'}
    if any(name not in allowed for name in manifest['files']):raise ValueError('Unrecognized quality package member')
    for name,expected in manifest['files'].items():
        if digest(bundle/name)!=expected:raise ValueError('Quality package has changed')
    jar=ROOT/'backend/target/eatwhat-backend-1.0.0.jar'
    with zipfile.ZipFile(jar) as archive:
        if any(name.startswith('BOOT-INF/classes/application') and name.endswith(('.yml','.yaml','.properties')) for name in archive.namelist()):
            raise ValueError('JAR includes application configuration; rebuild without local secrets')
    out.mkdir(parents=True)
    def copy(source,relative):
        if source.is_symlink():raise ValueError('Symlink is not a release input')
        dest=out/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest)
    export(ROOT,out/'wechat')
    # Keep machine-local domain-check preferences out of a reviewable release candidate.
    private=out/'wechat/project.private.config.json'
    if private.exists():private.unlink()
    copy(jar,'backend/eatwhat-backend.jar')
    copy(ROOT/'backend/src/main/resources/application.yml.example','config/application.yml.example')
    copy(ROOT/'recommend-service/.env.example','config/recommend.env.example')
    for source in (ROOT/'recommend-service').rglob('*.py'):
        if '__pycache__' not in source.parts:copy(source,Path('recommend-service')/source.relative_to(ROOT/'recommend-service'))
    copy(ROOT/'recommend-service/requirements.txt','recommend-service/requirements.txt')
    for source in (ROOT/'backend/db').rglob('*.sql'):copy(source,Path('backend/db')/source.relative_to(ROOT/'backend/db'))
    copy(ROOT/'backend/db/migration-manifest.json','backend/db/migration-manifest.json')
    for name in ['catalog_quality.py','catalog-quality-rules.json','build_catalog_quality.py','validate_catalog_reviews.py','legacy_dump.py','bridge_legacy_local.py','run_mysql_integration.py','check_test_environment.py']:
        copy(ROOT/'scripts'/name,Path('scripts')/name)
    for name in allowed:copy(bundle/name,Path('catalog')/name)
    for source in [ROOT/'docs/release/local-maturity-cutover.md',ROOT/'docs/testing/2026-10-08-local-maturity-results.md',ROOT/'docs/testing/local-maturity-page-matrix.md',ROOT/'docs/database/legacy-to-v4-local-bridge.md']:
        copy(source,Path('docs')/source.name)
    git=['git','-c','safe.directory='+ROOT.as_posix(),'-C',str(ROOT)]
    commit=subprocess.check_output(git+['rev-parse','HEAD'],text=True).strip()
    dirty=bool(subprocess.check_output(git+['status','--porcelain'],text=True).strip())
    files={p.relative_to(out).as_posix():digest(p) for p in sorted(out.rglob('*')) if p.is_file()}
    record={'status':'DRAFT','gitBaseCommit':commit,'workingTreeHasChanges':dirty,'datasetVersion':manifest['datasetVersion'],'files':files,
            'snapshotSha256':hashlib.sha256(json.dumps(files,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'gatesPending':['human recipe evidence and cooking','image rights','native 27-page interaction and real devices','external model unified acceptance','backup restoration and production cutover approval'],
            'deploymentAllowed':False,'frontendApi':'local loopback; must be explicitly reviewed before release'}
    (out/'release-manifest.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    return {'status':record['status'],'files':len(files),'datasetVersion':record['datasetVersion'],'output':str(out),'snapshotSha256':record['snapshotSha256']}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--quality-bundle',required=True);parser.add_argument('--out',required=True);args=parser.parse_args()
    print(json.dumps(package(args.quality_bundle,args.out),ensure_ascii=False,indent=2))
