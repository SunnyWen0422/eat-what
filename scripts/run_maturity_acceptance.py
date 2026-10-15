"""Opt-in real-MySQL/HTTP journeys on NEW owned instances, with model substitutes."""
import argparse
from datetime import date,timedelta
import json
import os
from pathlib import Path
import time
import concurrent.futures
import subprocess
import xml.etree.ElementTree as ET
import urllib.error
import urllib.request
import uuid
from maturity_runtime import owned_runtime,validate_config,new_output,digest,load


def key():return str(uuid.uuid4())
def require(value,message):
    if not value:raise AssertionError(message)


class Journeys:
    def __init__(self,r):
        self.r=r;self.a=r.api;self.user=910002;self.day=date.today()-timedelta(days=10);self.target=self.day+timedelta(days=1);self.w=None;self.plan=None

    def current(self):return self.a.http(f'/meal-workspaces/current?date={self.day}&mealType=dinner',user=self.user)

    def command(self,name,**extras):
        w=self.current()['workspace'];body={'requestId':key(),'expectedWorkspaceRevision':w['revision'],'planVersion':w['draft']['planVersion'],'command':name,**extras}
        self.a.http('/meal-workspaces/'+w['id']+'/commands',body,self.user)
        until=time.monotonic()+45
        while True:
            self.w=self.current()['workspace']
            if self.w['status']!='generating':return self.w
            require(time.monotonic()<until,'Rule task timed out');time.sleep(.07)

    def login_catalog(self):
        try:self.a.opener.open(self.a.state['api']+'/shopping-list',timeout=5)
        except urllib.error.HTTPError as e:require(e.code==401,'Anonymous private request not denied')
        else:raise AssertionError('Anonymous private request succeeded')
        login=self.a.http('/users/login',{'code':'local-v4'})
        require(login['user']['id']==910001 and login.get('token'),'Local fixture login failed')
        first=self.a.http('/dishes?page=1&pageSize=100');total=first['total'];last=self.a.http('/dishes?page='+str((total+99)//100)+'&pageSize=100')
        require(total==self.r.dataset['rows'] and last['total']==total and len(last['list'])==(total%100 or 100),'Catalog first/last page differs')
        return {'catalogRows':total,'firstRows':len(first['list']),'lastRows':len(last['list']),'anonymousStatus':401}

    def generate_keep_replace(self):
        self.w=self.a.http('/meal-workspaces',{'requestId':key(),'expectedWorkspaceRevision':0,'context':{'date':str(self.day),'mealType':'dinner','people':2,'compositionMode':'manual','counts':{'meat':1,'veg':1,'soup':1},'requirements':'','ownedIngredients':[]}},self.user)
        w=self.command('generate');require(w['status']=='draft' and len(w['draft']['dishes'])==3,'Incomplete rule draft')
        kept=w['draft']['dishes'][0]['id'];self.command('keep',dishId=kept);w=self.command('regenerate')
        require(kept in [d['id'] for d in w['draft']['dishes']] and kept in w['draft']['lockedDishIds'],'Regeneration lost explicit keep')
        replacement=next(d['id'] for d in w['draft']['dishes'] if d['id']!=kept);w=self.command('replace',dishId=replacement)
        require(kept in [d['id'] for d in w['draft']['dishes']],'Single replacement lost keep')
        stored=self.a.sql('SELECT state_json FROM meal_workspace WHERE id=%s AND user_id=%s',(w['id'],self.user))[0][0]
        require(json.loads(stored)['draft']['lockedDishIds']==w['draft']['lockedDishIds'],'Kept IDs not persisted')
        return {'draftCount':len(w['draft']['dishes']),'keptCount':len(w['draft']['lockedDishIds'])}

    def save_target_replay(self):
        w=self.current()['workspace'];self.w=w
        self.save_body={'requestId':key(),'expectedWorkspaceRevision':w['revision'],'planVersion':w['draft']['planVersion'],'expectedPlanRevision':0,'targetDate':str(self.target),'targetMealType':'lunch'}
        url='/meal-workspaces/'+w['id']+'/confirm';saved=self.a.http(url,self.save_body,self.user);again=self.a.http(url,self.save_body,self.user)
        require(saved['revision']==again['revision'],'Confirmation replay changed revision')
        slot=self.a.http(f'/meal-workspaces/current?date={self.target}&mealType=lunch',user=self.user);self.plan=slot['plan']
        require(self.plan and slot.get('actual') is None,'Save target absent or plan inferred eaten')
        require(self.a.sql('SELECT COUNT(*) FROM recipe_records WHERE user_id=%s AND record_date=%s AND meal_type=%s',(self.user,str(self.target),'lunch'))[0][0]==1,'Duplicate/wrong target plan')
        require(self.a.http(f'/meal-workspaces/current?date={self.target}&mealType=lunch',user=910001).get('plan') is None,'Plan leaked to another account')
        return {'targetMeal':'lunch','targetDay':str(self.target),'planRows':1,'actualRows':0,'replaySameRevision':True}

    def procurement_expense(self):
        plan=self.plan;a=self.a;user=self.user
        preview=a.http('/shopping-list/preview',{'dishIds':plan['dishIds'],'targetPeople':2},user)
        # Legacy seeded recipes may contain a legitimate base serving count.
        # Exercise the unknown-quantity contract with an explicitly unverified
        # fixture instead of assuming the random meal cannot choose a seed.
        unknown=a.sql('SELECT ID FROM food WHERE NAME=%s',('验收合成早餐燕麦',))
        if unknown:
            unverified=a.http('/shopping-list/preview',{'clientRequestId':key(),'dishIds':[unknown[0][0]],'targetPeople':2},user)
        else:unverified=preview
        require(all(i.get('quantityValue') is None and i.get('calculationStatus')!='CALCULATED' for g in unverified['dishes'] for i in g['items']),'Unverified quantity was scaled')
        listing=a.http('/shopping-list',user=user);groups=[{'selectionKey':key(),'dishId':g['dishId'],'items':g['items'],'sourceDate':str(self.target),'sourceMealType':'lunch','targetPeople':2} for g in preview['dishes']]
        request={'requestId':key(),'expectedListVersion':listing['version'],'dishes':groups,'targetPeople':2}
        a.http('/shopping-list/items:batch-add',request,user);added=a.http('/shopping-list',user=user);before=a.counts(user)
        a.http('/shopping-list/items:batch-add',request,user);require(a.counts(user)==before,'Procurement replay duplicated data')
        stored=a.sql('SELECT d.source_date,d.source_meal_type,i.source_line_no,i.normalized_variant FROM shopping_dish d JOIN shopping_item i ON i.shopping_dish_id=d.id JOIN shopping_list l ON l.id=d.shopping_list_id WHERE l.user_id=%s',(user,))
        require(stored and all(str(r[0])==str(self.target) and r[1]=='lunch' and r[2] is not None for r in stored),'Wrong procurement meal or line source')
        item=added['dishes'][0]['items'][0];ingredient='i'+''.join(f'{ord(c):04x}' for c in (item.get('canonicalName') or item['displayName']))+'v'+''.join(f'{ord(c):04x}' for c in item.get('normalizedVariant',''))
        body={'requestId':key(),'expectedListVersion':added['version'],'ingredientKey':ingredient,'amount':'0.00','channel':'超市'}
        expense=a.http('/shopping-list/expenses',body,user);require(float(expense['expenses'][ingredient]['amount'])==0 and expense['checkedCount']==added['checkedCount'],'Actual zero changed checked state')
        require(a.http('/shopping-list/expenses',body,user)==expense,'Expense replay differs')
        quotes=a.http('/ingredient-prices/query',{'items':[{'ingredientKey':ingredient,'canonicalName':item['canonicalName'],'normalizedVariant':item.get('normalizedVariant','')}]},user)
        require(quotes[ingredient].get('status')!='AVAILABLE','Empty price source invented reference')
        return {'persistedSourceLines':len(stored),'correctSourceMeal':True,'zeroExpense':True,'missingReference':True,'actualMealRows':a.counts(user)['meal_consumption']}

    def actual_correct(self):
        a=self.a;user=self.user;plan=self.plan;slot=f'/meal-consumptions/{self.target}/lunch'
        require(a.sql('SELECT COUNT(*) FROM meal_consumption WHERE user_id=%s',(user,))[0][0]==0,'Preparing/reading recorded eaten')
        body={'requestId':key(),'status':'eaten','usePlan':True,'dishes':[],'expectedPlanRevision':plan['revision'],'expectedRevision':0}
        first=a.http(slot,body,user,'PUT');require(a.http(slot,body,user,'PUT')==first,'Actual replay differs')
        changed={'requestId':key(),'status':'eaten','usePlan':False,'dishes':[{'name':'验收另外吃的面条','type':'staple'}],'expectedPlanRevision':plan['revision'],'expectedRevision':first['revision']}
        actual=a.http(slot,changed,user,'PUT');require(actual['actualDishes'][0]['name']=='验收另外吃的面条','Actual edit fell back to planned dishes')
        stale=dict(changed,requestId=key());a.http(slot,stale,user,'PUT',allowed=(409,))
        persisted=a.sql('SELECT revision,actual_dishes_json FROM meal_consumption WHERE user_id=%s AND meal_date=%s AND meal_type=%s',(user,str(self.target),'lunch'))[0]
        require(persisted[0]==actual['revision'] and json.loads(persisted[1])[0]['name']=='验收另外吃的面条','Actual DB snapshot mismatch')
        return {'actualRevision':actual['revision'],'separateFromPlan':True,'staleStatus':409}

    def copy_recovery(self):
        a=self.a;user=self.user;source=self.plan['dishIds'][0];dish=a.http('/dishes/'+str(source),user=user)
        count=lambda:a.sql('SELECT COUNT(*) FROM food WHERE user_id=%s',(user,))[0][0]
        before=count();a.http('/dishes/'+str(source),user=user);require(count()==before,'Read/editor setup created copy')
        body={'requestId':key(),'expectedVersion':dish['contentVersion'],'name':'验收编辑后才保存','type':dish['type'],'cl':dish.get('cl') or '青菜少许','step':dish.get('step') or dish.get('steps') or '洗净后煮熟','cookMinutes':dish.get('cookMinutes')}
        copied=a.http('/dishes/'+str(source)+'/copy-edited',body,user);require(count()==before+1 and copied['name']==body['name'],'Edited copy missing or duplicated')
        self.copied=copied
        require(copied['id']==self.r.state['futurePrivateFixtureId'],'Private publication negative fixture ID drifted')
        try:
            a.sql('UPDATE food SET IS_PUBLISHED=0 WHERE id=%s AND user_id IS NULL',(source,))
            replay=a.http('/dishes/'+str(source)+'/copy-edited',body,user);require(replay['id']==copied['id'] and count()==before+1,'Original request not recoverable after source down')
            a.http('/dishes/'+str(copied['id']),user=910001,allowed=(404,))
        finally:a.sql('UPDATE food SET IS_PUBLISHED=1 WHERE id=%s AND user_id IS NULL',(source,))
        return {'newCopies':1,'sourceDownReplaySameCopy':True,'cancelBoundary':'No save HTTP issued; UI cancellation covered by frontend tests, not this HTTP check'}

    def public_catalog(self):
        def get(path,expected=200):
            try:
                with self.a.opener.open(self.a.state['api']+path,timeout=5) as response:status=response.status;value=json.load(response)
            except urllib.error.HTTPError as error:status=error.code;value=json.load(error)
            require(status==expected,'Anonymous catalog status mismatch');return value
        page=get('/public/catalog/dishes?page=1&pageSize=100')
        require(page['total']==len(self.r.state['publicFixtureIds']),'Public catalog escaped release allowlist')
        require(not any('userId' in d or 'user_id' in d for d in page['list']),'Anonymous identity leak')
        get('/public/catalog/dishes/'+str(self.copied['id']),404)
        images=sum(bool(d.get('image')) for d in page['list'])
        if self.r.dataset['kind']=='public-source-snapshot':require(images>0,'Real public catalog lost image fields')
        return {'anonymousRows':page['total'],'imageRows':images,'ownedRecipeDeniedDespiteFutureIdAllowlist':True,'externalImagesDownloaded':False}

    def assistant_personal(self):
        a=self.a;w=self.current()['workspace'];caps=a.http('/assistant/v4/capabilities',user=self.user)
        require(len(caps['reads'])==11 and {'clarification_v1','handoff_v1'}<=set(caps['supportedUiFeatures']),'Extended capability negotiation absent')
        session=a.http('/assistant/v4/sessions',{'requestId':key(),'workspaceId':w['id']},self.user)['sessionId']
        message='隔离验收查看字典收藏和菜单 '+key();self.r.model.register(message,reads=[{'name':'get_recommendation_options','arguments':{'group':'scene'}},{'name':'read_favorites','arguments':{}},{'name':'read_saved_menus','arguments':{}}])
        body={'requestId':key(),'message':message,'workspaceId':w['id'],'expectedWorkspaceRevision':w['revision'],'expectedPlanVersion':w['draft']['planVersion'],'entryScene':'chat','uiFeatures':['clarification_v1','handoff_v1']}
        before=a.counts(self.user);accepted=a.http('/assistant/v4/sessions/'+session+'/turns',body,self.user);turn=a.poll(self.user,accepted['turnId'])
        require(turn['status']=='completed' and a.counts(self.user)==before,'Personal read modified business state or failed')
        history=a.http('/assistant/v4/sessions/'+session,user=self.user);require(history.get('messages'),'Durable assistant history missing')
        a.http('/assistant/v4/sessions/'+session,user=910001,allowed=(404,))
        self.session=session;return {'reads':len(caps['reads']),'personalReadStatus':turn['status'],'historyMessages':len(history['messages']),'businessCountsUnchanged':True}

    def original_request(self):
        w=self.current()['workspace'];a=self.a
        before=a.counts(self.user);self.r.restart()
        receipt=a.http('/meal-workspaces/'+w['id']+'/requests/'+self.save_body['requestId'],user=self.user)
        require(receipt and receipt['id']==w['id'],'Original save request no longer readable')
        require(a.counts(self.user)==before,'Process restart changed business counts')
        require(a.http('/assistant/v4/sessions/'+self.session,user=self.user).get('messages'),'Assistant history lost on process restart')
        stale={'requestId':key(),'expectedWorkspaceRevision':0,'planVersion':0,'command':'keep','dishId':self.plan['dishIds'][0]}
        a.http('/meal-workspaces/'+w['id']+'/commands',stale,self.user,allowed=(409,))
        return {'originalRequestRecovered':True,'staleStatus':409,'realJvmRestart':True,'assistantHistoryPreserved':True}

    def health_during_model_failure(self):
        a=self.a;w=self.current()['workspace'];message='隔离供应商不可用 '+key();before=a.counts(self.user)
        tid,_=a.start(self.user,w,self.session,message,unavailable=True)
        values=[]
        for _ in range(15):
            start=time.monotonic();a.http('/actuator/health/local-ready');values.append((time.monotonic()-start)*1000)
        turn=a.poll(self.user,tid);require(not turn.get('pendingAction') and a.counts(self.user)==before,'Unavailable provider proposed/completed a write')
        values.sort();p95=values[int((len(values)-1)*.95)];require(p95<=500,'Health under provider failure exceeded local target')
        return {'healthSamples':len(values),'healthP95Ms':round(p95,2),'providerUnavailableStatus':turn['status'],'businessCountsUnchanged':True}


def transaction_it(runtime,maven,repository):
    state=runtime.state;actual='eatwhat_actual_test_'+uuid.uuid4().hex[:10];task='eatwhat_task_test_'+uuid.uuid4().hex[:10]
    runtime.api.sql('CREATE DATABASE `'+actual+'` CHARACTER SET utf8mb4');runtime.api.sql('CREATE DATABASE f2_aop_test CHARACTER SET utf8mb4')
    runtime.api.sql('CREATE DATABASE `'+task+'` CHARACTER SET utf8mb4')
    env={k:v for k,v in os.environ.items() if not k.upper().startswith(('MEAL_ACTUAL_TEST_','EATWHAT_F2_','SPRING_','V4_TEST_'))}
    def jdbc(database):return f'jdbc:mysql://127.0.0.1:{state["dbPort"]}/{database}?allowPublicKeyRetrieval=true&useSSL=false&serverTimezone=UTC'
    env.update(MEAL_ACTUAL_TEST_ENABLED='true',MEAL_ACTUAL_TEST_JDBC=jdbc(actual),MEAL_ACTUAL_TEST_PASSWORD=state['password'],EATWHAT_F2_MYSQL_TEST='1',EATWHAT_F2_JDBC_URL=jdbc('f2_aop_test'),EATWHAT_F2_DB_PASSWORD=state['password'],EATWHAT_TASK_CANCEL_TEST='1',EATWHAT_TASK_CANCEL_JDBC=jdbc(task),EATWHAT_TASK_CANCEL_PASSWORD=state['password'])
    root=Path(__file__).resolve().parents[1];build=runtime.output/'transaction-java'
    command=[maven,'-o','-f',str(root/'backend/isolated-tests/pom.xml'),'-Deatwhat.build.directory='+str(build),'-Dtest=MealConsumptionMysqlIT,FilteredDishSpringTransactionIT,WorkspaceTaskCancellationMysqlIT','-Djacoco.skip=true']
    if repository:command+=['-Dmaven.repo.local='+str(Path(repository).absolute())]
    command+=['test']
    with (runtime.data/'transaction-java.log').open('wb') as log:
        result=subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),timeout=180)
    totals={'tests':0,'failures':0,'errors':0,'skipped':0}
    for report in (build/'surefire-reports').glob('TEST-*.xml'):
        row=ET.parse(report).getroot()
        for name in totals:totals[name]+=int(row.get(name,0))
    require(result.returncode==0 and totals['tests']>=10 and not any(totals[k] for k in ('failures','errors','skipped')),'Explicit real-DB transaction IT not all passing; private log retained')
    return totals


def run(config,out,backup=None,backup_receipt=None,maven='mvn',repository=None):
    root=new_output(out);root.mkdir(parents=True);report={'sourceSha':config['sourceSha'],'jarSha256':config['jarSha256'],'datasetHash':config['datasetHash'],'providerMode':'mock','realProviderRequests':0,'productionTouched':False,'datasets':[]}
    for rows in (0,6665):
        cfg=dict(config,rows=rows,privateDb='eatwhat_maturity_local_'+uuid.uuid4().hex[:8]);entry={'rows':rows,'cases':[]};report['datasets'].append(entry)
        with owned_runtime(cfg,root/('synthetic' if rows==0 else 'public-catalog')) as runtime:
            suite=Journeys(runtime)
            for case,method in [('J01','login_catalog'),('J02','generate_keep_replace'),('J03','save_target_replay'),('J04','procurement_expense'),('J05','actual_correct'),('J06','copy_recovery'),('J07','assistant_personal'),('J08','original_request'),('H01','health_during_model_failure'),('W01','public_catalog')]:
                start=time.monotonic()
                try:detail=getattr(suite,method)();result={'id':case,'passed':True,'detail':detail}
                except Exception as e:result={'id':case,'passed':False,'failureType':type(e).__name__,'failure':str(e)[:600]}
                result['seconds']=round(time.monotonic()-start,3);entry['cases'].append(result)
                (root/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False),flush=True)
            entry['mockHttpCalls']=len(runtime.model.calls)
            if rows==0:
                helper=load('maturity_schema_checks','scripts/assistant_v4_acceptance.py');entry['schemaAssertions']=helper.schema_checks(runtime.api)
                for case,action in [('IT01',lambda:transaction_it(runtime,maven,repository)),('R01',lambda:load('maturity_rehearsal','scripts/rehearse_maturity_candidate.py').rehearse(runtime,backup,backup_receipt))]:
                    if case=='R01' and backup is None:
                        entry['cases'].append({'id':case,'passed':False,'notRun':True,'failure':'Explicit pinned anonymized backup and receipt not provided'});continue
                    try:detail=action();entry['cases'].append({'id':case,'passed':True,'detail':detail})
                    except Exception as e:entry['cases'].append({'id':case,'passed':False,'failureType':type(e).__name__,'failure':str(e)[:500]})
    report['passed']=sum(c['passed'] for d in report['datasets'] for c in d['cases']);report['total']=sum(len(d['cases']) for d in report['datasets'])
    report['limits']=['Public catalog snapshot is real; fixture accounts and business writes are synthetic','Prior anonymized backup restoration is a separate restricted schema; historical private records are never sent to models','HTTP harness does not prove native gestures/keyboard or a lost in-flight connection','No production system or fresh production backup is accessed']
    (root/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');return report


def run_assistant(config,out):
    root=new_output(out);root.mkdir(parents=True);report={'sourceSha':config['sourceSha'],'jarSha256':config['jarSha256'],'providerMode':'mock','realProviderRequests':0,'productionTouched':False,'cases':[]}
    cfg=dict(config,rows=0,privateDb='eatwhat_maturity_local_'+uuid.uuid4().hex[:8])
    with owned_runtime(cfg,root/'synthetic') as runtime:
        helper=load('maturity_assistant_matrix','scripts/assistant_v4_acceptance.py');a=runtime.api
        names=['番茄炒蛋','香菇鸡丁','土豆炖肉','清炒青菜','清炒西兰花','醋溜土豆丝','紫菜蛋汤','番茄豆腐汤','米饭','清粥','验收合成水果甜点','验收合成凉拌黄瓜','验收合成早餐燕麦']
        for number,name in enumerate(names,1):
            rows=a.sql('SELECT ID FROM food WHERE NAME=%s',(name,));require(len(rows)==1,'Unique synthetic recipe missing');a.ids[number]=rows[0][0]
        for index,case in enumerate(helper.load_fixtures()):
            start=time.monotonic();calls=len(runtime.model.calls)
            try:helper.run_case(a,case,index);result={'id':case['id'],'passed':True}
            except Exception as e:result={'id':case['id'],'passed':False,'failureType':type(e).__name__,'failure':str(e)[:500]}
            result.update(seconds=round(time.monotonic()-start,3),mockHttpCalls=len(runtime.model.calls)-calls);report['cases'].append(result)
            (root/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False),flush=True)
    report['passed']=sum(c['passed'] for c in report['cases']);report['total']=len(report['cases']);report['limits']=['Deterministic local HTTP provider, not supplier behavior','No native or production proof']
    (root/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');return report


def main():
    p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--stage',choices=['database','assistant'],required=True);p.add_argument('--out',required=True);p.add_argument('--rehearsal-backup');p.add_argument('--rehearsal-receipt');p.add_argument('--maven',default='mvn');p.add_argument('--maven-repository');args=p.parse_args()
    if bool(args.rehearsal_backup)!=bool(args.rehearsal_receipt):raise ValueError('Backup and receipt must be provided together')
    config=validate_config(json.loads(Path(args.config).read_text(encoding='utf-8')))
    report=run_assistant(config,args.out) if args.stage=='assistant' else run(config,args.out,args.rehearsal_backup,args.rehearsal_receipt,args.maven,args.maven_repository)
    return 0 if report['passed']==report['total'] else 1


if __name__=='__main__':raise SystemExit(main())
