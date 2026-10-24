"""Fresh loopback-only full catalog integration. Never adopts ambient services."""
import argparse,hashlib,json,os,secrets,socket,subprocess,sys,time,shutil,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FLAGS=getattr(subprocess,'CREATE_NO_WINDOW',0)
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def main():
 import pymysql
 from canonical_catalog_import import install
 from run_mysql_integration import statements
 from maturity_runtime import backend_fingerprint
 from build_canonical_catalog import verify_build
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);a.add_argument('--catalog',required=True);a.add_argument('--retired',required=True);a.add_argument('--mysqld',required=True);a.add_argument('--java',required=True);a.add_argument('--jar',required=True);a.add_argument('--build-manifest',required=True);args=a.parse_args()
 build_receipt=verify_build(args.jar,args.build_manifest)
 out=Path(args.output).resolve()
 if out.exists() or out.is_relative_to(ROOT):raise ValueError('New outside-repository directory required')
 bundle=json.loads(Path(args.catalog).read_text('utf-8'));retired=json.loads(Path(args.retired).read_text('utf-8'))
 out.mkdir(parents=True);private=out/'private';private.mkdir();data=private/'mysql';data.mkdir()
 processes=[];db=None;mysql=None;jvm=None
 state={'api':'http://127.0.0.1:'+str(port())+'/api','database':'eatwhat_catalog_local_'+secrets.token_hex(4),'dbPort':port(),'pythonPort':port(),'password':secrets.token_urlsafe(32),'tokenSecret':secrets.token_urlsafe(40),'serviceToken':secrets.token_urlsafe(40),'catalogPath':str(Path(args.catalog).resolve()),'catalogSha256':digest(args.catalog),'purpose':'canonical-catalog-isolated','providerMode':'mock','sourceFingerprint':backend_fingerprint()}
 report={'catalogSha256':state['catalogSha256'],'productionTouched':False,'realModelRequests':0,'build':build_receipt}
 try:
  subprocess.run([args.mysqld,'--no-defaults','--initialize-insecure','--datadir='+str(data),'--log-error='+str(private/'mysql.log')],check=True,creationflags=FLAGS)
  mysql=subprocess.Popen([args.mysqld,'--no-defaults','--datadir='+str(data),'--bind-address=127.0.0.1','--port='+str(state['dbPort']),'--mysqlx=OFF','--default-time-zone=+08:00','--group-concat-max-len=65536','--log-error='+str(private/'mysql.log')],creationflags=FLAGS);processes.append(mysql)
  deadline=time.monotonic()+50
  while db is None:
   if mysql.poll() is not None or time.monotonic()>deadline:raise RuntimeError('Owned MySQL failed')
   try:db=pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password='',charset='utf8mb4',autocommit=True,connect_timeout=2)
   except pymysql.Error:time.sleep(.15)
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
  def start_java():
   nonlocal jvm
   if jvm and jvm.poll() is None:jvm.terminate();jvm.wait(timeout=20)
   receipt=verify_build(args.jar,args.build_manifest)
   jar=private/'candidate.jar';shutil.copyfile(args.jar,jar);state['jarSha256']=digest(jar);state['sourceFingerprint']=receipt['sourceAfter']
   if state['jarSha256']!=receipt['jarSha256']:raise ValueError('Candidate changed while pinning runtime')
   (out/'build-manifest.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
   props={'server.address':'127.0.0.1','server.port':int(state['api'].split(':')[2].split('/')[0]),'server.servlet.context-path':'/api','spring.datasource.url':f"jdbc:mysql://127.0.0.1:{state['dbPort']}/{state['database']}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8",'spring.datasource.username':'root','spring.datasource.password':state['password'],'spring.datasource.hikari.maximum-pool-size':6,'spring.datasource.hikari.minimum-idle':1,'spring.datasource.hikari.connection-init-sql':'SET SESSION group_concat_max_len=65536','spring.jackson.time-zone':'GMT+8','mybatis.configuration.map-underscore-to-camel-case':True,'security.token.secret':state['tokenSecret'],'wechat.miniapp.appid':'local','wechat.miniapp.secret':'local','admin.user-ids':'910001','meal-workspace.enabled':True,'meal-workspace.service-token':state['serviceToken'],'public-catalog.enabled':True,'public-catalog.allowed-dish-ids':[r['id'] for r in bundle['recipes'][:500]],'recommend.service.base-url':f"http://127.0.0.1:{state['pythonPort']}",'assistant-v4.enabled':True,'assistant-v4.extensions-enabled':True,'management.endpoints.web.exposure.include':'health,info,metrics','management.endpoint.health.group.runtime.include':'db,diskSpace','logging.level.com.eatwhat':'WARN'}
   # File avoids Windows' per-variable size limit for the public-ID allowlist.
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
  for process in reversed(processes):
   if process is not mysql and process.poll() is None:process.terminate();process.wait(timeout=20)
  if db is not None:
   try:
    with db.cursor() as c:
     c.execute('SELECT @@datadir,@@port');actual=c.fetchone()
     if Path(actual[0]).resolve()!=data.resolve() or actual[1]!=state['dbPort']:raise RuntimeError('Owned database identity changed')
     c.execute('SHUTDOWN')
   finally:db.close()
  if mysql and mysql.poll() is None:mysql.wait(timeout=20)
  (out/'cleanup.json').write_text(json.dumps({'allOwnedProcessesExited':all(p.poll() is not None for p in processes)}),encoding='utf-8')
if __name__=='__main__':main()
