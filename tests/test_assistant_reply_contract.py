import copy
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'recommend-service'))
from assistant_v4_schema import step_input, final_output, StepValidationError
from test_assistant_v4_step import body


def basis():
    return {'items':[{'key':'dish:1','entityType':'dish','entityId':1,'fields':{'name':'番茄炒蛋','cookMinutes':15},'sourceVersion':'1','unknownFields':[]}]}


def answer():
    return {'segments':[{'text':'番茄炒蛋可以先选上。','evidenceKeys':['dish:1'],'claims':[]}], 'cardRefs':['dish:1']}


class AssistantReplyContractTest(unittest.TestCase):
    def test_legacy_contract_is_unchanged(self):
        self.assertEqual({'type':'final','reply':'请查看查询结果，并核对本餐需求。'}, final_output({'type':'final','reply':'原话'}, {1}))
        with self.assertRaises(StepValidationError):
            final_output({'type':'final','reply':'原话','answer':answer()}, {1})

    def test_new_internal_envelope_is_explicit_and_bounded(self):
        request=body(); request.update(replyContract='meal_reply.v1',answerBasis=basis())
        self.assertEqual('meal_reply.v1', step_input(request)['replyContract'])
        invalid=copy.deepcopy(request); invalid['answerBasis']['items'][0]['secret']='forbidden'
        with self.assertRaises(StepValidationError):step_input(invalid)
        invalid=copy.deepcopy(request); invalid['replyContract']='unknown'
        with self.assertRaises(StepValidationError):step_input(invalid)

    def test_natural_answer_survives_only_negotiated_contract(self):
        result=final_output({'type':'final','reply':'建议','answer':answer()}, {1}, (), 'meal_reply.v1', basis())
        self.assertEqual(answer(), result['answer'])

    def test_limits_and_unprovided_reference_fail_closed(self):
        for mutate in (lambda a:a['cardRefs'].append('dish:999'),lambda a:a['segments'][0].update(text='字'*281),lambda a:a.update(url='https://invalid.example')):
            value=answer();mutate(value)
            with self.assertRaises(StepValidationError):
                final_output({'type':'final','reply':'建议','answer':value}, {1}, (), 'meal_reply.v1', basis())


if __name__=='__main__':unittest.main()
