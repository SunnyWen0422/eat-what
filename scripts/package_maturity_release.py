"""Create an immutable local DRAFT package from allowlisted public/runtime files."""
import argparse,hashlib,json,re,shutil,subprocess,zipfile
from pathlib import Path
from urllib.parse import urlsplit
from export_local_miniprogram import export

ROOT=Path(__file__).resolve().parents[1]


def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def frontend_api(root):
    values=re.findall(r"^\s*const\s+API_BASE_URL\s*=\s*(['\"])([^'\"\r\n]+)\1\s*;?\s*$",(Path(root)/'utils/config.js').read_text(encoding='utf-8'),re.M)
    if len(values)!=1:raise ValueError('API source must contain one literal API_BASE_URL')
    value=values[0][1];url=urlsplit(value)
    if url.username or url.password or url.query or url.fragment or url.path!='/api' or not url.hostname:
        raise ValueError('API URL must not include credentials or request parameters')
    if url.scheme!='https' and not (url.scheme=='http' and url.hostname in ('127.0.0.1','localhost','::1')):
        raise ValueError('API URL must use HTTPS or explicit local loopback')
    return value


def python_inputs(root):
    root=Path(root);service=root/'recommend-service'
    for source in sorted(service.rglob('*.py')):
        if '__pycache__' not in source.parts:yield source,source.relative_to(root)
    yield service/'requirements.txt',Path('recommend-service/requirements.txt')
    for source in sorted((service/'prompts').rglob('*.txt')):yield source,source.relative_to(root)
    for name in ('agent-policy.json','agent.md','spec.md','data-policy.md'):
        source=root/'docs/assistant'/name
        if not source.is_file():raise ValueError('Missing runtime assistant policy: '+name)
        yield source,source.relative_to(root)


def check_prepared_migration(directory):
    directory=Path(directory)
    expected={'legacy-to-v4.sql','steps.json','contracts.json','preflight.json'}
    if {source.name for source in directory.iterdir()}!=expected:raise ValueError('Incomplete or unexpected prepared migration files')
    receipt=json.loads((directory/'preflight.json').read_text(encoding='utf-8'))
    if receipt.get('mode')!='prepare-only' or receipt.get('productionApproved') is not False or receipt.get('migrationRegistryWrites')!=0:
        raise ValueError('Migration preparation boundary differs')
    if set(receipt.get('files',{}))!=expected-{'preflight.json'}:raise ValueError('Migration file receipt differs')
    for name,record in receipt['files'].items():
        source=directory/name
        if source.is_symlink() or not source.is_file() or source.stat().st_size!=record['bytes'] or digest(source)!=record['sha256']:
            raise ValueError('Prepared migration changed')
    return receipt


def package(bundle,out,web_release=None,migration_bundle=None,jar_path=None):
    bundle=Path(bundle).resolve();out=Path(out).resolve()
    if out.exists() or out.is_relative_to(ROOT):raise ValueError('Choose a new output directory outside the source repository')
    manifest=json.loads((bundle/'manifest.json').read_text(encoding='utf-8'))
    allowed={'manifest.json','recipes.csv','quality.jsonl','issues.csv','changes.jsonl','source-recipes.jsonl','review-candidates.csv','profile.json','audit.md'}
    if any(name not in allowed for name in manifest['files']):raise ValueError('Unrecognized quality package member')
    for name,expected in manifest['files'].items():
        if digest(bundle/name)!=expected:raise ValueError('Quality package has changed')
    api=frontend_api(ROOT)
    web_release=Path(web_release).resolve() if web_release else None
    migration_bundle=Path(migration_bundle).resolve() if migration_bundle else None
    if migration_bundle:check_prepared_migration(migration_bundle)
    if web_release:
        subprocess.run([shutil.which('node') or 'node','--input-type=module','-e',
            "import {verifyRelease} from '"+(ROOT/'web/scripts/release-files.ts').as_uri()+"'; await verifyRelease(process.argv[1]);",str(web_release)],check=True)
    jar=Path(jar_path).resolve() if jar_path else ROOT/'backend/target/eatwhat-backend-1.0.0.jar'
    with zipfile.ZipFile(jar) as archive:
        if any(name.startswith('BOOT-INF/classes/application') and name.endswith(('.yml','.yaml','.properties')) for name in archive.namelist()):
            raise ValueError('JAR includes application configuration; rebuild without local secrets')
        for name in ('PublicCatalogController','MealWorkspaceController'):
            value=archive.read('BOOT-INF/classes/com/eatwhat/controller/'+name+'.class')
            if int.from_bytes(value[6:8],'big')!=52:raise ValueError('Java 8 compatible controllers are required')
        if archive.testzip() is not None:raise ValueError('JAR integrity failed')
    out.mkdir(parents=True)
    def copy(source,relative):
        if source.is_symlink():raise ValueError('Symlink is not a release input')
        dest=out/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest)
    export(ROOT,out/'wechat')
    # Keep machine-local domain-check preferences out of a reviewable release candidate.
    private=out/'wechat/project.private.config.json'
    if private.exists():private.unlink()
    source_receipt=out/'wechat/source-manifest.json'
    value=json.loads(source_receipt.read_text(encoding='utf-8'));value['source']='repository mini-program runtime'
    source_receipt.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    copy(jar,'backend/eatwhat-backend.jar')
    copy(ROOT/'backend/src/main/resources/application.yml.example','config/application.yml.example')
    copy(ROOT/'recommend-service/.env.example','config/recommend.env.example')
    for source,relative in python_inputs(ROOT):copy(source,relative)
    for source in (ROOT/'backend/db').rglob('*.sql'):copy(source,Path('backend/db')/source.relative_to(ROOT/'backend/db'))
    copy(ROOT/'backend/db/migration-manifest.json','backend/db/migration-manifest.json')
    for name in ['catalog_quality.py','catalog-quality-rules.json','build_catalog_quality.py','validate_catalog_reviews.py','legacy_dump.py','bridge_legacy_local.py','run_mysql_integration.py','check_test_environment.py','prepare_legacy_v4_release.py','quality_sidecar.py','build_assistant_index.py']:
        copy(ROOT/'scripts'/name,Path('scripts')/name)
    for name in allowed:copy(bundle/name,Path('catalog')/name)
    for source in [ROOT/'docs/release/local-maturity-cutover.md',ROOT/'docs/testing/2026-10-08-local-maturity-results.md',ROOT/'docs/testing/local-maturity-page-matrix.md',ROOT/'docs/database/legacy-to-v4-local-bridge.md',ROOT/'docs/database/legacy-v4-release-preflight.md']:
        copy(source,Path('docs')/source.name)
    for name in ('2026-10-10-local-merged-readiness.md',):
        source=ROOT/'docs/release'/name
        if source.is_file():copy(source,Path('docs')/name)
    if web_release:
        for source in sorted(web_release.rglob('*')):
            if source.is_file():copy(source,Path('web')/source.relative_to(web_release))
        copy(ROOT/'web/deploy/nginx-web.example.conf','config/nginx-web.example.conf')
    if migration_bundle:
        for source in sorted(migration_bundle.iterdir()):
            if source.name not in {'legacy-to-v4.sql','steps.json','preflight.json','contracts.json'} or not source.is_file():
                raise ValueError('Unrecognized prepared migration member')
            copy(source,Path('migration')/source.name)
    git=['git','-c','safe.directory='+ROOT.as_posix(),'-C',str(ROOT)]
    commit=subprocess.check_output(git+['rev-parse','HEAD'],text=True).strip()
    dirty=bool(subprocess.check_output(git+['status','--porcelain'],text=True).strip())
    files={p.relative_to(out).as_posix():digest(p) for p in sorted(out.rglob('*')) if p.is_file()}
    record={'status':'DRAFT','gitBaseCommit':commit,'workingTreeHasChanges':dirty,'datasetVersion':manifest['datasetVersion'],'files':files,
            'snapshotSha256':hashlib.sha256(json.dumps(files,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'gatesPending':['native interaction and real devices','external model unified acceptance','fresh server schema preflight and backup restoration','production cutover approval'],
            'datasetLimitations':['unreviewed recipes cannot become trusted automatic web recommendations','unknown portions/prices/nutrition remain unknown'],
            'deploymentAllowed':False,'frontendApi':api,'webIncluded':bool(web_release),'preparedMigrationIncluded':bool(migration_bundle),
            'pythonEntrypoint':'main:app','productionConfigurationIncluded':False}
    (out/'release-manifest.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    return {'status':record['status'],'files':len(files),'datasetVersion':record['datasetVersion'],'output':str(out),'snapshotSha256':record['snapshotSha256']}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--quality-bundle',required=True);parser.add_argument('--out',required=True);parser.add_argument('--web-release');parser.add_argument('--migration-bundle');parser.add_argument('--jar');args=parser.parse_args()
    print(json.dumps(package(args.quality_bundle,args.out,args.web_release,args.migration_bundle,args.jar),ensure_ascii=False,indent=2))
