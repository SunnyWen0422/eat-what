"""Coordinator-only live synthetic acceptance. Never enabled by test discovery.

The shared owned launcher keeps Java/Python/MySQL on loopback. A local forwarding
completion server passes the actual Python payload to the configured supplier.
Every external attempt is reserved before HTTP; no mocked model output is used.
"""
from __future__ import annotations
import argparse
import importlib.util
from datetime import date, timedelta
import json
from pathlib import Path
import statistics
import time
import urllib.parse

import assistant_v4_acceptance as runner
from assistant_v4_provider_budget import ProviderBudget, BudgetExhausted

FIELDS={'DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL','DEEPSEEK_MODEL'}
UNAVAILABLE='本次智能理解暂不可用，请明确需求或稍后重试。'
READS={'search_dishes','search_by_ingredients','get_dish_details','get_dish_methods','read_current_meal','read_calendar','read_shopping','read_actual_diet_review'}

def selected_cases(value):
    result=value.split(',') if value else None
    runner.require(result is None or all(x in {'LIVE01','LIVE02','LIVE03','LIVE04','LIVE05','LIVE06'} for x in result),'Unknown live case selection')
    return result

def text_category(value):
    if not isinstance(value,str) or not value:return 'empty'
    if value==UNAVAILABLE:return 'unavailable'
    for words,category in (('日期 哪天 明天','date'),('餐次 早餐 午餐 晚餐','meal'),('人数 几人 个人','people'),('菜品 哪道','dish')):
        if any(word in value for word in words.split()):return category
    return 'other_text'

def safe_keys(value,allowed):
    if not isinstance(value,dict):return {'keys':[],'unknownKeyCount':0}
    return {'keys':sorted(set(value)&allowed),'unknownKeyCount':len(set(value)-allowed)}

VALIDATION_CODES={'invalid value','invalid type','invalid enum','invalid fields','invalid array length','invalid string length','invalid date',
    'invalid string value','invalid number','invalid tool JSON','duplicate JSON field','invalid JSON constant','invalid date range','invalid date cursor','duplicate call id',
    'invalid final output','unsourced dish','duplicate dish','action not enabled'}

def validation_code(error):
    return str(error) if str(error) in VALIDATION_CODES else 'other_validation_error'

def schema_failure(module,value,schema,path):
    """Find a failing schema-owned path; never use provider keys or values in paths."""
    try:module.validate(value,schema);return None
    except module.StepValidationError as error:failure={'code':validation_code(error),'path':path}
    if isinstance(value,dict):
        for key,child in schema.get('properties',{}).items():
            if key in value:
                detail=schema_failure(module,value[key],child,path+'.'+key)
                if detail:return detail
    if isinstance(value,list) and 'items' in schema:
        for child in value:
            detail=schema_failure(module,child,schema['items'],path+'[]')
            if detail:return detail
    return failure

def tool_diagnostics(message):
    # This module is dependency-free: no config, provider, database or network import.
    spec=importlib.util.spec_from_file_location('acceptance_diagnostic_schema',runner.ROOT/'recommend-service/assistant_v4_schema.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    try:module.assistant_calls(message,READS);validation={'passed':True,'code':None}
    except module.StepValidationError as error:validation={'passed':False,'code':validation_code(error)}
    calls=message.get('tool_calls');details=[]
    if not isinstance(calls,list):return validation,details
    for call in calls:
        detail={'callType':type(call).__name__,'callKeys':safe_keys(call,{'id','type','function','index'})}
        try:module.tool_call(call,READS);detail['validation']={'passed':True,'code':None}
        except module.StepValidationError as error:detail['validation']={'passed':False,'code':validation_code(error)}
        function=call.get('function') if isinstance(call,dict) else None
        detail['functionType']=type(function).__name__;detail['functionKeys']=safe_keys(function,{'name','arguments'})
        if isinstance(function,dict):
            name=function.get('name');detail['name']=name if isinstance(name,str) and name in READS else 'unknown'
            arguments=function.get('arguments');detail['argumentsType']=type(arguments).__name__
            try:parsed=module.strict_json(arguments)
            except (TypeError,ValueError):detail['argumentParse']='invalid_json'
            else:
                detail['argumentParse']='json';detail['argumentType']=type(parsed).__name__
                schema=module.TOOL_ARGUMENTS.get(name,{}) if isinstance(name,str) else {}
                props=schema.get('properties',{})
                detail['argumentKeys']=safe_keys(parsed,set(props))
                if isinstance(parsed,dict):
                    detail['argumentFields']={key:{'present':key in parsed,'type':type(parsed[key]).__name__ if key in parsed else 'missing',
                        'null':key in parsed and parsed[key] is None,'blank':isinstance(parsed.get(key),str) and not parsed[key].strip()} for key in props}
                if schema:detail['argumentValidation']=schema_failure(module,parsed,schema,'arguments')
        details.append(detail)
    return validation,details

def final_diagnostic(message,payload):
    spec=importlib.util.spec_from_file_location('acceptance_final_diagnostic_schema',runner.ROOT/'recommend-service/assistant_v4_schema.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    output=module.strict_json(message['content'])
    proposal=output.get('actionProposal');steps=proposal.get('steps') if isinstance(proposal,dict) else None
    result={'proposalType':type(proposal).__name__,'proposalKeys':safe_keys(proposal,{'steps'}),
        'stepsType':type(steps).__name__,'stepCount':len(steps) if isinstance(steps,list) else None,'steps':[]}
    # Mirror the final-frame schema used by run_step, with its actual validator.
    frame=module.obj({'role':module.string(20,['assistant']),'content':module.string(20000),
        'reasoning_content':module.nullable(module.string(60000)),
        'tool_calls':module.array({'type':'object'},0)},['role','content'])
    result['frameValidation']=schema_failure(module,message,frame,'message')
    messages=payload.get('messages',[]) if isinstance(payload,dict) else []
    first_user=next((item for item in messages if item.get('role')=='user'),{})
    text=first_user.get('content');prefix='当前授权上下文资料(JSON)：'
    if not isinstance(text,str) or not text.startswith(prefix):
        result['validation']={'passed':None,'code':'trusted_context_unavailable'};return result
    context=module.strict_json(text[len(prefix):]);module.validate(context,module.CONTEXT)
    enabled=set(context['capabilities'])&set(module.ACTION_ARGUMENTS)
    ids={dish['id'] for dish in context.get('activeMeal',{}).get('currentDishes',[]) if 'id' in dish}
    # Only server-created tool-role read results can extend the authorized set.
    for frame in messages:
        if frame.get('role')!='tool':continue
        read=module.strict_json(frame['content']);module.read_result(read)
        if read['name'] in module.READS[:4]:ids.update(dish['id'] for dish in read['items'] if 'id' in dish)
        elif read['name']=='read_current_meal':
            for meal in read['items']:ids.update(dish['id'] for dish in meal.get('currentDishes',[]) if 'id' in dish)
    result['authorizedDishCount']=len(ids);result['enabledActions']=sorted(enabled)
    try:module.final_output(output,ids,enabled);result['validation']={'passed':True,'code':None}
    except module.StepValidationError as error:result['validation']={'passed':False,'code':validation_code(error)}
    for step in steps if isinstance(steps,list) else []:
        detail={'type':type(step).__name__,'keys':safe_keys(step,{'kind','arguments'})}
        if isinstance(step,dict):
            kind=step.get('kind');schema=module.ACTION_ARGUMENTS.get(kind,{}) if isinstance(kind,str) else {}
            detail['kind']=kind if isinstance(kind,str) and kind in enabled else 'unknown_or_disabled'
            arguments=step.get('arguments');props=schema.get('properties',{})
            detail['argumentsType']=type(arguments).__name__;detail['argumentKeys']=safe_keys(arguments,set(props))
            if isinstance(arguments,dict):
                detail['argumentFields']={key:{'present':key in arguments,'type':type(arguments[key]).__name__ if key in arguments else 'missing',
                    'null':key in arguments and arguments[key] is None,'blank':isinstance(arguments.get(key),str) and not arguments[key].strip()} for key in props}
            if schema:detail['argumentValidation']=schema_failure(module,arguments,schema,'actionProposal.steps[].arguments')
        result['steps'].append(detail)
    return result

def message_diagnostic(message,payload=None):
    result={'messageType':type(message).__name__}
    result.update(safe_keys(message,{'role','content','reasoning_content','tool_calls','refusal','function_call','annotations','audio'}))
    if not isinstance(message,dict):return result
    result['fieldTypes']={key:type(message[key]).__name__ if key in message else 'missing' for key in ('content','tool_calls')}
    calls=message.get('tool_calls')
    result['toolNames']=[name if isinstance(name,str) and name in READS else 'unknown' for call in (calls if isinstance(calls,list) else []) if isinstance(call,dict) and isinstance(call.get('function'),dict) for name in [call['function'].get('name')]]
    if calls is not None:result['assistantCallsValidation'],result['toolDiagnostics']=tool_diagnostics(message)
    try:parsed=json.loads(message.get('content'))
    except (TypeError,ValueError):result['contentCategory']='not_json';return result
    result['contentCategory']='json';result['jsonShape']=type(parsed).__name__
    result['jsonKeys']=safe_keys(parsed,{'type','question','reply','actionProposal','readCalls','status','message','tool_calls','actions','action','steps','arguments'})
    if isinstance(parsed,dict):
        result['jsonType']=parsed.get('type') if parsed.get('type') in ('need_input','final','read_calls') else 'unknown'
        if parsed.get('type')=='need_input':result['needInputCategory']=text_category(parsed.get('question'))
        elif parsed.get('type')=='final':result['finalDiagnostic']=final_diagnostic(message,payload)
    return result

def turn_diagnostic(turn):
    status=turn.get('status');error=turn.get('errorCode')
    return {'status':status if status in ('queued','running','needs_input','awaiting_confirmation','completed','partially_completed','failed','cancelled') else 'unknown',
        'errorCode':error if error is None or error in ('CONFLICT','VERSION_CONFLICT','SOURCE_CHANGED','PROVIDER_UNAVAILABLE','TOOL_FAILED','CANCELLED') else 'other',
        'retryable':turn.get('retryable') is True,'replyCategory':text_category(turn.get('reply')),
        'cardTypes':[c.get('type') if c.get('type') in ('menu','recipe','calendar_save','shopping_preview','receipt','clarification') else 'unknown' for c in turn.get('cards',[]) if isinstance(c,dict)]}

def approved_provider_fields(path):
    """Read only the three named fields from the canonical known provider file."""
    path=Path(path).resolve()
    runner.require(path==runner.ROOT/'recommend-service/.env','Only the known canonical provider configuration is allowed')
    values={}
    with path.open(encoding='utf-8-sig') as stream:
        for line in stream:
            key,sep,value=line.strip().partition('=')
            if sep and key in FIELDS:
                value=value.strip()
                if len(value)>=2 and value[0]==value[-1] and value[0] in ('"',"'"):value=value[1:-1]
                values[key]=value
    runner.require(set(values)==FIELDS and all(values.values()),'Explicit key/base/model fields are required')
    parsed=urllib.parse.urlsplit(values['DEEPSEEK_BASE_URL'])
    runner.require(parsed.scheme=='https' and parsed.hostname and not parsed.username and not parsed.password
                   and not parsed.query and not parsed.fragment,'Live provider must use configured credential-free HTTPS base URL')
    runner.require(not values['DEEPSEEK_API_KEY'].lower().startswith('your_'),'Provider key is not configured')
    return values

class LiveCompletion:
    def __init__(self, fields, ledger):
        import httpx
        self.fields=fields;self.ledger=ledger;self.calls=[];self.scripts={};self.diagnostics=[];self.denied_reservations=0
        self.post=ledger.wrap(httpx.post,self.calls)
    def register(self,message,*args,**kwargs):
        # Java's actual natural-language request is kept in memory only.
        self.scripts[message]={'calls':0}
    def complete(self,payload):
        payload=dict(payload,model=self.fields['DEEPSEEK_MODEL'])
        try:
            response=self.post(self.fields['DEEPSEEK_BASE_URL'].rstrip('/')+'/v1/chat/completions',
                headers={'Authorization':'Bearer '+self.fields['DEEPSEEK_API_KEY'],'Content-Type':'application/json'},
                json=payload,timeout=10)
        except BudgetExhausted:
            self.denied_reservations+=1
            raise
        if response.status_code>=400:return None
        message=response.json()['choices'][0]['message']
        try:self.diagnostics.append(message_diagnostic(message,payload))
        except Exception:
            # Optional inspection must never alter forwarding or expose exception text.
            self.diagnostics.append({'diagnosticFailure':'diagnostic_unavailable'})
        return message

class LiveExecution:
    provider_mode='live'
    def __init__(self,fields,budget):
        self.fields=fields;self.ledger=ProviderBudget(budget);self.initial_used=self.ledger.validate()['used'];self.workspace=None;self.session=None;self.last_saved=None;self.turn_diagnostics=[]
    def create_model(self):return LiveCompletion(self.fields,self.ledger)
    def cases(self):
        return [{'id':name,'scenario':mode} for name,mode in (
            ('LIVE01','generate'),('LIVE02','replace'),('LIVE03','read'),
            ('LIVE04','save'),('LIVE05','shopping'),('LIVE06','ambiguous'))]
    def budget_used(self):return json.loads(self.ledger.path.read_text(encoding='utf-8'))['used']
    def run_case(self,a,case,index):
        if self.budget_used()>=20:raise BudgetExhausted('Budget exhausted; scenario not evaluated')
        user=910001;mode=case['scenario']
        if self.workspace is None:
            context={'date':str(a.day),'mealType':'lunch','people':2,
                'compositionMode':'manual','counts':{'meat':1,'veg':1,'soup':1},'requirements':'','ownedIngredients':[]}
            self.workspace=a.http('/meal-workspaces',{'requestId':runner.uid(),'expectedWorkspaceRevision':0,'context':context},user)
            self.session=a.http('/assistant/v4/sessions',{'requestId':runner.uid(),'workspaceId':self.workspace['id']},user)['sessionId']
        self.workspace=a.workspace(self.workspace,user);w=self.workspace
        before=a.counts(user);ids=[d['id'] for d in w['draft']['dishes']]
        messages={'generate':'给两个人安排一荤一素一汤，使用真实可访问菜谱，缺少份数或价格保持未知。',
            'replace':'把当前菜单第二道换一道同类菜，第一道和第三道保持不变。',
            'read':'只查看这餐有哪些菜和人数，不修改安排。',
            'save':'把当前这餐保存到明天晚餐，给我确认预览。',
            'shopping':'为刚才已经保存的明天晚餐准备采购预览，未知价格和份量保持空着，不代表已经吃过。',
            'ambiguous':'把这餐保存到另一天，日期和餐次还没有选定，请先问我。'}
        denied_before=a.model.denied_reservations
        turn=a.turn(user,w,self.session,messages[mode]+' [合成验收 '+a.run_id+']')
        self.turn_diagnostics.append(dict(caseId=case['id'],**turn_diagnostic(turn)))
        runner.require(a.counts(user)==before,'Unconfirmed live turn wrote persistent business state')
        if a.model.denied_reservations>denied_before:
            raise BudgetExhausted('A provider reservation was denied during scenario; no success claimed')
        if mode=='generate':
            runner.require(turn['status']=='completed','Live generation did not complete')
            actual=a.workspace(w,user)['draft']['dishes'];runner.require(len(actual)==3 and sorted(d['type'] for d in actual)==['meat','soup','veg'],'Live generated composition mismatch')
            runner.require(all(a.sql('SELECT COUNT(*) FROM food WHERE ID=%s AND (user_id IS NULL OR user_id=%s)',(d['id'],user))[0][0]==1 for d in actual),'Live generation selected inaccessible recipe')
        elif mode=='replace':
            runner.require(turn['status']=='completed' and len(ids)==3,'Live replacement did not complete')
            actual=[d['id'] for d in a.workspace(w,user)['draft']['dishes']]
            runner.require(len(actual)==3 and actual[0]==ids[0] and actual[2]==ids[2] and actual[1]!=ids[1],'Live second-dish reference mismatch')
        elif mode=='read':
            runner.require(turn['status']=='completed' and turn['cards'] and not turn.get('pendingAction'),'Live readonly answer lacks real facts')
            runner.require(a.workspace(w,user)==w,'Live readonly query changed draft')
        elif mode in ('save','shopping'):
            runner.require(turn['status']=='awaiting_confirmation','Live action did not produce confirmation preview')
            task=a.task(user,turn);expected='save_meal_to_target' if mode=='save' else 'add_meal_shopping'
            runner.require(task['steps'][0]['tool']==expected,'Live action selected wrong domain operation')
            if mode=='save':
                binding=task['steps'][0]['binding'];target=str(date.today()+timedelta(days=1))
                runner.require(binding['targetDate']==target and binding['targetMealType']=='dinner','Live tomorrow resolved against selected future date')
            else:
                rows=turn['cards'][-1]['data']['items'];runner.require(rows and all(r['price'] is None for r in rows),'Live shopping invented price')
            saved=a.confirm(user,turn);runner.require(saved['status']=='completed','Live confirmed domain operation failed')
            after=a.counts(user);runner.require(after['meal_consumption']==before['meal_consumption'],'Live plan/shopping created eaten record')
            if mode=='save':
                self.last_saved=saved
                runner.require(a.sql('SELECT COUNT(*) FROM recipe_records WHERE user_id=%s AND record_date=%s AND meal_type=%s',(user,target,'dinner'))[0][0]==1,'Live save missing correct target')
            else:runner.require(after['shopping_item']>before['shopping_item'],'Live shopping added no ingredients')
        else:
            runner.require(turn['status']=='needs_input' and not turn.get('pendingAction') and not turn.get('retryable') and text_category(turn.get('reply')) in ('date','meal'),'Ambiguous live target was not genuinely clarified')
            runner.require(a.workspace(w,user)==w,'Live clarification changed workspace')
        return {'businessOutcome':'clarified' if mode=='ambiguous' else 'passed','turnStatus':turn['status']}
    def finish_report(self,report,model):
        latency=sorted(m['latencyMs'] for m in model.calls)
        report['budgetUsedCumulative']=self.budget_used()
        report['realProviderRequests']=report['budgetUsedCumulative']-self.initial_used
        report['completedProviderMetrics']=len(model.calls)
        report['inFlightOrInterruptedRequests']=report['realProviderRequests']-len(model.calls)
        report['providerMetrics']=model.calls
        report['providerDiagnostics']=model.diagnostics if isinstance(getattr(model,'diagnostics',None),list) else []
        report['turnDiagnostics']=self.turn_diagnostics
        report['latencyMs']={'p50':statistics.median(latency) if latency else None,
            'p95':latency[min(len(latency)-1,max(0,int((len(latency)*.95+.999999))-1))] if latency else None}
        report['tokenUsage']={};report['tokenUsageCoverage']={}
        for key in ('prompt_tokens','completion_tokens','total_tokens'):
            known=[m.get('usage',{}).get(key) for m in model.calls if type(m.get('usage',{}).get(key)) is int and m['usage'][key]>=0]
            total=report['realProviderRequests'];complete=total>0 and len(known)==total
            subtotal=sum(known) if known else None
            report['tokenUsage'][key]=subtotal if complete else None
            report['tokenUsageCoverage'][key]={'knownRequests':len(known),'totalRequests':total,'knownSubtotal':subtotal,
                'status':'complete' if complete else 'partial' if known else 'unknown'}
        report['businessSummary']={kind:sum(c.get('businessOutcome')==kind for c in report['cases']) for kind in ('passed','clarified')}
        report['businessSummary']['failedOrNotEvaluated']=sum(not c['passed'] for c in report['cases'])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--manifest',required=True);parser.add_argument('--jar',required=True);parser.add_argument('--output',required=True);parser.add_argument('--budget',required=True);parser.add_argument('--cases');parser.add_argument('--approved-live',action='store_true');args=parser.parse_args()
    runner.require(args.approved_live,'Explicit coordinator live invocation required')
    case_ids=selected_cases(args.cases)
    manifest=json.loads(Path(args.manifest).read_text(encoding='utf-8'))
    runner.require(manifest.get('providerMode')=='live','Live manifest must be labeled live')
    fields=approved_provider_fields(runner.ROOT/'recommend-service/.env')
    execution=LiveExecution(fields,args.budget)
    report=runner.run_owned(manifest,args.jar,args.output,case_ids=case_ids,execution=execution)
    return 0 if report['passed']==report['total'] else 1
if __name__=='__main__':raise SystemExit(main())
