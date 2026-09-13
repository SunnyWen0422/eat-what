"""Whitelisted tools exposed to the model-driven Agent.

Tools return JSON-compatible values.  They never expose a database connection
to the model and write tools are rejected unless an explicit confirmation
context is supplied by the trusted application layer.
"""
from __future__ import annotations

import copy
import re
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_HALF_UP
from typing import Any, Dict, Iterable, List, Optional

import rag


class ToolError(RuntimeError):
    pass


class ConfirmationRequired(ToolError):
    pass


_READ_TOOLS = {
    "search_dishes", "search_by_ingredients", "get_dish_details", "get_dish_methods",
    "get_user_context", "get_calendar_context", "get_shopping_list", "check_plan_constraints",
}
_TRANSFORM_TOOLS = {
    "scale_recipe_ingredients", "compose_meal_plan", "replace_plan_dish", "compare_dishes",
    "build_shopping_preview", "build_calendar_preview",
}
_WRITE_TOOLS = {
    "create_calendar_records", "update_calendar_records", "delete_calendar_records",
    "add_shopping_items", "update_shopping_items", "delete_shopping_items",
}


def _schema(required: Iterable[str], properties: Dict[str, Any]) -> Dict[str, Any]:
    return {"type": "object", "properties": properties, "required": list(required), "additionalProperties": False}


_COMMON_ID = {"type": ["integer", "string"]}
_CATALOG: List[Dict[str, Any]] = [
    {"name": "search_dishes", "description": "查询满足条件的已发布菜品候选", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema([], {"query": {"type": "string"}, "filters": {"type": "object"}, "top_k": {"type": "integer", "minimum": 1, "maximum": 30}})},
    {"name": "search_by_ingredients", "description": "按当前任务中的现有食材检索菜品", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema(["ingredients"], {"ingredients": {"type": "array", "items": {"type": "string"}, "maxItems": 30}, "top_k": {"type": "integer", "minimum": 1, "maximum": 30}})},
    {"name": "get_dish_details", "description": "读取真实菜品详情、原料和基础份量", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema(["dish_ids"], {"dish_ids": {"type": "array", "items": _COMMON_ID, "maxItems": 30}})},
    {"name": "get_dish_methods", "description": "读取菜库记录的做法步骤", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema(["dish_id"], {"dish_id": _COMMON_ID})},
    {"name": "get_user_context", "description": "读取当前用户明确授权的偏好、收藏和近期记录", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema([], {})},
    {"name": "get_calendar_context", "description": "查询当前用户指定日期和餐次的日历记录", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema([], {"dates": {"type": "array", "items": {"type": "string"}}, "meal_types": {"type": "array", "items": {"type": "string"}}})},
    {"name": "get_shopping_list", "description": "查询当前用户购物清单", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema([], {})},
    {"name": "check_plan_constraints", "description": "校验方案中的硬约束和整餐搭配", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema(["plan"], {"plan": {"type": "object"}, "excluded_ingredients": {"type": "array", "items": {"type": "string"}}})},
    {"name": "scale_recipe_ingredients", "description": "按服务端 Decimal 规则换算目标人数食材用量", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema(["dish", "target_people"], {"dish": {"type": "object"}, "target_people": {"type": "number", "minimum": 1, "maximum": 50}})},
    {"name": "compose_meal_plan", "description": "将工具查到的菜品组合为当前任务方案", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema(["dishes", "dates", "meal_types", "people"], {"dishes": {"type": "array"}, "dates": {"type": "array"}, "meal_types": {"type": "array"}, "people": {"type": "integer", "minimum": 1, "maximum": 50}})},
    {"name": "replace_plan_dish", "description": "只替换当前任务方案中的指定菜品", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema(["plan", "target_dish_id", "replacement_dish"], {"plan": {"type": "object"}, "target_dish_id": _COMMON_ID, "replacement_dish": {"type": "object"}})},
    {"name": "compare_dishes", "description": "比较真实候选菜品的字段和限制", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema(["dishes"], {"dishes": {"type": "array", "maxItems": 10}})},
    {"name": "build_shopping_preview", "description": "为当前方案生成按菜展示的购物清单草稿", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema(["plan"], {"plan": {"type": "object"}})},
    {"name": "build_calendar_preview", "description": "检查当前方案的日历冲突并生成预览", "mutates": False, "requires_confirmation": False,
     "input_schema": _schema(["plan"], {"plan": {"type": "object"}})},
]
for _name in sorted(_WRITE_TOOLS):
    _CATALOG.append({"name": _name, "description": "修改当前用户数据（必须经过用户确认）", "mutates": True, "requires_confirmation": True,
                     "input_schema": _schema(["preview_token", "idempotency_key"], {"preview_token": {"type": "string"}, "idempotency_key": {"type": "string"}, "payload": {"type": "object"}})})


def catalog() -> Dict[str, Any]:
    return {"version": "2.0", "tools": copy.deepcopy(_CATALOG)}


def model_catalog() -> Dict[str, Any]:
    """Return only tools the model may call during planning.

    User-data mutations remain in the public catalog for the trusted
    confirmation contract, but are intentionally not advertised to the model.
    The model proposes an action in its final JSON; the application previews,
    authorizes and executes it after the user confirms.
    """
    return {"version": "2.0", "tools": [copy.deepcopy(item) for item in _CATALOG if not item.get("mutates")]}


def tool_spec(name: str) -> Dict[str, Any]:
    for item in _CATALOG:
        if item["name"] == name:
            return copy.deepcopy(item)
    raise ToolError(f"unknown tool: {name}")


def _dish_index() -> Dict[str, Dict[str, Any]]:
    rag.load_index()
    return {str(item.get("id")): dict(item) for item in getattr(rag, "_dish_meta", []) if item.get("id") is not None}


def _parse_quantity(value: str) -> Optional[tuple]:
    text = str(value or "").strip()
    match = re.search(r"(?P<number>\d+(?:\.\d+)?)(?:\s*)(?P<unit>克|千克|g|kg|毫升|ml|mL|升|个|只|根|块|片|条|把|勺|汤匙|茶匙)", text, re.I)
    if not match:
        return None
    try:
        return Decimal(match.group("number")), match.group("unit")
    except InvalidOperation:
        return None


def _parse_ingredients(raw: Any) -> List[Dict[str, Any]]:
    text = str(raw or "")
    result: List[Dict[str, Any]] = []
    for line in re.split(r"[#\n]+", text):
        line = line.strip()
        if not line:
            continue
        if "：" in line:
            name, quantity = line.split("：", 1)
        elif ":" in line:
            name, quantity = line.split(":", 1)
        else:
            name, quantity = line, ""
        parsed = _parse_quantity(quantity)
        if parsed:
            value, unit = parsed
            result.append({"name": name.strip(), "source_quantity": quantity.strip(), "value": value, "unit": unit, "status": "calculated"})
        else:
            result.append({"name": name.strip(), "source_quantity": quantity.strip() or line, "status": "needs_adjustment"})
    return result


def _json_quantity(value: Decimal) -> str:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP).normalize().to_eng_string()


def _scale(dish: Dict[str, Any], target_people: Any) -> Dict[str, Any]:
    try:
        target = Decimal(str(target_people))
    except (InvalidOperation, TypeError):
        raise ToolError("target_people must be numeric")
    if target < 1 or target > 50:
        raise ToolError("target_people must be between 1 and 50")
    fl = str(dish.get("fl") or dish.get("servings") or "")
    base_match = re.search(r"(\d+(?:\.\d+)?)", fl)
    base = Decimal(base_match.group(1)) if base_match else Decimal("2")
    raw = dish.get("ingredientsAmounts") or dish.get("ingredients_amounts") or dish.get("cl") or dish.get("ingredients")
    if isinstance(raw, list):
        raw = "#".join(f"{item.get('name', '')}：{item.get('quantity', '')}" if isinstance(item, dict) else str(item) for item in raw)
    ingredients = []
    for item in _parse_ingredients(raw):
        item["source_base_people"] = _json_quantity(base)
        if item["status"] != "calculated":
            continue
        scaled = item["value"] * target / base
        if item["unit"] in {"个", "只", "根", "块", "片", "条", "把"}:
            scaled = scaled.quantize(Decimal("1"), rounding=ROUND_CEILING)
        item["quantity"] = _json_quantity(scaled)
        item.pop("value", None)
        item["status"] = "calculated"
        ingredients.append(item)
    for item in _parse_ingredients(raw):
        if item["status"] != "calculated":
            item["source_base_people"] = _json_quantity(base)
            ingredients.append(item)
    target_value = int(target) if target == target.to_integral_value() else float(target)
    return {"dish_id": dish.get("id"), "dish_name": dish.get("name", ""), "source_people": _json_quantity(base), "target_people": target_value, "ingredients": ingredients, "source": "database", "rounding": "half_up; count units ceiling"}


def _search(args: Dict[str, Any]) -> List[Dict[str, Any]]:
    return rag.search_candidates(str(args.get("query") or ""), filters=dict(args.get("filters") or {}), top_k=min(30, max(1, int(args.get("top_k") or 10))))


def execute_tool(name: str, arguments: Optional[Dict[str, Any]] = None, user_scope: str = "", confirmation_context: Optional[Dict[str, Any]] = None) -> Any:
    arguments = dict(arguments or {})
    tool_spec(name)  # validates name
    if name in _WRITE_TOOLS:
        if not confirmation_context or confirmation_context.get("confirmed") is not True:
            raise ConfirmationRequired(f"{name} requires user confirmation")
        return {"success": True, "tool": name, "status": "delegated_to_trusted_business_service"}
    if name == "search_dishes":
        return _search(arguments)
    if name == "search_by_ingredients":
        return rag.search_by_ingredients([str(item) for item in arguments.get("ingredients") or []], top_k=min(30, max(1, int(arguments.get("top_k") or 10))))
    if name in {"get_dish_details", "get_dish_methods"}:
        index = _dish_index()
        ids = arguments.get("dish_ids") if name == "get_dish_details" else [arguments.get("dish_id")]
        dishes = [index[str(value)] for value in ids or [] if str(value) in index]
        if name == "get_dish_methods":
            return [{"id": dish.get("id"), "name": dish.get("name"), "steps": dish.get("step") or dish.get("steps") or dish.get("methods") or "", "source": "database"} for dish in dishes]
        return dishes
    if name == "get_user_context":
        if not str(user_scope).startswith("user:"):
            return {"scope": "guest", "authorized_context": {}}
        try:
            from db import fetch_user_assistant_context, fetch_recent_dish_names
            user_id = int(str(user_scope).split(":", 1)[1])
            context = fetch_user_assistant_context(user_id) or {}
            context["recent_dish_names"] = fetch_recent_dish_names(user_id, limit=12)
            return {"scope": "user", "authorized_context": context}
        except Exception:
            return {"scope": "user", "authorized_context": {}}
    if name in {"get_calendar_context", "get_shopping_list"}:
        if not str(user_scope).startswith("user:"):
            return {"scope": "guest", "records": [], "available": False}
        try:
            from db import fetch_user_calendar_context, fetch_user_shopping_context
            user_id = int(str(user_scope).split(":", 1)[1])
            if name == "get_calendar_context":
                return {"scope": "user", "records": fetch_user_calendar_context(user_id, arguments.get("dates"), arguments.get("meal_types")), "available": True}
            return {"scope": "user", **fetch_user_shopping_context(user_id)}
        except Exception:
            return {"scope": "user", "records": [], "available": False}
    if name == "check_plan_constraints":
        plan = arguments.get("plan") or {}
        excluded = {rag.normalize_ingredient(item) for item in arguments.get("excluded_ingredients") or []}
        violations = []
        for meal in plan.get("meals") or []:
            for dish in meal.get("dishes") or []:
                ingredients = {rag.normalize_ingredient(item) for item in (dish.get("ingredients") or [])}
                if excluded.intersection(ingredients):
                    violations.append({"dish_id": dish.get("id", dish.get("dish_id")), "reason": "excluded_ingredient"})
        return {"valid": not violations, "violations": violations}
    if name == "scale_recipe_ingredients":
        return _scale(arguments.get("dish") or {}, arguments.get("target_people"))
    if name == "compose_meal_plan":
        dishes = [dict(item) for item in arguments.get("dishes") or [] if item.get("id") is not None]
        dates = [str(item) for item in arguments.get("dates") or []]
        meals = [str(item) for item in arguments.get("meal_types") or ["dinner"]]
        return {"period": {"dates": dates, "meal_types": meals, "people": int(arguments.get("people") or 2)}, "meals": [{"date": current, "meal_type": meal, "dishes": copy.deepcopy(dishes)} for current in dates for meal in meals], "source": "database"}
    if name == "replace_plan_dish":
        plan = copy.deepcopy(arguments.get("plan") or {})
        target = str(arguments.get("target_dish_id"))
        replacement = copy.deepcopy(arguments.get("replacement_dish") or {})
        for meal in plan.get("meals") or []:
            for index, dish in enumerate(meal.get("dishes") or []):
                if str(dish.get("id", dish.get("dish_id"))) == target:
                    replacement["replaced_from"] = dish.get("id", dish.get("dish_id"))
                    meal["dishes"][index] = replacement
        return plan
    if name == "compare_dishes":
        return [{"id": dish.get("id"), "name": dish.get("name"), "type": dish.get("type"), "ingredients": dish.get("ingredients"), "cook_minutes": dish.get("cook_minutes"), "tags": dish.get("tags")} for dish in arguments.get("dishes") or []]
    if name in {"build_shopping_preview", "build_calendar_preview"}:
        plan = copy.deepcopy(arguments.get("plan") or {})
        if name == "build_calendar_preview":
            return {"action_type": "SAVE_CALENDAR", "requires_confirmation": True, "conflicts": [], "plan": plan}
        groups = []
        for meal in plan.get("meals") or []:
            for dish in meal.get("dishes") or []:
                scaled = _scale(dish, dish.get("target_people") or (plan.get("period") or {}).get("people") or 2)
                groups.append({"selection_key": f"assistant-{meal.get('date')}-{meal.get('meal_type')}-{dish.get('id')}", "dish_id": dish.get("id"), "dish_name": dish.get("name"), "date": meal.get("date"), "meal_type": meal.get("meal_type"), "target_people": scaled["target_people"], "items": scaled["ingredients"]})
        return {"action_type": "ADD_SHOPPING_LIST", "requires_confirmation": True, "dishes": groups, "plan": plan}
    raise ToolError(f"tool is not implemented: {name}")
