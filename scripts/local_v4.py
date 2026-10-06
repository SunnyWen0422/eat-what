"""Persistent private local runtime. Only its own private MySQL and Java processes are started."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time
import pymysql

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'.local-v4'
FLAGS=getattr(subprocess,'CREATE_NO_WINDOW',0)

def available(port):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',port))

def read_state():
    from check_test_environment import validate
    state=json.loads((DATA/'runtime.json').read_text(encoding='utf-8'))
    if not validate(state)['safe'] or Path(state['root']).resolve()!=ROOT or (ROOT/state['dataDir']).resolve()!=DATA/'mysql':
        raise RuntimeError('Runtime record does not describe this isolated workspace')
    return state

def stop_owned(pid, markers):
    # PID records alone are unsafe after a restart. Match the recorded command too.
    query=f"$p=Get-CimInstance Win32_Process -Filter 'ProcessId={int(pid)}'; if($p) {{$p.CommandLine}}"
    result=subprocess.run(['powershell','-NoProfile','-Command',query],capture_output=True,text=True,check=True,creationflags=FLAGS)
    command=result.stdout.strip()
    if not command:return
    if not all(marker.lower() in command.replace('\\','/').lower() for marker in markers):
        raise RuntimeError('Recorded PID belongs to a different process; no process was stopped')
    subprocess.run(['taskkill.exe','/PID',str(int(pid)),'/T','/F'],check=True,capture_output=True,creationflags=FLAGS)

def start_java(state, executable):
    runtime=DATA/'application-local.yml';jar=ROOT/'backend/target/eatwhat-backend-1.0.0.jar'
    if not jar.is_file():raise RuntimeError('Build backend before starting the local runtime')
    env=os.environ.copy();env['TENCENT_ASR_ENABLED']='false'
    with open(DATA/'backend.log','ab') as log:
        java=subprocess.Popen([executable,'-jar',str(jar),'--spring.profiles.active=local-v4',f'--spring.config.location={runtime.as_uri()}'],cwd=DATA,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=FLAGS)
    state['javaPid']=java.pid;state['javaExecutable']=executable
    (DATA/'runtime.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')

def start(args):
    DATA.mkdir(exist_ok=True)
    if (DATA/'runtime.json').exists():
        raise RuntimeError('A local runtime already exists. Use status or stop; do not overwrite its data.')
    available(18780)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    database='eatwhat_v4_local_'+secrets.token_hex(4)
    config={'environment':'local','api':'http://127.0.0.1:18780/api','dbHost':'127.0.0.1','database':database,'root':str(ROOT),'dataDir':'.local-v4/mysql'}
    from check_test_environment import validate
    if not validate(config)['safe']: raise RuntimeError('Unsafe local environment')
    mysql_data=DATA/'mysql';mysql_data.mkdir(exist_ok=False)
    mysql_log=DATA/'mysql.log'
    binary=str(Path(args.mysqld).resolve(strict=True))
    subprocess.run([binary,'--no-defaults','--initialize-insecure',f'--datadir={mysql_data}',f'--log-error={mysql_log}'],check=True,creationflags=FLAGS)
    mysql=subprocess.Popen([binary,'--no-defaults',f'--datadir={mysql_data}','--bind-address=127.0.0.1',f'--port={port}',f'--log-error={mysql_log}','--mysqlx=OFF','--default-time-zone=+08:00'],creationflags=FLAGS)
    processes=[mysql]
    try:
        deadline=time.monotonic()+35;connection=None
        while time.monotonic()<deadline and mysql.poll() is None:
            try:connection=pymysql.connect(host='127.0.0.1',port=port,user='root',password='',charset='utf8mb4',autocommit=True);break
            except pymysql.Error:time.sleep(.25)
        if connection is None:raise RuntimeError('Private MySQL startup failed')
        password=secrets.token_urlsafe(32)
        spec=importlib.util.spec_from_file_location('isolated_mysql',ROOT/'scripts/run_mysql_integration.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with connection.cursor() as cursor:
            cursor.execute("ALTER USER 'root'@'localhost' IDENTIFIED BY %s",(password,))
            cursor.execute(f'CREATE DATABASE `{database}` CHARACTER SET utf8mb4');cursor.execute(f'USE `{database}`')
            cursor.execute('CREATE TABLE food(id INT PRIMARY KEY AUTO_INCREMENT, NAME VARCHAR(255), TYPE VARCHAR(16), CL TEXT, FL TEXT, STEP LONGTEXT)')
            files=['database_migration.sql','ensure_food_import_schema.sql','create_favorite_dishes_table.sql','shopping_list_schema.sql','recommendation_preferences_schema.sql']
            files+=['db/migrations/'+v['file'] for v in json.loads((ROOT/'backend/db/migration-manifest.json').read_text(encoding='utf-8'))['migrations']]
            for file in files:
                for sql in module.statements((ROOT/'backend'/file).read_text(encoding='utf-8')):
                    if sql.upper().startswith('USE '):continue
                    cursor.execute(sql)
                    while cursor.nextset():pass
                if file=='database_migration.sql':cursor.execute('ALTER TABLE recipe_records ADD COLUMN DISH_DETAILS TEXT')
            cursor.execute('ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL')
            cursor.execute("INSERT INTO users(id,open_id,nickname,status) VALUES(910001,'local-v4-user','本地体验用户',1),(910002,'local-v4-second','本地第二账号',1)")
            recipes=[('番茄炒蛋','meat','番茄|300克###鸡蛋|2个',15),('香菇鸡丁','meat','鸡肉|300克###香菇|100克',20),('土豆炖肉','meat','猪肉|300克###土豆|200克',30),('清炒青菜','veg','青菜|300克',10),('清炒西兰花','veg','西兰花|300克',10),('醋溜土豆丝','veg','土豆|300克',15),('紫菜蛋汤','soup','紫菜|10克###鸡蛋|1个',10),('番茄豆腐汤','soup','番茄|200克###豆腐|200克',15),('米饭','staple','大米|200克',25),('清粥','staple','大米|100克',25)]
            for name,kind,ingredients,minutes in recipes:
                import re
                structured=re.sub(r'\|(\d+)(克|个)',lambda m:'|'+m.group(1)+'|'+m.group(2),ingredients)
                cursor.execute("INSERT INTO food(NAME,TYPE,CL,INGREDIENTS_AMOUNTS,STEPS,COOK_MINUTES,COOK_TIME,TAG_CODES,IS_PUBLISHED) VALUES(%s,%s,%s,%s,%s,%s,%s,'HOME_STYLE',1)",(name,kind,ingredients.replace('|','：'),structured,'准备食材###按原菜谱完成烹调###装盘后核对实际记录',minutes,str(minutes)+'分钟'))
        connection.close()
        # No source runtime settings or production secrets are copied into the backend.
        token_secret=secrets.token_urlsafe(40);service_secret=secrets.token_urlsafe(40)
        jdbc=f'jdbc:mysql://127.0.0.1:{port}/{database}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8'
        runtime=DATA/'application-local.yml'
        runtime.write_text('server:\n  address: 127.0.0.1\n  port: 18780\n  servlet:\n    context-path: /api\nspring:\n  datasource:\n    url: '+jdbc+'\n    username: root\n    password: '+password+'\n  jackson:\n    time-zone: GMT+8\nmybatis:\n  configuration:\n    map-underscore-to-camel-case: true\nsecurity:\n  token:\n    secret: '+token_secret+'\nwechat:\n  miniapp:\n    appid: local\n    secret: local\nadmin:\n  user-ids: 910001\nmeal-workspace:\n  enabled: true\n  service-token: '+service_secret+'\nrecommend:\n  service:\n    base-url: http://127.0.0.1:18781\n',encoding='utf-8')
        env=os.environ.copy()
        # User explicitly deferred voice. Never load vendor credentials here.
        env['TENCENT_ASR_ENABLED']='false'
        jar=ROOT/'backend/target/eatwhat-backend-1.0.0.jar'
        if not jar.is_file():raise RuntimeError('Build backend before starting the local runtime')
        log=open(DATA/'backend.log','ab')
        java=subprocess.Popen([args.java,'-jar',str(jar),'--spring.profiles.active=local-v4',f'--spring.config.location={runtime.as_uri()}'],cwd=DATA,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=FLAGS);processes.append(java)
        state={**config,'dbPort':port,'password':password,'tokenSecret':token_secret,'mysqlPid':mysql.pid,'javaPid':java.pid,'javaExecutable':args.java,'mysqlExecutable':binary,'startedAt':time.time(),'asrConfigured':False}
        (DATA/'runtime.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'api':config['api'],'database':database,'privateMysqlPort':port,'asrConfigured':state['asrConfigured'],'dataset':'synthetic local recipes; no official prices seeded'},ensure_ascii=False))
    except BaseException:
        for process in reversed(processes):
            if process.poll() is None:process.terminate()
        raise

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['start','restart','status','stop','model']);parser.add_argument('--mysqld',default='C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe');parser.add_argument('--java',default='D:/Java/bin/java.exe');args=parser.parse_args()
    if args.action=='start':start(args)
    elif args.action=='restart':
        state=read_state()
        stop_owned(state['javaPid'],[str(ROOT/'backend/target/eatwhat-backend-1.0.0.jar').replace('\\','/'),'local-v4','application-local.yml'])
        try:
            connection=pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password']);connection.close()
        except pymysql.OperationalError:
            available(state['dbPort'])
            binary=str(Path(state.get('mysqlExecutable',args.mysqld)).resolve(strict=True))
            mysql=subprocess.Popen([binary,'--no-defaults',f'--datadir={DATA/"mysql"}','--bind-address=127.0.0.1',f'--port={state["dbPort"]}',f'--log-error={DATA/"mysql.log"}','--mysqlx=OFF','--default-time-zone=+08:00'],creationflags=FLAGS)
            state['mysqlPid']=mysql.pid
            deadline=time.monotonic()+35
            while True:
                try:
                    connection=pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password']);connection.close();break
                except pymysql.OperationalError:
                    if mysql.poll() is not None or time.monotonic()>deadline:raise RuntimeError('Private MySQL restart failed')
                    time.sleep(.25)
        start_java(state,args.java);print('Private backend restarted; existing data, credentials and model budget retained.')
    elif args.action=='model':
        import sys
        from dotenv import dotenv_values
        state=read_state();available(18781)
        vendor=dotenv_values(ROOT/'recommend-service/.env');env=os.environ.copy()
        for key in ['DEEPSEEK_API_KEY','DEEPSEEK_MODEL','DEEPSEEK_BASE_URL']:env[key]=env.get(key) or vendor.get(key) or ''
        if not env['DEEPSEEK_API_KEY']:raise RuntimeError('Model credential is missing')
        if not env['DEEPSEEK_MODEL']:env['DEEPSEEK_MODEL']='deepseek-chat'
        if not env['DEEPSEEK_BASE_URL']:env['DEEPSEEK_BASE_URL']='https://api.deepseek.com'
        reader_password=secrets.token_urlsafe(32)
        connection=pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password'],autocommit=True)
        with connection.cursor() as cursor:
            cursor.execute("CREATE USER IF NOT EXISTS 'local_reader'@'localhost' IDENTIFIED BY %s",(reader_password,))
            cursor.execute("ALTER USER 'local_reader'@'localhost' IDENTIFIED BY %s",(reader_password,))
            cursor.execute(f"GRANT SELECT ON `{state['database']}`.* TO 'local_reader'@'localhost'")
        connection.close()
        service_secret=(DATA/'application-local.yml').read_text(encoding='utf-8').split('service-token: ',1)[1].splitlines()[0]
        env.update(DB_HOST='127.0.0.1',DB_PORT=str(state['dbPort']),DB_USER='local_reader',DB_PASSWORD=reader_password,DB_NAME=state['database'],MEAL_WORKSPACE_SERVICE_TOKEN=service_secret,LOCAL_MODEL_BUDGET_FILE=str(DATA/'model-budget.json'),ASSISTANT_STORE_PATH=str(DATA/'assistant.sqlite3'),DISH_META_PATH=str(DATA/'dish_meta.json'),INGREDIENT_MAP_PATH=str(DATA/'ingredient_map.json'))
        budget=DATA/'model-budget.json'
        if not budget.exists():budget.write_text(json.dumps({'limit':20,'used':0}),encoding='utf-8')
        log=open(DATA/'agent.log','ab')
        process=subprocess.Popen([sys.executable,'-m','uvicorn','local_agent:app','--host','127.0.0.1','--port','18781'],cwd=ROOT/'recommend-service',env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=FLAGS)
        state['agentPid']=process.pid;(DATA/'runtime.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
        print('Local V4 model adapter started with a persistent 20-request limit.')
    elif args.action=='status':
        state=read_state();print(json.dumps({k:state[k] for k in ['api','database','dbPort','mysqlPid','javaPid','asrConfigured']},ensure_ascii=False))
    else:
        state=read_state()
        stop_owned(state['javaPid'],[str(ROOT/'backend/target/eatwhat-backend-1.0.0.jar').replace('\\','/'),'local-v4','application-local.yml'])
        if state.get('agentPid'):stop_owned(state['agentPid'],['uvicorn','local_agent:app'])
        connection=pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password'])
        with connection.cursor() as cursor:cursor.execute('SHUTDOWN')
        print('Private services stopped; data and runtime records retained.')
if __name__=='__main__':main()
