"""Small dependency-free schemas for model tool calls and final plans."""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, Iterable, List, Optional, Set


class SchemaValidationError(ValueError):
    pass


ALLOWED_INTENTS = {"meal_plan", "ingredient_match", "period_plan", "replace", "howto", "chat"}
ALLOWED_ACTIONS = {"SAVE_CALENDAR", "UPDATE_CALENDAR", "DELETE_CALENDAR", "ADD_SHOPPING_LIST", "UPDATE_SHOPPING_LIST", "DELETE_SHOPPING_LIST"}
ALLOWED_MEALS = {"breakfast", "lunch", "dinner"}
FINAL_REQUIRED_FIELDS = {"intent", "need_clarification", "reply", "plan", "actions", "warnings", "sources"}


def _required(mapping: Dict[str, Any], key: str) -> Any:
    value = mapping.get(key)
    if value is None:
        raise SchemaValidationError(f"missing field: {key}")
    return value


def _validate_schema_value(value: Any, schema: Dict[str, Any], path: str) -> None:
    """Validate the small JSON-Schema subset used by the tool catalog."""
    expected = schema.get("type")
    expected_types = expected if isinstance(expected, list) else [expected]
    if expected_types and expected_types != [None]:
        valid = False
        for type_name in expected_types:
            if type_name == "object" and isinstance(value, dict): valid = True
            elif type_name == "array" and isinstance(value, list): valid = True
            elif type_name == "string" and isinstance(value, str): valid = True
            elif type_name == "integer" and isinstance(value, int) and not isinstance(value, bool): valid = True
            elif type_name == "number" and isinstance(value, (int, float)) and not isinstance(value, bool): valid = True
            elif type_name == "boolean" and isinstance(value, bool): valid = True
        if not valid:
            raise SchemaValidationError(f"invalid tool argument type: {path}")
    if isinstance(value, str) and isinstance(schema.get("maxLength"), int) and len(value) > schema["maxLength"]:
        raise SchemaValidationError(f"tool argument is too long: {path}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if schema.get("minimum") is not None and value < schema["minimum"]:
            raise SchemaValidationError(f"tool argument is below minimum: {path}")
        if schema.get("maximum") is not None and value > schema["maximum"]:
            raise SchemaValidationError(f"tool argument is above maximum: {path}")
    if isinstance(value, list):
        if schema.get("maxItems") is not None and len(value) > schema["maxItems"]:
            raise SchemaValidationError(f"too many tool argument items: {path}")
        item_schema = schema.get("items") or {}
        for index, item in enumerate(value):
            _validate_schema_value(item, item_schema, f"{path}[{index}]")
    if isinstance(value, dict) and schema.get("additionalProperties") is False:
        properties = schema.get("properties") or {}
        for key, child in value.items():
            if key in properties:
                _validate_schema_value(child, properties[key], f"{path}.{key}")


def validate_tool_call(call: Dict[str, Any], allowed_tools: Set[str], tool_catalog: Optional[Iterable[Dict[str, Any]]] = None) -> Dict[str, Any]:
    if not isinstance(call, dict):
        raise SchemaValidationError("tool call must be an object")
    name = str(call.get("name") or "").strip()
    if name not in allowed_tools:
        raise SchemaValidationError(f"tool is not allowed: {name}")
    arguments = call.get("arguments", {})
    if not isinstance(arguments, dict):
        raise SchemaValidationError("tool arguments must be an object")
    if tool_catalog is not None:
        spec = next((item for item in tool_catalog if item.get("name") == name), None)
        schema = (spec or {}).get("input_schema") or {}
        for field in schema.get("required") or []:
            if field not in arguments or arguments.get(field) is None:
                raise SchemaValidationError(f"missing tool argument: {name}.{field}")
        if schema.get("additionalProperties") is False:
            allowed_fields = set((schema.get("properties") or {}).keys())
            unknown = set(arguments.keys()) - allowed_fields
            if unknown:
                raise SchemaValidationError(f"unknown tool arguments: {name}.{sorted(unknown)[0]}")
        _validate_schema_value(arguments, schema, name)
    return {"name": name, "arguments": arguments, "id": call.get("id")}


def validate_final_output(payload: Dict[str, Any], allowed_dish_ids: Iterable[Any] = ()) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise SchemaValidationError("final output must be an object")
    missing = FINAL_REQUIRED_FIELDS - set(payload.keys())
    if missing:
        raise SchemaValidationError(f"final output is missing: {sorted(missing)[0]}")
    intent = str(payload.get("intent") or "chat")
    if intent not in ALLOWED_INTENTS:
        raise SchemaValidationError("invalid intent")
    reply = str(payload.get("reply") or "").strip()
    if len(reply) > 2000:
        raise SchemaValidationError("reply is too long")
    need_clarification = payload.get("need_clarification")
    if not isinstance(need_clarification, bool):
        raise SchemaValidationError("need_clarification must be boolean")
    plan = payload.get("plan")
    if plan is not None and not isinstance(plan, dict):
        raise SchemaValidationError("plan must be an object")
    allowed = {str(value) for value in allowed_dish_ids if value is not None}
    if plan:
        period = plan.get("period") or {}
        if not isinstance(period, dict):
            raise SchemaValidationError("plan.period must be an object")
        people = period.get("people", 2)
        try:
            if int(people) < 1 or int(people) > 50:
                raise SchemaValidationError("people must be between 1 and 50")
        except (TypeError, ValueError) as error:
            raise SchemaValidationError("people must be numeric") from error
        dates = period.get("dates") or []
        if not isinstance(dates, list) or any(not str(item).strip() for item in dates):
            raise SchemaValidationError("plan dates are invalid")
        for item in dates:
            try:
                date.fromisoformat(str(item))
            except ValueError as error:
                raise SchemaValidationError("plan dates must use YYYY-MM-DD") from error
        meals = plan.get("meals")
        if not isinstance(meals, list):
            raise SchemaValidationError("plan.meals must be an array")
        for meal in meals:
            if not isinstance(meal, dict):
                raise SchemaValidationError("meal must be an object")
            if str(meal.get("meal_type") or "") not in ALLOWED_MEALS:
                raise SchemaValidationError("invalid meal type")
            dishes = meal.get("dishes") or []
            if not isinstance(dishes, list):
                raise SchemaValidationError("meal.dishes must be an array")
            for dish in dishes:
                if not isinstance(dish, dict):
                    raise SchemaValidationError("dish must be an object")
                dish_id = dish.get("dish_id", dish.get("id"))
                if dish_id is None or str(dish_id) not in allowed:
                    raise SchemaValidationError("dish id was not returned by a tool")
                if "ingredients" in dish and not isinstance(dish["ingredients"], list):
                    raise SchemaValidationError("dish ingredients must be an array")
    actions = payload.get("actions") or []
    if not isinstance(actions, list):
        raise SchemaValidationError("actions must be an array")
    for action in actions:
        if not isinstance(action, dict) or action.get("type") not in ALLOWED_ACTIONS:
            raise SchemaValidationError("unsupported action")
        if action.get("type") in ALLOWED_ACTIONS and action.get("requires_confirmation") is not True:
            raise SchemaValidationError("user data actions require confirmation")
        if "payload" in action and not isinstance(action.get("payload"), dict):
            raise SchemaValidationError("action payload must be an object")
        action_dish_ids = action.get("dish_ids") or []
        if any(str(value) not in allowed for value in action_dish_ids):
            raise SchemaValidationError("action references an unknown dish id")
    alternatives = payload.get("alternatives") or []
    if not isinstance(alternatives, list):
        raise SchemaValidationError("alternatives must be an array")
    for alternative in alternatives:
        if isinstance(alternative, dict) and alternative.get("id", alternative.get("dish_id")) is not None:
            if str(alternative.get("id", alternative.get("dish_id"))) not in allowed:
                raise SchemaValidationError("alternative references an unknown dish id")
    warnings = payload.get("warnings") or []
    if not isinstance(warnings, list):
        raise SchemaValidationError("warnings must be an array")
    sources = payload.get("sources") or []
    if not isinstance(sources, list):
        raise SchemaValidationError("sources must be an array")
    if not plan and not need_clarification and intent not in {"chat", "howto"}:
        raise SchemaValidationError("a planning intent requires a plan or clarification")
    return payload


def to_runtime_plan(payload: Dict[str, Any], candidates: Dict[str, Dict[str, Any]], version: int) -> Optional[Dict[str, Any]]:
    source_plan = payload.get("plan")
    if not source_plan:
        return None
    period = dict(source_plan.get("period") or {})
    meals: List[Dict[str, Any]] = []
    for meal in source_plan.get("meals") or []:
        out_meal = {
            "date": str(meal.get("date") or ""),
            "meal_type": str(meal.get("meal_type") or "dinner"),
            "label": {"breakfast": "早餐", "lunch": "午餐", "dinner": "晚餐"}.get(str(meal.get("meal_type")), str(meal.get("meal_type"))),
            "dishes": [],
        }
        for requested in meal.get("dishes") or []:
            key = str(requested.get("dish_id", requested.get("id")))
            base = dict(candidates[key])
            base["match_reasons"] = [str(requested.get("reason") or "按你的需求匹配")]
            if requested.get("target_people") is not None:
                base["target_people"] = requested["target_people"]
            if isinstance(requested.get("ingredients"), list):
                base["ingredients_scaled"] = requested["ingredients"]
            out_meal["dishes"].append(base)
        meals.append(out_meal)
    return {
        "version": int(version),
        "source": "database",
        "period": period,
        "meals": meals,
        "warnings": [str(item) for item in payload.get("warnings") or []],
        "provenance": [
            {"dish_id": dish.get("id"), "source": "database"}
            for meal in meals for dish in meal.get("dishes") or [] if dish.get("id") is not None
        ],
    }
