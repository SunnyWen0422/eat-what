"""Persistent private local runtime. Only its own private MySQL and Java processes are started."""
import argparse
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time
import sys
import urllib.request
import zipfile
import re
from urllib.parse import urlparse
import ctypes
from ctypes import wintypes
import shlex
import pymysql

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'.local-v4'
FLAGS=getattr(subprocess,'CREATE_NO_WINDOW',0)

def executable_path(value):
    # Windows can allow executing a file while denying GetFinalPathNameByHandle.
    path=Path(value).absolute()
    if not path.is_file():raise RuntimeError('Local executable is missing')
    return str(path)

def available(port):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',port))

def read_state():
    from check_test_environment import validate
    state=json.loads((DATA/'runtime.json').read_text(encoding='utf-8'))
    if not validate(state)['safe'] or Path(state['root']).resolve()!=ROOT or (ROOT/state['dataDir']).resolve()!=DATA/'mysql':
        raise RuntimeError('Runtime record does not describe this isolated workspace')
    if 'javaJarPath' in state or 'javaJarSha256' in state:recorded_java_jar(state)
    return state

def jar_digest(path):
    value=hashlib.sha256()
    with open(path,'rb') as source:
        for chunk in iter(lambda:source.read(1024*1024),b''):value.update(chunk)
    return value.hexdigest()

def runtime_jar_directory():
    root=ROOT.resolve();data=DATA.resolve();directory=DATA/'jars'
    if data==root or not data.is_relative_to(root) or DATA.is_symlink():
        raise RuntimeError('JAR runtime directory belongs to a different workspace')
    if directory.exists() and (directory.is_symlink() or directory.resolve().parent!=data):
        raise RuntimeError('JAR runtime directory has an unsafe target')
    return directory

def validate_jar(path):
    path=Path(path).absolute()
    if not path.is_file() or path.is_symlink():raise RuntimeError('JAR source is missing or is not a regular file; build the backend first')
    try:
        with zipfile.ZipFile(path) as archive:
            names=set(archive.namelist())
            if 'BOOT-INF/classes/com/eatwhat/EatWhatApplication.class' not in names:
                raise RuntimeError('JAR is not the packaged eatwhat backend')
            manifest=archive.read('META-INF/MANIFEST.MF').decode('utf-8')
            if not re.search(r'^Start-Class: com\.eatwhat\.EatWhatApplication\r?$',manifest,re.M) or not re.search(r'^Main-Class: org\.springframework\.boot\.loader\.JarLauncher\r?$',manifest,re.M):
                raise RuntimeError('JAR has no supported backend entrypoint')
            if any(name.startswith('BOOT-INF/classes/application') and name.endswith(('.yml','.yaml','.properties')) for name in names):
                raise RuntimeError('JAR includes private application configuration')
            if sum(entry.file_size for entry in archive.infolist())>300*1024*1024 or archive.testzip() is not None:
                raise RuntimeError('JAR archive integrity check failed')
    except (OSError,zipfile.BadZipFile,KeyError,UnicodeError) as error:
        raise RuntimeError('JAR archive is unreadable or invalid') from error
    return jar_digest(path)

def recorded_java_jar(state):
    directory=runtime_jar_directory()
    digest=state.get('javaJarSha256');value=state.get('javaJarPath')
    if not isinstance(digest,str) or not re.fullmatch('[0-9a-f]{64}',digest) or not isinstance(value,str):
        raise RuntimeError('JAR runtime identity is incomplete')
    path=Path(value).absolute()
    if path.parent!=directory.absolute() or path.name!='eatwhat-backend-'+digest+'.jar' or path.resolve().parent!=directory.resolve():
        raise RuntimeError('JAR runtime path does not belong to this private workspace')
    if validate_jar(path)!=digest:raise RuntimeError('JAR runtime hash has changed; existing services were not stopped')
    return {'path':str(path),'sha256':digest}

def prepare_java_jar(state=None, explicit=None):
    """Pin a reviewed build before stopping processes; never overwrite an existing snapshot."""
    if state and ('javaJarPath' in state or 'javaJarSha256' in state):
        saved=recorded_java_jar(state)
        if not explicit:return saved
    source=Path(explicit).absolute() if explicit else ROOT/'backend/target/eatwhat-backend-1.0.0.jar'
    resolved=source.resolve()
    if any(part=='.local-v4' or part.startswith('.local-maturity') for part in (*source.parts,*resolved.parts)) and not resolved.is_relative_to(DATA.resolve()):
        raise RuntimeError('JAR source is inside a different private runtime')
    digest=validate_jar(source);directory=runtime_jar_directory();directory.mkdir(parents=True,exist_ok=True)
    destination=directory/('eatwhat-backend-'+digest+'.jar')
    if destination.exists():
        if validate_jar(destination)!=digest:raise RuntimeError('JAR snapshot has changed; refusing to overwrite it')
    else:
        with open(source,'rb') as original,open(destination,'xb') as copy:
            for chunk in iter(lambda:original.read(1024*1024),b''):copy.write(chunk)
        if validate_jar(destination)!=digest:raise RuntimeError('JAR source changed during copying; existing services were not stopped')
    return recorded_java_jar({'javaJarPath':str(destination.absolute()),'javaJarSha256':digest})

def java_process_markers(state):
    if 'javaJarPath' in state or 'javaJarSha256' in state:jar=Path(recorded_java_jar(state)['path'])
    else:jar=ROOT/'backend/target/eatwhat-backend-1.0.0.jar'
    return [jar.as_posix(),'local-v4',(DATA/'application-local.yml').absolute().as_uri()]

def validate_local_configuration(state):
    """Validate the generated private YAML before any service is stopped; never print its values."""
    path=DATA/'application-local.yml'
    if not path.is_file() or path.is_symlink() or path.resolve().parent!=DATA.resolve():
        raise RuntimeError('Local application configuration is missing or has an unsafe target')
    try:
        if Path(state['root']).resolve()!=ROOT.resolve() or (ROOT/state['dataDir']).resolve()!=DATA/'mysql' or state.get('api')!='http://127.0.0.1:18780/api':
            raise ValueError('state ownership mismatch')
        values={};seen=set();sections=[]
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            if not line.strip() or line.lstrip().startswith('#'):continue
            match=re.fullmatch(r'( *)([A-Za-z0-9_-]+):\s*(.*)',line)
            if not match:
                if line.lstrip().startswith('- '):continue
                raise ValueError('unsupported configuration syntax')
            depth=len(match[1])
            while sections and sections[-1][0]>=depth:sections.pop()
            key=tuple(name for _,name in sections)+(match[2],)
            if key in seen:raise ValueError('duplicate configuration field')
            seen.add(key);value=match[3].strip()
            if not value:sections.append((depth,match[2]));continue
            if value.startswith('"'):value=json.loads(value)
            elif value.startswith("'") and value.endswith("'"):value=value[1:-1].replace("''","'")
            else:value=re.sub(r'\s+#.*$','',value).strip()
            values[key]=value
        if any(key[:2] in [('spring','config'),('spring','profiles')] for key in values):
            raise ValueError('private configuration cannot import or activate another datasource')
        jdbc=values[('spring','datasource','url')]
        if not isinstance(jdbc,str) or not jdbc.startswith('jdbc:mysql://'):raise ValueError('invalid datasource')
        database=urlparse(jdbc[len('jdbc:'):])
        if database.hostname!='127.0.0.1' or database.port!=int(state['dbPort']) or database.path!='/'+state['database'] or database.username or database.password or database.fragment:
            raise ValueError('datasource does not match private state')
        expected={('server','address'):'127.0.0.1',('server','port'):'18780',('server','servlet','context-path'):'/api',
                  ('spring','datasource','username'):'root',('spring','datasource','password'):state['password'],('security','token','secret'):state['tokenSecret']}
        if any(values.get(key)!=value for key,value in expected.items()):raise ValueError('configuration does not match private state')
    except (OSError,ValueError,TypeError,KeyError) as error:
        raise RuntimeError('Local application configuration does not match this private runtime') from None
    return path

def process_command(pid):
    if os.name=='nt':
        try:return native_process_command(pid)
        except RuntimeError:pass
    query=f"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId={int(pid)}'; if($p) {{$p.CommandLine}}"
    try:
        result=subprocess.run(['powershell','-NoProfile','-Command',query],capture_output=True,text=True,encoding='utf-8',errors='replace',check=True,creationflags=FLAGS,timeout=15)
    except (OSError,subprocess.SubprocessError):raise RuntimeError('Java process identity could not be verified') from None
    return result.stdout.strip()

def native_process_command(pid):
    """Read only the recorded PID with limited query access; no administrator/process-enumeration rights."""
    kernel=ctypes.WinDLL('kernel32',use_last_error=True);nt=ctypes.WinDLL('ntdll')
    kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];kernel.OpenProcess.restype=wintypes.HANDLE
    kernel.CloseHandle.argtypes=[wintypes.HANDLE];kernel.CloseHandle.restype=wintypes.BOOL
    kernel.GetExitCodeProcess.argtypes=[wintypes.HANDLE,ctypes.POINTER(wintypes.DWORD)];kernel.GetExitCodeProcess.restype=wintypes.BOOL
    nt.NtQueryInformationProcess.argtypes=[wintypes.HANDLE,wintypes.ULONG,ctypes.c_void_p,wintypes.ULONG,ctypes.POINTER(wintypes.ULONG)];nt.NtQueryInformationProcess.restype=wintypes.LONG
    handle=kernel.OpenProcess(0x1000,False,int(pid))  # PROCESS_QUERY_LIMITED_INFORMATION
    if not handle:
        if ctypes.get_last_error()==87:return ''  # No process with this PID.
        raise RuntimeError('Java process limited query access was denied')
    try:
        exit_code=wintypes.DWORD()
        if not kernel.GetExitCodeProcess(handle,ctypes.byref(exit_code)):raise RuntimeError('Java process status cannot be read')
        if exit_code.value!=259:return ''  # STILL_ACTIVE
        size=wintypes.ULONG()
        nt.NtQueryInformationProcess(handle,60,None,0,ctypes.byref(size))
        if not 16<=size.value<=65536:raise RuntimeError('Java process command length cannot be verified')
        buffer=ctypes.create_string_buffer(size.value)
        if nt.NtQueryInformationProcess(handle,60,buffer,len(buffer),ctypes.byref(size))<0:raise RuntimeError('Java process command query failed')
        class UnicodeString(ctypes.Structure):
            _fields_=[('Length',wintypes.USHORT),('MaximumLength',wintypes.USHORT),('Buffer',ctypes.c_void_p)]
        value=UnicodeString.from_buffer(buffer);start=ctypes.addressof(buffer)
        if value.Length%2 or not value.Buffer or value.Buffer<start or value.Buffer+value.Length>start+len(buffer):raise RuntimeError('Java process command buffer is invalid')
        command=ctypes.wstring_at(value.Buffer,value.Length//2)
        if not kernel.GetExitCodeProcess(handle,ctypes.byref(exit_code)):raise RuntimeError('Java process status cannot be read')
        return command if exit_code.value==259 else ''
    finally:kernel.CloseHandle(handle)

def parse_netstat_listeners(output):
    owners=set()
    for line in output.splitlines():
        parts=line.split()
        if not parts or parts[0].upper()!='TCP':continue
        if len(parts)!=5:raise ValueError('Malformed local listener output')
        try:port=int(parts[1].rsplit(':',1)[1]);pid=int(parts[4])
        except (IndexError,ValueError):raise ValueError('Malformed local listener identity') from None
        if port==18780 and parts[3].upper()=='LISTENING':
            if pid<=0:raise ValueError('Invalid local listener owner')
            owners.add(pid)
    return owners

def api_listener_pids():
    # Query all listeners rather than a missing-port filter that can conceal query failures.
    query="$ErrorActionPreference='Stop'; $owners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {$_.LocalPort -eq 18780} | Select-Object -ExpandProperty OwningProcess -Unique); ConvertTo-Json -Compress -InputObject $owners"
    try:
        result=subprocess.run(['powershell','-NoProfile','-Command',query],capture_output=True,text=True,encoding='utf-8',errors='replace',check=True,creationflags=FLAGS,timeout=15)
        owners=json.loads(result.stdout)
        if not isinstance(owners,list) or any(not isinstance(pid,int) or pid<=0 for pid in owners):raise ValueError('invalid owners')
        return set(owners)
    except (OSError,subprocess.SubprocessError,ValueError):
        try:
            result=subprocess.run(['netstat.exe','-ano','-p','tcp'],capture_output=True,text=True,encoding='utf-8',errors='replace',check=True,creationflags=FLAGS,timeout=15)
            return parse_netstat_listeners(result.stdout)
        except (OSError,subprocess.SubprocessError,ValueError):raise RuntimeError('Local API port ownership could not be verified') from None

def verify_java_running(state):
    command=process_command(state['javaPid'])
    if not command:raise RuntimeError('Java process exited before this local API became ready; inspect backend.log')
    if not all(marker.lower() in command.replace('\\','/').lower() for marker in java_process_markers(state)):
        raise RuntimeError('Java process identity does not belong to this private runtime')
    return True

def verify_api_listener(state):
    owners=api_listener_pids()
    if owners and owners!={int(state['javaPid'])}:raise RuntimeError('Local API port belongs to another runtime; no foreign service was stopped')
    if owners:verify_java_running(state)
    return bool(owners)

def windows_command_arguments(command):
    if not isinstance(command,str) or not command.strip():raise RuntimeError('Local listener command cannot be verified')
    if os.name!='nt':
        # Test parsing for ordinary quoted paths; actual listener inspection remains Windows-specific.
        return [value[1:-1] if value.startswith('"') and value.endswith('"') else value for value in shlex.split(command,posix=False)]
    shell=ctypes.WinDLL('shell32',use_last_error=True);kernel=ctypes.WinDLL('kernel32')
    shell.CommandLineToArgvW.argtypes=[wintypes.LPCWSTR,ctypes.POINTER(ctypes.c_int)]
    shell.CommandLineToArgvW.restype=ctypes.POINTER(wintypes.LPWSTR)
    kernel.LocalFree.argtypes=[ctypes.c_void_p];kernel.LocalFree.restype=ctypes.c_void_p
    count=ctypes.c_int();arguments=shell.CommandLineToArgvW(command,ctypes.byref(count))
    if not arguments:raise RuntimeError('Local listener command cannot be parsed')
    try:
        if not 1<=count.value<=32:raise RuntimeError('Local listener command has an unsupported argument count')
        return [arguments[index] for index in range(count.value)]
    finally:kernel.LocalFree(arguments)

def running_listener_identity(state):
    owners=api_listener_pids()
    if len(owners)!=1:raise RuntimeError('A single local API listener is required; runtime record was not changed')
    pid=next(iter(owners));command=process_command(pid);arguments=windows_command_arguments(command)
    profile='--spring.profiles.active=local-v4'
    configuration='--spring.config.location='+(DATA/'application-local.yml').absolute().as_uri()
    allowed={profile,configuration,'--management.endpoint.health.group.local-ready.include=db,ping'}
    if len(arguments)<5 or arguments[1]!='-jar' or arguments[3:].count(profile)!=1 or arguments[3:].count(configuration)!=1 or any(value not in allowed for value in arguments[3:]):
        raise RuntimeError('Local listener does not have this runtime profile and private configuration')
    executable=state.get('javaExecutable')
    if not executable or Path(arguments[0]).absolute()!=Path(executable).absolute():
        raise RuntimeError('Local listener executable does not match the runtime record')
    selected=Path(arguments[2])
    if not selected.is_absolute():raise RuntimeError('Local listener JAR must use an absolute owned path')
    canonical=ROOT/'backend/target/eatwhat-backend-1.0.0.jar'
    if selected==canonical and selected.resolve().is_relative_to(ROOT.resolve()):
        layout='legacy-canonical';digest=validate_jar(selected)
    elif 'javaJarPath' in state and selected==Path(state['javaJarPath']):
        saved=recorded_java_jar(state);layout='saved-snapshot';digest=saved['sha256']
    else:raise RuntimeError('Local listener JAR is not the saved snapshot or the owned legacy build')
    return {'pid':pid,'command':command,'path':str(selected),'sha256':digest,'layout':layout}

def adopt_running():
    """Explicitly repair only Java fields after proving the existing listener; never stop/start it."""
    record=DATA/'runtime.json';original=record.read_bytes();state=read_state()
    validate_local_configuration(state);running=running_listener_identity(state)
    if running_listener_identity(state)!=running or record.read_bytes()!=original:
        raise RuntimeError('Local listener or runtime record changed during recovery; nothing was adopted')
    validate_local_configuration(state)
    restored=dict(state);restored['javaPid']=running['pid']
    if running['layout']=='saved-snapshot':
        restored['javaJarPath']=running['path'];restored['javaJarSha256']=running['sha256']
    else:
        # A legacy process is not the newer prepared snapshot. The next explicit restart selects it.
        restored.pop('javaJarPath',None);restored.pop('javaJarSha256',None)
    name=f'runtime-before-adopt-{int(time.time()*1000)}-{secrets.token_hex(6)}.json'
    backup=DATA/name
    with open(backup,'xb') as output:output.write(original)
    pending=DATA/('runtime-adopt-'+secrets.token_hex(6)+'.pending.json')
    with open(pending,'x',encoding='utf-8') as output:json.dump(restored,output,ensure_ascii=False,indent=2)
    if running_listener_identity(state)!=running or record.read_bytes()!=original:
        raise RuntimeError('Local listener or runtime record changed before saving; original record and backup retained')
    validate_local_configuration(state)
    pending.replace(record)
    return {'javaPid':running['pid'],'layout':running['layout'],'jarSha256':running['sha256'],'backup':str(backup),'processChanged':False,'latestCodeVerified':False}

def stop_owned(pid, markers):
    # PID records alone are unsafe after a restart. Match the recorded command too.
    command=process_command(pid)
    if not command:return
    if not all(marker.lower() in command.replace('\\','/').lower() for marker in markers):
        raise RuntimeError('Recorded PID belongs to a different process; no process was stopped')
    subprocess.run(['taskkill.exe','/PID',str(int(pid)),'/T','/F'],check=True,capture_output=True,creationflags=FLAGS)

def start_java(state, executable, prepared_jar=None):
    prepared=prepared_jar or prepare_java_jar(state)
    prepared=recorded_java_jar({'javaJarPath':prepared['path'],'javaJarSha256':prepared['sha256']})
    runtime=validate_local_configuration(state);jar=Path(prepared['path'])
    try:available(18780)
    except OSError:raise RuntimeError('Local API port is unavailable; no foreign service was touched') from None
    # Application settings and JVM-injected properties must not bypass the private-file checks.
    blocked_prefixes=('SPRING_','SERVER_','SECURITY_TOKEN_','MEAL_WORKSPACE_','RECOMMEND_SERVICE_')
    blocked_options={'JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS','JAVA_OPTS'}
    env={key:value for key,value in os.environ.items() if key.upper() not in blocked_options and not key.upper().startswith(blocked_prefixes)}
    env['TENCENT_ASR_ENABLED']='false'
    with open(DATA/'backend.log','ab') as log:
        java=subprocess.Popen([executable,'-jar',str(jar),'--spring.profiles.active=local-v4',f'--spring.config.location={runtime.as_uri()}','--management.endpoint.health.group.local-ready.include=db,ping'],cwd=DATA,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=FLAGS)
    state['javaPid']=java.pid;state['javaExecutable']=executable
    state['javaJarPath']=str(jar);state['javaJarSha256']=prepared['sha256']
    try:
        pending=DATA/'runtime.pending.json'
        pending.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
        pending.replace(DATA/'runtime.json')
    except BaseException:
        # This process was created by this call; no existing process is touched.
        java.terminate();java.wait(timeout=15);raise
    return java

def start(args):
    DATA.mkdir(exist_ok=True)
    if (DATA/'runtime.json').exists():
        raise RuntimeError('A local runtime already exists. Use status or stop; do not overwrite its data.')
    available(18780)
    bootstrap=DATA/'bootstrap.json'
    resumed=json.loads(bootstrap.read_text(encoding='utf-8')) if bootstrap.exists() else None
    if resumed and not getattr(args,'legacy_backup',None):raise RuntimeError('Only maturity bootstrap supports resume')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=resumed['dbPort'] if resumed else sock.getsockname()[1]
    database=resumed['database'] if resumed else ('eatwhat_maturity_local_' if getattr(args,'legacy_backup',None) else 'eatwhat_v4_local_')+secrets.token_hex(4)
    config={'environment':'local','api':'http://127.0.0.1:18780/api','dbHost':'127.0.0.1','database':database,'root':str(ROOT),'dataDir':str((DATA/'mysql').relative_to(ROOT)).replace('\\','/')}
    from check_test_environment import validate
    if not validate(config)['safe']: raise RuntimeError('Unsafe local environment')
    if resumed:
        if any(resumed.get(k)!=v for k,v in config.items()):raise RuntimeError('Bootstrap does not belong to this isolated runtime')
        if resumed['sourceHash']!=args.prepared_source['sourceSha256'] or resumed['qualityHash']!=args.prepared_source['qualityManifestHash']:
            raise RuntimeError('Bootstrap inputs changed; retain the original inputs for resume')
    prepared_jar=prepare_java_jar(explicit=getattr(args,'jar',None))
    args.java=executable_path(args.java or 'D:/Java/bin/java.exe')
    mysql_data=DATA/'mysql'
    if not resumed:mysql_data.mkdir(exist_ok=False)
    mysql_log=DATA/'mysql.log'
    binary=executable_path(args.mysqld)
    if not resumed:
        subprocess.run([binary,'--no-defaults','--initialize-insecure',f'--datadir={mysql_data}',f'--log-error={mysql_log}'],check=True,creationflags=FLAGS)
    password=resumed['password'] if resumed else secrets.token_urlsafe(32)
    bootstrap_state=resumed or {**config,'dbPort':port,'password':password,'anonymizationSalt':secrets.token_hex(32),'bridgeComplete':False}
    def save_bootstrap():
        if not getattr(args,'legacy_backup',None):return
        bootstrap_state.update(sourceHash=args.prepared_source['sourceSha256'],qualityHash=args.prepared_source['qualityManifestHash'])
        temporary=DATA/'bootstrap.pending.json'
        temporary.write_text(json.dumps(bootstrap_state,ensure_ascii=False,indent=2),encoding='utf-8')
        temporary.replace(bootstrap)
    save_bootstrap()
    available(port)
    mysql=subprocess.Popen([binary,'--no-defaults',f'--datadir={mysql_data}','--bind-address=127.0.0.1',f'--port={port}',f'--log-error={mysql_log}','--mysqlx=OFF','--default-time-zone=+08:00'],creationflags=FLAGS)
    processes=[mysql]
    try:
        deadline=time.monotonic()+35;connection=None
        while time.monotonic()<deadline and mysql.poll() is None:
            try:
                try:connection=pymysql.connect(host='127.0.0.1',port=port,user='root',password=password if resumed else '',charset='utf8mb4',autocommit=True,connect_timeout=2)
                except pymysql.OperationalError as auth_error:
                    # Interrupted before ALTER USER: only the owned fresh instance may still be empty.
                    if not resumed or auth_error.args[0]!=1045:raise
                    connection=pymysql.connect(host='127.0.0.1',port=port,user='root',password='',charset='utf8mb4',autocommit=True,connect_timeout=2)
                break
            except pymysql.Error as error:
                if connection is None and not locals().get('reported_connect_error',False):
                    import re
                    code=error.args[0] if error.args else None
                    win=re.search(r'WinError (\d+)',str(error))
                    print(json.dumps({'localDbConnectionWaiting':True,'mysqlErrorCode':code,'windowsErrorCode':win.group(1) if win else None}),flush=True)
                    reported_connect_error=True
                time.sleep(.25)
        if connection is None:raise RuntimeError('Private MySQL startup failed')
        spec=importlib.util.spec_from_file_location('isolated_mysql',ROOT/'scripts/run_mysql_integration.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with connection.cursor() as cursor:
            cursor.execute("ALTER USER 'root'@'localhost' IDENTIFIED BY %s",(password,))
            cursor.execute(f'CREATE DATABASE IF NOT EXISTS `{database}` CHARACTER SET utf8mb4');cursor.execute(f'USE `{database}`')
            if getattr(args,'legacy_backup',None):
                from bridge_legacy_local import restore_and_bridge
                if not bootstrap_state['bridgeComplete']:
                    bridge_target={**config,'anonymizationSalt':bootstrap_state['anonymizationSalt']}
                    report=restore_and_bridge(connection,args.legacy_backup,bridge_target,getattr(args,'quality_bundle',None),args.prepared_source)
                    (DATA/'bridge-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                    bootstrap_state['bridgeComplete']=True;save_bootstrap()
                for user_id,open_id,nickname in [(910001,'local-v4-user','本地体验用户'),(910002,'local-v4-second','本地第二账号')]:
                    cursor.execute('SELECT open_id FROM users WHERE id=%s',(user_id,));existing=cursor.fetchone()
                    if existing and existing[0]!=open_id:raise RuntimeError('Local fixture ID conflicts with source account')
                    if not existing:cursor.execute('INSERT INTO users(id,open_id,nickname,status) VALUES(%s,%s,%s,1)',(user_id,open_id,nickname))
            else:
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
        state={**config,'dbPort':port,'password':password,'tokenSecret':token_secret,'mysqlPid':mysql.pid,'javaExecutable':args.java,'mysqlExecutable':binary,'startedAt':time.time(),'asrConfigured':False}
        java=start_java(state,args.java,prepared_jar);processes.append(java)
        print(json.dumps({'api':config['api'],'database':database,'privateMysqlPort':port,'asrConfigured':state['asrConfigured'],'dataset':'governed catalog and anonymous legacy history' if getattr(args,'legacy_backup',None) else 'synthetic local recipes; no official prices seeded'},ensure_ascii=False))
    except BaseException:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate();process.wait(timeout=15)
        raise

def start_optional_model():
    try:
        with urllib.request.urlopen('http://127.0.0.1:18781/health',timeout=2) as response:value=json.load(response)
        if value.get('local') is True and value.get('status')=='ok' and value.get('modelBudget',{}).get('limit')==20:
            print('Existing local model adapter reused.',flush=True);return True
    except (OSError,ValueError):pass
    try:
        subprocess.run([sys.executable,str(Path(__file__).absolute()),'model'],check=True,capture_output=True,creationflags=FLAGS)
        return True
    except (subprocess.CalledProcessError,OSError):
        print('Model adapter unavailable; basic local API remains available.',flush=True);return False

def wait_for_basic_api(state=None):
    state=state or read_state()
    deadline=time.monotonic()+35
    while True:
        verify_java_running(state)
        if verify_api_listener(state):
            try:
                with urllib.request.urlopen('http://127.0.0.1:18780/api/actuator/health/local-ready',timeout=2) as response:
                    if response.status==200:
                        verify_java_running(state)
                        if verify_api_listener(state):return
            except OSError:pass
        if time.monotonic()>deadline:raise RuntimeError('Basic local API did not become ready; see .local-v4/backend.log')
        time.sleep(.5)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['start','restart','status','stop','model','serve','check-jar','adopt-running']);parser.add_argument('--mysqld',default='C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe');parser.add_argument('--java');parser.add_argument('--jar');args=parser.parse_args()
    if args.action=='adopt-running':
        if args.jar or args.java:raise RuntimeError('adopt-running cannot select a new executable or JAR; use an explicit restart afterward')
        print(json.dumps(adopt_running()));return
    if args.action=='check-jar':
        state=read_state() if (DATA/'runtime.json').exists() else None
        executable_path(args.java or (state or {}).get('javaExecutable') or 'D:/Java/bin/java.exe')
        if state:validate_local_configuration(state)
        print(json.dumps(prepare_java_jar(state,args.jar)));return
    if args.action=='serve':
        # Keep the command host alive: temporary tool jobs reclaim background children.
        command=[sys.executable,str(Path(__file__).absolute()),'restart','--mysqld',args.mysqld]
        if args.java:command.extend(['--java',args.java])
        if args.jar:command.extend(['--jar',args.jar])
        subprocess.run(command,check=True,creationflags=FLAGS)
        wait_for_basic_api()
        print('Local V4 ready at http://127.0.0.1:18780/api; external models and voice remain disabled. Keep this terminal running.',flush=True)
        while True:time.sleep(1)
        return
    if args.action=='start':
        args.java=args.java or 'D:/Java/bin/java.exe'
        start(args)
    elif args.action=='restart':
        state=read_state()
        java=executable_path(args.java or state.get('javaExecutable') or 'D:/Java/bin/java.exe')
        prepared_jar=prepare_java_jar(state,args.jar)
        validate_local_configuration(state);verify_api_listener(state)
        stop_owned(state['javaPid'],java_process_markers(state))
        try:
            connection=pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password']);connection.close()
        except pymysql.OperationalError:
            available(state['dbPort'])
            binary=executable_path(state.get('mysqlExecutable',args.mysqld))
            mysql=subprocess.Popen([binary,'--no-defaults',f'--datadir={DATA/"mysql"}','--bind-address=127.0.0.1',f'--port={state["dbPort"]}',f'--log-error={DATA/"mysql.log"}','--mysqlx=OFF','--default-time-zone=+08:00'],creationflags=FLAGS)
            state['mysqlPid']=mysql.pid
            deadline=time.monotonic()+35
            while True:
                try:
                    connection=pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password']);connection.close();break
                except pymysql.OperationalError:
                    if mysql.poll() is not None or time.monotonic()>deadline:raise RuntimeError('Private MySQL restart failed')
                    time.sleep(.25)
        start_java(state,java,prepared_jar);print('Private backend restarted; existing data, credentials and model budget retained.')
    elif args.action=='model':
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
        validate_local_configuration(state);verify_api_listener(state)
        stop_owned(state['javaPid'],java_process_markers(state))
        if state.get('agentPid'):stop_owned(state['agentPid'],['uvicorn','local_agent:app'])
        connection=pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password'])
        with connection.cursor() as cursor:cursor.execute('SHUTDOWN')
        print('Private services stopped; data and runtime records retained.')
if __name__=='__main__':main()
