"""Stateless V4 task adapter. Java owns drafts; only read tools are exposed."""
from __future__ import annotations

import copy
import hmac
import json
import time
from typing import Any


def authorized(provided: str, configured: str) -> bool:
    return bool(configured and provided and hmac.compare_digest(provided, configured))


def validate_result(value: dict, context: dict, sourced_ids: set[int]) -> dict:
    result = copy.deepcopy(value)
    if result.get("needsInput") is not False or result.get("constraintsUnderstood") is not True:
        return {"needsInput": True, "message": "请补充或使用设置面板明确本餐限制", "dishIds": []}
    if result.get("date") != context.get("date") or result.get("mealType") != context.get("mealType"):
        return {"needsInput": True, "message": "需求指向其他日期或餐次，请先切换当前餐再安排", "dishIds": [],
                "suggestedTarget": {"date": result.get("date"), "mealType": result.get("mealType")}}
    ids = result.get("dishIds")
    if not isinstance(ids, list) or not 1 <= len(ids) <= 10:
        raise ValueError("invalid dish count")
    if any(not isinstance(i, int) or isinstance(i, bool) or i not in sourced_ids for i in ids):
        raise ValueError("dish was not returned by a read tool")
    result["dishIds"] = list(dict.fromkeys(ids))
    criteria = result.get("criteria") or {}
    allowed = {"cuisineCodes", "includeTagCodes", "excludeTagCodes", "excludedIngredients", "maxCookMinutes"}
    if not isinstance(criteria, dict) or set(criteria) - allowed:
        raise ValueError("invalid interpreted criteria")
    for key in allowed - {"maxCookMinutes"}:
        values = criteria.get(key, [])
        if not isinstance(values, list) or len(values) > 30 or any(not isinstance(v, str) or len(v) > 40 for v in values):
            raise ValueError("invalid criterion values")
    result["criteria"] = criteria
    return result


def run_task(workspace: dict, user_id: int, model=None, execute=None) -> dict[str, Any]:
    from model_client import DeepSeekModelClient
    import agent_tools
    from agent_schemas import validate_tool_call

    context = workspace.get("context") or {}
    model = model or DeepSeekModelClient(timeout=10)
    execute = execute or agent_tools.execute_tool
    tools = [t for t in agent_tools.model_catalog()["tools"] if t["name"] in {
        "search_dishes", "search_by_ingredients", "get_dish_details", "get_dish_methods"}]
    messages = [{"role": "system", "content": json.dumps({
        "instruction": "理解本餐自由文本并用只读工具选择真实菜品。明确限制全部转为 criteria 或 totalCookMinutes，不能确定时 needsInput=true。不得编造菜品、营养或用时。日期餐次与工作区不同时返回实际目标并等待用户切换。保留菜品必须包含。只返回 JSON。",
        "context": context, "lockedDishIds": workspace.get("draft", {}).get("lockedDishIds", []),
        "contract": {"needsInput": "boolean", "constraintsUnderstood": "boolean", "message": "string",
                     "date": "YYYY-MM-DD", "mealType": "breakfast|lunch|dinner", "dishIds": "integer[]",
                     "criteria": {"cuisineCodes": [], "includeTagCodes": [], "excludeTagCodes": [], "excludedIngredients": [], "maxCookMinutes": None},
                     "totalCookMinutes": "null or positive integer (entire meal serial duration)"},
    }, ensure_ascii=False)}, {"role": "user", "content": str(context.get("requirements") or "")[:2000]}]
    sourced = set()
    started = time.monotonic()
    for round_number in range(4):
        remaining = 14 - (time.monotonic() - started)
        if remaining <= 0:
            break
        if hasattr(model, "timeout"):
            model.timeout = min(10, remaining)
        response = model.complete(messages, tools, {"type": "object"})
        if response.get("final"):
            return validate_result(response["final"], context, sourced)
        call = validate_tool_call(response.get("tool_call"), {t["name"] for t in tools}, tools)
        records = execute(call["name"], call["arguments"], f"user:{int(user_id)}")
        def collect(value):
            if isinstance(value, dict):
                identifier = value.get("id", value.get("dish_id"))
                if identifier is not None:
                    try:
                        sourced.add(int(identifier))
                    except (ValueError, TypeError):
                        raise ValueError("invalid identifier from tool")
                for child in value.values():
                    collect(child)
            elif isinstance(value, list):
                for child in value:
                    collect(child)
        collect(records)
        call_id = call.get("id") or f"v4_{round_number}"
        messages.extend([{"role": "assistant", "tool_calls": [{"id": call_id, "type": "function", "function": {
            "name": call["name"], "arguments": json.dumps(call["arguments"], ensure_ascii=False)}}]},
            {"role": "tool", "tool_call_id": call_id, "content": json.dumps(records, ensure_ascii=False)}])
    return {"needsInput": True, "message": "本次理解超时，请在设置面板明确限制后重试", "dishIds": []}
