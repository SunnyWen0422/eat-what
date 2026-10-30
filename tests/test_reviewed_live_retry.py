"""Pure guards; this suite never opens a socket or calls a provider."""
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from daily_menu_live_review import validate_reviewed_retry, check_case


class ReviewedRetryTest(unittest.TestCase):
    def fixture(self):
        row={'number':2,'passed':False,'status':'needs_input','turnId':'original',
             'workspaceId':'w','expectedWorkspaceRevision':3,'expectedPlanVersion':3,
             'beforeDishIds':[1,2],'afterDishIds':[1,2],'counts':{'records':0,'shopping':0}}
        previous={'cases':[{'number':1,'passed':True},row],'pythonExited':True,'providerHttpAttempts':6}
        turn={'turnId':'original','status':'needs_input','workspaceRef':{'workspaceId':'w','workspaceRevision':3,'planVersion':3}}
        workspace={'id':'w','revision':3,'draft':{'planVersion':3,'dishes':[{'id':1},{'id':2}]}}
        return [previous,2,'original',turn,workspace,{'records':0,'shopping':0},6]

    def test_terminal_effect_free_retest_keeps_original_evidence(self):
        args=self.fixture();before=copy.deepcopy(args)
        self.assertEqual(validate_reviewed_retry(*args)['turnId'],'original')
        self.assertEqual(args,before)

    def test_original_identity_and_budget_cannot_change(self):
        for mutate in (lambda a:a.__setitem__(2,'different'),lambda a:a.__setitem__(6,0),
                       lambda a:a.__setitem__(6,7),lambda a:a[0].__setitem__('pythonExited',False),
                       lambda a:a[0]['cases'][0].__setitem__('passed',False),lambda a:a.__setitem__(1,1)):
            args=self.fixture();mutate(args)
            with self.subTest(args=args),self.assertRaises(AssertionError):validate_reviewed_retry(*args)

    def test_unknown_running_pending_and_completed_actions_are_not_retried(self):
        for status in ('queued','running','awaiting_confirmation','completed','failed','cancelled'):
            args=self.fixture();args[3]['status']=status
            with self.subTest(status=status),self.assertRaises(AssertionError):validate_reviewed_retry(*args)
        for field in ('continuation','pendingAction'):
            args=self.fixture();args[3][field]={'id':'pending'}
            with self.subTest(field=field),self.assertRaises(AssertionError):validate_reviewed_retry(*args)

    def test_any_new_workspace_or_saved_effect_blocks_retest(self):
        for mutate in (lambda a:a[4].__setitem__('revision',4),lambda a:a[4]['draft'].__setitem__('planVersion',4),
                       lambda a:a[4]['draft']['dishes'][0].__setitem__('id',9),lambda a:a[5].__setitem__('records',1),
                       lambda a:a[5].__setitem__('shopping',1),lambda a:a[3]['workspaceRef'].__setitem__('workspaceId','other')):
            args=self.fixture();mutate(args)
            with self.subTest(args=args),self.assertRaises(AssertionError):validate_reviewed_retry(*args)

    def test_next_preference_scene_requires_light_without_unrelated_changes(self):
        before={'context':{'people':3,'counts':{'meat':1,'veg':1},'criteria':{},'recommendationPreferences':{'includeTagCodes':[]}},'draft':{'dishes':[{'id':1}]}}
        after=copy.deepcopy(before);after['context']['recommendationPreferences']['includeTagCodes']=['INTENSITY_LIGHT']
        counts={'records':0,'shopping':0}
        check_case('next_preferences',before,after,counts,counts,{'status':'completed'})
        for field,value in (('people',4),('counts',{'meat':1,'veg':2}),('criteria',{'excludedIngredients':['花生']})):
            changed=copy.deepcopy(after);changed['context'][field]=value
            with self.subTest(field=field),self.assertRaises(AssertionError):check_case('next_preferences',before,changed,counts,counts,{'status':'completed'})
        with self.assertRaises(AssertionError):check_case('next_preferences',before,before,counts,counts,{'status':'completed'})


if __name__=='__main__':unittest.main()
