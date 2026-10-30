"""Opt-in owned canonical Java -> actual FastAPI -> mock HTTP provider acceptance.

Imported by the canonical runtime only. No substitute main app, no production
configuration, and no provider credentials are loaded. Children are owned handles.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import timedelta

from assistant_v4_acceptance import Acceptance as BaseAcceptance, MockCompletion, local_provider, require, uid

ROOT = Path(__file__).resolve().parents[1]


class Acceptance(BaseAcceptance):
    """Canonical client continuation; legacy confirmation acceptance keeps its own poll."""
    def poll(self, user, turn_id):
        deadline=time.monotonic()+40
        resumed=set()
        result=None
        while time.monotonic()<deadline:
            if result is None:
                result=self.http('/assistant/v4/turns/'+turn_id,user=user)
            require(isinstance(result,dict) and result.get('turnId')==turn_id,
                    'Canonical assistant turn identity differs')
            if result.get('status') in ('queued','running'):
                result=None;time.sleep(.07);continue
            continuation=result.get('continuation') or {}
            steps=continuation.get('steps') or []
            cursor=continuation.get('cursor')
            normal_checkpoint=(result.get('status')=='awaiting_confirmation'
                and result.get('pendingAction') is None
                and isinstance(cursor,int) and not isinstance(cursor,bool)
                and 0<=cursor<len(steps) and steps[cursor].get('status')=='pending'
                and (not result.get('reply') or result.get('retryable') is False))
            if not normal_checkpoint:
                return result
            # Resume the existing durable step, never resend the model question,
            # create a new turn, or confirm an actual pending write preview.
            checkpoint=(continuation.get('revision'),cursor,steps[cursor].get('stepId'))
            if checkpoint not in resumed:
                resumed.add(checkpoint)
                result=self.http('/assistant/v4/turns/'+turn_id+'/resume',{},user)
            else:
                result=None;time.sleep(.07)
        raise AssertionError('Canonical turn did not settle within 40 seconds')


def fixed_menu_facts(dishes):
    require(bool(dishes), 'Assistant returned an empty menu')
    facts = []
    for dish in dishes:
        recipe = dish['recipe']
        require(dish.get('quantityPolicy') == recipe.get('quantityPolicy') == 'fixed-recipe-v1',
                'Assistant returned a different quantity policy')
        facts.append({'id': dish['id'], 'ingredients': recipe['ingredients'], 'steps': recipe['steps'],
                      'nutrition': recipe['calculatedNutrition']})
    return facts


def shopping_quantities(preview):
    return [[{key: item.get(key) for key in ('canonicalName', 'normalizedVariant', 'quantityValue',
             'quantityText', 'quantityKind', 'unitCode', 'sourceQuantityText')} for item in dish['items']]
            for dish in preview['dishes']]


def begin_shared_generation(acceptance, user, context, readiness_timeout=15):
    """Observe real Java/Python negotiation before submitting one business turn."""
    started = time.monotonic()
    attempts = 0
    while True:
        capabilities = acceptance.http('/assistant/v4/capabilities', user=user)
        attempts += 1
        ready = (capabilities.get('enabled') is True
                 and 'read_favorites' in capabilities.get('reads', [])
                 and 'clarification_v1' in capabilities.get('supportedUiFeatures', []))
        if ready:
            break
        require(time.monotonic() - started < readiness_timeout,
                'Actual Java/Python assistant capability negotiation did not become ready')
        time.sleep(.25)
    readiness = {'attempts': attempts, 'elapsedSeconds': round(time.monotonic() - started, 3),
                 'observedVia': '/assistant/v4/capabilities'}
    workspace = acceptance.http('/meal-workspaces', {'requestId':uid(),'expectedWorkspaceRevision':0,'context':context}, user)
    session = acceptance.http('/assistant/v4/sessions', {'requestId':uid(),'workspaceId':workspace['id']}, user)['sessionId']
    turn = acceptance.turn(user, workspace, session, 'canonical breakfast ' + uid(),
        [{'kind':'draft_update','arguments':{'operation':'generate','selectionMode':'recommend'}}])
    return workspace, session, turn, readiness


def run(state, db, output, diagnostic=False):
    destination = Path(output).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    parsed = urllib.parse.urlparse(state['api'])
    require(parsed.scheme == 'http' and parsed.hostname == '127.0.0.1' and parsed.path == '/api', 'Owned loopback API required')
    require(re.fullmatch(r'eatwhat_catalog_local_[0-9a-f]{8}', state['database']) is not None, 'Owned canonical database required')
    require(1024 < int(state['dbPort']) < 65536 and 1024 < int(state['pythonPort']) < 65536, 'Owned service ports required')
    guard = destination / 'python-guard'
    guard.mkdir(exist_ok=True)
    (guard / 'sitecustomize.py').write_text('''import socket
_real_connect=socket.socket.connect
_real_connect_ex=socket.socket.connect_ex
_real_getaddrinfo=socket.getaddrinfo
def _allowed(host):
    if str(host) not in ('127.0.0.1','localhost','::1'):raise RuntimeError('External network forbidden in canonical acceptance')
def _connect(self,address):
    if isinstance(address,tuple):_allowed(address[0])
    return _real_connect(self,address)
def _connect_ex(self,address):
    if isinstance(address,tuple):_allowed(address[0])
    return _real_connect_ex(self,address)
def _resolve(host,*args,**kwargs):
    _allowed(host)
    return _real_getaddrinfo(host,*args,**kwargs)
socket.socket.connect=_connect
socket.socket.connect_ex=_connect_ex
socket.getaddrinfo=_resolve
''', encoding='utf-8')
    model = MockCompletion()
    with local_provider(model) as provider:
        environment = os.environ.copy()
        for key in list(environment):
            if 'PROXY' in key.upper() or key.endswith('API_KEY'):
                environment.pop(key, None)
        environment.update(EATWHAT_DISABLE_DOTENV='1', PYTHONUTF8='1', PYTHONDONTWRITEBYTECODE='1',
            DB_HOST='127.0.0.1', DB_PORT=str(state['dbPort']), DB_NAME=state['database'],
            DB_USER=state.get('dbUser', 'root'), DB_PASSWORD=state['password'],
            MEAL_WORKSPACE_SERVICE_TOKEN=state['serviceToken'], DEEPSEEK_API_KEY='owned-mock-only',
            DEEPSEEK_BASE_URL=provider, DEEPSEEK_MODEL='owned-fixture', DASHSCOPE_API_KEY='',
            CATALOG_SERVICE_BASE_URL=state['api'][:-4],
            ASSISTANT_STORE_PATH=str(destination / 'assistant-history.sqlite3'),
            DISH_META_PATH=str(destination / 'dish-index.json'), INGREDIENT_MAP_PATH=str(destination / 'ingredient-index.json'))
        paths = [str(guard), str(ROOT / 'recommend-service'), *[str(path) for path in sys.path if path]]
        environment['PYTHONPATH'] = os.pathsep.join(paths)
        app_module = 'main:app'
        if diagnostic:
            # Opt-in local observation only: call the unchanged real step function,
            # preserving its exact input, output and exception for boundary diagnosis.
            trace = destination / 'private'
            trace.mkdir(exist_ok=True)
            environment['CANONICAL_STEP_TRACE'] = str(trace / 'step-boundary.jsonl')
            (guard / 'canonical_trace_app.py').write_text('''import json,os
from pathlib import Path
from main import app
import assistant_v4_step
_real_step=assistant_v4_step.run_step_async
def _record(value):
    with Path(os.environ['CANONICAL_STEP_TRACE']).open('a',encoding='utf-8') as stream:
        stream.write(json.dumps(value,ensure_ascii=False)+'\\n')
async def observed_step(body,*args,**kwargs):
    _record({'kind':'request','body':body})
    try:
        result=await _real_step(body,*args,**kwargs)
    except Exception as error:
        _record({'kind':'failure','type':type(error).__name__,'message':str(error)})
        raise
    _record({'kind':'response','body':result})
    return result
assistant_v4_step.run_step_async=observed_step
''', encoding='utf-8')
            app_module = 'canonical_trace_app:app'
        # Exercise the real DB/RAG adapter and Java calculator before starting the service.
        probe = '''import json
import db, rag, catalog_service
metadata,rows=db.fetch_canonical_catalog()
assert len(rows)==5407, len(rows)
rag.build_index()
assert len(rag._dish_meta)==5407
breakfast=rag.search_candidates('', {'meal_codes':['MEAL_BREAKFAST']})
assert breakfast
result=catalog_service.scale_recipe(rows[0]['id'],3)
assert result['catalogRevision']==metadata['catalogRevision']
assert result['recipeId']==rows[0]['id'] and result['ingredients'] and result['steps']
print(json.dumps({'catalogRevision':metadata['catalogRevision'],'catalogRows':len(rows),'breakfastRows':len(breakfast),'scaledRecipeId':result['recipeId']}))
'''
        checked = subprocess.run([sys.executable, '-c', probe], env=environment, cwd=destination,
                                 capture_output=True, text=True, encoding='utf-8', timeout=90)
        (destination / 'python-adapter.log').write_text(checked.stdout + checked.stderr, encoding='utf-8')
        require(checked.returncode == 0, 'Actual canonical Python adapter failed; inspect private python-adapter.log')
        facts = json.loads(checked.stdout.strip().splitlines()[-1])
        log = (destination / 'python-service.log').open('w', encoding='utf-8')
        process = subprocess.Popen([sys.executable, '-m', 'uvicorn', app_module, '--host', '127.0.0.1',
                                   '--port', str(state['pythonPort']), '--log-level', 'warning'],
                                  cwd=destination, env=environment, stdout=log, stderr=subprocess.STDOUT,
                                  creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            origin = 'http://127.0.0.1:' + str(state['pythonPort'])
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                require(process.poll() is None, 'Actual FastAPI child exited; inspect private python-service.log')
                try:
                    with opener.open(origin + '/health', timeout=1) as response:
                        if response.status == 200: break
                except OSError: time.sleep(.1)
            else: raise AssertionError('Actual FastAPI startup timed out')
            acceptance = Acceptance(state, db, model)
            user = 910001
            context = {'date': str(acceptance.day), 'mealType': 'breakfast', 'people': 3,
                       'compositionMode': 'manual', 'counts': {'meat':0,'veg':0,'soup':0,'staple':1,'dessert':0},
                       'requirements':'', 'ownedIngredients':[], 'recommendationPolicy':'balanced-v1'}
            workspace, session, turn, readiness = begin_shared_generation(acceptance, user, context)
            require(turn['status']=='completed', 'Actual Java/Python shared generation did not complete: '+str(turn.get('status')))
            workspace = acceptance.workspace(workspace, user)
            selected = workspace['draft']['dishes']
            require(selected and all('MEAL_BREAKFAST' in dish['recipe']['mealCodes'] for dish in selected), 'Shared generation ignored canonical meal facts')
            original = fixed_menu_facts(selected)
            require(workspace['draft'].get('canUndo') is False, 'First menu must not offer undo to an empty state')
            replaced = acceptance.turn(user, workspace, session, 'canonical replace one ' + uid(),
                [{'kind':'draft_update','arguments':{'operation':'adjust','targetDishId':selected[0]['id'],'selectionMode':'recommend'}}])
            require(replaced['status']=='completed', 'Actual assistant single replacement did not complete')
            workspace = acceptance.workspace(workspace, user)
            selected = workspace['draft']['dishes']
            require(fixed_menu_facts(selected)!=original and workspace['draft'].get('canUndo') is True,
                    'Actual menu change did not create a single undo target')
            before = fixed_menu_facts(selected)
            selected_ids = [dish['id'] for dish in selected]
            shopping_before = acceptance.http('/shopping-list/preview',
                {'dishIds':selected_ids, 'targetPeople':3, 'clientRequestId':uid()}, user)
            changed = acceptance.turn(user, workspace, session, 'canonical share with eight ' + uid(),
                [{'kind':'draft_update','arguments':{'operation':'adjust','contextPatch':{'people':8}}}])
            require(changed['status'] == 'completed', 'Actual assistant diner adjustment did not complete')
            workspace = acceptance.workspace(workspace, user)
            require(workspace['context']['people'] == 8, 'Assistant did not update diners')
            require(fixed_menu_facts(workspace['draft']['dishes']) == before,
                    'Assistant diner adjustment changed dish quantities, steps or whole nutrition')
            require(not any(card.get('data',{}).get('canUndo') for card in changed.get('cards',[])),
                    'Configuration reply incorrectly offered menu undo')
            shopping_after = acceptance.http('/shopping-list/preview',
                {'dishIds':selected_ids, 'targetPeople':8, 'clientRequestId':uid()}, user)
            require(shopping_quantities(shopping_after) == shopping_quantities(shopping_before),
                    'Assistant diner adjustment changed shopping quantities')
            undone = acceptance.turn(user, workspace, session, 'canonical undo menu replacement ' + uid(),
                [{'kind':'draft_update','arguments':{'operation':'undo'}}])
            require(undone['status'] == 'completed', 'Assistant menu replacement could not be undone')
            workspace = acceptance.workspace(workspace, user)
            require(workspace['context']['people'] == 8 and fixed_menu_facts(workspace['draft']['dishes']) == original,
                    'Assistant menu undo changed current diners or lost the original menu')
            require(workspace['draft'].get('canUndo') is False and not workspace['draft'].get('history'),
                    'Assistant menu undo did not consume its sole target')
            selected = workspace['draft']['dishes']
            recipe_id = selected[0]['id']
            turn = acceptance.turn(user, workspace, session, 'canonical methods ' + uid(), reads=[
                {'name':'get_dish_methods','arguments':{'dish_id':recipe_id}},
                {'name':'search_by_ingredients','arguments':{'ingredients':[selected[0]['recipe']['ingredients'][0]['ingredientId']],
                    'filters':{'meal_codes':['MEAL_BREAKFAST']},'top_k':3}}])
            require(turn['status']=='completed', 'Actual Java canonical reads failed Python schema validation: '+str(turn.get('status')))
            acceptance.http('/assistant/v4/sessions/'+session, user=910002, allowed=(404,))
            # Retired generators fail explicitly; their history endpoints remain separate.
            request = urllib.request.Request(origin+'/recommend',data=b'{}',headers={'Content-Type':'application/json'})
            try: opener.open(request,timeout=3);raise AssertionError('Standalone selector still available')
            except urllib.error.HTTPError as error:require(error.code==410,'Unexpected retired-selector status')
            report = {**facts, 'actualFastApi':True,'diagnostic':diagnostic,'capabilityReadiness':readiness,'javaSharedGeneration':'passed','javaPythonCanonicalReads':'passed',
                      'assistantPeopleChange':{'from':3,'to':8,'fixedMenu':True,'fixedShopping':True,'configurationUndoOffered':False},
                      'assistantMenuUndo':{'restoredPriorMenu':True,'preservedCurrentPeople':True,'consumedOnce':True},
                      'ownerIsolation':'passed','mockProviderHttpCalls':len(model.calls),'externalProviderCalls':0,
                      'legacySelectorStatus':410}
            (destination / 'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            return report
        finally:
            if diagnostic:
                (destination / 'private/mock-provider-calls.json').write_text(json.dumps(model.calls),encoding='utf-8')
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=8)
                except subprocess.TimeoutExpired: process.kill();process.wait(timeout=5)
            log.close()
            (destination / 'child-cleanup.json').write_text(json.dumps({'pythonProcessExited':process.poll() is not None,
                                                                        'pythonExitCode':process.returncode}),encoding='utf-8')
