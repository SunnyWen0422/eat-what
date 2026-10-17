"""Four targeted real-service journeys with a scripted provider, zero external HTTP.

This proves execution and safety, not natural-language interpretation by a model.
"""
import argparse,json
from datetime import timedelta
from pathlib import Path
import assistant_v4_acceptance as r

class NoExternalBudget:
    def validate(self):return {'used':0,'externalRequestsAllowed':False}

class Journeys:
    provider_mode='mock';natural_replies=True
    ledger=NoExternalBudget()
    def create_model(self):return r.MockCompletion()
    def cases(self):return [{'id':x} for x in ('FLOW01','FLOW02','FLOW03','FLOW04')]
    def finish_report(self,report,model):
        report['realProviderRequests']=0;report['mockHttpCalls']=len(model.calls)
        report['scope']='Controlled provider outputs; actual Java/Python validation and isolated MySQL effects; no model intent accuracy claim'
    def run_case(self,a,case,index):
        user=910001;uid=case['id']
        w,s=a.create({'id':uid,'group':'journey','initial':{'dishIds':[1,4,7],'context':{'ownedIngredients':['番茄','鸡蛋']}}},user,index+100)
        before=a.counts(user);prefs=a.sql('SELECT * FROM user_preference WHERE USER_ID=%s',(user,))
        ids=lambda seq:[a.ids[x] for x in seq]
        def draft(arguments,reads=None):
            nonlocal w
            turn=a.turn(user,w,s,uid+' '+r.uid(),[r.action('draft_update',**arguments)],reads)
            r.require(turn['status']=='completed','Draft step failed: '+turn.get('reply',''))
            w=a.workspace(w,user);return turn
        if uid=='FLOW01':
            draft({'operation':'adjust','keepDishIds':ids([1])})
            draft({'operation':'adjust','targetDishId':a.ids[4],'replacementDishId':a.ids[5]},r.details(ids([5])))
            r.require([d['id'] for d in w['draft']['dishes']]==ids([1,5,7]) and a.ids[1] in w['draft']['lockedDishIds'],'Kept meal or single replacement incorrect')
            r.require(w['context']['ownedIngredients']==['番茄','鸡蛋'],'Owned ingredients lost')
        elif uid=='FLOW02':
            message=uid+' compare '+r.uid();left='dish:'+str(a.ids[1]);right='dish:'+str(a.ids[2])
            text='番茄炒蛋预计15分钟，比香菇鸡丁更快。'
            a.model.final_overrides[message]={'type':'final','reply':'建议','answer':{'segments':[{'text':text,'evidenceKeys':[left,right],'claims':[{'op':'less_than','left':left,'right':right,'field':'cookMinutes','value':15}]}],'cardRefs':[left,right]}}
            turn=a.turn(user,w,s,message,reads=r.details(ids([1,2])))
            r.require(turn['reply']==text and turn.get('cards'),'Grounded comparison did not preserve natural explanation and real cards')
            r.require(a.workspace(w,user)==w,'Comparison modified menu')
            draft({'operation':'adjust','targetDishId':a.ids[1],'replacementDishId':a.ids[2]},r.details(ids([2])))
            r.require([d['id'] for d in w['draft']['dishes']]==ids([2,4,7]),'Selected comparison candidate was not applied')
        elif uid=='FLOW03':
            draft({'operation':'adjust','selectedDishIds':ids([2,4,8]),'contextPatch':{'requirements':'这餐不吃鸡蛋'}},r.details(ids([2,8])))
            r.require('鸡蛋' in w['context']['criteria']['excludedIngredients'],'Explicit temporary exclusion missing')
            r.require([d['id'] for d in w['draft']['dishes']]==ids([2,4,8]),'Temporary exclusion menu mismatch')
        else:
            draft({'operation':'adjust','selectedDishIds':ids([1,4,7]),'contextPatch':{'people':4}})
            target=str(a.day+timedelta(days=400))
            turn=a.turn(user,w,s,uid+' save shopping '+r.uid(),[
                r.action('calendar_save',targetDate=target,targetMealType='dinner'),
                r.action('shopping_preview',sourceRef={'kind':'draft','workspaceId':w['id']})])
            r.require(turn['status']=='awaiting_confirmation' and a.counts(user)==before,'Preview wrote before confirmation')
            receipt=a.confirm(user,turn);r.require(receipt['status']=='completed','Calendar confirm failed')
            again=a.confirm(user,turn);r.require(again['steps'][0]['result']==receipt['steps'][0]['result'],'Original confirmation result changed')
            turn=a.poll(user,turn['turnId']);r.require(turn['status']=='awaiting_confirmation','Shopping step did not await separate confirmation')
            task=a.task(user,turn);binding=task['steps'][0]['binding'];rows=turn['cards'][-1]['data']['items']
            r.require(rows and all(x.get('price') is None for x in rows),'Unknown price invented')
            r.require(a.confirm(user,turn)['status']=='completed','Shopping confirm failed')
            after=a.counts(user)
            r.require(after['recipe_records']==before['recipe_records']+1 and after['shopping_item']>before['shopping_item'] and after['meal_consumption']==before['meal_consumption'],'Confirmed business effects incorrect')
            r.require(a.sql('SELECT COUNT(*) FROM recipe_records WHERE user_id=%s AND record_date=%s AND meal_type=%s',(user,target,'dinner'))[0][0]==1,'Calendar target mismatch')
        r.require(a.sql('SELECT * FROM user_preference WHERE USER_ID=%s',(user,))==prefs,'Journey polluted permanent preferences')
        if uid!='FLOW04':r.require(a.counts(user)==before,'Draft/read created domain records')
        return {'asserted':'actual menu, locks, preferences, sources/confirmation and persisted domain effects','businessOutcome':'passed'}

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--jar',required=True);p.add_argument('--output',required=True);p.add_argument('--cases');args=p.parse_args()
    manifest=json.loads(Path(args.manifest).read_text(encoding='utf-8'))
    result=r.run_owned(manifest,args.jar,args.output,case_ids=set(args.cases.split(',')) if args.cases else None,execution=Journeys())
    return 0 if result['passed']==result['total'] else 1
if __name__=='__main__':raise SystemExit(main())
