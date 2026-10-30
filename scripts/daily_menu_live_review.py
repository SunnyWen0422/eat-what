"""Explicit opt-in natural conversations on an owner-created canonical runtime.

The real provider is forwarded unchanged, with a shared atomic HTTP-attempt cap.
Only synthetic users in a verified private loopback database may be used.
"""
import argparse
import hashlib
from datetime import date, datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

from assistant_v4_acceptance import Acceptance, local_provider, require, uid
from assistant_v4_live_acceptance import LiveCompletion, approved_provider_fields
from assistant_v4_provider_budget import ProviderBudget
from maturity_runtime import backend_fingerprint

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS = [
    ('generate', '今晚两个人吃，想吃家常一点，帮我安排一荤一素吧。'),
    ('replace', '素菜换一道，荤菜不动。'),
    ('people', '又来了一位朋友，改成三个人分着吃，菜不用加。'),
    ('save', '就这样吧，存到今天晚餐。'),
    ('shopping', '把这顿需要买的食材放进购物清单。'),
    ('view', '看看我今天都安排了什么。'),
    ('nutrition', '今天记录的这些菜营养怎么样，大概多少卡路里？'),
    ('cooking', '第一道菜怎么做？'),
    ('allergy', '家里有人花生过敏，不要花生，再安排一套晚餐。'),
    ('boundary', '帮我把购物清单里的东西直接下单送到家。'),
]

CORE_QUESTIONS = [
    ('generate', '今晚两个人吃，想吃家常一点，帮我安排一荤一素吧。'),
    ('replace', '素菜换一道，荤菜不动。'),
    ('people', '又来了一位朋友，改成三个人分着吃，菜不用加。'),
    ('next_preferences', '下次帮我选清淡一点的，这一餐的菜先不变。'),
    ('save', '就这样吧，存到今天晚餐。'),
    ('shopping', '把这顿需要买的食材放进购物清单。'),
    ('prices', '这些待买食材大概要花多少钱？没价格的先空着。'),
    ('view', '看看我今天都安排了什么。'),
    ('nutrition', '今天记录的这些菜营养怎么样，大概多少卡路里？'),
    ('allergy', '家里有人花生过敏，不要花生，再安排一套晚餐。'),
]

class SettlingAcceptance(Acceptance):
    def poll(self, user, turn_id):
        deadline=time.monotonic()+45
        while time.monotonic()<deadline:
            turn=self.http('/assistant/v4/turns/'+turn_id,user=user)
            continuation=turn.get('continuation') or {};steps=continuation.get('steps') or [];cursor=continuation.get('cursor',0)
            checkpoint=(turn.get('status')=='awaiting_confirmation' and not turn.get('pendingAction') and (not turn.get('reply') or turn.get('retryable') is False)
                        and cursor<len(steps) and steps[cursor].get('status')=='pending')
            direct=any((card.get('data') or {}).get('executionMode')=='direct' for card in turn.get('cards',[]))
            if checkpoint or direct and turn.get('retryable') is False:
                # Same durable local action only; this endpoint never calls the model.
                self.http('/assistant/v4/turns/'+turn_id+'/resume',{},user)
            elif turn['status'] not in ('queued','running'):return turn
            time.sleep(.2)
        raise AssertionError('Original turn has not settled; do not resend the question')


def check_case(kind, before, after, counts_before, counts_after, turn, ingredient_definitions=None):
    ids = lambda w: [d['id'] for d in w['draft']['dishes']]
    old, new = ids(before), ids(after)
    require(turn['status'] in ('completed', 'needs_input'), 'Conversation did not finish: ' + turn['status'])
    if kind == 'generate': require(len(new) == 2, 'Expected one meat and one vegetable dish')
    elif kind == 'replace':
        require(len(old) == len(new) == 2 and len(set(old) & set(new)) == 1, 'Expected one replacement only')
        meat = [d['id'] for d in before['draft']['dishes'] if d['type'] == 'meat']
        require(set(meat) <= set(new), 'Meat dish changed unexpectedly')
    elif kind == 'people':
        require(after['context']['people'] == 3 and old == new, 'Sharing change altered the menu')
        require(before['draft']['dishes'] == after['draft']['dishes'], 'Sharing scaled or rewrote recipe facts')
    elif kind == 'next_preferences':
        require(turn['status'] == 'completed', 'Next preference did not finish')
        require(before['draft']['dishes'] == after['draft']['dishes'], 'Next preferences changed the existing menu')
        require('INTENSITY_LIGHT' in after['context'].get('recommendationPreferences', {}).get('includeTagCodes', []), 'Light preference was not applied to next selection')
        require({k:v for k,v in before['context'].items() if k!='recommendationPreferences'} == {k:v for k,v in after['context'].items() if k!='recommendationPreferences'}, 'Next preference changed unrelated configuration')
        require(counts_before == counts_after, 'Next preference wrote calendar or shopping data')
    elif kind == 'save': require(counts_after['records'] == 1 and after.get('confirmation'), 'No saved calendar receipt')
    elif kind == 'shopping': require(counts_after['shopping'] > 0, 'No shopping ingredients were created')
    elif kind in ('view', 'nutrition', 'cooking', 'boundary', 'prices'):
        require(before == after and counts_before == counts_after, 'Read or unsupported action mutated user data')
        if kind == 'prices':
            require(any(word in (turn.get('reply') or '') for word in ('参考', '小计', '报价', '估算')), 'Price result is missing from the user reply')
    elif kind == 'allergy':
        require(len(new) == 2 and old != new, 'New allergy-aware menu was not generated')
        require('花生' in after['context']['criteria'].get('excludedIngredients', []), 'Explicit peanut exclusion missing')
        require(isinstance(ingredient_definitions, dict) and ingredient_definitions, 'Canonical ingredient definitions required for allergy verification')
        for dish in after['draft']['dishes']:
            recipe=dish.get('recipe', {})
            # Null is unknown metadata, not an empty authoritative allergen set;
            # still inspect every canonical ingredient identity below.
            require(not any('peanut' in str(code).lower() for code in (recipe.get('allergenCodes') or [])), 'Recipe declares peanut')
            for line in recipe.get('ingredients', []):
                definition=ingredient_definitions.get(line.get('ingredientId'))
                require(definition is not None, 'Unknown ingredient identity cannot pass allergy verification')
                text=json.dumps({key:definition.get(key) for key in ('id','name','aliases')},ensure_ascii=False).lower()
                require('花生' not in text and 'peanut' not in text and 'peanut' not in (definition.get('allergens') or []), 'Peanut appears in the resulting recipe')


def validate_reviewed_retry(previous, number, turn_id, turn, workspace, counts, budget_used):
    """One explicit retest of a terminal, effect-free failed scene after inspection.

    Unknown/running/pending/completed actions must be recovered by their original
    identity, never by asking the model again. Previous evidence is not replaced.
    """
    latest = {row['number']: row for row in previous['cases']}
    require(type(number) is int and 1 <= number <= 10 and set(latest) == set(range(1, number + 1)), 'Only the last attempted scenario can be explicitly retested')
    row = latest[number]
    require(all(value.get('passed') is True for key, value in latest.items() if key != number), 'Earlier scenarios must already be resolved')
    require(row.get('passed') is False and row.get('status') == 'needs_input' and row.get('turnId') == turn_id, 'Only the specifically reviewed terminal failed turn can be retested')
    require(previous.get('pythonExited') is True and budget_used == previous['providerHttpAttempts'], 'Original model process must be stopped and its budget retained')
    require(turn.get('turnId') == turn_id and turn.get('status') == 'needs_input' and not turn.get('continuation') and not turn.get('pendingAction'), 'Pending, unknown or completed operations must not be resent')
    expected = {'workspaceId': row['workspaceId'], 'workspaceRevision': row['expectedWorkspaceRevision'], 'planVersion': row['expectedPlanVersion']}
    require(turn.get('workspaceRef') == expected and workspace['id'] == expected['workspaceId'] and workspace['revision'] == expected['workspaceRevision'] and workspace['draft']['planVersion'] == expected['planVersion'], 'Workspace changed since the failed scene')
    require([dish['id'] for dish in workspace['draft']['dishes']] == row['beforeDishIds'] == row['afterDishIds'], 'The failed scene changed the menu')
    require(counts == row['counts'], 'Saved or shopping data changed since the failed scene')
    return row


def run(args):
    import pymysql
    require(args.approved_live, 'Explicit live authorization flag required')
    date.fromisoformat(args.authorization_date)
    questions = CORE_QUESTIONS if args.profile == 'core-enhancement' else QUESTIONS
    require(not args.complete_run or args.profile == 'daily', 'Legacy completion applies only to the original daily profile')
    require(not args.resume_run or args.profile == 'core-enhancement' and not args.complete_run, 'Resume is limited to the current core profile')
    retry_number = getattr(args, 'retry_reviewed_case', None)
    retry_turn = getattr(args, 'reviewed_turn_id', None)
    require(bool(retry_number) == bool(retry_turn), 'A reviewed case and original turn identity must be supplied together')
    require(not retry_number or args.profile == 'core-enhancement' and not args.complete_run and not args.resume_run, 'Explicit retest is separate from normal continuation')
    question_hash=hashlib.sha256(json.dumps(questions,ensure_ascii=False).encode()).hexdigest()
    runtime = Path(args.runtime).resolve()
    require(not runtime.is_relative_to(ROOT) and (runtime / 'ready.json').is_file(), 'Owned outside-repository ready runtime required')
    state = json.loads((runtime / 'private/runtime.json').read_text('utf-8'))
    url = urllib.parse.urlparse(state['api'])
    require(url.scheme == 'http' and url.hostname == '127.0.0.1' and url.path == '/api', 'Only loopback API allowed')
    require(state['purpose'] == 'canonical-catalog-isolated' and re.fullmatch(r'eatwhat_catalog_local_[0-9a-f]{8}', state['database']), 'Canonical isolated database required')
    require(state['sourceFingerprint'] == backend_fingerprint(), 'Runtime backend is not the current source')
    catalog_bytes=Path(state['catalogPath']).read_bytes()
    require(hashlib.sha256(catalog_bytes).hexdigest()==state['catalogSha256'], 'Pinned canonical catalog changed')
    ingredient_definitions={value['id']:value for value in json.loads(catalog_bytes)['ingredients']}
    ledger = ProviderBudget(args.budget, authorization_date=args.authorization_date, request_limit=20)
    ledger.validate()
    output = runtime / 'natural-conversations'
    base_output=output
    previous=None
    if args.resume_run or retry_number:
        previous=json.loads((output/'report.json').read_text('utf-8'))
        require(previous.get('profile')==args.profile and previous.get('questionsSha256')==question_hash, 'Scenario list changed; cannot reuse this authorization ledger')
        require(previous.get('catalogSha256')==state['catalogSha256'], 'Candidate catalog changed during the run')
        latest={c['number']:c for c in previous['cases']}
        require(len(latest)<10 or any(not c.get('passed') for c in latest.values()), 'Completed run cannot be repeated')
        if args.resume_run:require(all(c.get('passed') is True for c in latest.values()), 'Inspect the original failed or unknown turn; this runner never resends an attempted question')
        require(ledger.validate()['used']>=previous['providerHttpAttempts'], 'Budget ledger was reset')
        if retry_number:
            require(re.fullmatch(r'[0-9a-f-]{36}', retry_turn or '') is not None, 'Original turn identity is invalid')
            output=output/('reviewed-retest-'+str(retry_number)+'-'+retry_turn)
        else:output=output/('resume-'+str(len(previous['cases'])))
    elif args.complete_run:
        previous=json.loads((output/'report.json').read_text('utf-8'))
        require(len(previous['cases'])==10 and not previous.get('followups'), 'Only one completion of this original run is allowed')
        require(all(c['providerHttpAttempts']==0 and 'HTTP 409' in c.get('error','') for c in previous['cases'] if c['number'] in (2,4,10)), 'Do not resend any question already delivered to the model')
        output=output/'completion'
    require(not output.exists(), 'Conversation run already exists; do not silently repeat questions')
    output.mkdir()
    db = pymysql.connect(host='127.0.0.1', port=state['dbPort'], user='root', password=state['password'], database=state['database'], autocommit=True, charset='utf8mb4')
    with db.cursor() as c:
        c.execute('SELECT @@datadir,@@port'); data, port = c.fetchone()
        require(Path(data).resolve() == (runtime / 'private/mysql').resolve() and port == state['dbPort'], 'Database ownership mismatch')
        c.execute('SELECT open_id FROM users WHERE id=910001')
        require(c.fetchone() == ('catalog-local-a',), 'Synthetic account required')
    model = LiveCompletion(approved_provider_fields(ROOT / 'recommend-service/.env'), ledger)
    continuing = args.resume_run or bool(retry_number)
    report = {'productionTouched': False, 'profile': args.profile, 'questionsSha256': question_hash, 'questionLimit': 10, 'providerHttpLimit': 20, 'authorizationDate': args.authorization_date, 'cases': list(previous['cases']) if continuing else [], 'catalogSha256': state['catalogSha256'], 'sourceFingerprint': state['sourceFingerprint']}
    if continuing:report['priorRunSourceFingerprint']=previous['sourceFingerprint']
    guard = output / 'guard'; guard.mkdir()
    (guard / 'sitecustomize.py').write_text('''import socket
_connect=socket.socket.connect
_resolve=socket.getaddrinfo
def allowed(host):
 if str(host) not in ('localhost','127.0.0.1','::1'):raise RuntimeError('Only owned loopback services allowed')
def connect(self,address):
 if isinstance(address,tuple):allowed(address[0])
 return _connect(self,address)
def resolve(host,*args,**kwargs):
 allowed(host);return _resolve(host,*args,**kwargs)
socket.socket.connect=connect
socket.getaddrinfo=resolve
''', encoding='utf-8')
    process = None
    try:
        with local_provider(model) as provider, (output / 'python-service.log').open('wb') as log:
            env = {k:v for k,v in os.environ.items() if 'PROXY' not in k.upper() and not k.endswith('API_KEY')}
            env.update(EATWHAT_DISABLE_DOTENV='1', PYTHONUTF8='1', PYTHONDONTWRITEBYTECODE='1',
                DB_HOST='127.0.0.1', DB_PORT=str(state['dbPort']), DB_NAME=state['database'], DB_USER='root', DB_PASSWORD=state['password'],
                MEAL_WORKSPACE_SERVICE_TOKEN=state['serviceToken'], DEEPSEEK_API_KEY='owned-forwarder', DEEPSEEK_BASE_URL=provider,
                DEEPSEEK_MODEL='owned-forwarder', DASHSCOPE_API_KEY='', CATALOG_SERVICE_BASE_URL=state['api'][:-4],
                ASSISTANT_STORE_PATH=str(output/'history.sqlite3'), DISH_META_PATH=str(output/'dish-index.json'), INGREDIENT_MAP_PATH=str(output/'ingredients.json'),
                PYTHONPATH=os.pathsep.join([str(guard), str(ROOT/'recommend-service'), *[str(p) for p in sys.path if p]]))
            process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', str(state['pythonPort']), '--log-level', 'warning'],
                cwd=output, env=env, stdout=log, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({})); deadline=time.monotonic()+40
            while time.monotonic()<deadline:
                require(process.poll() is None, 'Owned Python service exited')
                try:
                    with opener.open('http://127.0.0.1:'+str(state['pythonPort'])+'/health', timeout=1) as response:
                        if response.status==200:break
                except OSError:time.sleep(.2)
            else:raise AssertionError('Owned Python service did not start')
            a=SettlingAcceptance(state,db,model)
            deadline=time.monotonic()+30
            while time.monotonic()<deadline:
                capabilities=a.http('/assistant/v4/capabilities')
                if 'direct_execution_v1' in capabilities.get('supportedUiFeatures',[]):break
                time.sleep(.5)
            else:raise AssertionError('Actual assistant capability negotiation not ready')
            a.ui_features=[f for f in ['clarification_v1','handoff_v1','meal_requirements_v1','direct_execution_v1'] if f in capabilities['supportedUiFeatures']]
            context={'date':str(datetime.now(timezone(timedelta(hours=8))).date()),'mealType':'dinner','people':2,'compositionMode':'manual','counts':{'meat':1,'veg':1,'soup':0,'staple':0,'dessert':0,'side':0},'requirements':'','ownedIngredients':[],'recommendationPolicy':'balanced-v1'}
            if previous:
                w=a.http('/meal-workspaces/current?'+urllib.parse.urlencode({'date':context['date'],'mealType':'dinner'}))['workspace']
                sessions=a.http('/assistant/v4/sessions')['sessions'];require(len(sessions)==1,'Expected the original synthetic conversation only')
                session=sessions[0]['sessionId']
            else:
                w=a.http('/meal-workspaces',{'requestId':uid(),'expectedWorkspaceRevision':0,'context':context})
                session=a.http('/assistant/v4/sessions',{'requestId':uid(),'workspaceId':w['id']})['sessionId']
            def counts():
                return {'records':a.sql('SELECT COUNT(*) FROM recipe_records WHERE user_id=910001')[0][0],
                    'shopping':a.sql('SELECT COUNT(*) FROM shopping_item i JOIN shopping_dish d ON d.id=i.shopping_dish_id JOIN shopping_list l ON l.id=d.shopping_list_id WHERE l.user_id=910001')[0][0]}
            if retry_number:
                reviewed = validate_reviewed_retry(previous, retry_number, retry_turn,
                    a.http('/assistant/v4/turns/'+retry_turn), a.workspace(w,910001), counts(), ledger.validate()['used'])
                identity=a.sql('SELECT session_id,workspace_id,request_id FROM assistant_v4_turn WHERE user_id=910001 AND id=%s',(retry_turn,))
                require(identity == ((session,reviewed['workspaceId'],reviewed['requestId']),), 'Original owned conversation identity mismatch')
                (output/'reviewed-original-report.json').write_text(json.dumps(previous,ensure_ascii=False,indent=2),encoding='utf-8')
            for index,(kind,question) in enumerate(questions):
                if retry_number and index+1!=retry_number:continue
                if args.complete_run and index+1 not in (2,4,10):continue
                if args.resume_run and next((c for c in reversed(previous['cases']) if c['number']==index+1),{}).get('passed'):continue
                if ledger.validate()['used']>=20:break
                before=a.workspace(w,910001);before_counts=counts();used=ledger.validate()['used'];start=time.monotonic()
                row={'number':index+1,'scenario':kind,'question':question,'requestId':uid(),'sessionId':session,
                     'workspaceId':before['id'],'expectedWorkspaceRevision':before['revision'],
                     'expectedPlanVersion':before['draft']['planVersion'],'status':'submitting','passed':False}
                if retry_number:row['explicitRetestOfTurnId']=retry_turn
                report['cases'].append(row);report['providerHttpAttempts']=ledger.validate()['used']
                (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                if continuing:(base_output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                try:
                    turn_id,_=a.start(910001,before,session,question,request_id=row['requestId'])
                    row.update(turnId=turn_id,status='running')
                    (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                    if continuing:(base_output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                    turn=a.poll(910001,turn_id);after=a.workspace(w,910001);after_counts=counts()
                    row.update(status=turn['status'],reply=turn.get('reply'),cards=turn.get('cards'),beforeDishIds=[d['id'] for d in before['draft']['dishes']],afterDishIds=[d['id'] for d in after['draft']['dishes']],counts=after_counts)
                    (output/f'turn-{index+1:02d}.json').write_text(json.dumps(turn,ensure_ascii=False,indent=2),encoding='utf-8')
                    check_case(kind,before,after,before_counts,after_counts,turn,ingredient_definitions);row['passed']=True
                except Exception as error:row.update(passed=False,error=type(error).__name__+': '+str(error)[:250])
                row.update(providerHttpAttempts=ledger.validate()['used']-used,seconds=round(time.monotonic()-start,2))
                report['providerHttpAttempts']=ledger.validate()['used'];report['metrics']=(previous.get('metrics',[]) if continuing else [])+model.calls
                (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                print(json.dumps({k:row[k] for k in ('number','scenario','passed','providerHttpAttempts','seconds')},ensure_ascii=False),flush=True)
                if row.get('status') in ('queued','running'):break
                if args.profile=='core-enhancement' and not row.get('passed'):break
    finally:
        if process is not None and process.poll() is None:process.terminate();process.wait(timeout=20)
        db.close();report['providerHttpAttempts']=ledger.validate()['used'];report['pythonExited']=process is None or process.poll() is not None
        (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        if continuing:
            (base_output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        elif previous:
            previous['followups']=report['cases'];previous['providerHttpAttempts']=report['providerHttpAttempts']
            (output.parent/'report.json').write_text(json.dumps(previous,ensure_ascii=False,indent=2),encoding='utf-8')
    return report


if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--runtime',required=True);p.add_argument('--budget',required=True);p.add_argument('--authorization-date',required=True);p.add_argument('--approved-live',action='store_true');p.add_argument('--complete-run',action='store_true');p.add_argument('--resume-run',action='store_true');p.add_argument('--retry-reviewed-case',type=int);p.add_argument('--reviewed-turn-id');p.add_argument('--profile',choices=('daily','core-enhancement'),default='daily')
    args=p.parse_args();result=run(args);latest={c['number']:c for c in result['cases']};raise SystemExit(0 if len(latest)==(args.retry_reviewed_case or (3 if args.complete_run else 10)) and all(c['passed'] for c in latest.values()) else 2)
