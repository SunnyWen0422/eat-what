"""Real guarded ASGI accepts omitted IDs and an exact original-ID restatement; mock HTTP only."""
import copy
import unittest
import test_assistant_v4_step as step_fixture


class AssistantPeoplePreservationContractTest(unittest.TestCase):
    def test_explicit_composition_is_distinct_from_automatic_dish_selection(self):
        for mode in ("manual", "auto"):
            request=step_fixture.body();request.update(replyContract="meal_reply.v2",answerBasis={"items":[]})
            request["context"]["constraints"]["recommendationPolicy"]="balanced-v1"
            request["message"]="今晚两个人吃，帮我安排一荤一素。"
            arguments={"operation":"generate","selectionMode":"recommend","contextPatch":{"people":2,"counts":{"meat":1,"veg":1},"compositionMode":mode}}
            output={"type":"final","reply":"安排这餐","actionProposal":{"steps":[{"kind":"draft_update","arguments":arguments}]}}
            status,result,calls=step_fixture.AssistantV4StepTest().route(step_fixture.final(output),request)
            self.assertEqual(200,status)
            self.assertEqual(arguments,result["actionProposal"]["steps"][0]["arguments"])
            prompt=calls[0]["json"]["messages"][0]["content"]
            self.assertIn("明确菜数（如一荤一素）",prompt)
            self.assertIn("compositionMode=manual",prompt)
            self.assertIn("selectionMode=recommend只表示自动选菜",prompt)
            self.assertIn("自动决定菜数时才设compositionMode=auto且省略counts",prompt)

    def test_next_meal_configuration_uses_the_existing_local_adjust_contract(self):
        for selected in (None,[1]):
            request=step_fixture.body();request.update(replyContract="meal_reply.v2",answerBasis={"items":[]})
            request["context"]["constraints"]["recommendationPolicy"]="balanced-v1"
            request["message"]="下次清淡一点，这餐菜单不变。"
            arguments={"operation":"adjust","contextPatch":{"recommendationPreferences":{"includeTagCodes":["LIGHT"]}},"selectionMode":"recommend" if selected is None else "explicit"}
            if selected is not None:arguments["selectedDishIds"]=selected
            response={"type":"final","reply":"调整下次条件","actionProposal":{"steps":[{"kind":"draft_update","arguments":arguments}]}}
            status,result,calls=step_fixture.AssistantV4StepTest().route(step_fixture.final(response),request)
            self.assertEqual(200,status);self.assertEqual("final",result["type"]);self.assertEqual(arguments,result["actionProposal"]["steps"][0]["arguments"])
            prompt=calls[0]["json"]["messages"][0]["content"]
            self.assertIn("不得导航到edit_preferences",prompt);self.assertIn("配置没有撤销",prompt);self.assertIn("单步撤销一次",prompt);self.assertIn("只有明确为true才可执行菜单撤销",prompt)

    def test_both_people_only_argument_forms_survive_real_route_without_new_selection(self):
        for selected in (None,[1988,2027]):
            request=step_fixture.body();request.update(replyContract="meal_reply.v2",answerBasis={"items":[]})
            request["context"]["constraints"]["recommendationPolicy"]="balanced-v1"
            request["context"]["activeMeal"]={"workspaceRevision":2,"planVersion":2,"people":2,"mealType":"dinner","compositionMode":"auto","counts":{"meat":1,"veg":1},"currentDishes":[{"id":1988,"name":"原荤菜","type":"meat"},{"id":2027,"name":"原素菜","type":"veg"}]}
            request["message"]="又来了一位朋友，改成三个人分着吃，菜不用加。"
            arguments={"operation":"adjust","contextPatch":{"people":3},"selectionMode":"recommend" if selected is None else "explicit"}
            if selected is not None:arguments["selectedDishIds"]=selected
            expected=copy.deepcopy(arguments)
            output={"type":"final","reply":"调整本餐人数","actionProposal":{"steps":[{"kind":"draft_update","arguments":arguments}]}}
            status,result,calls=step_fixture.AssistantV4StepTest().route(step_fixture.final(output),request)
            self.assertEqual(200,status);self.assertEqual("final",result["type"])
            self.assertEqual(expected,result["actionProposal"]["steps"][0]["arguments"])
            self.assertEqual(1,len(calls))
            prompt=calls[0]["json"]["messages"][0]["content"]
            self.assertIn("仅修改人数且菜品不变",prompt)
            self.assertIn("省略selectedDishIds",prompt)
            self.assertIn("完整ID和顺序",prompt)


if __name__=="__main__":unittest.main()
