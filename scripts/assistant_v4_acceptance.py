"""Opt-in synthetic-only Java -> FastAPI -> HTTP provider -> MySQL acceptance.

Run everything in one owning process tree on Windows. No production configuration
is imported. Only directly created Popen handles are terminated. Test outputs never
contain authentication values, prompts, provider frames or reasoning.
"""
from __future__ import annotations
import argparse
import base64
import concurrent.futures
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import threading
import time
import types
import urllib.error
import urllib.parse
import urllib.request
import uuid
from contextlib import contextmanager
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'tests/fixtures/assistant-v4-evaluation.jsonl'
TYPES = ['meat', 'veg', 'soup', 'staple', 'dessert', 'side']
ENTRY_SCENE = 'chat'
PYTHON_PORT = 18781
OWNED_INTERNAL_BASE = f'http://127.0.0.1:{PYTHON_PORT}'

def uid(): return str(uuid.uuid4())
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def require(condition, message):
    if not condition: raise AssertionError(message)

def validate_manifest(value, provider_mode='mock'):
    """Fail closed before opening any socket or launching any process."""
    require(value.get('purpose') == 'assistant-v4-synthetic-acceptance', 'Explicit synthetic purpose required')
    require(value.get('syntheticOnly') is True, 'Synthetic dataset attestation required')
    parsed = urllib.parse.urlsplit(value.get('isolatedApiBase', ''))
    require(parsed.scheme == 'http' and parsed.hostname == '127.0.0.1' and parsed.path == '/api'
            and parsed.port and not parsed.username and not parsed.query and not parsed.fragment,
            'Only explicit loopback /api is allowed')
    require(re.fullmatch(r'eatwhat_v4_local_[a-f0-9]{8}', value.get('database', '')) is not None,
            'Only dedicated synthetic database identifiers are allowed')
    require(value.get('users') == [910001, 910002], 'Two dedicated fixture accounts required')
    require(re.fullmatch(r'[a-f0-9]{64}', value.get('jarSha256', '')) is not None, 'Pinned final JAR hash required')
    private = Path(value.get('privateDirectory', '')).resolve()
    require(private.parent == ROOT and private.name.startswith('.local-maturity-assistant-'),
            'Only task-specific private runtime directory allowed')
    require(provider_mode in ('mock','live') and value.get('providerMode','mock')==provider_mode,
            'Provider mode must match the explicitly selected execution entry')
    return value

def validate_owned_internal_configuration(configuration):
    """Require literal owned endpoint/token before process identity checks or sockets.

    Accept only the generated runtime's simple YAML mapping syntax. No environment
    expansion, duplicate fields or implicit packaged endpoint can enter this chain.
    """
    values={};seen=set();sections=[]
    try:
        for line in configuration.splitlines():
            if not line.strip() or line.lstrip().startswith('#'):continue
            match=re.fullmatch(r'( *)([A-Za-z0-9_-]+):\s*(.*)',line)
            require(match is not None,'Owned internal configuration syntax is unsupported')
            depth=len(match[1])
            while sections and sections[-1][0]>=depth:sections.pop()
            key=tuple(name for _,name in sections)+(match[2],)
            require(key not in seen,'Owned internal configuration has duplicate fields');seen.add(key)
            value=match[3].strip()
            if not value:sections.append((depth,match[2]));continue
            if value.startswith('"'):value=json.loads(value)
            elif value.startswith("'") and value.endswith("'"):value=value[1:-1].replace("''","'")
            else:value=re.sub(r'\s+#.*$','',value).strip()
            values[key]=value
        require(values.get(('recommend','service','base-url'))==OWNED_INTERNAL_BASE,'Owned internal endpoint must explicitly match the private FastAPI listener')
        token=values.get(('meal-workspace','service-token'))
        require(isinstance(token,str) and re.fullmatch(r'[A-Za-z0-9_-]+',token) is not None,'Owned internal service token must be a nonempty literal')
        return token
    except (ValueError,TypeError):
        raise AssertionError('Owned internal configuration is invalid') from None

def load_fixtures():
    return [json.loads(line) for line in FIXTURES.read_text(encoding='utf-8').splitlines() if line.strip()]

def bearer(state, user):
    enc = lambda b: base64.urlsafe_b64encode(b).decode().rstrip('=')
    payload = enc(f'{user}:{int(time.time()*1000)+3600000}'.encode())
    return payload+'.'+enc(hmac.new(state['tokenSecret'].encode(), payload.encode(), hashlib.sha256).digest())

class MockCompletion:
    """Scripted model output only. All tools, validation and effects run in real services."""
    def __init__(self):
        self.scripts = {}; self.calls = []; self.lock = threading.Lock();self.final_overrides={}
    def register(self, message, steps=None, reads=None, question=None, delay=0, unavailable=False):
        with self.lock:
            self.scripts[message] = dict(steps=steps, reads=reads or [], question=question,
                                         delay=delay, unavailable=unavailable, calls=0)
    def complete(self, payload):
        users = [m.get('content') for m in payload['messages'] if m['role']=='user']
        script = self.scripts[users[-1]]
        with self.lock:
            script['calls'] += 1; number = script['calls']; self.calls.append({'at': time.time(), 'round': number})
        if script['delay']: time.sleep(script['delay'])
        if script['unavailable']: return None
        if number == 1 and script['reads']:
            return {'role':'assistant','content':None,'tool_calls':[
                {'id':f'call-{i}', 'type':'function','function':{'name':read['name'],
                 'arguments':json.dumps(read.get('arguments',{}), ensure_ascii=False)}}
                for i,read in enumerate(script['reads'])]}
        result = self.final_overrides.get(users[-1]) or ({'type':'need_input','question':script['question']} if script['question'] else {'type':'final','reply':'请核对本次需求。'})
        if script['steps']: result['actionProposal']={'steps':script['steps']}
        return {'role':'assistant','content':json.dumps(result, ensure_ascii=False)}

@contextmanager
def local_provider(script):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def do_POST(self):
            if self.path != '/v1/chat/completions': self.send_error(404); return
            try: value=script.complete(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
            except Exception: self.send_error(500); return
            if value is None: self.send_error(503); return
            raw=json.dumps({'choices':[{'message':value}], 'usage':{'prompt_tokens':0,'completion_tokens':0}}).encode()
            self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try: yield f'http://127.0.0.1:{server.server_port}'
    finally: server.shutdown();server.server_close();thread.join(timeout=5)

def synthetic_python_app(provider_url, token):
    """Load the actual main.py router with inert legacy dependencies and no dotenv."""
    config=types.ModuleType('config')
    for key in ('DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME'): setattr(config,key,'synthetic-unused')
    config.DEEPSEEK_API_KEY='synthetic-local-only';config.DEEPSEEK_BASE_URL=provider_url;config.DEEPSEEK_MODEL='synthetic-model'
    sys.modules['config']=config
    for name in ('db','rag','chat_handler','assistant_engine','agent_runtime'):
        sys.modules[name]=types.ModuleType(name)
    def denied(*_,**__): raise AssertionError('Legacy DB access is forbidden in assistant acceptance')
    sys.modules['db']._get_connection=denied
    sys.path.insert(0,str(ROOT/'recommend-service'))
    os.environ['MEAL_WORKSPACE_SERVICE_TOKEN']=token
    os.environ['NO_PROXY']=','.join(filter(None,[os.environ.get('NO_PROXY',''),'127.0.0.1','localhost']))
    spec=importlib.util.spec_from_file_location('assistant_acceptance_main',ROOT/'recommend-service/main.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module.app

class Acceptance:
    def __init__(self, state, connection, model, run_id=None):
        self.state=state;self.db=connection;self.model=model;self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.turn_times={910001:[],910002:[]};self.outcomes=[];self.ids={};self.run_id=run_id if run_id is not None else uid();self.day=date.today()+timedelta(days=1000+int(uuid.uuid4().hex[:8],16)%100000)
    def http(self, path, body=None, user=910001, method=None, allowed=(200,201,202,204)):
        request=urllib.request.Request(self.state['api']+path,data=None if body is None else json.dumps(body).encode(),
            headers={'Authorization':'Bearer '+bearer(self.state,user),'Content-Type':'application/json'},method=method)
        try:
            with self.opener.open(request,timeout=40) as response: status=response.status;raw=response.read()
        except urllib.error.HTTPError as error: status=error.code;raw=error.read()
        value=json.loads(raw) if raw else None
        require(status in allowed,f'HTTP {status} for {method or ("POST" if body is not None else "GET")} {path}: '+json.dumps(value,ensure_ascii=False)[:250])
        return value
    def sql(self, query, args=()):
        self.db.ping(reconnect=False)
        with self.db.cursor() as c: c.execute(query,args);return c.fetchall()
    def counts(self,user):
        counts={table:self.sql('SELECT COUNT(*) FROM '+table+' WHERE user_id=%s',(user,))[0][0]
                for table in ('recipe_records','meal_consumption')}
        counts['shopping_item']=self.sql('SELECT COUNT(*) FROM shopping_item i JOIN shopping_dish d ON d.id=i.shopping_dish_id JOIN shopping_list l ON l.id=d.shopping_list_id WHERE l.user_id=%s',(user,))[0][0]
        return counts
    def workspace(self,w,user):
        return self.http('/meal-workspaces/current?'+urllib.parse.urlencode({'date':w['context']['date'],'mealType':w['context']['mealType']}),user=user)['workspace']
    def create(self, case, user, index):
        initial=case['initial'];context={'date':str(self.day+timedelta(days=index*3)),'mealType':initial.get('mealType','lunch'),
            'people':initial.get('people',2),'compositionMode':'manual','counts':{t:0 for t in TYPES},'requirements':'','ownedIngredients':[]}
        for dish in initial['dishIds']: context['counts'][dish_type(dish)]+=1
        context.update(initial.get('context',{}))
        w=self.http('/meal-workspaces',{'requestId':uid(),'expectedWorkspaceRevision':0,'context':context},user)
        session=self.http('/assistant/v4/sessions',{'requestId':uid(),'workspaceId':w['id']},user)['sessionId']
        if case['group']!='generation':
            physical=[self.ids[d] for d in initial['dishIds']]
            turn=self.turn(user,w,session,'验收初态 '+self.run_id+' '+case['id'],
                [{'kind':'draft_update','arguments':{'operation':'generate','selectedDishIds':physical}}], details(physical))
            require(turn['status']=='completed','Initial draft generation failed: '+turn['status'])
            w=self.workspace(w,user)
        return w,session
    def start(self,user,w,session,message,steps=None,reads=None,question=None,delay=0,unavailable=False,request_id=None):
        recent=self.turn_times[user]
        while len([x for x in recent if time.monotonic()-x<61])>=24: time.sleep(.25)
        recent.append(time.monotonic())
        self.model.register(message,steps,reads,question,delay,unavailable)
        body={'requestId':request_id or uid(),'message':message,'workspaceId':w['id'],
            'expectedWorkspaceRevision':w['revision'],'expectedPlanVersion':w['draft']['planVersion'],'entryScene':ENTRY_SCENE}
        accepted=self.http('/assistant/v4/sessions/'+session+'/turns',body,user)
        return accepted['turnId'],body
    def poll(self,user,turn_id):
        deadline=time.monotonic()+40
        while time.monotonic()<deadline:
            result=self.http('/assistant/v4/turns/'+turn_id,user=user)
            if result['status'] not in ('queued','running'): return result
            time.sleep(.07)
        raise AssertionError('Turn did not settle within 40 seconds')
    def turn(self,user,w,session,message,steps=None,reads=None,question=None,**kwargs):
        tid,_=self.start(user,w,session,message,steps,reads,question,**kwargs);return self.poll(user,tid)
    def confirm(self,user,turn):
        p=turn['pendingAction'];return self.http('/assistant/tool-tasks/'+p['taskId']+'/confirm',{'previewToken':p['previewToken']},user)
    def task(self,user,turn): return self.http('/assistant/tool-tasks/'+turn['pendingAction']['taskId'],user=user)

def dish_type(dish): return {1:'meat',2:'meat',3:'meat',4:'veg',5:'veg',6:'veg',7:'soup',8:'soup',9:'staple',10:'staple',11:'dessert',12:'side',13:'staple'}[dish]
def details(ids): return [{'name':'get_dish_details','arguments':{'dish_ids':ids}}]
def action(kind, **arguments): return {'kind':kind,'arguments':arguments}

def run_case(a,case,index):
    user=910001+index%2;other=910002 if user==910001 else 910001
    w,session=a.create(case,user,index);before=a.counts(user);original=json.loads(json.dumps(w));mode=case['scenario']
    message=case['input']+' ['+a.run_id+' '+case['id']+']';target=str(a.day+timedelta(days=index*3+1))
    save=action('calendar_save',targetDate=target,targetMealType='dinner')
    shopping=action('shopping_preview',sourceRef={'kind':'draft','workspaceId':w['id']})
    mapped=lambda values:[a.ids[d] for d in values]
    ids=mapped(case['initial']['dishIds']);reads=[];steps=None;question=None
    if case['group']=='generation': steps=[action('draft_update',operation='generate',selectedDishIds=ids)];reads=details(ids)
    elif mode=='replace_second': steps=[action('draft_update',operation='adjust',targetDishId=a.ids[4],replacementDishId=a.ids[5])];reads=details(mapped([5]))
    elif mode=='keep': steps=[action('draft_update',operation='adjust',keepDishIds=mapped([1]))]
    elif mode=='people': steps=[action('draft_update',operation='adjust',selectedDishIds=ids,contextPatch={'people':4})]
    elif mode=='regenerate': steps=[action('draft_update',operation='regenerate',selectedDishIds=mapped([2,5,8]))];reads=details(mapped([2,5,8]))
    elif mode=='undo': steps=[action('draft_update',operation='undo')]
    elif mode=='hard_filter': steps=[action('draft_update',operation='adjust',selectedDishIds=mapped([2,4,8]),contextPatch={'criteria':{'excludedIngredients':['鸡蛋']}})];reads=details(mapped([2,8]))
    elif mode=='text_preserved':
        patched=dict(w['context']);patched['requirements']='不能吃任何来源不明的坚果'
        w=a.http('/meal-workspaces/'+w['id']+'/context',{'requestId':uid(),'expectedWorkspaceRevision':w['revision'],'context':patched},user,'PATCH')
        original=json.loads(json.dumps(w));steps=[action('draft_update',operation='adjust',selectedDishIds=ids,contextPatch={'requirements':''})]
    elif mode=='stale': steps=[action('draft_update',operation='adjust',keepDishIds=mapped([1]))]
    elif case['group']=='calendar': steps=[save]
    elif case['group']=='shopping': steps=[shopping]
    elif case['group']=='readonly':
        name={'read_meal':'read_current_meal','read_calendar':'read_calendar','read_shopping':'read_shopping','read_actual':'read_actual_diet_review'}[mode]
        reads=[{'name':name,'arguments':{'startDate':str(date.today()-timedelta(days=6)),'endDate':str(date.today())} if name in ('read_calendar','read_actual_diet_review') else {}}]
    elif mode=='ambiguous': question='你要保存到哪一天、哪一餐？'
    elif mode=='injection': steps=[action('draft_update',operation='adjust',selectedDishIds=[999999999])]
    elif mode=='provider_unavailable': pass
    elif mode=='parallel_reads': reads=[{'name':'read_current_meal','arguments':{}},{'name':'read_shopping','arguments':{'status':'all'}}]
    elif mode=='cross_account': reads=[{'name':'read_current_meal','arguments':{}}]
    elif mode=='partial_resume': steps=[save,shopping]
    elif mode=='forged_success': a.model.final_overrides[message]={'type':'final','reply':'已为你保存计划，并记录这餐为已吃。'}
    elif mode=='unsupported_write': steps=[action('delete_dish',dishId=a.ids[1])]
    if mode=='tomorrow': save['arguments']['targetDate']=str(date.today()+timedelta(days=1));target=save['arguments']['targetDate']
    prior_target_count=a.sql('SELECT COUNT(*) FROM recipe_records WHERE user_id=%s AND record_date=%s AND meal_type=%s',(user,target,'dinner'))[0][0]
    tid,body=a.start(user,w,session,message,steps,reads,question,delay=1 if mode=='cancel' else .3 if mode=='stale' else 0,unavailable=mode=='provider_unavailable')
    if mode=='stale':
        a.http('/meal-workspaces/'+w['id']+'/commands',{'requestId':uid(),'command':'keep','dishId':a.ids[7],'expectedWorkspaceRevision':w['revision'],'planVersion':w['draft']['planVersion']},user)
    if mode=='cancel':
        deadline=time.monotonic()+5
        while a.model.scripts[message]['calls']==0 and time.monotonic()<deadline: time.sleep(.02)
        require(a.model.scripts[message]['calls']==1,'Cancellation did not reach delayed real provider HTTP')
        a.http('/assistant/v4/turns/'+tid+'/cancel',{},user)
    turn=a.poll(user,tid)
    expected=case['assertions']['turnStatuses'];require(turn['status'] in expected,case['id']+' unexpected status '+turn['status']+' '+str(turn.get('reply')))
    require(a.counts(user)==before,'Unconfirmed assistant turn wrote persistent business state')
    if case['group']=='generation':
        after=a.workspace(w,user);require([d['id'] for d in after['draft']['dishes']]==ids,'Generated dish identity/order mismatch')
    elif mode in ('replace_second','keep','people','regenerate','undo','hard_filter'):
        after=a.workspace(w,user)
        if mode=='replace_second': require([d['id'] for d in after['draft']['dishes']]==mapped([1,5,7]),'Second dish was not exclusively replaced')
        if mode=='keep': require(a.ids[1] in after['draft']['lockedDishIds'],'Keep not persisted')
        if mode=='people': require(after['context']['people']==4,'People adjustment absent')
        if mode=='regenerate': require([d['id'] for d in after['draft']['dishes']]==mapped([2,5,8]),'Regenerated menu mismatch')
        if mode=='undo': require(after['draft']['dishes']==[],'Undo did not restore empty initial draft')
        if mode=='hard_filter': require(a.ids[1] not in [d['id'] for d in after['draft']['dishes']] and a.ids[7] not in [d['id'] for d in after['draft']['dishes']],'Egg restriction violated')
    elif mode=='text_preserved': require(a.workspace(w,user)['context']['requirements']==original['context']['requirements'],'Unparsed requirement erased')
    if mode=='cross_account':
        a.http('/assistant/v4/turns/'+tid,user=other,allowed=(404,))
        a.http('/assistant/v4/sessions/'+session,user=other,allowed=(404,))
        a.http('/assistant/v4/sessions/'+session+'/turns',body,other,allowed=(404,))
    if mode=='idempotent_turn':
        replay=a.http('/assistant/v4/sessions/'+session+'/turns',body,user);require(replay['turnId']==tid,'Turn replay created another turn')
        changed=dict(body,message=body['message']+'不同内容');a.http('/assistant/v4/sessions/'+session+'/turns',changed,user,allowed=(409,))
    if mode=='delete':
        a.http('/assistant/v4/sessions/'+session,user=user,method='DELETE')
        require(a.confirm(user,turn)['status']!='completed','Deleted parent still confirmed')
        require(a.counts(user)==before,'Deleted parent wrote domain state')
    elif mode in ('save','tomorrow','duplicate_confirm','idempotent_turn','parallel_confirm','source_changed','shopping_confirm','unknown_price','repreview','same_meal_alias','other_meal_scope','manual_preserved','partial_resume'):
        if mode=='source_changed':
            a.http('/meal-workspaces/'+w['id']+'/commands',{'requestId':uid(),'command':'keep','dishId':a.ids[7],'expectedWorkspaceRevision':w['revision'],'planVersion':w['draft']['planVersion']},user)
            require(a.confirm(user,turn)['status']!='completed','Changed source confirmed');require(a.counts(user)==before,'Changed source wrote plan');return
        if mode in ('unknown_price','repreview','manual_preserved'):
            rows=turn['cards'][-1]['data']['items'];require(rows and all(r['price'] is None for r in rows),'Unknown price was invented')
            require(all(r['quantity'] is None for r in rows),'Unknown servings were scaled')
        if mode=='repreview':
            old=turn['pendingAction'];req={'requestId':uid(),'selectedSourceKeys':[turn['cards'][-1]['data']['items'][0]['sourceKey']]}
            fresh=a.http('/assistant/v4/shopping/tasks/'+old['taskId']+'/repreview',req,user)
            require(fresh['previewToken']!=old['previewToken'],'Renewal reused old token')
            require(a.confirm(user,turn)['status']!='completed','Old preview still confirmed')
            recovered=a.http('/assistant/tool-tasks/by-request/'+req['requestId'],user=user);require(recovered['id']==fresh['id'],'Lost renewal was not recoverable')
            turn=a.poll(user,tid)
        if mode=='parallel_confirm':
            with concurrent.futures.ThreadPoolExecutor(2) as pool: receipts=list(pool.map(lambda _:a.confirm(user,turn),range(2)))
            receipt=receipts[0];require(all(r['status']=='completed' for r in receipts),'Concurrent confirm failed')
        else: receipt=a.confirm(user,turn)
        require(receipt['status']=='completed','Confirmed task failed: '+str(receipt.get('errorCode')))
        after=a.counts(user);require(after['meal_consumption']==before['meal_consumption'],'Plan/shopping was recorded as eaten')
        if case['group']=='shopping': require(after['shopping_item']>before['shopping_item'],'Confirmed shopping did not persist any ingredients')
        if case['group']=='calendar' or mode=='partial_resume':
            require(after['recipe_records']==before['recipe_records']+(0 if prior_target_count else 1),'Calendar write count mismatch')
            require(a.sql('SELECT COUNT(*) FROM recipe_records WHERE user_id=%s AND record_date=%s AND meal_type=%s',(user,target,'dinner'))[0][0]==1,'Wrong target date or meal')
        if mode=='duplicate_confirm':
            again=a.confirm(user,turn);require(again['steps'][0]['result']==receipt['steps'][0]['result'],'Receipt replay changed');require(a.counts(user)==after,'Duplicate confirmation wrote again')
            a.http('/assistant/v4/sessions/'+session,user=user,method='DELETE');require(a.confirm(user,turn)['status']=='completed','Business receipt lost on session delete')
        if mode=='partial_resume':
            continued=a.poll(user,tid);require(continued['status']=='awaiting_confirmation','Second action not independently awaiting confirmation')
            saved_count=after['recipe_records'];a.http('/assistant/v4/turns/'+tid+'/resume',{},user);a.http('/assistant/v4/turns/'+tid+'/resume',{},user)
            require(a.counts(user)['recipe_records']==saved_count,'Resume replayed calendar')
            # Simulate another device changing the owned list after preview. This is
            # test arrangement, not a substitute for the real confirmation code.
            a.sql('UPDATE shopping_list SET version=version+1 WHERE user_id=%s',(user,))
            failed=a.confirm(user,continued);require(failed['status']!='completed','Stale shopping preview unexpectedly confirmed')
            require(a.counts(user)['recipe_records']==saved_count,'Shopping failure removed/replayed completed plan')
            a.http('/assistant/v4/shopping/tasks/'+continued['pendingAction']['taskId']+'/repreview',{'requestId':uid()},user)
            require(a.confirm(user,a.poll(user,tid))['status']=='completed','Shopping continuation failed');require(a.counts(user)['recipe_records']==saved_count,'Shopping replayed calendar')
        if mode in ('same_meal_alias','other_meal_scope','manual_preserved'):
            first_count=a.counts(user)['shopping_item'];w=a.workspace(w,user)
            if mode=='manual_preserved':
                listing=a.http('/shopping-list',user=user);item=listing['dishes'][-1]['items'][0]
                a.http('/shopping-list/items/'+str(item['id']),{'requestId':uid(),'expectedListVersion':listing['version'],'quantityText':'半袋','checked':True},user,'PATCH')
            saved=a.turn(user,w,session,message+' 保存',[action('calendar_save',targetDate=w['context']['date'] if mode!='other_meal_scope' else target,targetMealType=w['context']['mealType'] if mode!='other_meal_scope' else 'dinner')])
            require(a.confirm(user,saved)['status']=='completed','Alias setup save failed');w=a.workspace(w,user)
            ref={'kind':'plan','date':w['context']['date'] if mode!='other_meal_scope' else target,'mealType':w['context']['mealType'] if mode!='other_meal_scope' else 'dinner'}
            second=a.turn(user,w,session,message+' 再采购',[action('shopping_preview',sourceRef=ref)])
            if mode=='manual_preserved': require(any(r['quantityText']=='半袋' and r['checked'] for r in second['cards'][-1]['data']['items']),'Manual/checked state lost')
            require(a.confirm(user,second)['status']=='completed','Alias confirmation failed')
            final_count=a.counts(user)['shopping_item'];require(final_count>first_count if mode=='other_meal_scope' else final_count==first_count,'Meal scope identity incorrect')
    elif mode=='cancel':
        time.sleep(1.2);require(a.poll(user,tid)['status']=='cancelled','Late model response revived cancelled turn');require(a.counts(user)==before,'Cancelled task wrote domain state')
        pending=a.turn(user,w,session,message+' 重新预览',[save]);require(pending['status']=='awaiting_confirmation','Cancellation setup preview absent')
        a.http('/assistant/v4/turns/'+pending['turnId']+'/cancel',{},user)
        require(a.confirm(user,pending)['status']!='completed','Cancelled preview still confirmed');require(a.counts(user)==before,'Cancelled preview wrote persistent state')
    elif case['group']=='readonly' or mode in ('ambiguous','injection','provider_unavailable','parallel_reads','cross_account','forged_success','unsupported_write'):
        require(a.workspace(w,user)==original,'Readonly/refusal modified workspace')
    if mode in ('forged_success','unsupported_write'):
        require(not turn.get('pendingAction') and not any(card.get('receiptRef') for card in turn.get('cards',[])),'Forged/unsupported response invented a business receipt')
        require('已为你保存' not in turn.get('reply','') and '记录这餐为已吃' not in turn.get('reply',''),'Supplier success text reached UI without a receipt')
    if mode=='parallel_reads':
        require(a.model.scripts[message]['calls']==2,'Parallel tool results did not resume in a single model round')
    if case['group']=='readonly':
        require(not turn.get('pendingAction'),'Readonly query asked for business confirmation')
        require(turn['cards'] and all(not card.get('receiptRef') for card in turn['cards']),'Readonly query invented a write receipt')
        if mode=='read_meal': require([d['id'] for d in turn['cards'][0]['data']['dishes']]==ids,'Current meal read returned wrong dish order')
        if mode=='read_actual': require(all(meal.get('status')=='eaten' for card in turn['cards'] for meal in card.get('data',{}).get('meals',[])),'Actual review included a merely planned meal')

def schema_checks(a):
    """Exercise real InnoDB ownership, row locks, rollback and mapper JSON SQL."""
    import pymysql
    session=uid();turn=uid();now=int(time.time()*1000);user=910001
    a.sql('INSERT INTO assistant_v4_session VALUES(%s,%s,%s,%s,%s,%s,%s)',(session,user,'synthetic-schema',uid(),'0'*64,now,now))
    try:
        try:
            a.sql('INSERT INTO assistant_v4_turn(id,user_id,session_id,workspace_id,request_id,request_hash,status,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)',(uid(),910002,session,'synthetic-schema',uid(),'0'*64,'completed',now,now))
        except pymysql.IntegrityError: pass
        else: raise AssertionError('Composite owner FK accepted foreign user')
        a.sql('INSERT INTO assistant_v4_turn(id,user_id,session_id,workspace_id,request_id,request_hash,status,input_json,result_json,continuation_json,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(turn,user,session,'synthetic-schema',uid(),'0'*64,'completed','{"message":"synthetic"}','{}','{"steps":[{"arguments":{"x":1},"receiptRef":"business-preserved"}]}',now,now))
        a.db.begin();a.sql("UPDATE assistant_v4_turn SET input_json=NULL,continuation_json=JSON_REMOVE(continuation_json,'$.steps[0].arguments') WHERE id=%s",(turn,))
        require(a.sql("SELECT JSON_EXTRACT(continuation_json,'$.steps[0].arguments'),JSON_UNQUOTE(JSON_EXTRACT(continuation_json,'$.steps[0].receiptRef')) FROM assistant_v4_turn WHERE id=%s",(turn,))[0]==(None,'business-preserved'),'Retention JSON did not preserve receipt reference')
        a.db.rollback();require(a.sql('SELECT input_json FROM assistant_v4_turn WHERE id=%s',(turn,))[0][0] is not None,'Rollback did not restore row')
        second=pymysql.connect(host='127.0.0.1',port=a.state['dbPort'],user='root',password=a.state['password'],database=a.state['database'],autocommit=True)
        try:
            a.db.begin();a.sql('SELECT id FROM assistant_v4_turn WHERE id=%s FOR UPDATE',(turn,))
            with second.cursor() as cursor:
                cursor.execute('SET innodb_lock_wait_timeout=1')
                try: cursor.execute("UPDATE assistant_v4_turn SET status='cancelled' WHERE id=%s",(turn,))
                except pymysql.OperationalError as e: require(e.args[0]==1205,'Unexpected lock error')
                else: raise AssertionError('FOR UPDATE did not serialize competing mutation')
        finally: a.db.rollback();second.close()
        # Use exact expression shape of ShoppingScopeAliasMapper against real JSON rows.
        a.sql("SELECT id FROM controlled_tool_task WHERE user_id=%s AND JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.steps[0].tool'))='save_meal_to_target' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.steps[0].result.targetPlanRevision')) AS UNSIGNED)=1 ORDER BY updated_at DESC LIMIT 1",(user,))
    finally: a.sql('DELETE FROM assistant_v4_session WHERE id=%s',(session,))
    require(a.sql('SELECT COUNT(*) FROM assistant_v4_turn WHERE id=%s',(turn,))[0][0]==0,'Session cascade did not remove owned turn')
    return {'ownerForeignKey':True,'jsonRetention':True,'transactionRollback':True,'rowLock':True,'sessionCascade':True,'aliasJsonExpression':True}

def run_owned(manifest,jar,output,case_ids=None,execution=None):
    mode='mock' if execution is None else execution.provider_mode
    require(execution is None or mode=='live','Unknown execution mode')
    validate_manifest(manifest,mode)
    if execution is not None: execution.ledger.validate()
    jar=Path(jar).resolve();require(sha(jar)==manifest['jarSha256'],'JAR hash changed')
    data=Path(manifest['privateDirectory']).resolve();state=json.loads((data/'runtime.json').read_text(encoding='utf-8'))
    require(state['database']==manifest['database'] and state['api']==manifest['isolatedApiBase'],'Runtime/manifest mismatch')
    internal_token=validate_owned_internal_configuration((data/'application-local.yml').read_text(encoding='utf-8-sig'))
    import pymysql
    import uvicorn
    spec=importlib.util.spec_from_file_location('owned_acceptance_runtime',ROOT/'scripts/local_v4.py');runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime);runtime.DATA=data
    runtime.validate_local_configuration(state)
    require(not any(runtime.process_command(state.get(key)) for key in ('mysqlPid','javaPid')),'Recorded process still active; no process touched')
    for port in (state['dbPort'],urllib.parse.urlsplit(state['api']).port,PYTHON_PORT): runtime.available(port)
    processes=[];connection=None;server=None;server_thread=None;report={'runId':uid(),'providerMode':mode,'realProviderRequests':0,'jarSha256':sha(jar),'cases':[],
        'backendSourceHashes':{str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in sorted((ROOT/'backend/src/main').rglob('*')) if p.is_file() and p.name!='application.yml'}}
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    try:
        mysql=subprocess.Popen([state['mysqlExecutable'],'--no-defaults','--datadir='+str(data/'mysql'),'--bind-address=127.0.0.1','--port='+str(state['dbPort']),'--log-error='+str(data/'mysql.log'),'--mysqlx=OFF','--default-time-zone=+08:00'],creationflags=runtime.FLAGS);processes.append(mysql)
        deadline=time.monotonic()+40
        while connection is None:
            require(mysql.poll() is None,'Owned MySQL exited')
            try: connection=pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password'],database=state['database'],charset='utf8mb4',autocommit=True,connect_timeout=2)
            except pymysql.Error as error:
                if not report.get('dbConnectionDiagnostic'):
                    win=re.search(r'WinError (\d+)',str(error))
                    report['dbConnectionDiagnostic']={'mysqlErrorCode':error.args[0] if error.args else None,'windowsErrorCode':win.group(1) if win else None}
                    print(json.dumps({'dbConnectionWaiting':report['dbConnectionDiagnostic']}),flush=True)
                if time.monotonic()>deadline: raise RuntimeError('Owned MySQL connection unavailable') from None
                time.sleep(.2)
        model=MockCompletion() if execution is None else execution.create_model();a=Acceptance(state,connection,model,run_id=report['runId'])
        require(a.sql('SELECT DATABASE()')[0][0]==manifest['database'],'Connected database mismatch')
        require(a.sql("SELECT id,open_id FROM users ORDER BY id")==((910001,'local-v4-user'),(910002,'local-v4-second')),'Database is not the two-account synthetic fixture')
        require(a.sql('SELECT COUNT(*) FROM food WHERE user_id IS NOT NULL')[0][0]==0,'Non-fixture personal recipes exist')
        names=['番茄炒蛋','香菇鸡丁','土豆炖肉','清炒青菜','清炒西兰花','醋溜土豆丝','紫菜蛋汤','番茄豆腐汤','米饭','清粥']
        migration_names=['V4 早餐·燕麦粥','V4 早餐·蒸玉米','V4 早餐·烤吐司','V4 早餐·水煮鸡蛋','V4 早餐·清炒小白菜','V4 早餐·黄瓜小菜']
        extra_names=['验收合成水果甜点','验收合成凉拌黄瓜','验收合成早餐燕麦']
        original_food=a.sql('SELECT ID,NAME,TYPE FROM food ORDER BY ID')
        require([r[1] for r in original_food[:16]]==migration_names+names,'Original synthetic recipe identity mismatch')
        require([r[2] for r in original_food[:6]]==['staple','staple','staple','meat','veg','veg'],'Migration breakfast category mismatch')
        require([r[1] for r in original_food[16:]]==extra_names[:len(original_food)-16] and 16<=len(original_food)<=19,'Unexpected recipes in synthetic database')
        by_name={row[1]:row for row in original_food}
        for logical,name in enumerate(names,1):
            require(by_name[name][2]==dish_type(logical),'Synthetic recipe category mismatch');a.ids[logical]=by_name[name][0]
        baseline={t:a.sql('SELECT COUNT(*) FROM '+t)[0][0] for t in ('users','food','recipe_records','meal_consumption','shopping_item')}
        sys.path.insert(0,str(ROOT/'scripts'));from run_mysql_integration import statements
        for _ in range(2):
            for filename in ('V8__assistant_v4_conversations.sql','V8_10__assistant_shopping_scope_aliases.sql'):
                for sql in statements((ROOT/'backend/db/migrations'/filename).read_text(encoding='utf-8')):
                    a.sql(sql)
        require(baseline=={t:a.sql('SELECT COUNT(*) FROM '+t)[0][0] for t in baseline},'Additive DDL changed domain row counts')
        # Additional fixtures are explicitly synthetic. Unknown serving/quantity evidence remains unknown.
        for dish,name,kind,ingredients in ((11,'验收合成水果甜点','dessert','苹果|1|个'),(12,'验收合成凉拌黄瓜','side','黄瓜|1|根'),(13,'验收合成早餐燕麦','staple','燕麦|50|克')):
            existing=a.sql('SELECT ID,TYPE FROM food WHERE NAME=%s',(name,))
            require(not existing or len(existing)==1 and existing[0][1]==kind,'Synthetic recipe name collision')
            if not existing:
                physical=a.sql('SELECT MAX(ID)+1 FROM food')[0][0]
                a.sql("INSERT INTO food(ID,NAME,TYPE,CL,INGREDIENTS_AMOUNTS,STEPS,COOK_MINUTES,COOK_TIME,TAG_CODES,IS_PUBLISHED) VALUES(%s,%s,%s,%s,%s,'准备食材###煮熟或洗净切块###分装供合成验收',10,'10分钟',%s,1)",(physical,name,kind,ingredients,ingredients,'BREAKFAST_ELIGIBLE' if dish==13 else 'HOME_STYLE'))
            else: physical=existing[0][0]
            a.ids[dish]=physical
        report['syntheticFixtureIdMap']=a.ids
        with local_provider(model) as provider:
            app=synthetic_python_app(provider,internal_token);server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=PYTHON_PORT,log_level='critical',access_log=False));server_thread=threading.Thread(target=server.run,daemon=True);server_thread.start()
            deadline=time.monotonic()+15
            while not server.started:
                require(time.monotonic()<deadline,'Owned FastAPI startup timeout');time.sleep(.05)
            env={k:v for k,v in os.environ.items() if k.upper() not in ('JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS','JAVA_OPTS') and not k.upper().startswith(('SPRING_','SERVER_','SECURITY_TOKEN_','MEAL_WORKSPACE_','RECOMMEND_SERVICE_'))};env['ASSISTANT_V4_ENABLED']='true';env['TENCENT_ASR_ENABLED']='false'
            with (data/'acceptance-java.log').open('ab') as log:
                java=subprocess.Popen([state['javaExecutable'],'-jar',str(jar),'--spring.profiles.active=local-v4','--spring.config.location='+(data/'application-local.yml').as_uri(),'--assistant.v4.enabled=true'],cwd=data,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=runtime.FLAGS)
            processes.append(java);deadline=time.monotonic()+45
            while True:
                require(java.poll() is None,'Owned Java exited')
                command=runtime.process_command(java.pid);require(str(jar).replace('\\','/').lower() in command.replace('\\','/').lower(),'Owned Java command identity unavailable')
                try:
                    if a.http('/users/info')['user']['id']==910001: break
                except OSError:
                    require(time.monotonic()<deadline,'Private authenticated Java readiness failed');time.sleep(.2)
            caps=a.http('/assistant/v4/capabilities');require(caps['enabled'] and len(caps['reads'])==8 and caps['draftCommands']==['draft_update'] and set(caps['previewActions'])=={'calendar_save','shopping_preview'},'Final capability registry mismatch')
            report['schema']=schema_checks(a);report['ddlRerunnable']=True
            for index,case in enumerate(load_fixtures() if execution is None else execution.cases()):
                if case_ids and case['id'] not in case_ids: continue
                started=time.monotonic();calls=len(model.calls)
                try:
                    detail=run_case(a,case,index) if execution is None else execution.run_case(a,case,index)
                    outcome={'id':case['id'],'passed':True}
                    if detail: outcome.update(detail)
                except Exception as error: outcome={'id':case['id'],'passed':False,'failure':str(error)[:500],'failureType':type(error).__name__}
                outcome['seconds']=round(time.monotonic()-started,3)
                outcome['mockHttpCalls' if execution is None else 'providerHttpCalls']=len(model.calls)-calls
                if execution is not None: execution.finish_report(report,model)
                report['cases'].append(outcome);output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(outcome,ensure_ascii=False),flush=True)
            report['passed']=sum(c['passed'] for c in report['cases']);report['total']=len(report['cases'])
            if execution is None: report['mockHttpCalls']=len(model.calls)
            else: execution.finish_report(report,model)
            report['sourceHashes']={str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in sorted((ROOT/'recommend-service').glob('*.py'))}
            report['contractSha256']=sha(ROOT/'contracts/assistant-v4.json')
            output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            return report
    finally:
        if connection is not None: connection.close()
        if server is not None: server.should_exit=True
        if server_thread is not None: server_thread.join(timeout=5)
        for process in reversed(processes):
            if process.poll() is None: process.terminate();process.wait(timeout=20)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--manifest',required=True);parser.add_argument('--jar',required=True);parser.add_argument('--output',required=True);parser.add_argument('--cases')
    args=parser.parse_args();manifest=validate_manifest(json.loads(Path(args.manifest).read_text(encoding='utf-8')))
    report=run_owned(manifest,args.jar,args.output,set(args.cases.split(',')) if args.cases else None)
    return 0 if report['passed']==report['total'] else 1
if __name__=='__main__': raise SystemExit(main())
