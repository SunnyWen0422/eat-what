"""Model-driven Agent runtime with bounded tool use and rule fallback."""
from __future__ import annotations

import copy
import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional, Set

import agent_tools
import assistant_engine
from agent_policy import load_policy, policy_hash
from agent_schemas import SchemaValidationError, to_runtime_plan, validate_final_output, validate_tool_call
from assistant_store import AssistantStore
from plan_commands import next_plan_state, PlanCommandError
from model_client import ModelProtocolError, ModelUnavailable, default_model_client


STAGES = {
    "queued": ("任务已创建", 0.0),
    "understanding": ("正在理解你的需求", 0.12),
    "querying": ("正在查询菜库和相关数据", 0.38),
    "planning": ("正在组合和调整方案", 0.62),
    "validating": ("正在检查规则和数据", 0.84),
    "needs_input": ("还需要你补充一点信息", 1.0),
    "awaiting_confirmation": ("方案已准备好，等待你的确认", 1.0),
    "completed": ("方案已生成", 1.0),
    "failed": ("这次生成没有完成", 1.0),
    "cancelled": ("任务已停止", 1.0),
}


class TaskInProgressError(RuntimeError):
    pass


class TaskCancelled(RuntimeError):
    pass


class AgentRuntime:
    def __init__(self, store: Optional[AssistantStore] = None, model_factory=None):
        self.store = store or assistant_engine.SESSION_STORE
        self.model_factory = model_factory or default_model_client
        self.max_rounds = max(1, int(os.getenv("ASSISTANT_MAX_TOOL_ROUNDS", "8")))
        self.max_calls = max(1, int(os.getenv("ASSISTANT_MAX_TOOL_CALLS", "16")))
        self.timeout_seconds = max(1, float(os.getenv("ASSISTANT_TASK_TIMEOUT_SECONDS", "30")))

    def _ensure_session(self, session_id: str, user_scope: str) -> None:
        if not self.store.get(session_id, user_scope):
            self.store.create(user_scope, session_id=session_id)

    def begin_task(self, session_id: str, user_scope: str, message: str,
                   idempotency_key: Optional[str] = None, parent_task_id: Optional[str] = None) -> Dict[str, Any]:
        self._ensure_session(session_id, user_scope)
        try:
            return self.store.create_task(session_id, user_scope, message, idempotency_key or uuid.uuid4().hex, parent_task_id)
        except RuntimeError as error:
            raise TaskInProgressError(str(error)) from error

    def _event(self, task_id: str, scope: str, stage: str, message: Optional[str] = None) -> None:
        default, progress = STAGES.get(stage, (stage, 0.0))
        self.store.update_task(task_id, scope, status=stage)
        self.store.append_task_event(task_id, scope, stage, message or default, progress)

    def _raise_if_cancelled(self, task_id: str, scope: str) -> None:
        task = self.store.get_task(task_id, scope)
        if task and task.get("status") == "cancelled":
            raise TaskCancelled("agent task cancelled")

    def _task_result(self, task_id: str, scope: str, result: Dict[str, Any], status: str) -> Dict[str, Any]:
        task = self.store.update_task(task_id, scope, status=status, result=result) or {}
        response = dict(result)
        response["task_id"] = task_id
        previous_task = result.get("task") if isinstance(result.get("task"), dict) else {}
        response["task"] = {
            "id": task_id, "session_id": task.get("session_id"), "type": previous_task.get("type", previous_task.get("task_type", "meal_plan")),
            "status": status, "progress": 1.0,
        }
        response["events"] = task.get("events", [])
        return response

    def _fallback(self, task_id: str, session_id: str, scope: str, message: str, reason: str) -> Dict[str, Any]:
        self._event(task_id, scope, "planning", "正在使用本地菜库和规则整理方案")
        try:
            result = assistant_engine.handle_message(message, scope, session_id=session_id)
        except PlanCommandError as error:
            return self._plan_constraint_result(task_id, session_id, scope, error)
        result = copy.deepcopy(result or {})
        base_reply = str(result.get("reply") or "我先按本地菜库和规则为你整理了一套方案。")
        result["reply"] = "当前智能模型暂时不可用，我先使用本地菜库和规则处理。" + base_reply
        result["mode"] = "rule"
        result["degradation"] = {"active": True, "reason": reason, "message": "复杂需求可能无法完整满足，你可以稍后重试。"}
        result["policy_hash"] = policy_hash()
        self._event(task_id, scope, "validating", "正在检查本地规则结果")
        status = "completed" if result.get("plan") or result.get("howto") else "needs_input"
        self._event(task_id, scope, status)
        return self._task_result(task_id, scope, result, status)

    def _plan_constraint_result(self, task_id, session_id, scope, error):
        # A user edit constraint is recoverable; it must not leave a running task.
        state = (self.store.get(session_id, scope) or {}).get("state") or {}
        reply = str(error) + "。原方案已保留，请解除对应菜品的保留后重试。"
        self.store.append_message(session_id, scope, "assistant", reply)
        self._event(task_id, scope, "needs_input", reply)
        return self._task_result(task_id, scope, {
            "success": True, "session_id": session_id, "reply": reply,
            "plan": state.get("plan"), "can_undo": len(state.get("plan_history") or []) > 1,
            "actions": [], "warnings": [str(error)],
        }, "needs_input")

    @staticmethod
    def _collect_ids(value: Any, output: Optional[Set[str]] = None) -> Set[str]:
        output = output or set()
        if isinstance(value, dict):
            if value.get("id") is not None:
                output.add(str(value["id"]))
            if value.get("dish_id") is not None:
                output.add(str(value["dish_id"]))
            for child in value.values():
                AgentRuntime._collect_ids(child, output)
        elif isinstance(value, list):
            for child in value:
                AgentRuntime._collect_ids(child, output)
        return output

    @staticmethod
    def _collect_sourced_records(value: Any) -> List[Dict[str, Any]]:
        """Flatten trusted tool records so transform results retain ID provenance."""
        records: List[Dict[str, Any]] = []
        if isinstance(value, dict):
            if value.get("id") is not None or value.get("dish_id") is not None:
                record = dict(value)
                if record.get("id") is None:
                    record["id"] = record.get("dish_id")
                records.append(record)
            for child in value.values():
                records.extend(AgentRuntime._collect_sourced_records(child))
        elif isinstance(value, list):
            for child in value:
                records.extend(AgentRuntime._collect_sourced_records(child))
        return records

    def _persist_model_result(self, session_id: str, scope: str, message: str,
                              payload: Dict[str, Any], candidates: Dict[str, Dict[str, Any]], version: int) -> Dict[str, Any]:
        previous = (self.store.get(session_id, scope) or {}).get("state") or {}
        plan = to_runtime_plan(payload, candidates, version)
        history_state = next_plan_state(previous, plan)
        plan = history_state.get("plan")
        version = (plan or {}).get("version", version)
        state = {
            "request": {"message": message, "intent": payload.get("intent", "chat"), "skill": "dynamic"},
            "plan": plan,
            "howto": payload.get("howto"),
            "alternatives": payload.get("alternatives") or [],
            "task": {"type": payload.get("intent", "chat"), "status": "ready" if plan else "needs_input", "progress": 1.0},
            "active_plan_version": version if plan else None,
            "next_plan_version": version + 1,
            "policy_version": load_policy().get("policy_version"),
            "policy_hash": policy_hash(),
            "mode": "model",
        }
        if plan:
            state["plan_history"] = history_state.get("plan_history") or [copy.deepcopy(plan)]
            state["plan_archive"] = history_state.get("plan_archive") or []
        self.store.append_message(session_id, scope, "user", message)
        self.store.append_message(session_id, scope, "assistant", str(payload.get("reply") or ""))
        self.store.update_state(session_id, scope, state)
        response = {
            "success": True,
            "assistant_version": "2.0",
            "session_id": session_id,
            "reply": payload.get("reply") or "",
            "intent": payload.get("intent", "chat"),
            "skill": "dynamic",
            "plan": plan,
            "dishes": [dish for meal in (plan or {}).get("meals", []) for dish in meal.get("dishes", [])],
            "howto": payload.get("howto"),
            "alternatives": payload.get("alternatives") or [],
            "actions": payload.get("actions") or [],
            "warnings": payload.get("warnings") or [],
            "source": "database" if candidates else "none",
            "can_undo": len(state.get("plan_history") or []) > 1,
            "mode": "model",
            "policy_version": state["policy_version"],
            "policy_hash": state["policy_hash"],
        }
        return response

    @staticmethod
    def _apply_trusted_scaling(payload: Dict[str, Any], scaled_results: Dict[tuple, Dict[str, Any]]) -> None:
        """Replace model-provided ingredient numbers with tool-calculated values.

        The model may choose a target serving count, but it cannot invent or
        edit the resulting grams/counts.  A plan that includes inline scaled
        ingredients must therefore be backed by a preceding scale tool call.
        """
        plan = payload.get("plan")
        if not isinstance(plan, dict):
            return
        period = plan.get("period") or {}
        default_people = period.get("people", 2)
        for meal in plan.get("meals") or []:
            for dish in meal.get("dishes") or []:
                if "ingredients" not in dish and "target_people" not in dish:
                    continue
                dish_id = dish.get("dish_id", dish.get("id"))
                target = dish.get("target_people", default_people)
                key = (str(dish_id), str(target))
                scaled = scaled_results.get(key)
                if scaled is None:
                    raise SchemaValidationError("scaled ingredients require scale_recipe_ingredients")
                if "ingredients" in dish:
                    dish["ingredients"] = copy.deepcopy(scaled.get("ingredients") or [])
                dish["target_people"] = scaled.get("target_people", target)

    def run(self, message: str, user_scope: str, session_id: Optional[str] = None,
            idempotency_key: Optional[str] = None, parent_task_id: Optional[str] = None) -> Dict[str, Any]:
        session_id = session_id or uuid.uuid4().hex
        task = self.begin_task(session_id, user_scope, message, idempotency_key, parent_task_id)
        task_id = task["task_id"]
        if task.get("_existing"):
            if task.get("result"):
                return self._task_result(task_id, user_scope, task["result"], task["status"])
            return {"success": True, "task_id": task_id, "session_id": session_id,
                    "task": {"id": task_id, "status": task["status"], "progress": 0.0},
                    "events": task.get("events", [])}
        if task.get("status") in {"completed", "failed", "cancelled"} and task.get("result"):
            return self._task_result(task_id, user_scope, task["result"], task["status"])
        mode = str(os.getenv("ASSISTANT_AGENT_MODE", "model")).strip().lower()
        if mode == "rule":
            return self._fallback(task_id, session_id, user_scope, message, "rule_mode")
        started = time.monotonic()
        self._event(task_id, user_scope, "understanding")
        policy = load_policy()
        session = self.store.get(session_id, user_scope) or {}
        history = [{"role": item.get("role"), "content": item.get("content")} for item in (session.get("messages") or [])[-12:]]
        final_contract = {
            "intent": "meal_plan|ingredient_match|period_plan|replace|howto|chat",
            "need_clarification": "boolean",
            "reply": "string",
            "plan": "null or {period:{people:number,dates:[YYYY-MM-DD]},meals:[{date,meal_type,dishes:[{dish_id,reason,target_people?,ingredients?}]}]}",
            "actions": "[{type: SAVE_CALENDAR|UPDATE_CALENDAR|DELETE_CALENDAR|ADD_SHOPPING_LIST|UPDATE_SHOPPING_LIST|DELETE_SHOPPING_LIST, requires_confirmation:true}]",
            "alternatives": "array", "warnings": "array", "sources": "array",
        }
        messages: List[Dict[str, Any]] = [{"role": "system", "content": json.dumps({
            "agent_policy": policy,
            "instruction": "根据用户需求动态选择查询和变换工具，最后只返回符合 final_contract 的 JSON。只能使用工具返回的菜品 ID；不要调用用户数据写入工具。所有用户数据写入只输出 requires_confirmation=true 的动作，由应用在用户确认后执行。",
            "final_contract": final_contract,
        }, ensure_ascii=False)}]
        messages.extend(history)
        messages.append({"role": "user", "content": str(message or "")[:4000]})
        candidates: Dict[str, Dict[str, Any]] = {}
        scaled_results: Dict[tuple, Dict[str, Any]] = {}
        tool_messages: List[Dict[str, Any]] = []
        tool_calls_used = 0
        repair_attempted = False
        model_tools = agent_tools.model_catalog()["tools"]
        try:
            model = self.model_factory()
            for round_number in range(self.max_rounds):
                self._raise_if_cancelled(task_id, user_scope)
                if time.monotonic() - started >= self.timeout_seconds:
                    raise ModelUnavailable("agent task timed out")
                try:
                    response = model.complete(messages + tool_messages, model_tools, {"type": "object"})
                except ModelProtocolError:
                    if repair_attempted:
                        raise
                    repair_attempted = True
                    messages.append({"role": "system", "content": "上次响应格式无效。请只输出一个符合 final_contract 的 JSON 对象，不要 Markdown、解释或代码围栏。"})
                    continue
                if response.get("tool_call"):
                    if tool_calls_used >= self.max_calls:
                        raise ModelUnavailable("tool call limit exceeded")
                    tool_calls_used += 1
                    tool_catalog = model_tools
                    call = validate_tool_call(response["tool_call"], {item["name"] for item in tool_catalog}, tool_catalog)
                    self._event(task_id, user_scope, "querying" if call["name"] in agent_tools._READ_TOOLS else "planning", f"正在调用 {call['name']}")
                    tool_result = None
                    tool_error = None
                    # A transient database/index failure gets one bounded
                    # retry.  Invalid calls are still rejected by the schema
                    # validator and are not allowed to loop indefinitely.
                    for attempt in range(2):
                        try:
                            tool_result = agent_tools.execute_tool(call["name"], call["arguments"], user_scope)
                            tool_error = None
                            break
                        except Exception as error:
                            tool_error = error
                    if tool_error is not None:
                        tool_result = {
                            "error": "tool_error",
                            "message": str(tool_error)[:300],
                            "requires_confirmation": isinstance(tool_error, agent_tools.ConfirmationRequired),
                        }
                    # Only direct lookup tools establish dish provenance. A
                    # transform result may contain IDs copied from model input
                    # (for example compose_meal_plan), so accepting those IDs
                    # would let a model smuggle a fabricated dish into the
                    # final plan.
                    if call["name"] in {"search_dishes", "search_by_ingredients", "get_dish_details", "get_dish_methods"}:
                        for sourced in AgentRuntime._collect_sourced_records(tool_result):
                            identifier = str(sourced.get("id"))
                            candidates.setdefault(identifier, sourced)
                    if call["name"] == "scale_recipe_ingredients" and isinstance(tool_result, dict) and tool_result.get("dish_id") is not None and tool_result.get("ingredients") is not None:
                        if str(tool_result.get("dish_id")) not in candidates:
                            raise SchemaValidationError("scaling requires a dish returned by a lookup tool")
                        scaled_results[(str(tool_result.get("dish_id")), str(tool_result.get("target_people")))] = copy.deepcopy(tool_result)
                    tool_messages.append({"role": "assistant", "tool_calls": [{"id": call.get("id") or f"call_{round_number}", "type": "function", "function": {"name": call["name"], "arguments": json.dumps(call["arguments"], ensure_ascii=False)}}]})
                    tool_messages.append({"role": "tool", "tool_call_id": call.get("id") or f"call_{round_number}", "content": json.dumps(tool_result, ensure_ascii=False)[:12000]})
                    continue
                payload = response.get("final")
                if payload is None:
                    raise ModelProtocolError("model did not return tool call or final JSON")
                self._raise_if_cancelled(task_id, user_scope)
                self._event(task_id, user_scope, "validating")
                try:
                    validated = validate_final_output(payload, allowed_dish_ids=set(candidates.keys()))
                    self._apply_trusted_scaling(validated, scaled_results)
                except SchemaValidationError:
                    if repair_attempted:
                        raise
                    repair_attempted = True
                    messages.append({"role": "assistant", "content": json.dumps(payload, ensure_ascii=False)})
                    messages.append({"role": "system", "content": "上次 JSON 未通过服务端校验。请修正后只输出一个符合 final_contract 的 JSON；菜品 ID 必须来自工具结果，份量必须来自换算工具，不要 Markdown。"})
                    continue
                version = int((session.get("state") or {}).get("next_plan_version") or 1)
                result = self._persist_model_result(session_id, user_scope, message, validated, candidates, version)
                result["mode"] = "model"
                self._event(task_id, user_scope, "awaiting_confirmation" if result.get("actions") else "completed")
                final_status = "awaiting_confirmation" if result.get("actions") else "completed"
                return self._task_result(task_id, user_scope, result, final_status)
            raise ModelUnavailable("agent tool loop exceeded round limit")
        except PlanCommandError as error:
            return self._plan_constraint_result(task_id, session_id, user_scope, error)
        except TaskCancelled:
            return self._task_result(task_id, user_scope, {
                "success": False, "error_code": "ASSISTANT_TASK_CANCELLED", "message": "任务已停止",
            }, "cancelled")
        except (ModelUnavailable, ModelProtocolError, SchemaValidationError, agent_tools.ToolError, TimeoutError) as error:
            return self._fallback(task_id, session_id, user_scope, message, str(error))

    def get_task(self, task_id: str, user_scope: str) -> Optional[Dict[str, Any]]:
        return self.store.get_task(task_id, user_scope)

    def cancel_task(self, task_id: str, user_scope: str) -> Optional[Dict[str, Any]]:
        task = self.store.cancel_task(task_id, user_scope)
        if task:
            self.store.update_task(task_id, user_scope, status="cancelled", result={"success": False, "error_code": "ASSISTANT_TASK_CANCELLED", "message": "任务已停止"})
        return self.store.get_task(task_id, user_scope)


RUNTIME = AgentRuntime()
