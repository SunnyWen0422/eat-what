"""Atomic supplemental HTTP cap; synthetic transports only, no provider calls."""
import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from assistant_v4_provider_budget import ProviderBudget,BudgetExhausted

REF='call_synthetic_supplemental_4'

class SupplementalBudgetTest(unittest.TestCase):
    def ledger(self,path,**changes):
        record={'authorizationDate':'2026-10-17','authorizationRef':REF,'limit':4,'used':0,
                'scope':'new V4 assistant synthetic local integration tests','providerRequestsCountedPerHttpAttempt':True}
        record.update(changes);path.write_text(json.dumps(record),encoding='utf-8');return record

    def budget(self,path,**changes):
        args={'authorization_date':'2026-10-17','request_limit':4,'authorization_ref':REF};args.update(changes)
        return ProviderBudget(path,**args)

    def test_four_actual_attempts_include_failure_and_fifth_never_reaches_transport(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'new.json';self.ledger(path);budget=self.budget(path);calls=[];metrics=[]
            def transport():
                calls.append(True)
                if len(calls)==1:raise TimeoutError('synthetic timeout')
                class Response:
                    status_code=200
                    def json(self):return {'usage':{'total_tokens':1}}
                return Response()
            counted=budget.wrap(transport,metrics)
            with self.assertRaises(TimeoutError):counted()
            for _ in range(3):counted()
            with self.assertRaises(BudgetExhausted):counted()
            self.assertEqual(4,len(calls));self.assertEqual(4,budget.validate()['used'])
            self.assertEqual([1,2,3,4],[a['ordinal'] for a in budget.validate()['attempts']])
            self.assertEqual('failed',metrics[0]['status']);self.assertEqual(4,len(metrics))

    def test_authorization_and_limit_mismatches_cannot_expand_or_reset_a_ledger(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'new.json';self.ledger(path);original=path.read_bytes()
            for args in ({'authorization_ref':'call_other'},{'authorization_date':'2026-10-16'},
                         {'request_limit':20},{'request_limit':5},{'authorization_ref':None}):
                with self.subTest(args=args),self.assertRaises(BudgetExhausted):self.budget(path,**args).reserve()
                self.assertEqual(original,path.read_bytes())
            self.ledger(path,limit=20);original=path.read_bytes()
            with self.assertRaises(BudgetExhausted):self.budget(path).reserve()
            self.assertEqual(original,path.read_bytes())

    def test_original_twenty_budget_remains_default_and_cannot_be_adopted_as_four(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'old.json';record=self.ledger(path,authorizationDate='2026-10-16',limit=20,used=20)
            record.pop('authorizationRef');path.write_text(json.dumps(record),encoding='utf-8');original=path.read_bytes()
            legacy=ProviderBudget(path,authorization_date='2026-10-16')
            self.assertEqual(20,legacy.validate()['limit'])
            with self.assertRaises(BudgetExhausted):legacy.reserve()
            with self.assertRaises(BudgetExhausted):self.budget(path).reserve()
            self.assertEqual(original,path.read_bytes())

if __name__=='__main__':unittest.main()
