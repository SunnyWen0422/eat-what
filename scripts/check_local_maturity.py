"""Check only the owned local runtime; never calls model endpoints or production."""
import argparse,base64,datetime,hashlib,hmac,json,time,urllib.error,urllib.request,uuid
from pathlib import Path
from check_test_environment import validate

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'.local-maturity-active'


def check(workflow=False):
    state=json.loads((DATA/'runtime.json').read_text(encoding='utf-8'))
    if not validate(state)['safe'] or Path(state['root']).resolve()!=ROOT or (ROOT/state['dataDir']).resolve()!=DATA/'mysql':
        raise ValueError('Only this owned local maturity runtime can be checked')
    checks=[]
    def token(user):
        payload=base64.urlsafe_b64encode(f'{user}:{int(time.time()*1000)+3600000}'.encode()).decode().rstrip('=')
        sig=base64.urlsafe_b64encode(hmac.new(state['tokenSecret'].encode(),payload.encode(),hashlib.sha256).digest()).decode().rstrip('=')
        return payload+'.'+sig
    def call(path,method='GET',body=None,user=910002,expected=200):
        request=urllib.request.Request(state['api']+path,method=method,data=json.dumps(body,ensure_ascii=False).encode() if body is not None else None,headers={'Authorization':'Bearer '+token(user),'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(request,timeout=45) as response:status=response.status;value=json.load(response)
        except urllib.error.HTTPError as error:status=error.code;value=json.load(error)
        if status!=expected:raise AssertionError(f'{method} {path}: HTTP {status}, expected {expected}')
        return value
    def passed(name):checks.append({'case':name,'status':'PASS'})
    try:
        call('/actuator/health/local-ready');passed('database-ready')
        login=call('/users/login','POST',{'code':'local-v4'})
        if not login.get('success') or login.get('user',{}).get('id')!=910001:raise AssertionError('Synthetic login failed')
        passed('local-synthetic-login')
        first=call('/dishes?page=1&pageSize=100');last=call('/dishes?page=67&pageSize=100')
        if first['total']!=6665 or last['total']!=6665 or len(last['list'])!=65:raise AssertionError('Full catalog pagination differs from the audited baseline')
        passed('full-catalog-first-and-last-page')
        dishes=first['list']
        for dish in dishes+last['list']:
            q=dish.get('quality')
            if not q or q['reviewStatus']!='UNREVIEWED' or q.get('basePeople') is not None:raise AssertionError('Unknown recipe evidence was upgraded')
        detail=call('/dishes/'+str(dishes[0]['id']))
        if detail['quality']['contentHash']!=dishes[0]['quality']['contentHash']:raise AssertionError('Detail/list quality versions differ')
        passed('unknown-quality-and-consistent-detail')
        preview=call('/shopping-list/preview','POST',{'dishIds':[dishes[0]['id']],'targetPeople':4})
        for group in preview['dishes']:
            for item in group['items']:
                if item.get('calculationStatus')=='CALCULATED' or item.get('quantityValue') is not None:raise AssertionError('Unreviewed amount became calculated')
        passed('unverified-quantity-not-scaled')
        if workflow:
            # All writes belong to the dedicated second synthetic account on an unused date.
            day=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()-datetime.timedelta(days=1)
            for _ in range(365):
                current=call(f'/meal-workspaces/current?date={day}&mealType=dinner')
                if not current.get('workspace') and not current.get('plan'):break
                day-=datetime.timedelta(days=1)
            else:raise AssertionError('No unused synthetic acceptance slot')
            key=lambda:str(uuid.uuid4())
            w=call('/meal-workspaces','POST',{'requestId':key(),'expectedWorkspaceRevision':0,'context':{'date':str(day),'mealType':'dinner','people':2,'compositionMode':'auto','requirements':'','ownedIngredients':[]}})
            call(f"/meal-workspaces/{w['id']}/commands",'POST',{'command':'generate','requestId':key(),'expectedWorkspaceRevision':w['revision'],'planVersion':w['draft']['planVersion']})
            deadline=time.monotonic()+45
            while True:
                current=call(f'/meal-workspaces/current?date={day}&mealType=dinner');w=current['workspace']
                if w['status']!='generating':break
                if time.monotonic()>deadline:raise AssertionError('Rule generation timeout')
                time.sleep(.25)
            if w['status']!='draft':raise AssertionError('Rule path did not generate a draft')
            passed('rule-generation-without-model')
            body={'requestId':key(),'expectedWorkspaceRevision':w['revision'],'planVersion':w['draft']['planVersion'],'expectedPlanRevision':current.get('planRevision',0)}
            confirmed=call(f"/meal-workspaces/{w['id']}/confirm",'POST',body)
            replay=call(f"/meal-workspaces/{w['id']}/confirm",'POST',body)
            if confirmed['revision']!=replay['revision']:raise AssertionError('Confirmation retry was not idempotent')
            current=call(f'/meal-workspaces/current?date={day}&mealType=dinner');plan=current['plan']
            other=call(f'/meal-workspaces/current?date={day}&mealType=dinner',user=910001)
            if other.get('workspace') or other.get('plan'):raise AssertionError('Synthetic accounts leaked state')
            passed('confirmation-replay-and-account-isolation')
            if not plan.get('dishDetails') or len(plan['dishDetails'])!=len(plan['dishIds']):raise AssertionError('Cooking snapshot is incomplete')
            meal_preview=call('/shopping-list/preview','POST',{'dishIds':plan['dishIds'],'targetPeople':2})
            listing=call('/shopping-list')
            groups=[{'selectionKey':f'acceptance-{day}-{d["dishId"]}','items':d['items'],'sourceDate':str(day),'sourceMealType':'dinner','targetPeople':2} for d in meal_preview['dishes']]
            call('/shopping-list/items:batch-add','POST',{'requestId':key(),'expectedListVersion':listing['version'],'dishes':groups,'targetPeople':2})
            added=call('/shopping-list')
            item=next(i for group in added['dishes'] for i in group['items'] if i.get('sourceDishId'))
            ingredient='i'+''.join(f'{ord(c):04x}' for c in (item.get('canonicalName') or item['displayName']))+'v'+''.join(f'{ord(c):04x}' for c in item.get('normalizedVariant',''))
            expense={'requestId':key(),'expectedListVersion':added['version'],'ingredientKey':ingredient,'amount':'0.00','channel':'超市'}
            saved=call('/shopping-list/expenses','POST',expense)
            if float(saved['expenses'][ingredient]['amount'])!=0 or saved['checkedCount']!=added['checkedCount']:raise AssertionError('Zero expense changed shopping state')
            if call('/shopping-list/expenses','POST',expense)!=saved:raise AssertionError('Expense retry duplicated a write')
            quotes=call('/ingredient-prices/query','POST',{'items':[{'ingredientKey':ingredient,'canonicalName':item['canonicalName'],'normalizedVariant':item.get('normalizedVariant','')}]})
            if quotes[ingredient].get('status')=='AVAILABLE':raise AssertionError('Local empty price source unexpectedly supplied a quote')
            passed('shopping-snapshot-zero-expense-replay-and-missing-price')
            snapshots=plan['dishDetails']
            menu=call('/menus','POST',{'requestId':key(),'expectedVersion':0,'name':'本地验收菜单 '+str(day),'people':2,'dishIds':plan['dishIds'],'dishVersions':{str(d['id']):d['contentVersion'] for d in snapshots}})
            resolved=call(f"/menus/{menu['id']}/resolve",'POST',{'expectedVersion':menu['version'],'date':str(day),'mealType':'lunch'})
            if resolved['dishIds']!=plan['dishIds']:raise AssertionError('Menu resolution changed saved dishes')
            call(f"/menus/{menu['id']}",user=910001,expected=404)
            passed('personal-menu-snapshot-resolution-and-isolation')
            actual=call(f'/meal-consumptions/{day}/dinner','PUT',{'requestId':key(),'status':'eaten','usePlan':True,'dishes':[],'expectedPlanRevision':plan['revision'],'expectedRevision':0})
            if actual['status']!='eaten':raise AssertionError('Actual meal not stored')
            review=call(f'/diet-reviews?startDate={day}&endDate={day}')
            if review.get('summary',review).get('mealCount')!=1:raise AssertionError('Actual review count differs')
            passed('actual-meal-and-review')
        result={'status':'PASS','checks':checks,'modelRequests':0,'scope':'local HTTP; native interaction and real devices are separate','workflowWrites':workflow}
    except Exception as error:
        result={'status':'FAIL','checks':checks,'errorType':type(error).__name__,'message':str(error),'modelRequests':0,'workflowWrites':workflow}
    (DATA/'acceptance-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--workflow',action='store_true');args=parser.parse_args()
    result=check(args.workflow);print(json.dumps(result,ensure_ascii=False,indent=2));raise SystemExit(0 if result['status']=='PASS' else 1)
