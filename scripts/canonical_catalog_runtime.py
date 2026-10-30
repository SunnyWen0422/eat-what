"""Owner-created loopback integration; fresh by default, explicit stopped-owner resume."""
import argparse,hashlib,json,os,re,secrets,socket,subprocess,sys,time,shutil,urllib.request,urllib.parse,uuid
from contextlib import contextmanager
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FLAGS=getattr(subprocess,'CREATE_NO_WINDOW',0)
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]

def no_links(path):
 """Reject symlinks and Windows reparse points before resolving owned paths."""
 path=Path(path).absolute()
 for item in (path,*path.parents):
  if item.is_symlink() or (item.exists() and getattr(item.lstat(),'st_file_attributes',0)&0x400):raise ValueError('Owned path cannot contain links/reparse points')

def assert_ports_available(ports):
 sockets=[]
 try:
  for value in ports:
   s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);sockets.append(s)
   if hasattr(socket,'SO_EXCLUSIVEADDRUSE'):s.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
   s.bind(('127.0.0.1',value))
 finally:
  for s in sockets:s.close()

@contextmanager
def resume_lock(output):
 lock=Path(output)/'.resume-owned.lock'
 with lock.open('x',encoding='utf-8') as f:f.write(str(os.getpid()))
 try:yield
 finally:lock.unlink()

def validate_resume_owned(output,catalog,jar,manifest,verify,check_ports=None):
 """Read-only guards. The caller must hold resume_lock until daemon cleanup."""
 no_links(output);out=Path(output).resolve()
 if not out.is_dir() or out.is_relative_to(ROOT):raise ValueError('Existing outside-repository owner directory required')
 private=out/'private';data=private/'mysql'
 required=[private/'runtime.json',private/'candidate.jar',out/'build-manifest.json',out/'ready.json',out/'cleanup.json',out/'import-report.json']
 for p in [private,data,*required]:
  no_links(p)
  if not p.exists():raise ValueError('Complete stopped-owner receipts and data required')
 state=json.loads((private/'runtime.json').read_text('utf-8'))
 cleanup=json.loads((out/'cleanup.json').read_text('utf-8'))
 ready=json.loads((out/'ready.json').read_text('utf-8'))
 old_build=json.loads((out/'build-manifest.json').read_text('utf-8'))
 imported=json.loads((out/'import-report.json').read_text('utf-8'))
 if cleanup.get('allOwnedProcessesExited') is not True:raise ValueError('Owned processes must have exited normally before resume')
 if cleanup.get('databaseIdentityVerified') is False:raise ValueError('Prior database identity failed; inspect owned history')
 if state.get('purpose')!='canonical-catalog-isolated' or state.get('providerMode')!='mock':raise ValueError('Not a mock canonical owner receipt')
 if not re.fullmatch(r'eatwhat_catalog_local_[a-f0-9]{8}',str(state.get('database',''))):raise ValueError('Invalid owned database name')
 for key in ('password','tokenSecret','serviceToken'):
  if not isinstance(state.get(key),str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,256}',state[key]):raise ValueError('Original owner secrets are missing/invalid')
 for key in ('catalogSha256','sourceFingerprint','jarSha256'):
  if not re.fullmatch(r'[a-f0-9]{64}',str(state.get(key,''))):raise ValueError('Incomplete owner hashes')
 for key in ('mysqlPid','javaPid'):
  if type(state.get(key)) is not int or state[key]<1:raise ValueError('Missing prior process ownership')
 if type(state.get('naturalRepliesEnabled')) is not bool:raise ValueError('Missing prior Java mode')
 url=urllib.parse.urlsplit(state.get('api',''))
 if url.scheme!='http' or url.hostname!='127.0.0.1' or url.username or url.password or url.path!='/api' or url.query or url.fragment:raise ValueError('Owned API must be explicit IPv4 loopback')
 ports=[url.port,state.get('dbPort'),state.get('pythonPort')]
 if any(type(p) is not int or not 1024<=p<=65535 for p in ports) or len(set(ports))!=3:raise ValueError('Invalid/distinct owned ports required')
 if not data.is_dir() or not (data/'auto.cnf').is_file() or not (data/'mysql').is_dir() or not (data/state['database']).is_dir():raise ValueError('Initialized original MySQL datadir required')
 no_links(data/state['database'])
 if Path(state.get('catalogPath','')).resolve()!=Path(catalog).resolve() or digest(catalog)!=state['catalogSha256']:raise ValueError('Original catalog path/hash mismatch')
 if ready!={'api':state['api'],'jarSha256':state['jarSha256'],'sourceFingerprint':state['sourceFingerprint']}:raise ValueError('Prior ready receipt mismatch')
 if old_build.get('purpose')!='canonical-catalog-isolated-build' or old_build.get('sourceBefore')!=old_build.get('sourceAfter') or old_build.get('sourceAfter')!=state['sourceFingerprint'] or old_build.get('jarSha256')!=state['jarSha256'] or digest(private/'candidate.jar')!=state['jarSha256']:raise ValueError('Prior candidate/build receipt mismatch')
 if imported.get('catalogSha256')!=state['catalogSha256'] or imported.get('productionTouched') is not False or imported.get('realModelRequests')!=0:raise ValueError('Prior isolated import receipt mismatch')
 build=verify(jar,manifest)
 # Never copy a new candidate over the only source archive while starting it.
 if Path(jar).resolve()==private/'candidate.jar' or Path(manifest).resolve()==out/'build-manifest.json':raise ValueError('New build must be supplied outside the pinned runtime artifacts')
 (check_ports or assert_ports_available)(ports)
 return out,state,build

def archive_resume_receipts(out):
 history=out/'history';no_links(history);history.mkdir(exist_ok=True)
 target=history/('resume-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'-'+uuid.uuid4().hex)
 target.mkdir()
 files=['private/candidate.jar','private/runtime.json','build-manifest.json','ready.json','cleanup.json','import-report.json','private/application.properties','resume-report.json','control.json']
 for name in files:
  source=out/name
  if source.exists():
   no_links(source);destination=target/name;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
 # Retiring this receipt plus the exclusive lock prevents a second resume.
 (out/'cleanup.json').unlink();(out/'ready.json').unlink()
 if (out/'control.json').exists():(out/'control.json').unlink()
 return target

def validate_database_identity(db,data,state):
 with db.cursor() as c:
  c.execute('SELECT @@datadir,@@port,DATABASE()');actual=c.fetchone()
 no_links(actual[0])
 if Path(actual[0]).resolve()!=data.resolve() or actual[1]!=state['dbPort'] or actual[2]!=state['database']:raise RuntimeError('Owned database identity changed')

def assert_resume_rsa_support(pymysql):
 # caching_sha2_password may require RSA only after a real server restart.
 # Check the actual auth module's successfully imported backend, not package metadata.
 auth=getattr(getattr(pymysql,'connections',None),'_auth',None)
 if getattr(auth,'_have_cryptography',False) is not True:raise RuntimeError('Owned resume requires PyMySQL cryptography/RSA support in this Python; use the already provisioned runtime without changing MySQL authentication')

def start_owned_mysql(executable,data,private,state,processes,connect,error_type,*,resume=False):
 if not resume:subprocess.run([executable,'--no-defaults','--initialize-insecure','--datadir='+str(data),'--log-error='+str(private/'mysql.log')],check=True,creationflags=FLAGS)
 command=[executable,'--no-defaults','--datadir='+str(data),'--bind-address=127.0.0.1','--port='+str(state['dbPort']),'--mysqlx=OFF','--default-time-zone=+08:00','--group-concat-max-len=65536','--log-error='+str(private/'mysql.log')]
 # Windows' RESTART monitor forks the real server; own that server's Popen handle.
 if sys.platform=='win32':command.append('--no-monitor')
 mysql=subprocess.Popen(command,creationflags=FLAGS);processes.append(mysql)
 deadline=time.monotonic()+50
 while True:
  if mysql.poll() is not None or time.monotonic()>deadline:raise RuntimeError('Owned MySQL failed')
  try:
   options=dict(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password'] if resume else '',charset='utf8mb4',autocommit=True,connect_timeout=2)
   if resume:options['database']=state['database']
   db=connect(**options)
   if resume:
    try:validate_database_identity(db,data,state)
    except Exception:db.close();raise
   return mysql,db
  except error_type:time.sleep(.15)

def stop_owned_process(process):
 if process.poll() is None:
  process.terminate()
  try:process.wait(timeout=20)
  except subprocess.TimeoutExpired:process.kill();process.wait(timeout=20)

def cleanup_owned(processes,mysql,db,data,state):
 """Only Popen handles created by this invocation may be terminated."""
 identity=False
 try:
  for process in reversed(processes):
   if process is not mysql:stop_owned_process(process)
  if db is not None:
   try:
    validate_database_identity(db,data,state);identity=True
    with db.cursor() as c:c.execute('SHUTDOWN')
   finally:db.close()
 finally:
  if mysql is not None:
   if mysql.poll() is None:
    try:mysql.wait(timeout=20)
    except subprocess.TimeoutExpired:stop_owned_process(mysql)
 return {'allOwnedProcessesExited':all(p.poll() is not None for p in processes),'databaseIdentityVerified':identity}
def main():
 import pymysql
 from canonical_catalog_import import install
 from run_mysql_integration import statements
 from maturity_runtime import backend_fingerprint
 from build_canonical_catalog import verify_build
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);a.add_argument('--catalog',required=True);a.add_argument('--retired',required=True);a.add_argument('--mysqld',required=True);a.add_argument('--java',required=True);a.add_argument('--jar',required=True);a.add_argument('--build-manifest',required=True);a.add_argument('--natural-replies',action='store_true');a.add_argument('--resume-owned',action='store_true',help='Restart only a stopped, fully receipted local datadir; never initialize/import');args=a.parse_args()
 build_receipt=verify_build(args.jar,args.build_manifest)
 no_links(args.output);out=Path(args.output).resolve();owner_lock=None;history=None
 if out.is_relative_to(ROOT):raise ValueError('Outside-repository directory required')
 bundle=json.loads(Path(args.catalog).read_text('utf-8'))
 if args.resume_owned:
  owner_lock=resume_lock(out);owner_lock.__enter__()
  try:
   out,state,build_receipt=validate_resume_owned(out,args.catalog,args.jar,args.build_manifest,verify_build)
   assert_resume_rsa_support(pymysql)
   history=archive_resume_receipts(out)
  except BaseException:owner_lock.__exit__(*sys.exc_info());raise
  private=out/'private';data=private/'mysql';args.natural_replies=args.natural_replies or state['naturalRepliesEnabled']
 else:
  if out.exists():raise ValueError('New outside-repository directory required')
  retired=json.loads(Path(args.retired).read_text('utf-8'))
  out.mkdir(parents=True);private=out/'private';private.mkdir();data=private/'mysql';data.mkdir()
  state={'api':'http://127.0.0.1:'+str(port())+'/api','database':'eatwhat_catalog_local_'+secrets.token_hex(4),'dbPort':port(),'pythonPort':port(),'password':secrets.token_urlsafe(32),'tokenSecret':secrets.token_urlsafe(40),'serviceToken':secrets.token_urlsafe(40),'catalogPath':str(Path(args.catalog).resolve()),'catalogSha256':digest(args.catalog),'purpose':'canonical-catalog-isolated','providerMode':'mock','sourceFingerprint':backend_fingerprint()}
 processes=[];db=None;mysql=None;jvm=None
 report={'catalogSha256':state['catalogSha256'],'productionTouched':False,'realModelRequests':0,'build':build_receipt}
 try:
  mysql,db=start_owned_mysql(args.mysqld,data,private,state,processes,pymysql.connect,pymysql.Error,resume=args.resume_owned)
  if not args.resume_owned:
   with db.cursor() as c:
    c.execute("ALTER USER 'root'@'localhost' IDENTIFIED BY %s",(state['password'],));c.execute('CREATE DATABASE `'+state['database']+'` CHARACTER SET utf8mb4');db.select_db(state['database'])
    c.execute('CREATE TABLE food(id INT PRIMARY KEY AUTO_INCREMENT,NAME VARCHAR(255),TYPE VARCHAR(16),CL TEXT,FL TEXT,STEP LONGTEXT)')
    files=['database_migration.sql','ensure_food_import_schema.sql','create_favorite_dishes_table.sql','shopping_list_schema.sql','recommendation_preferences_schema.sql']+['db/migrations/'+m['file'] for m in json.loads((ROOT/'backend/db/migration-manifest.json').read_text('utf-8'))['migrations']]
    for file in files:
     for sql in statements((ROOT/'backend'/file).read_text('utf-8')):
      if sql.upper().startswith('USE '):continue
      c.execute(sql)
      while c.nextset():pass
     if file=='database_migration.sql':c.execute('ALTER TABLE recipe_records ADD COLUMN DISH_DETAILS TEXT')
    c.execute('ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL')
    c.execute("INSERT INTO users(id,open_id,nickname,status) VALUES(910001,'catalog-local-a','验收账户一',1),(910002,'catalog-local-b','验收账户二',1)")
   report['import']=install(db,bundle,state['catalogSha256'],retired)
   report['replay']=install(db,bundle,state['catalogSha256'],retired)
   (out/'import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
  else:
   (out/'resume-report.json').write_text(json.dumps(dict(report,resumedFrom=str(history.relative_to(out)),databasePreserved=True,initialized=False,imported=False),indent=2),encoding='utf-8')
  def start_java():
   nonlocal jvm
   if jvm and jvm.poll() is None:jvm.terminate();jvm.wait(timeout=20)
   receipt=verify_build(args.jar,args.build_manifest)
   jar=private/'candidate.jar';shutil.copyfile(args.jar,jar);state['jarSha256']=digest(jar);state['sourceFingerprint']=receipt['sourceAfter']
   if state['jarSha256']!=receipt['jarSha256']:raise ValueError('Candidate changed while pinning runtime')
   (out/'build-manifest.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
   props={'server.address':'127.0.0.1','server.port':int(state['api'].split(':')[2].split('/')[0]),'server.servlet.context-path':'/api','spring.datasource.url':f"jdbc:mysql://127.0.0.1:{state['dbPort']}/{state['database']}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8",'spring.datasource.username':'root','spring.datasource.password':state['password'],'spring.datasource.hikari.maximum-pool-size':6,'spring.datasource.hikari.minimum-idle':1,'spring.datasource.hikari.connection-init-sql':'SET SESSION group_concat_max_len=65536','spring.jackson.time-zone':'GMT+8','mybatis.configuration.map-underscore-to-camel-case':True,'security.token.secret':state['tokenSecret'],'wechat.miniapp.appid':'local','wechat.miniapp.secret':'local','admin.user-ids':'910001','meal-workspace.enabled':True,'meal-workspace.service-token':state['serviceToken'],'public-catalog.enabled':True,'public-catalog.allowed-dish-ids':[r['id'] for r in bundle['recipes'][:500]],'recommend.service.base-url':f"http://127.0.0.1:{state['pythonPort']}",'assistant-v4.enabled':True,'assistant-v4.extensions-enabled':True,'management.endpoints.web.exposure.include':'health,info,metrics','management.endpoint.health.group.runtime.include':'db,diskSpace','logging.level.com.eatwhat':'WARN'}
   # File avoids Windows' per-variable size limit for the public-ID allowlist.
   props['assistant-v4.natural-reply-enabled']=args.natural_replies
   state['naturalRepliesEnabled']=args.natural_replies
   config=private/'application.properties';config.write_text('\n'.join(k+'='+(','.join(map(str,v)) if isinstance(v,list) else str(v).lower() if isinstance(v,bool) else str(v)) for k,v in props.items()),encoding='utf-8')
   env={k:v for k,v in os.environ.items() if k.upper() in {'SYSTEMROOT','WINDIR','PATH','TEMP','TMP'}}
   with (private/'java.log').open('ab') as log:jvm=subprocess.Popen([args.java,'-Xms128m','-Xmx512m','-jar',str(jar),'--spring.profiles.active=canonical-isolated','--spring.config.location=file:'+str(config)],env=env,cwd=private,stdout=log,stderr=subprocess.STDOUT,creationflags=FLAGS)
   processes.append(jvm);state['javaPid']=jvm.pid;state['mysqlPid']=mysql.pid
   (private/'runtime.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
   deadline=time.monotonic()+75
   while True:
    if jvm.poll() is not None:raise RuntimeError('Owned Java startup failed; inspect private log')
    try:
     with urllib.request.urlopen(state['api']+'/actuator/health/runtime',timeout=2) as r:
      if r.status==200:break
    except Exception:
     if time.monotonic()>deadline:raise RuntimeError('Owned Java not ready')
     time.sleep(.3)
   (out/'ready.json').write_text(json.dumps({'api':state['api'],'jarSha256':state['jarSha256'],'sourceFingerprint':state['sourceFingerprint']}),encoding='utf-8')
  start_java();print('Owned canonical runtime ready',flush=True)
  # Control remains a closed list of local operations, never arbitrary commands.
  while True:
   control=out/'control.json'
   if control.exists():
    action=json.loads(control.read_text('utf-8'))['action'];control.unlink()
    if action=='stop':break
    if action=='restart':start_java();print('Owned Java restarted',flush=True)
    elif action=='check':
     import importlib,canonical_catalog_acceptance
     importlib.reload(canonical_catalog_acceptance)
     try:result=canonical_catalog_acceptance.run(state,db,out);print('Acceptance complete',flush=True)
     except Exception as e:
      import traceback;result={'passed':False,'error':type(e).__name__,'message':str(e)};traceback.print_exc()
     (out/'acceptance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
   if mysql.poll() is not None or jvm.poll() is not None:raise RuntimeError('Owned service exited')
   time.sleep(.2)
 finally:
  cleanup={'allOwnedProcessesExited':False,'databaseIdentityVerified':False}
  try:
   cleanup=cleanup_owned(processes,mysql,db,data,state)
  finally:
   cleanup['allOwnedProcessesExited']=all(p.poll() is not None for p in processes)
   (out/'cleanup.json').write_text(json.dumps(cleanup),encoding='utf-8')
   if owner_lock is not None:owner_lock.__exit__(None,None,None)
if __name__=='__main__':main()
