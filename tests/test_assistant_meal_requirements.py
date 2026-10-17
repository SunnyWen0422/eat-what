import copy
import unittest
from test_assistant_reply_contract import basis
from test_assistant_v4_step import body
from assistant_v4_schema import final_output,step_input,StepValidationError

class MealRequirementsTest(unittest.TestCase):
    def test_vague_requirement_becomes_one_supported_question(self):
        result=final_output({'type':'need_input','question':'想简单清淡一点吗','clarificationKind':'meal_requirement'}, {1}, ['clarification_v1','meal_requirements_v1'],'meal_reply.v1',basis())
        self.assertEqual('这餐想优先调整什么？',result['question'])
    def test_selected_time_mode_does_not_invent_minutes(self):
        result=final_output({'type':'need_input','question':'每道菜最多几分钟？'}, {1}, ['clarification_v1','meal_requirements_v1'],'meal_reply.v1',basis())
        self.assertEqual('这餐每道菜最多做几分钟？',result['question'])
    def test_unnegotiated_clients_cannot_receive_new_clarification_kind(self):
        with self.assertRaises(StepValidationError):final_output({'type':'need_input','question':'清淡','clarificationKind':'meal_requirement'}, {1}, ['clarification_v1'])
    def test_server_validated_choice_fits_strict_context(self):
        value=body();value.update(replyContract='meal_reply.v1',answerBasis=basis());value['context']['requestContext']['clarification']={'kind':'meal_requirement','originalIntent':'少油','selection':{'requirementMode':'time'}}
        self.assertEqual('time',step_input(value)['context']['requestContext']['clarification']['selection']['requirementMode'])

if __name__=='__main__':unittest.main()
