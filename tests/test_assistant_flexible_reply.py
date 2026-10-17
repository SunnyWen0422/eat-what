import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'recommend-service'))
from assistant_reply import validate_answer
from assistant_v4_schema import model_output_schema, StepValidationError

class FlexibleReplyTest(unittest.TestCase):
    def test_display_name_can_differ_but_reference_must_be_real(self):
        basis={'items':[{'key':'dish:1','entityType':'dish','entityId':1,'fields':{'name':'番茄炒蛋'},'sourceVersion':None,'unknownFields':[]}]}
        answer={'segments':[{'text':'这道搭配米饭很合适。','evidenceKeys':['dish:1'],'claims':[]}],'cardRefs':['dish:1'],'cardLabels':[{'dishRef':'dish:1','title':'家常番茄鸡蛋'}]}
        self.assertEqual(validate_answer(answer,basis,'meal_reply.v2')['cardLabels'],answer['cardLabels'])
        with self.assertRaises(StepValidationError):validate_answer(answer,basis)
        answer['cardLabels'][0]['dishRef']='dish:999'
        with self.assertRaises(StepValidationError):validate_answer(answer,basis,'meal_reply.v2')

    def test_v2_schema_accepts_labels_without_changing_v1(self):
        self.assertIn('cardLabels',model_output_schema([], 'meal_reply.v2')['anyOf'][1]['properties']['answer']['properties'])
        self.assertNotIn('cardLabels',model_output_schema([], 'meal_reply.v1')['anyOf'][1]['properties']['answer']['properties'])

if __name__=='__main__':unittest.main()
