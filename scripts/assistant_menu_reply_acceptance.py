"""Explicit opt-in live menu acceptance; dedicated generated database, no production.

The credential file is read only by the approved live entry. Each external HTTP
attempt is reserved by the dated ledger before forwarding the real service payload.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import secrets
import time
from types import SimpleNamespace

import assistant_v4_acceptance as runner
import assistant_v4_live_acceptance as live
from assistant_v4_provider_budget import ProviderBudget

class MenuCompletion(live.LiveCompletion):
    def __init__(self,fields,ledger):
        super().__init__(fields,ledger);self.answer_diagnostics=[]
    def complete(self,payload):
        result=super().complete(payload)
        # Synthetic-only, selected public explanation fields; no reasoning or frames.
        try:
            output=json.loads(result['content'])
            self.answer_diagnostics.append({'type':output.get('type'),'answer':output.get('answer'),
                'contractAdvertised':any('本轮回答依据(JSON)' in str(x.get('content','')) for x in payload.get('messages',[])),
                'actionKinds':[s.get('kind') for s in output.get('actionProposal',{}).get('steps',[])]})
        except (ValueError,TypeError,KeyError):pass
        return result

class MenuExecution(live.LiveExecution):
    natural_replies=True
    def __init__(self,fields,budget):
        self.fields=fields;self.ledger=ProviderBudget(budget,authorization_date='2026-10-17')
        self.initial_used=self.ledger.validate()['used'];self.workspace=None;self.session=None
        self.last_saved=None;self.turn_diagnostics=[];self.observations=[]
    def create_model(self):return MenuCompletion(self.fields,self.ledger)
    def cases(self):
        return [{'id':key,'scenario':mode} for key,mode in (
            ('MENU01','generate'),('MENU02','replace'),('MENU03','read'),
            ('MENU04','compare'),('MENU05','temporary'),('MENU06','save'),
            ('MENU07','shopping'),('MENU08','vague'))]
    def run_case(self,a,case,index):
        original=a.turn
        def observed(*args,**kwargs):
            result=original(*args,**kwargs)
            self.observations.append({'caseId':case['id'],'status':result.get('status'),
                'reply':result.get('reply'),'cards':[c.get('type') for c in result.get('cards',[])],
                'pending':bool(result.get('pendingAction'))})
            return result
        a.turn=observed
        try:
            mode=case['scenario']
            if self.workspace is None and mode!='generate':
                for row in a.sql('SELECT CAST(state_json AS CHAR) FROM meal_workspace WHERE user_id=910001 ORDER BY updated_at DESC'):
                    candidate=json.loads(row[0])
                    if len(candidate.get('draft',{}).get('dishes',[]))>=2:
                        self.workspace=a.workspace(candidate,910001)
                        self.session=a.http('/assistant/v4/sessions',{'requestId':runner.uid(),'workspaceId':self.workspace['id']},910001)['sessionId'];break
            if mode not in ('compare','temporary','vague'):
                return super().run_case(a,case,index)
            runner.require(self.workspace is not None,'Generation prerequisite not completed')
            self.workspace=a.workspace(self.workspace,910001);w=self.workspace
            before=a.counts(910001);prefs=a.sql('SELECT * FROM user_preference WHERE USER_ID=910001')
            dishes=w['draft']['dishes'];runner.require(len(dishes)>=2,'Menu comparison prerequisite missing')
            messages={
                'compare':f"只比较{dishes[0]['name']}和{dishes[1]['name']}，哪道更省时？用现有数据简短解释，给出真实菜品卡，不要修改菜单。",
                'temporary':'仅这餐不吃鸡蛋，请调整当前菜单，长期偏好不变，不保存日历。',
                'vague':'这餐想吃得简单一点。先问我需要明确的条件，不要自行设定用时。'}
            turn=a.turn(910001,w,self.session,messages[mode])
            after=a.workspace(w,910001)
            runner.require(a.counts(910001)==before,'Read or draft unexpectedly wrote business records')
            runner.require(a.sql('SELECT * FROM user_preference WHERE USER_ID=910001')==prefs,'Temporary request changed long-term preferences')
            runner.require(not turn.get('pendingAction'),'Read or draft unexpectedly created confirmation task')
            if mode=='temporary':
                runner.require(turn['status']=='completed','Temporary requirement was not applied')
                runner.require('鸡蛋' in after['context']['criteria']['excludedIngredients'],'Temporary excluded ingredient missing')
                for dish in after['draft']['dishes']:
                    runner.require('鸡蛋' not in ''.join(str(v or '') for v in a.sql('SELECT CL,INGREDIENTS_AMOUNTS FROM food WHERE ID=%s',(dish['id'],))[0]),'Forbidden ingredient remained')
            elif mode=='vague':
                runner.require(turn['status']=='needs_input' and not turn.get('retryable'),'Vague request did not produce useful clarification')
                runner.require(after==w,'Vague request changed current menu')
            else:
                runner.require(turn['status']=='completed' and turn.get('cards'),'Comparison lacks real dish facts')
                runner.require(after==w,'Comparison changed menu')
                runner.require(len(turn.get('reply',''))<=280,'Comparison reply is not concise')
                runner.require('这次读到' not in turn.get('reply','') and ('更快' in turn.get('reply','') or '更省时' in turn.get('reply','') or '相同' in turn.get('reply','')),'Comparison still fell back instead of explaining actual time relation')
            return {'businessOutcome':'clarified' if mode=='vague' else 'passed','turnStatus':turn['status']}
        finally:a.turn=original
    def finish_report(self,report,model):
        super().finish_report(report,model);report['publicSyntheticObservations']=self.observations
        report['syntheticAnswerDiagnostics']=model.answer_diagnostics


def bootstrap(jar,out):
    spec=importlib.util.spec_from_file_location('menu_owned_runtime',runner.ROOT/'scripts/local_v4.py')
    runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
    runtime.DATA=runner.ROOT/('.local-maturity-assistant-menu-20261017-'+secrets.token_hex(4))
    runtime.start(SimpleNamespace(java='D:/Java/bin/java.exe',mysqld='C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe',jar=str(jar),legacy_backup=None))
    state=runtime.read_state()
    try:runtime.wait_for_basic_api(state)
    finally:
        runtime.stop_owned(state['javaPid'],runtime.java_process_markers(state))
        runtime.stop_owned(state['mysqlPid'],['--no-defaults','--datadir='+(runtime.DATA/'mysql').as_posix()])
    deadline=time.monotonic()+12
    while any(runtime.process_command(state.get(k)) for k in ('mysqlPid','javaPid')):
        runner.require(time.monotonic()<deadline,'Bootstrap children did not stop');time.sleep(.1)
    manifest={'purpose':'assistant-v4-synthetic-acceptance','syntheticOnly':True,'providerMode':'live',
        'isolatedApiBase':state['api'],'database':state['database'],'users':[910001,910002],
        'privateDirectory':str(runtime.DATA),'jarSha256':runner.sha(jar)}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    return manifest


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--budget',required=True)
    parser.add_argument('--jar',required=True);parser.add_argument('--approved-live',action='store_true');parser.add_argument('--cases');parser.add_argument('--manifest')
    args=parser.parse_args();runner.require(args.approved_live,'Explicit approved live entry required')
    out=Path(args.out).resolve();runner.require(out.is_relative_to(runner.ROOT/'.superpowers'),'Evidence must remain in ignored task workspace')
    out.mkdir(parents=True,exist_ok=False)
    fields=live.approved_provider_fields(runner.ROOT/'recommend-service/.env')
    execution=MenuExecution(fields,args.budget);jar=Path(args.jar).resolve()
    manifest=runner.validate_manifest(json.loads(Path(args.manifest).read_text(encoding='utf-8')),'live') if args.manifest else bootstrap(jar,out)
    report=runner.run_owned(manifest,jar,out/'result.json',set(args.cases.split(',')) if args.cases else None,execution)
    return 0 if report['passed']==report['total'] else 1
if __name__=='__main__':raise SystemExit(main())
