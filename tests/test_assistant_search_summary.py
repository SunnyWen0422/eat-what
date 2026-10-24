"""Search summary contracts through the real step route, with a socket-denied provider stub."""
import unittest
import json

import test_assistant_v4_step as step_contract
from test_assistant_v4_step import body, call, final, read_result, tool_message


class AssistantSearchSummaryTest(unittest.TestCase):
    def test_summary_is_preserved_to_provider_and_authorizes_selected_recipe(self):
        runner = step_contract.AssistantV4StepTest()
        for name, arguments in (("search_dishes", {}), ("search_by_ingredients", {"ingredients": ["青菜"]})):
            with self.subTest(name=name):
                request = body()
                _, first, _ = runner.route(tool_message(call("search", name, arguments)), request)
                request["providerContinuation"] = first["providerContinuation"]
                item = {"id": 101, "name": "青菜汤", "type": "soup", "detailLevel": "summary",
                        "basePeople": None, "catalogRevision": "fixture-v4",
                        "omittedFields": ["ingredients", "ingredientFacts", "steps", "methods", "tagCodes"]}
                result = read_result("search", name, [item])
                result.update(truncated=True, nextCursor="1", unknownFields=["basePeople:101"])
                request["readResults"] = [result]
                proposal = {"steps": [{"kind": "draft_update", "arguments": {
                    "operation": "generate", "selectedDishIds": [101]}}]}
                status, response, calls = runner.route(final({"type": "final", "reply": "x", "actionProposal": proposal}), request)
                self.assertEqual(200, status)
                self.assertEqual("final", response["type"])
                self.assertEqual(proposal, response["actionProposal"])
                sent = json.loads(next(m["content"] for m in calls[0]["json"]["messages"] if m["role"] == "tool"))
                self.assertEqual(result, sent)
                self.assertNotIn("ingredientFacts", sent["items"][0])

    def test_full_details_keep_unknown_quantities_and_summary_extension_remains_strict(self):
        from assistant_v4_isolation import isolated_service
        with isolated_service():
            from assistant_v4_schema import read_result as validate_result, StepValidationError
            item = {"id": 101, "type": "soup", "detailLevel": "full", "basePeople": None,
                    "catalogRevision": "fixture-v4", "catalogContractVersion": 4, "dietaryCodes": None, "allergenCodes": None,
                    "quantityPolicy": "fixed-recipe-v1",
                    "nutrition": {"completeness": "partial", "total": None, "perServing": None, "perServingUnavailableReason": "diners_not_specified"},
                    "ingredientFacts": [{"lineId": "i1", "ingredientId": "greens", "name": "青菜", "unit": "g",
                                         "quantityValue": None, "quantityKind": "discretionary", "quantityDisplay": "适量",
                                         "optional": False, "defaultEnabled": True, "preparation": "洗净"}]}
            result = read_result("details", "get_dish_details", [item])
            self.assertEqual(result, validate_result(result))
            for key, value in (("detailLevel", "invented"), ("omittedFields", ["privateOwner"]), ("type", "invalid-category"),
                               ("dietaryCodes", "DIET_VEGAN"), ("allergenCodes", [False]), ("catalogContractVersion", 2),
                               ("quantityPolicy", "scaled-recipe"),
                               ("nutrition", {"completeness": "partial", "total": None, "perServing": None, "quantifiedSubtotal": {}})):
                invalid = {**item, key: value}
                with self.assertRaises(StepValidationError):
                    validate_result(read_result("bad", "get_dish_details", [invalid]))
            for key, value in (("quantityValue", "适量"), ("quantityKind", "guessed"), ("quantityStatus", "VERIFIED")):
                invalid = {**item, "ingredientFacts": [{**item["ingredientFacts"][0], key: value}]}
                with self.assertRaises(StepValidationError):
                    validate_result(read_result("bad", "get_dish_details", [invalid]))


if __name__ == "__main__":
    unittest.main()
