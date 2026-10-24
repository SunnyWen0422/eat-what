"""Behavioral V4/legacy tool contracts; real routes, synthetic provider only."""
import copy
import json
import unittest
from unittest.mock import Mock, patch

from canonical_catalog_fixture import canonical_row
from assistant_v4_isolation import asgi_post, isolated_service, load_main

OWNER = 910011
TOKEN = "synthetic-internal-token"
ROWS = [
    canonical_row(1, "清炒青菜", ("青菜", "蒜"), codes=("LIGHT",), cuisine="HOME"),
    canonical_row(2, "青菜炒蛋", ("青菜", "鸡蛋"), codes=("LIGHT",), cuisine="HOME"),
    canonical_row(3, "青菜汤", ("青菜",), category="CAT_SOUP_CLEAR", codes=("LIGHT",), cuisine="HOME"),
    canonical_row(4, "辣青菜", ("青菜", "辣椒"), codes=("LIGHT", "SPICY"), cuisine="HOME"),
    canonical_row(5, "粤式青菜", ("青菜",), codes=("LIGHT",), cuisine="CANTONESE"),
    canonical_row(6, "炖青菜", ("青菜",), codes=("LIGHT",), cuisine="HOME", minutes=25),
    canonical_row(7, "拌黄瓜", ("黄瓜",), codes=("LIGHT",), cuisine="HOME"),
    canonical_row(8, "普通青菜", ("青菜",), codes=(), cuisine="HOME"),
]


def body():
    return {"userId": OWNER, "workspace": {
        "context": {"date": "2026-10-11", "mealType": "dinner", "requirements": "用青菜，不要鸡蛋"},
        "draft": {}, "agentContext": {"ownerUserId": OWNER, "catalog": copy.deepcopy(ROWS)}}}


class AssistantV4ToolContractTest(unittest.TestCase):
    def route(self, name, arguments, request=None, headers=None, configured=TOKEN):
        calls = []
        replies = [
            {"choices": [{"message": {"content": "", "tool_calls": [{"id": "read-1", "type": "function", "function": {
                "name": name, "arguments": json.dumps(arguments, ensure_ascii=False)}}]}}]},
            {"choices": [{"message": {"content": json.dumps({"needsInput": False, "constraintsUnderstood": True,
                "date": "2026-10-11", "mealType": "dinner", "dishIds": [1], "criteria": {} })}}]},
        ]

        def provider(*args, **kwargs):
            calls.append(copy.deepcopy(kwargs["json"]))
            response = Mock(status_code=200)
            response.json.return_value = replies.pop(0)
            return response

        with isolated_service() as service:
            main = load_main()
            with patch.dict("os.environ", {"MEAL_WORKSPACE_SERVICE_TOKEN": configured}), patch.object(service.client.httpx, "post", side_effect=provider):
                response = asgi_post(main.app, "/internal/v4/meal-task", request or body(),
                                     headers if headers is not None else {"X-Service-Token": TOKEN})
            self.assertEqual([], service.network_attempts)
        return response.status_code, response.json(), calls

    def test_ingredient_filters_survive_real_route(self):
        status, result, calls = self.route("search_by_ingredients", {
            "ingredients": ["青菜"], "top_k": 30, "filters": {
                "type": "veg", "cuisine_codes": ["HOME"], "include_tag_codes": ["LIGHT"],
                "exclude_tag_codes": ["SPICY"], "excluded_ingredients": ["鸡蛋"], "max_cook_minutes": 15}})
        self.assertEqual(200, status)
        self.assertFalse(result["needsInput"])
        self.assertEqual([1], result["dishIds"])
        records = json.loads(next(message["content"] for message in calls[1]["messages"] if message["role"] == "tool"))
        self.assertEqual([1], [row["id"] for row in records])
        advertised = {tool["function"]["name"] for tool in calls[0]["tools"]}
        self.assertEqual({"search_dishes", "search_by_ingredients", "get_dish_details", "get_dish_methods"}, advertised)

    def test_unknown_filters_and_invalid_types_are_rejected_before_execution(self):
        bad_filters = [
            {"unknown": "ignored?"}, {"type": "荤菜"}, {"type": ["veg"]},
            {"excluded_ingredients": "鸡蛋"}, {"excluded_ingredients": [False]},
            {"cuisine_codes": "HOME"}, {"include_tag_codes": [1]}, {"exclude_tag_codes": {}},
            {"max_cook_minutes": True}, {"max_cook_minutes": "15"}, {"max_cook_minutes": 1.5},
            {"max_cook_minutes": 0}, {"max_cook_minutes": 241},
            {"excluded_ingredients": ["食材"] * 31}, {"excluded_ingredients": ["菜" * 41]},
        ]
        for name in ("search_dishes", "search_by_ingredients"):
            for filters in bad_filters:
                with self.subTest(name=name, filters=filters):
                    args = {"filters": filters}
                    if name == "search_by_ingredients":
                        args["ingredients"] = ["青菜"]
                    status, result, calls = self.route(name, args)
                    self.assertEqual(200, status)
                    self.assertEqual("failed", result.get("executionStatus"))
                    self.assertEqual([], result["dishIds"])
                    self.assertEqual(1, len(calls))

    def test_bool_limit_unknown_arguments_and_unauthorized_ids_are_rejected(self):
        for name, args in [
            ("search_by_ingredients", {"ingredients": ["青菜"], "top_k": True}),
            ("search_dishes", {"top_k": True}),
            ("search_by_ingredients", {"ingredients": [True]}),
            ("search_dishes", {"bogus": 1}),
            ("get_dish_details", {"dish_ids": [999999]}),
            ("get_dish_details", {"dish_ids": [True]}),
        ]:
            with self.subTest(name=name, args=args):
                _, result, calls = self.route(name, args)
                self.assertEqual("failed", result.get("executionStatus"))
                self.assertEqual([], result["dishIds"])
                self.assertEqual(1, len(calls))

    def test_service_authorization_and_catalog_owner_are_enforced(self):
        for headers, configured in [({}, TOKEN), ({"X-Service-Token": "foreign"}, TOKEN), ({"X-Service-Token": TOKEN}, "")]:
            status, _, calls = self.route("search_dishes", {}, headers=headers, configured=configured)
            self.assertEqual(403, status)
            self.assertEqual([], calls)
        for missing in (False, True):
            request = body()
            if missing:
                del request["workspace"]["agentContext"]
            else:
                request["workspace"]["agentContext"]["ownerUserId"] = OWNER + 1
            _, result, calls = self.route("search_dishes", {}, request=request)
            self.assertEqual("AuthorizedContextMissing", result.get("failureClass"))
            self.assertEqual([], calls)

    def test_v4_catalog_validates_server_category_codes_and_nested_fields(self):
        with isolated_service() as service:
            factory = getattr(service.tools, "v4_model_catalog", None)
            self.assertTrue(callable(factory), "V4 must expose its own versioned catalog")
            catalog = factory()
            self.assertEqual("4.0", catalog["version"])
            tools = catalog["tools"]
            allowed = {item["name"] for item in tools}
            for name in ("search_dishes", "search_by_ingredients"):
                for category in ("meat", "veg", "soup", "staple", "dessert", "side"):
                    args = {"filters": {"type": category}}
                    if name == "search_by_ingredients":
                        args["ingredients"] = ["青菜"]
                    service.schemas.validate_tool_call({"name": name, "arguments": args}, allowed, tools)
                with self.assertRaises(service.schemas.SchemaValidationError):
                    service.schemas.validate_tool_call({"name": name, "arguments": {"ingredients": [], "filters": {"unknown": 1}} if name == "search_by_ingredients" else {"filters": {"unknown": 1}}}, allowed, tools)
            # Returning/mutating one catalog must not weaken validation on later tasks.
            next(item for item in tools if item["name"] == "search_dishes")["input_schema"]["properties"]["filters"]["additionalProperties"] = True
            with self.assertRaises(service.schemas.SchemaValidationError):
                service.schemas.validate_tool_call({"name": "search_dishes", "arguments": {"filters": {"unknown": 1}}}, allowed, factory()["tools"])

    def test_legacy_catalog_and_exclusions_unchanged(self):
        with isolated_service() as service:
            # Building the V4 contract cannot mutate the catalog used by legacy Runtime.
            service.tools.v4_model_catalog()
            catalog = service.tools.model_catalog()
            self.assertEqual("2.0", catalog["version"])
            names = {item["name"] for item in catalog["tools"]}
            self.assertIn("compose_meal_plan", names)
            self.assertNotIn("create_calendar_records", names)
            service.rag._dish_meta = copy.deepcopy(ROWS[:3])
            args = {"filters": {"types": ["veg"], "exclude_ingredients": ["鸡蛋"]}, "top_k": 30}
            call = service.schemas.validate_tool_call({"name": "search_dishes", "arguments": args}, names, catalog["tools"])
            result = service.tools.execute_tool(call["name"], call["arguments"])
            self.assertEqual([1], [row["id"] for row in result])
            # Legacy ingredient RAG has no filters parameter; do not falsely advertise it.
            with self.assertRaises(service.schemas.SchemaValidationError):
                service.schemas.validate_tool_call({"name": "search_by_ingredients", "arguments": {"ingredients": ["青菜"], "filters": {"excluded_ingredients": ["鸡蛋"]}}}, names, catalog["tools"])
            service.rag._ingredient_map = {"青菜": [1, 2, 3]}
            result = service.tools.execute_tool("search_by_ingredients", {"ingredients": ["青菜"], "top_k": 2})
            self.assertEqual(2, len(result))


if __name__ == "__main__":
    unittest.main()
