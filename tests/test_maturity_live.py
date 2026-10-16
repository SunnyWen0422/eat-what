"""Business assertions for live acceptance; no credentials, sockets or DB."""
import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))

class MaturityLiveAssertionsTest(unittest.TestCase):
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
