"""Opt-in real-provider acceptance on a NEW owned loopback stack.

Only the canonical provider file is read. Every supplier HTTP attempt uses the
existing atomic ledger; no model response is fabricated or rewritten.
"""
import argparse
from datetime import date,timedelta
import json
from pathlib import Path
import time,uuid
from assistant_v4_provider_budget import ProviderBudget,BudgetExhausted
from assistant_v4_live_acceptance import LiveExecution,approved_provider_fields,turn_diagnostic
from maturity_runtime import owned_runtime,new_output,digest,preflight
from assistant_v4_acceptance import require


def require_replacement(before,after):
    old=[d['id'] for d in before['dishes']];new=[d['id'] for d in after['dishes']]
    require(len(old)==len(new)==3 and new[0]==old[0] and new[2]==old[2] and new[1]!=old[1],'Reference replacement changed the wrong dish or made no change')
    require(old[0] in after.get('lockedDishIds',[]),'Explicit keep was not retained')


def require_handoff(turn,workspace):
    cards=[c for c in turn.get('cards',[]) if c.get('type')=='handoff']
    require(turn.get('status')=='needs_input' and len(cards)==1 and not turn.get('pendingAction'),'Expected a safe page handoff')
    c=cards[0];data=c.get('data',{});ref=c.get('workspaceRef',{})
    require(data.get('kind')=='edit_preferences' and data.get('ref')=={} and data.get('sourceVersion') and not c.get('receiptRef'),'Preference handoff forged a write receipt or lacks version')
    require(ref.get('workspaceId')==workspace['id'] and ref.get('workspaceRevision')==workspace['revision'] and ref.get('planVersion')==workspace['draft']['planVersion'],'Handoff points to another workspace revision')


def require_plan_source(binding,target,revision):
    expected={'kind':'plan','date':target,'mealType':'dinner'};source=binding.get('source',{})
    for ref in (binding.get('sourceRef',{}),source.get('sourceRef',{})):
        require(all(ref.get(k)==v for k,v in expected.items()) and ref.get('workspaceId') is None,'Shopping preview is for the wrong source meal')
    require(source.get('date')==target and source.get('mealType')=='dinner' and source.get('planRevision')==revision,'Resolved shopping source revision or target differs')


def require_temporary_requirement(turn, before, after, preferences_before, preferences_after):
    require(before==after,'Unsupported raw requirement changed the meal')
    require(preferences_before==preferences_after,'Temporary meal text changed long-term preferences')
    require(turn['status']=='needs_input' and not turn.get('retryable') and not turn.get('pendingAction'),
            'Unsupported temporary wording needs an actionable question, not blind retry')
    require('修改本餐要求' in turn.get('reply','') and '未修改' in turn.get('reply',''),
            'Unsupported temporary wording lacks a supported next step')


class Execution(LiveExecution):
    def __init__(self,fields,budget,authorization_date):
        self.fields=fields;self.ledger=ProviderBudget(budget,authorization_date=authorization_date)
        self.initial_used=self.ledger.validate()['used'];self.turn_diagnostics=[]


class Cases:
    def __init__(self,runtime,execution):
        self.r=runtime;self.a=runtime.api;self.execution=execution;self.user=910001
        self.target=str(date.today()+timedelta(days=1));self.actual_day=str(date.today()-timedelta(days=2));self.clarification=None;self.saved=None
        self.menu_name='合成验收常用三菜';self.foreign_actual='其他隔离账号的实吃不应显示'

    def current(self):return self.a.workspace(self.w,self.user)
    def signature(self):
        return {'counts':self.a.counts(self.user),'prefs':self.a.http('/users/preferences',user=self.user),
                'menus':self.a.http('/menus',user=self.user),'favorites':self.a.http('/favorite-dishes',user=self.user)}

    def setup(self,shopping_only=False):
        a=self.a;context={'date':str(date.today()-timedelta(days=1)),'mealType':'lunch','people':2,'compositionMode':'manual','counts':{'meat':1,'veg':1,'soup':1},'requirements':'','ownedIngredients':[]}
        self.w=a.http('/meal-workspaces',{'requestId':str(uuid.uuid4()),'expectedWorkspaceRevision':0,'context':context},self.user)
        a.http('/meal-workspaces/'+self.w['id']+'/commands',{'requestId':str(uuid.uuid4()),'command':'generate','expectedWorkspaceRevision':self.w['revision'],'planVersion':self.w['draft']['planVersion']},self.user)
        until=time.monotonic()+30
        while True:
            self.w=self.current()
            if self.w['status']!='generating':break
            require(time.monotonic()<until,'Rule fixture generation did not settle');time.sleep(.1)
        require(self.w['status']=='draft' and len(self.w['draft']['dishes'])==3,'Rule fixture must contain three accessible public recipes')
        ids=[d['id'] for d in self.w['draft']['dishes']]
        require(a.sql('SELECT COUNT(*) FROM food WHERE user_id IS NOT NULL')[0][0]==0,'Private catalog rows are forbidden')
        a.http('/menus',{'requestId':str(uuid.uuid4()),'expectedVersion':0,'name':self.menu_name,'people':2,'dishIds':ids},self.user)
        a.http('/favorite-dishes',{'dishId':ids[0]},self.user)
        row=a.sql("SELECT NAME,TYPE FROM food WHERE user_id IS NULL AND id NOT IN (%s,%s,%s) AND TYPE IN ('meat','veg','soup','staple','dessert','side') ORDER BY id LIMIT 1",tuple(ids))[0]
        self.actual_name=row[0]
        for user,name in ((self.user,self.actual_name),(910002,self.foreign_actual)):
            a.http('/meal-consumptions/'+self.actual_day+'/dinner',{'requestId':str(uuid.uuid4()),'expectedRevision':0,'expectedPlanRevision':None,'status':'eaten','usePlan':False,'dishes':[{'name':name,'type':row[1]}]},user,'PUT')
        self.session=a.http('/assistant/v4/sessions',{'requestId':str(uuid.uuid4()),'workspaceId':self.w['id']},self.user)['sessionId']
        self.signature()
        if shopping_only:
            self.w=self.current()
            a.http('/meal-workspaces/'+self.w['id']+'/confirm',{'requestId':str(uuid.uuid4()),'expectedWorkspaceRevision':self.w['revision'],'planVersion':self.w['draft']['planVersion'],'expectedPlanRevision':0,'targetDate':self.target,'targetMealType':'dinner'},self.user)
            from urllib.parse import urlencode
            plan=a.http('/meal-workspaces/current?'+urlencode({'date':self.target,'mealType':'dinner'}),user=self.user)['plan']
            require(plan and plan['dishIds']==ids,'Direct-API shopping prerequisite differs from saved plan')
            self.plan_revision=plan['revision'];self.saved={'fixture':'direct API confirmed plan'}

    def turn(self,message,choice=None):
        if self.execution.budget_used()>=20:raise BudgetExhausted('No supplier budget remains')
        self.w=self.current();w=self.w;before=self.signature();denied=self.r.model.denied_reservations
        self.r.model.register(message)
        body={'requestId':str(uuid.uuid4()),'message':message,'workspaceId':w['id'],'expectedWorkspaceRevision':w['revision'],
              'expectedPlanVersion':w['draft']['planVersion'],'entryScene':'chat','uiFeatures':['clarification_v1','handoff_v1']}
        if choice:body['clarificationChoice']=choice
        accepted=self.a.http('/assistant/v4/sessions/'+self.session+'/turns',body,self.user);turn=self.a.poll(self.user,accepted['turnId'])
        self.execution.turn_diagnostics.append(turn_diagnostic(turn))
        require(before==self.signature(),'An unconfirmed model turn changed persistent business facts')
        if self.r.model.denied_reservations>denied:raise BudgetExhausted('A supplier attempt was denied; no model success inferred')
        return turn

    def discovery(self):
        name=self.current()['draft']['dishes'][0]['name'];start=len(self.r.model.diagnostics)
        turn=self.turn('请在菜库查找“'+name+'”，同时查看我的收藏、常用菜单，以及可选口味筛选。只查询，不改菜单。')
        names={name for d in self.r.model.diagnostics[start:] for name in d.get('toolNames',[])}
        require({'read_favorites','read_saved_menus','get_recommendation_options'}<=names and bool(names&{'search_dishes','search_by_ingredients','get_dish_details'}),'Requested discovery and personal tools were not all used')
        cards=turn.get('cards',[]);require(turn['status']=='completed' and not turn.get('pendingAction'),'Readonly task did not complete')
        require(any(c.get('type')=='personal_menu' and self.menu_name in c.get('text','') for c in cards),'Saved menu is not visibly answered')
        require(any(c.get('type')=='recommendation_options' and c.get('text') for c in cards),'Filter dictionary is not visibly answered')
        require(any(c.get('type')=='recipe' and c.get('data',{}).get('dishes') for c in cards),'Recipe/favorite result empty')
        return {'visiblePersonalMenu':True,'visibleDictionary':True,'visibleRecipes':True,'readToolKinds':sorted(names)}

    def adjust(self):
        before=self.current()['draft']
        turn=self.turn('第一道“'+before['dishes'][0]['name']+'”请保留；把第二道“'+before['dishes'][1]['name']+'”换一道同类菜，第三道保持不变。请执行这次本餐调整。')
        require(turn['status']=='completed','Adjustment did not complete');require_replacement(before,self.current()['draft'])
        return {'firstLocked':True,'secondActuallyReplaced':True,'thirdUnchanged':True}

    def clarify(self):
        self.clarification=self.turn('把这餐保存到另一天，但我还没有确定日期和餐次。请先让我选择，先不要保存。')
        turn=self.clarification
        require(turn['status']=='needs_input' and not turn.get('retryable') and not turn.get('pendingAction'),'Ambiguity was not genuinely clarified')
        require(any(c.get('type')=='clarification' and c.get('data',{}).get('authorizedOptions') for c in turn.get('cards',[])),'Clarification has no usable authorized choices')
        return {'structuredChoicePresent':True,'noCalendarWrite':True}

    def save(self):
        choice=None
        for c in (self.clarification or {}).get('cards',[]):
            if c.get('type')!='clarification':continue
            data=c['data'];options=data.get('authorizedOptions',[])
            wanted='tomorrow' if data.get('questionCode')=='target_date' else 'dinner'
            if any(o.get('id')==wanted for o in options):choice={'continuationRef':data['continuationRef'],'optionId':wanted}
        turn=self.turn('请选择'+self.target+'的晚餐，保存当前菜单，给我确认预览。',choice)
        require(turn['status']=='awaiting_confirmation','Calendar task did not return a confirmation preview')
        task=self.a.task(self.user,turn);step=task['steps'][0];binding=step['binding']
        require(step['tool']=='save_meal_to_target' and binding['targetDate']==self.target and binding['targetMealType']=='dinner','Calendar preview selected the wrong target')
        before=self.a.counts(self.user);self.saved=self.a.confirm(self.user,turn)
        require(self.saved['status']=='completed','Calendar confirmation failed')
        self.plan_revision=self.saved['steps'][0]['result']['targetPlanRevision']
        require(self.a.sql('SELECT COUNT(*) FROM recipe_records WHERE user_id=%s AND record_date=%s AND meal_type=%s',(self.user,self.target,'dinner'))[0][0]==1,'Correct calendar row missing or duplicated')
        after=self.a.counts(self.user);require(after['meal_consumption']==before['meal_consumption'],'Saving a plan fabricated actual eating')
        require(self.a.confirm(self.user,turn)==self.saved and self.a.counts(self.user)==after,'Calendar confirmation replay wrote twice')
        return {'correctDateAndDinner':True,'receiptReplayStable':True,'structuredChoiceUsed':bool(choice),'actualRowsUnchanged':True}

    def shopping(self):
        if not self.saved:raise RuntimeError('Blocked dependency: calendar was not confirmed')
        turn=self.turn('为刚才保存的'+self.target+'晚餐准备采购预览，使用日历中这一餐，未知价格和用量不要猜。')
        require(turn['status']=='awaiting_confirmation','Shopping preview absent')
        task=self.a.task(self.user,turn);step=task['steps'][0];bound=step['binding']
        require(step['tool']=='add_meal_shopping','Shopping selected the wrong tool')
        require_plan_source(bound,self.target,self.plan_revision)
        groups=bound['groups'];require(groups and all(g['sourceDate']==self.target and g['sourceMealType']=='dinner' for g in groups),'Shopping submitted a wrong meal')
        expected_lines={(g['selectionKey'],i['sourceLineNo']) for g in groups for i in g['items']};require(expected_lines,'Shopping has no submitted ingredients')
        before=self.a.counts(self.user);receipt=self.a.confirm(self.user,turn);require(receipt['status']=='completed','Shopping confirmation failed')
        keys=[g['selectionKey'] for g in groups]
        rows=self.a.sql('SELECT d.selection_key,i.source_line_no,DATE_FORMAT(d.source_date,"%%Y-%%m-%%d"),d.source_meal_type FROM shopping_item i JOIN shopping_dish d ON d.id=i.shopping_dish_id JOIN shopping_list l ON l.id=d.shopping_list_id WHERE l.user_id=%s AND d.selection_key IN ('+','.join(['%s']*len(keys))+')',tuple([self.user]+keys))
        require({(r[0],r[1]) for r in rows}==expected_lines and all(r[2:]==(self.target,'dinner') for r in rows),'Persisted shopping provenance differs from confirmed selection')
        after=self.a.counts(self.user);require(after['meal_consumption']==before['meal_consumption'] and after['shopping_item']>before['shopping_item'],'Shopping fabricated eaten record or persisted no items')
        require(self.a.confirm(self.user,turn)==receipt and self.a.counts(self.user)==after,'Shopping replay wrote twice')
        return {'persistedSourceLines':len(rows),'exactDinnerSource':True,'actualRowsUnchanged':True,'replayStable':True}

    def actual(self):
        turn=self.turn('请只回顾'+self.actual_day+'晚餐实际记录吃过的内容，不用计划菜单代替，不修改任何记录。')
        meals=[meal for c in turn.get('cards',[]) for meal in c.get('data',{}).get('meals',[])]
        require(turn['status']=='completed' and meals and all(m.get('status')=='eaten' for m in meals),'Actual review returned no actual facts or included plans')
        encoded=json.dumps(meals,ensure_ascii=False)
        require(self.actual_name in encoded and self.foreign_actual not in encoded,'Actual review missed the owned fact or leaked another account')
        return {'nonemptyOwnedActual':True,'noPlannedFallback':True,'foreignAccountExcluded':True}

    def handoff(self):
        before=self.current();turn=self.turn('我想修改长期偏好：以后不吃香菜。请打开长期饮食偏好编辑页面，让我自己核对并保存，先不要替我保存。')
        require_handoff(turn,before);require(self.current()==before,'Preference handoff modified current meal')
        return {'versionedPreferenceHandoff':True,'noAutomaticPreferenceWrite':True,'pageSaveStillRequired':True}

    def temporary(self):
        before=self.current();preferences=self.a.http('/users/preferences',user=self.user)
        turn=self.turn('只给当前这一餐添加临时补充要求“少油”，其他人数和已有搭配保持。不要改长期偏好，不保存到日历，不加入采购。')
        after=self.current()
        require_temporary_requirement(turn,before,after,preferences,self.a.http('/users/preferences',user=self.user))
        return {'unsupportedWordingClarified':True,'noBlindRetry':True,'longTermPreferencesUnchanged':True,'calendarAndShoppingUnchanged':True,'sameMeal':True}


def run(config,out,budget,authorization_date,approved_live=False,case_ids=None):
    require(approved_live,'Explicit approved-live invocation required')
    require(case_ids is None or set(case_ids)<={'discovery','adjust','clarify','save','shopping','actual','handoff','temporary'},'Unknown live cases')
    date.fromisoformat(authorization_date)
    execution=Execution(approved_provider_fields(Path(__file__).resolve().parents[1]/'recommend-service/.env'),budget,authorization_date)
    require(config.get('providerMode')=='live' and Path(config['modelBudgetLedger']).resolve()==execution.ledger.path,'Live mode and atomic ledger must match')
    preflight(config,out,execution=execution)
    out=new_output(out);out.mkdir(parents=True)
    report={'sourceSha':config['sourceSha'],'jarSha256':config['jarSha256'],'datasetHash':config['datasetHash'],'providerMode':'live','productionTouched':False,'cases':[],
            'authorizationDate':authorization_date,'authorizationLimit':20,'actualAppBuildSource':json.loads(Path(config['buildManifest']).read_text(encoding='utf-8'))['sourceSha'],
            'harnessHashes':{name:digest(Path(__file__).parent/name) for name in ('run_maturity_live.py','maturity_runtime.py','assistant_v4_provider_budget.py','assistant_v4_live_acceptance.py')},
            'limits':['Public recipe snapshot and synthetic test identities only','Real Java/FastAPI/owned MySQL; local completion forwarder reaches real supplier','The external forwarder uses sync HTTPX; this does not prove production async DNS/TLS timing','Page handoff is verified as authorized data; native page gestures and physical devices are separate','Finite task samples do not estimate population success rate']}
    with owned_runtime(config,out/'owned-runtime',execution=execution) as runtime:
        require(runtime.dataset['rows']==6665,'Use pinned real public snapshot for live tasks')
        cases=Cases(runtime,execution);cases.setup(shopping_only=case_ids==['shopping'])
        report['setupMode']='direct API confirmed plan for targeted shopping' if case_ids==['shopping'] else 'rule draft and synthetic personal facts; model saves the plan'
        for group,name in [('temporary','temporary'),('discovery','discovery'),('adjust','adjust'),('calendar','clarify'),('calendar','save'),('shopping','shopping'),('review_handoff','actual'),('review_handoff','handoff')]:
            if case_ids is not None and name not in case_ids:continue
            start=time.perf_counter();used=execution.budget_used()
            try:detail=getattr(cases,name)();row={'id':name,'group':group,'passed':True,'businessOutcome':'clarified' if name in ('clarify','temporary') else 'passed','detail':detail}
            except Exception as error:row={'id':name,'group':group,'passed':False,'failureType':type(error).__name__,'failure':str(error)[:300],'notEvaluated':isinstance(error,BudgetExhausted) or str(error).startswith('Blocked dependency:')}
            row.update(seconds=round(time.perf_counter()-start,3),providerHttpAttempts=execution.budget_used()-used);report['cases'].append(row)
            execution.finish_report(report,runtime.model);(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(row,ensure_ascii=False),flush=True)
        report['domainFinalCounts']=runtime.api.counts(cases.user);report['budgetNotReset']=True
    report['passed']=sum(c['passed'] for c in report['cases']);report['total']=len(report['cases'])
    report['requestsByGroup']={g:sum(c['providerHttpAttempts'] for c in report['cases'] if c['group']==g) for g in {c['group'] for c in report['cases']}}
    report['plannedGroupAllocation']=4;report['allocationRule']='Unused group allocation may move within the global 20 HTTP attempt limit; no automatic retry.'
    (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');return report


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--out',required=True);p.add_argument('--budget',required=True);p.add_argument('--authorization-date',required=True);p.add_argument('--approved-live',action='store_true');p.add_argument('--cases');args=p.parse_args()
    report=run(json.loads(Path(args.config).read_text(encoding='utf-8')),args.out,args.budget,args.authorization_date,args.approved_live,args.cases.split(',') if args.cases else None)
    raise SystemExit(0 if report['passed']==report['total'] else 2)
