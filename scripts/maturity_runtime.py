"""New-instance-only maturity harness. Never adopts an existing process or DB.

All connection settings are generated here, secrets stay in the new evidence
directory, and shutdown uses only Popen handles created by this context.
"""
from contextlib import contextmanager
import hashlib
import io
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import time
import zipfile
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[1]
FLAGS=getattr(subprocess,'CREATE_NO_WINDOW',0)
REQUIRED={'purpose','sourceSha','datasetHash','loopbackApi','privateDb','providerMode','newInstance',
          'ownedProcessManifest','modelBudgetLedger','jarSha256','buildSourceFingerprint'}
OPTIONAL={'jar','buildManifest','mysqld','java','catalog','qualityBundle','rows','baselineJar','baselineBuildManifest','baselineSha'}


def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validate_execution(value,execution=None):
    if execution is None:
        validate_config(value);return None
    # The default entry never accepts a live flag. A live coordinator supplies
    # the same atomic ledger that guards each external HTTP attempt.
    if value.get('providerMode')!='live' or getattr(execution,'provider_mode',None)!='live':raise ValueError('Explicit live execution required')
    validate_config(dict(value,providerMode='mock',modelBudgetLedger=None))
    from assistant_v4_provider_budget import ProviderBudget,BudgetExhausted
    ledger=getattr(execution,'ledger',None)
    if not isinstance(ledger,ProviderBudget) or not value.get('modelBudgetLedger'):raise ValueError('Atomic live ledger required')
    if Path(value['modelBudgetLedger']).resolve()!=ledger.path or ledger.path.is_symlink() or ledger.path.is_relative_to(ROOT):raise ValueError('Live ledger scope differs')
    try:record=ledger.validate()
    except (OSError,ValueError,BudgetExhausted):raise ValueError('Live budget unavailable') from None
    if record['used']>=record['limit']:raise ValueError('Live budget exhausted')
    return execution


def backend_fingerprint(root=ROOT):
    root=Path(root);files=[root/'backend/pom.xml']
    files+=sorted((p for p in (root/'backend/src/main').rglob('*') if p.is_file() and not re.fullmatch(r'application(?:-.*)?\.(?:yml|yaml|properties)',p.name)),key=lambda p:p.relative_to(root).as_posix())
    h=hashlib.sha256()
    for path in files:h.update((path.relative_to(root).as_posix()+':'+digest(path)+'\n').encode())
    return h.hexdigest()


def validate_config(value):
    if set(value)-REQUIRED-OPTIONAL or REQUIRED-set(value):raise ValueError('Unknown or missing isolated runtime fields')
    if value['purpose']!='product-maturity-isolated' or value['newInstance'] is not True:raise ValueError('New exclusive instance required')
    if value['loopbackApi']!='http://127.0.0.1:18780/api':raise ValueError('Only owned literal loopback API allowed')
    if not re.fullmatch(r'eatwhat_maturity_local_[a-f0-9]{8}',str(value['privateDb'])):raise ValueError('Dedicated new database required')
    if value['providerMode']!='mock' or value['modelBudgetLedger'] is not None:raise ValueError('This harness never calls a real provider')
    if value['ownedProcessManifest']!='runtime.json':raise ValueError('Owned process manifest required')
    if not re.fullmatch('[a-f0-9]{40}',str(value['sourceSha'])):raise ValueError('Pinned source SHA required')
    for key in ('datasetHash','jarSha256','buildSourceFingerprint'):
        if not re.fullmatch('[a-f0-9]{64}',str(value[key])):raise ValueError('Pinned source/data/build hash required')
    if value.get('rows',6665) not in (0,6665,50000):raise ValueError('Only declared fixture sizes allowed')
    return value


def validate_build(config,build_path,jar,baseline=False):
    try:build=json.loads(Path(build_path).read_text(encoding='utf-8'))
    except (OSError,ValueError):raise ValueError('Build receipt missing') from None
    if build.get('jarSha256')!=config['jarSha256'] or build.get('backendFingerprint')!=config['buildSourceFingerprint']:
        raise ValueError('Build receipt does not match candidate')
    if not Path(jar).is_file() or Path(jar).is_symlink() or digest(jar)!=config['jarSha256']:raise ValueError('Pinned JAR changed')
    # A source SHA must identify the executable source, not just the last commit
    # under an uncommitted Java edit. Documentation/harness work may be separate.
    if not baseline and subprocess.run(['git','diff','--quiet','HEAD','--','backend/src/main','backend/pom.xml','backend/db'],cwd=ROOT).returncode!=0:
        raise ValueError('Commit executable/schema source before candidate integration')
    if baseline:
        revision=config.get('baselineSha','')
        if not re.fullmatch('[a-f0-9]{40}',revision) or build.get('sourceSha')!=revision:raise ValueError('Pinned baseline source required')
        subprocess.run(['git','merge-base','--is-ancestor',revision,config['sourceSha']],cwd=ROOT,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        archive=subprocess.check_output(['git','archive','--format=zip',revision,'backend/pom.xml','backend/src/main'],cwd=ROOT)
        h=hashlib.sha256()
        with zipfile.ZipFile(io.BytesIO(archive)) as z:
            files=sorted(n for n in z.namelist() if not n.endswith('/') and not re.fullmatch(r'application(?:-.*)?\.(?:yml|yaml|properties)',Path(n).name))
            # Match backend_fingerprint: POM first, then sorted source files.
            files=['backend/pom.xml']+[n for n in files if n!='backend/pom.xml']
            for name in files:h.update((name+':'+hashlib.sha256(z.read(name)).hexdigest()+'\n').encode())
        if h.hexdigest()!=config['buildSourceFingerprint']:raise ValueError('Baseline source receipt differs from Git archive')
    elif backend_fingerprint()!=config['buildSourceFingerprint']:raise ValueError('Backend source changed since build')
    # A matching hash alone cannot establish that the archive is a configuration-
    # free EatWhat Spring executable. Reuse the canonical strict archive check.
    load('maturity_jar_guard','scripts/local_v4.py').validate_jar(jar)
    return build


def new_output(path):
    path=Path(os.path.abspath(path)).resolve()
    if path.exists() or path==ROOT or path.is_relative_to(ROOT):raise ValueError('Choose a new evidence directory outside the repository')
    return path


def port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]


def available(value):
    with socket.socket() as s:s.bind(('127.0.0.1',value))


def load(name,relative):
    spec=importlib.util.spec_from_file_location(name,ROOT/relative);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


def install_catalog(connection,config):
    """Original public catalog only; no legacy users/history leave the source files."""
    size=config.get('rows',6665)
    if size==0:return {'kind':'synthetic','rows':19}
    path=Path(config['catalog'])
    if digest(path)!=config['datasetHash']:raise ValueError('Catalog hash changed')
    rows=[json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
    if len(rows)!=6665 or len({int(r['id']) for r in rows})!=6665 or any(r.get('user_id') not in (None,'') for r in rows):raise ValueError('Public source catalog identity mismatch')
    fields=['name','type','cl','fl','step','tags','image','difficulty','cook_time','ingredients_amounts','steps','step_images','tips','methods','kcal','is_custom']
    with connection.cursor() as c:
        # Only called before HTTP startup on a fresh DB created by this process.
        c.execute('DELETE FROM food')
        for start in range(0,size,256):
            batch=[]
            for index in range(start,min(size,start+256)):
                row=rows[index%len(rows)]
                values=[row.get(f) for f in fields]
                values[-1]=int(row.get('is_custom') or 0)
                batch.append(tuple([int(row['id']) if size==6665 else index+1]+values+[1,1]))
            # All values are placeholders so PyMySQL can emit bounded multi-row
            # INSERTs instead of silently falling back to 50k autocommit roundtrips.
            c.executemany('INSERT INTO food(id,'+','.join('`'+f+'`' for f in fields)+',IS_PUBLISHED,METADATA_VERSION) VALUES('+','.join(['%s']*(len(fields)+3))+')',batch)
    return {'kind':'public-source-snapshot' if size==6665 else 'synthetic-expanded-from-public-snapshot','rows':size,
            'sourceRows':6665,'privateHistoryImported':False,'quality':'unreviewed; no invented evidence'}


@contextmanager
def owned_runtime(config,out,baseline=False,execution=None):
    """Bootstrap schema + fixture + Java/Python in one owning process tree."""
    validate_execution(config,execution);out=new_output(out)
    if baseline and execution is not None:raise ValueError('Live baseline execution forbidden')
    if subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()!=config['sourceSha']:raise ValueError('Source HEAD changed')
    jar=Path(config['jar']).resolve();validate_build(config,config['buildManifest'],jar,baseline)
    mysqld=Path(config['mysqld']).absolute();java=Path(config['java']).absolute()
    if not mysqld.is_file() or not java.is_file() or mysqld.is_symlink() or java.is_symlink():raise ValueError('Explicit installed runtime executables required')
    if config.get('rows',6665)>0 and digest(config['catalog'])!=config['datasetHash']:raise ValueError('Dataset hash changed')
    available(18780);available(18781)
    out.mkdir(parents=True);data=out/'private';data.mkdir();mysql_data=data/'mysql';mysql_data.mkdir()
    pinned=data/('eatwhat-backend-'+config['jarSha256']+'.jar')
    with jar.open('rb') as source,pinned.open('xb') as target:
        for chunk in iter(lambda:source.read(1024*1024),b''):target.write(chunk)
    if digest(pinned)!=config['jarSha256']:raise ValueError('Candidate changed while pinning owned runtime')
    jar=pinned
    processes=[];connection=None;server=None;thread=None;provider_context=None
    password=secrets.token_urlsafe(32);token=secrets.token_urlsafe(40);service_token=secrets.token_urlsafe(40)
    db_port=port();database=config['privateDb'];jdbc=f'jdbc:mysql://127.0.0.1:{db_port}/{database}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8'
    state={'api':config['loopbackApi'],'database':database,'dbPort':db_port,'password':password,'tokenSecret':token,'root':str(ROOT),'purpose':config['purpose'],'providerMode':config['providerMode']}
    try:
        subprocess.run([str(mysqld),'--no-defaults','--initialize-insecure','--datadir='+str(mysql_data),'--log-error='+str(data/'mysql.log')],check=True,creationflags=FLAGS)
        mysql=subprocess.Popen([str(mysqld),'--no-defaults','--datadir='+str(mysql_data),'--bind-address=127.0.0.1','--port='+str(db_port),'--log-error='+str(data/'mysql.log'),'--mysqlx=OFF','--default-time-zone=+08:00'],creationflags=FLAGS);processes.append(mysql)
        import pymysql
        until=time.monotonic()+40
        while connection is None:
            if mysql.poll() is not None or time.monotonic()>until:raise RuntimeError('New owned MySQL startup failed; private logs retained')
            try:connection=pymysql.connect(host='127.0.0.1',port=db_port,user='root',password='',charset='utf8mb4',autocommit=True,connect_timeout=2)
            except pymysql.Error:time.sleep(.15)
        sql=load('maturity_sql','scripts/run_mysql_integration.py')
        with connection.cursor() as c:
            c.execute("ALTER USER 'root'@'localhost' IDENTIFIED BY %s",(password,));c.execute('CREATE DATABASE `'+database+'` CHARACTER SET utf8mb4');c.execute('USE `'+database+'`')
            c.execute('CREATE TABLE food(id INT PRIMARY KEY AUTO_INCREMENT,NAME VARCHAR(255),TYPE VARCHAR(16),CL TEXT,FL TEXT,STEP LONGTEXT)')
            scripts=['database_migration.sql','ensure_food_import_schema.sql','create_favorite_dishes_table.sql','shopping_list_schema.sql','recommendation_preferences_schema.sql']
            migration_source=subprocess.check_output(['git','show',config['baselineSha']+':backend/db/migration-manifest.json'],cwd=ROOT) if baseline else (ROOT/'backend/db/migration-manifest.json').read_bytes()
            migrations=json.loads(migration_source)['migrations']
            for item in migrations:
                path=ROOT/'backend/db/migrations'/item['file']
                if hashlib.sha256(path.read_text(encoding='utf-8').replace('\r\n','\n').encode()).hexdigest()!=item['checksumSha256']:raise ValueError('Migration source hash differs')
            scripts+=['db/migrations/'+r['file'] for r in migrations]
            for name in scripts:
                for statement in sql.statements((ROOT/'backend'/name).read_text(encoding='utf-8')):
                    if statement.upper().startswith('USE '):continue
                    c.execute(statement)
                    while c.nextset():pass
                if name=='database_migration.sql':c.execute('ALTER TABLE recipe_records ADD COLUMN DISH_DETAILS TEXT')
            c.execute('ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL')
            c.execute("INSERT INTO users(id,open_id,nickname,status) VALUES(910001,'local-v4-user','验收账户一',1),(910002,'local-v4-second','验收账户二',1)")
            if config.get('rows')==0:
                names=['番茄炒蛋','香菇鸡丁','土豆炖肉','清炒青菜','清炒西兰花','醋溜土豆丝','紫菜蛋汤','番茄豆腐汤','米饭','清粥','验收合成水果甜点','验收合成凉拌黄瓜','验收合成早餐燕麦']
                kinds=['meat']*3+['veg']*3+['soup']*2+['staple']*2+['dessert','side','staple']
                ingredients=['番茄|300|克###鸡蛋|2|个','鸡肉|300|克###香菇|100|克','猪肉|300|克###土豆|200|克','青菜|300|克','西兰花|300|克','土豆|300|克','紫菜|10|克###鸡蛋|1|个','番茄|200|克###豆腐|200|克','大米|200|克','大米|100|克','苹果|1|个','黄瓜|1|根','燕麦|50|克']
                for index,(name,kind,ingredient) in enumerate(zip(names,kinds,ingredients)):
                    c.execute("INSERT INTO food(NAME,TYPE,CL,INGREDIENTS_AMOUNTS,STEPS,COOK_MINUTES,COOK_TIME,TAG_CODES,IS_PUBLISHED,METADATA_VERSION) VALUES(%s,%s,%s,%s,'洗净###煮熟###装盘',15,'15分钟',%s,1,1)",(name,kind,ingredient,ingredient,'BREAKFAST_ELIGIBLE' if index==12 else 'HOME_STYLE'))
        dataset=install_catalog(connection,config)
        dataset['migrations']=[item['version'] for item in migrations]
        with connection.cursor() as c:
            c.execute("SELECT id FROM food WHERE user_id IS NULL AND TYPE IN ('meat','veg','soup','staple','dessert') ORDER BY id LIMIT 100");public_ids=[int(row[0]) for row in c.fetchall()]
            c.execute('SELECT MAX(id)+1 FROM food');future_private_id=int(c.fetchone()[0])
        # Include one deliberately future ID: the public API must still reject
        # an owned recipe even if that ID was accidentally put in its allowlist.
        state['publicFixtureIds']=public_ids;state['futurePrivateFixtureId']=future_private_id
        acceptance=load('maturity_assistant','scripts/assistant_v4_acceptance.py');model=acceptance.MockCompletion() if execution is None else execution.create_model()
        provider_context=acceptance.local_provider(model);provider_url=provider_context.__enter__()
        import uvicorn,threading
        app=acceptance.synthetic_python_app(provider_url,service_token)
        server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=18781,log_level='critical',access_log=False));thread=threading.Thread(target=server.run,daemon=True);thread.start()
        until=time.monotonic()+15
        while not server.started:
            if not thread.is_alive() or time.monotonic()>until:raise RuntimeError('Owned Python startup failed')
            time.sleep(.05)
        properties={'server.address':'127.0.0.1','server.port':18780,'server.servlet.context-path':'/api',
            'spring.datasource.url':jdbc,'spring.datasource.username':'root','spring.datasource.password':password,
            'spring.datasource.hikari.maximum-pool-size':10,'spring.datasource.hikari.minimum-idle':2,
            'spring.jackson.time-zone':'GMT+8','mybatis.configuration.map-underscore-to-camel-case':True,
            'security.token.secret':token,'wechat.miniapp.appid':'local','wechat.miniapp.secret':'local',
            'admin.user-ids':'910001','meal-workspace.enabled':True,'meal-workspace.service-token':service_token,
            'public-catalog.enabled':True,'public-catalog.allowed-dish-ids':public_ids+[future_private_id],
            'recommend.service.base-url':'http://127.0.0.1:18781','assistant-v4.enabled':True,'assistant-v4.extensions-enabled':True,
            'management.endpoints.web.exposure.include':'health,info,metrics',
            'management.endpoint.health.group.local-ready.include':'db,ping','logging.level.com.eatwhat':'WARN'}
        config_file=data/'application.json';config_file.write_text(json.dumps(properties),encoding='utf-8')
        env={k:v for k,v in os.environ.items() if k.upper() in {'SYSTEMROOT','WINDIR','PATH','TEMP','TMP','LANG','LC_ALL'}}
        # A literal JSON file is supplied as SPRING_APPLICATION_JSON only to this
        # child; ambient Spring/JVM/DB/provider settings never enter the process.
        env['SPRING_APPLICATION_JSON']=config_file.read_text(encoding='utf-8');env['TENCENT_ASR_ENABLED']='false'
        with (data/'java.log').open('ab') as log:
            jvm=subprocess.Popen([str(java),'-Xms128m','-Xmx512m','-XX:NativeMemoryTracking=summary','-Xlog:gc:file='+str(data/'gc.log'),'-jar',str(jar),'--spring.profiles.active=local-v4','--spring.config.location=optional:file:'+str(data/'absent.yml')],cwd=data,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=FLAGS)
        processes.append(jvm);state.update(javaPid=jvm.pid,mysqlPid=mysql.pid,jarSha256=digest(jar),sourceSha=config['sourceSha'],dataset=dataset)
        (data/'runtime.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
        a=acceptance.Acceptance(state,connection,model);until=time.monotonic()+60
        while True:
            if jvm.poll() is not None:raise RuntimeError('Owned Java exited; private log retained')
            try:
                if a.http('/users/info')['user']['id']==910001:break
            except OSError:
                if time.monotonic()>until:raise RuntimeError('Owned authenticated API readiness failed') from None
                time.sleep(.2)
        caps=a.http('/assistant/v4/capabilities')
        if not caps.get('enabled') or len(caps.get('reads',[]))!=11:raise RuntimeError('Owned assistant capability handshake failed')
        def restart():
            previous=next(p for p in reversed(processes) if p.args==jvm.args)
            if previous.poll() is None:previous.terminate();previous.wait(timeout=20)
            with (data/'java.log').open('ab') as log:
                replacement=subprocess.Popen(jvm.args,cwd=data,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=FLAGS)
            processes.append(replacement);state['javaPid']=replacement.pid
            (data/'runtime.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
            until=time.monotonic()+60
            while True:
                if replacement.poll() is not None:raise RuntimeError('Owned restart exited')
                try:
                    if a.http('/users/info')['user']['id']==910001:return replacement
                except OSError:
                    if time.monotonic()>until:raise RuntimeError('Owned restart readiness failed') from None
                    time.sleep(.2)
        yield SimpleNamespace(api=a,db=connection,state=state,model=model,java=jvm,mysql=mysql,output=out,data=data,
                              dataset=dataset,properties=properties,config=config,restart=restart,app=app)
    finally:
        if connection is not None:connection.close()
        if server is not None:server.should_exit=True
        if thread is not None:thread.join(timeout=10)
        if provider_context is not None:provider_context.__exit__(None,None,None)
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
                try:process.wait(timeout=20)
                except subprocess.TimeoutExpired:process.kill();process.wait(timeout=10)
