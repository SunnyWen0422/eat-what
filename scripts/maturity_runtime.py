"""New-instance-only maturity harness. Never adopts an existing process or DB.

All connection settings are generated here, secrets stay in the new evidence
directory, and shutdown uses only Popen handles created by this context.
"""
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import time
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[1]
FLAGS=getattr(subprocess,'CREATE_NO_WINDOW',0)
REQUIRED={'purpose','sourceSha','datasetHash','loopbackApi','privateDb','providerMode','newInstance',
          'ownedProcessManifest','modelBudgetLedger','jarSha256','buildSourceFingerprint'}
OPTIONAL={'jar','buildManifest','mysqld','java','catalog','qualityBundle','rows','baselineJar','baselineBuildManifest','baselineSha'}


def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def backend_fingerprint(root=ROOT):
    root=Path(root);files=[root/'backend/pom.xml']
    files+=sorted(p for p in (root/'backend/src/main').rglob('*') if p.is_file() and not re.fullmatch(r'application(?:-.*)?\.(?:yml|yaml|properties)',p.name))
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


def validate_build(config,build_path,jar):
    try:build=json.loads(Path(build_path).read_text(encoding='utf-8'))
    except (OSError,ValueError):raise ValueError('Build receipt missing') from None
    if build.get('jarSha256')!=config['jarSha256'] or build.get('backendFingerprint')!=config['buildSourceFingerprint']:
        raise ValueError('Build receipt does not match candidate')
    if not Path(jar).is_file() or Path(jar).is_symlink() or digest(jar)!=config['jarSha256']:raise ValueError('Pinned JAR changed')
    if backend_fingerprint()!=config['buildSourceFingerprint']:raise ValueError('Backend source changed since build')
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
    if size==0:return {'kind':'synthetic','rows':16}
    path=Path(config['catalog'])
    if digest(path)!=config['datasetHash']:raise ValueError('Catalog hash changed')
    rows=[json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
    if len(rows)!=6665 or len({r['id'] for r in rows})!=6665 or any(r.get('user_id') is not None for r in rows):raise ValueError('Public source catalog identity mismatch')
    fields=['name','type','cl','fl','step','tags','image','difficulty','cook_time','ingredients_amounts','steps','step_images','tips','methods','kcal','is_custom']
    with connection.cursor() as c:
        # Only called before HTTP startup on a fresh DB created by this process.
        c.execute('DELETE FROM food')
        for start in range(0,size,256):
            batch=[]
            for index in range(start,min(size,start+256)):
                row=rows[index%len(rows)]
                batch.append(tuple([row['id'] if size==6665 else index+1]+[row.get(f) for f in fields]))
            c.executemany('INSERT INTO food(id,'+','.join('`'+f+'`' for f in fields)+',IS_PUBLISHED,METADATA_VERSION) VALUES('+','.join(['%s']*17)+',1,1)',batch)
    return {'kind':'public-source-snapshot' if size==6665 else 'synthetic-expanded-from-public-snapshot','rows':size,
            'sourceRows':6665,'privateHistoryImported':False,'quality':'unreviewed; no invented evidence'}


@contextmanager
def owned_runtime(config,out):
    """Bootstrap schema + fixture + Java/Python in one owning process tree."""
    validate_config(config);out=new_output(out)
    if subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()!=config['sourceSha']:raise ValueError('Source HEAD changed')
    jar=Path(config['jar']).resolve();validate_build(config,config['buildManifest'],jar)
    mysqld=Path(config['mysqld']).absolute();java=Path(config['java']).absolute()
    if not mysqld.is_file() or not java.is_file() or mysqld.is_symlink() or java.is_symlink():raise ValueError('Explicit installed runtime executables required')
    if config.get('rows',6665)>0 and digest(config['catalog'])!=config['datasetHash']:raise ValueError('Dataset hash changed')
    available(18780);available(18781)
    out.mkdir(parents=True);data=out/'private';data.mkdir();mysql_data=data/'mysql';mysql_data.mkdir()
    processes=[];connection=None;server=None;thread=None;provider_context=None
    password=secrets.token_urlsafe(32);token=secrets.token_urlsafe(40);service_token=secrets.token_urlsafe(40)
    db_port=port();database=config['privateDb'];jdbc=f'jdbc:mysql://127.0.0.1:{db_port}/{database}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8'
    state={'api':config['loopbackApi'],'database':database,'dbPort':db_port,'password':password,'tokenSecret':token,'root':str(ROOT),'purpose':config['purpose']}
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
            migrations=json.loads((ROOT/'backend/db/migration-manifest.json').read_text(encoding='utf-8'))['migrations']
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
                for name,kind,ingredients in [('验收鸡丁','meat','鸡肉|200|克'),('验收豆腐','veg','豆腐|200|克'),('验收青菜','veg','青菜|200|克'),('验收蛋汤','soup','鸡蛋|1|个')]:
                    c.execute("INSERT INTO food(NAME,TYPE,CL,INGREDIENTS_AMOUNTS,STEPS,IS_PUBLISHED,METADATA_VERSION) VALUES(%s,%s,%s,%s,'洗净###煮熟###装盘',1,1)",(name,kind,ingredients,ingredients))
        dataset=install_catalog(connection,config)
        acceptance=load('maturity_assistant','scripts/assistant_v4_acceptance.py');model=acceptance.MockCompletion()
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
            'recommend.service.base-url':'http://127.0.0.1:18781','assistant.v4.enabled':True,
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
        yield SimpleNamespace(api=a,db=connection,state=state,model=model,java=jvm,mysql=mysql,output=out,data=data,
                              dataset=dataset,properties=properties,config=config)
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
