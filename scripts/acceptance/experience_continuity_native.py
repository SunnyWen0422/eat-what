"""Keep a NEW E17-owned stack alive for the native driver; no alternate runtime."""
import argparse
from datetime import date
import json
import os
import secrets
from pathlib import Path
import subprocess
import sys
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from maturity_runtime import ROOT, new_output, owned_runtime, preflight
from assistant_v4_acceptance import bearer


def temporary_semantics(runtime):
    """Minimal scripted proposal through the real Java/Python/owned DB chain.

    This is a model double, not a replacement for the retained live failure.
    """
    from datetime import timedelta
    from assistant_v4_acceptance import require
    a=runtime.api;user=910002
    context={'date':str(date.today()-timedelta(days=10)),'mealType':'lunch','people':2,
             'compositionMode':'manual','counts':{'meat':1,'veg':1,'soup':1},'requirements':'','ownedIngredients':[]}
    w=a.http('/meal-workspaces',{'requestId':str(uuid.uuid4()),'expectedWorkspaceRevision':0,'context':context},user)
    a.http('/meal-workspaces/'+w['id']+'/commands',{'requestId':str(uuid.uuid4()),'command':'generate',
           'expectedWorkspaceRevision':w['revision'],'planVersion':w['draft']['planVersion']},user)
    until=time.monotonic()+30
    while True:
        w=a.workspace(w,user)
        if w['status']!='generating':break
        require(time.monotonic()<until,'Scripted prerequisite generation timed out');time.sleep(.1)
    require(w['status']=='draft','Scripted prerequisite did not produce public draft')
    before=w;preferences=a.http('/users/preferences',user=user);counts=a.counts(user)
    session=a.http('/assistant/v4/sessions',{'requestId':str(uuid.uuid4()),'workspaceId':w['id']},user)['sessionId']
    ids=[d['id'] for d in w['draft']['dishes']]
    turn=a.turn(user,w,session,'E18 合成未解释文字提案',steps=[{'kind':'draft_update','arguments':{
        'operation':'adjust','contextPatch':{'requirements':'少油'},'keepDishIds':ids}}])
    from run_maturity_live import require_temporary_requirement
    require_temporary_requirement(turn,before,a.workspace(w,user),preferences,a.http('/users/preferences',user=user))
    require(a.counts(user)==counts,'Unsupported proposal changed persistent plans/shopping/actual')
    # Choose a concrete exclusion absent from every current public recipe;
    # this checks the legal structural path without inventing replacement IDs.
    text=json.dumps(w['draft']['dishes'],ensure_ascii=False)
    ingredient=next(item for item in ['花生','榴莲','芥末'] if item not in text)
    structured=a.turn(user,w,session,'E18 合成结构化本餐排除',steps=[{'kind':'draft_update','arguments':{
        'operation':'adjust','contextPatch':{'criteria':{'excludedIngredients':[ingredient]}},'selectedDishIds':ids}}])
    current=a.workspace(w,user)
    require(structured['status']=='completed' and any(c.get('receiptRef') for c in structured.get('cards',[])),
            'Legal structured temporary filter lost executor receipt')
    require(ingredient in current['context']['criteria']['excludedIngredients'] and preferences==a.http('/users/preferences',user=user),
            'Structured temporary filter changed long-term preferences or was not applied')
    require(a.counts(user)==counts,'Draft filter fabricated plan/shopping/actual')
    return {'providerMode':'mock','rawText':{'status':turn['status'],'retryable':turn.get('retryable'),
            'workspaceUnchanged':True,'actionableNextStep':True},
            'structuredFilter':{'status':structured['status'],'receiptPresent':True,'longTermPreferencesUnchanged':True},
            'persistentCountsUnchanged':True}


def run(args):
    if Path(args.driver).resolve() != ROOT / 'scripts/acceptance/experience-continuity-native.cjs':
        raise ValueError('Only the canonical E18 driver is allowed')
    config = json.loads(Path(args.config).read_text(encoding='utf-8-sig'))
    # Full preflight must precede even the coordinator output; the owning
    # context repeats it so a changed port/HEAD cannot use the earlier check.
    out = new_output(args.out)
    preflight(config, out)
    out.mkdir(parents=True)
    with owned_runtime(config, out / 'owned-runtime') as runtime:
        semantic=temporary_semantics(runtime)
        (out/'temporary-semantics.json').write_text(json.dumps(semantic,indent=2),encoding='utf-8')
        accounts = {}
        for role, user_id in [('admin', 910001), ('ordinary', 910002)]:
            user = runtime.api.http('/users/info', user=user_id)['user']
            accounts[role] = {'token': bearer(runtime.state, user_id), 'user': user}
        ids = [int(row[0]) for row in runtime.api.sql("SELECT id FROM food WHERE user_id IS NULL AND TYPE IN ('meat','veg','soup') ORDER BY id LIMIT 3")]
        day = str(date.today())
        for user_id in [910001, 910002]:
            runtime.api.http('/recipe-records', {'recordDateString':day,'mealType':'dinner','recipeName':'E18合成验收餐','dishIds':ids,'people':2}, user=user_id)
        nonce = secrets.token_urlsafe(32)
        session = {'purpose':'E18-new-owned-native','sourceSha':config['sourceSha'],'ownerPid':os.getpid(),'nonce':nonce,
                   'api':config['loopbackApi'],'accounts':accounts,
                   'fingerprints':{k:config[k] for k in ['sourceSha','jarSha256','datasetHash','buildSourceFingerprint']},
                   'queries':{'dish-detail':'?id='+str(ids[0]), 'meal-cooking':'?recipeId='+str(ids[0]),'custom-dishes':'?copy='+str(ids[0]),
                              'admin':'?legacy=1','admin-user-detail':'?id=910002',
                              'calendar-detail':'?date='+day+'&mealType=dinner',
                              'result':'?date='+day+'&mealType=dinner'}}
        session_file = out / 'private-native-session.json'
        session_file.write_text(json.dumps(session), encoding='utf-8')
        command = [args.node,args.driver,'--mode','service','--config',args.config,
                   '--session',str(session_file),'--out',str(out / 'native'),'--python',args.python,
                   '--port',args.port,'--width',args.width,'--widths',args.widths]
        for key in ['sdk','cli','cases']:
            if getattr(args,key): command += ['--'+key,getattr(args,key)]
        if args.prepare_only: command += ['--prepare-only']
        if args.remote: command += ['--remote']
        before = {str(u):int(runtime.api.sql('SELECT COUNT(*) FROM food WHERE user_id=%s',(u,))[0][0]) for u in [910001,910002]}
        # Page modules and administrative reset snapshots cache initial data.
        # A distinct cold export per factor prevents an acceptance adapter from
        # hiding that product limitation. Same explicitly owned stack, no adoption.
        font_runs=[]; code=0
        for factor in args.scales.split(','):
            single=list(command)
            single[single.index('--out')+1]=str(out/('native-font'+factor))
            single += ['--scales',factor]
            child = subprocess.Popen(single, env=dict(os.environ,EATWHAT_E18_CHILD=nonce),
                                     creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            try:
                result = child.wait(timeout=3600)
            except BaseException:
                child.terminate(); child.wait(timeout=20)
                raise
            font_runs.append({'fontScale':float(factor),'exitCode':result,'evidence':single[single.index('--out')+1]})
            if result: code=result; break
        after = {str(u):int(runtime.api.sql('SELECT COUNT(*) FROM food WHERE user_id=%s',(u,))[0][0]) for u in [910001,910002]}
        receipt = {'sourceSha':config['sourceSha'],'fingerprints':session['fingerprints'],
                   'lifecycleEnabled':True,'providerMode':'mock','authentication':'local-v4 synthetic, not WeChat SSO',
                   'copyCountsBefore':before,'copyCountsAfter':after,'nativeExitCode':code,'fontRuns':font_runs,
                   'realDeviceProof':False,'runtimeManifest':'owned-runtime/private/runtime.json'}
        (out / 'service-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    return code


if __name__ == '__main__':
    p=argparse.ArgumentParser()
    for key in ['config','out','node','driver','python','port','width','widths','scales']:p.add_argument('--'+key,required=True)
    for key in ['sdk','cli','cases']:p.add_argument('--'+key)
    p.add_argument('--prepare-only',action='store_true');p.add_argument('--remote',action='store_true')
    sys.exit(run(p.parse_args()))
