"""Business assertions for live acceptance; no credentials, sockets or DB."""
import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))

class MaturityLiveAssertionsTest(unittest.TestCase):
    def test_temporary_requirement_never_changes_long_term_preferences_or_meal_identity(self):
        from run_maturity_live import require_temporary_requirement
        before={'id':'owned','context':{'people':2,'requirements':''}}
        after=copy.deepcopy(before)
        turn={'status':'needs_input','retryable':False,'reply':'请修改本餐要求；菜单和长期偏好未修改。'}
        require_temporary_requirement(turn,before,after,{'avoid':['花生']},{'avoid':['花生']})
        for field in ('preference','identity','people','text','retry'):
            bad=copy.deepcopy(after);prefs={'avoid':['花生']};bad_turn=copy.deepcopy(turn)
            if field=='preference':prefs['avoid'].append('香菜')
            elif field=='identity':bad['id']='foreign'
            elif field=='people':bad['context']['people']=4
            elif field=='retry':bad_turn['retryable']=True
            else:bad['context']['requirements']='少油'
            with self.assertRaises(AssertionError):require_temporary_requirement(bad_turn,before,bad,{'avoid':['花生']},prefs)

    def test_shopping_ref_accepts_normalized_null_workspace_but_rejects_wrong_target_or_revision(self):
        from run_maturity_live import require_plan_source
        ref={'kind':'plan','date':'2026-10-17','mealType':'dinner','workspaceId':None}
        binding={'sourceRef':ref,'source':{'sourceRef':dict(ref),'date':'2026-10-17','mealType':'dinner','planRevision':3}}
        require_plan_source(binding,'2026-10-17',3)
        for changed in ('date','meal','kind','workspace','revision','resolved_date'):
            bad=copy.deepcopy(binding)
            if changed=='date':bad['sourceRef']['date']='2026-10-18'
            elif changed=='meal':bad['sourceRef']['mealType']='lunch'
            elif changed=='kind':bad['sourceRef']['kind']='draft'
            elif changed=='workspace':bad['sourceRef']['workspaceId']='another'
            elif changed=='revision':bad['source']['planRevision']=4
            else:bad['source']['date']='2026-10-18'
            with self.assertRaises(AssertionError):require_plan_source(bad,'2026-10-17',3)

    def test_replacement_requires_real_change_and_retained_first_and_third(self):
        from run_maturity_live import require_replacement
        before={'dishes':[{'id':1},{'id':2},{'id':3}]}
        after={'dishes':[{'id':1},{'id':4},{'id':3}],'lockedDishIds':[1]}
        require_replacement(before,after)
        for field in ('same','first','third','lock'):
            bad=copy.deepcopy(after)
            if field=='same':bad['dishes'][1]['id']=2
            elif field=='first':bad['dishes'][0]['id']=5
            elif field=='third':bad['dishes'][2]['id']=5
            else:bad['lockedDishIds']=[]
            with self.assertRaises(AssertionError):require_replacement(before,bad)

    def test_handoff_requires_owned_versioned_ref_and_no_fake_receipt(self):
        from run_maturity_live import require_handoff
        turn={'status':'needs_input','cards':[{'type':'handoff','data':{'kind':'edit_preferences','ref':{},'sourceVersion':'canonical-hash'},'workspaceRef':{'workspaceId':'owned','workspaceRevision':2,'planVersion':1}}]}
        workspace={'id':'owned','revision':2,'draft':{'planVersion':1}}
        require_handoff(turn,workspace)
        for field in ('kind','version','receipt','workspace'):
            bad=copy.deepcopy(turn)
            if field=='kind':bad['cards'][0]['data']['kind']='record_actual'
            elif field=='version':bad['cards'][0]['data'].pop('sourceVersion')
            elif field=='receipt':bad['cards'][0]['receiptRef']='forged'
            else:bad['cards'][0]['workspaceRef']['workspaceId']='foreign'
            with self.assertRaises(AssertionError):require_handoff(bad,workspace)

if __name__=='__main__':unittest.main()
