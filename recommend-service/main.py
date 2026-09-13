"""FastAPI 入口 - 菜谱推荐服务"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from fastapi.responses import StreamingResponse, JSONResponse
import uuid
import rag
import chat_handler
import assistant_engine
import agent_runtime

app = FastAPI(
    title="吃什么 - 菜谱推荐服务",
    description="基于 LangGraph + 通义千问的健康饮食搭配推荐",
    version="1.0.0",
)

class RecommendRequest(BaseModel):
    people: Optional[int] = 2
    meat_count: Optional[int] = None
    meat: Optional[int] = 2
    veg_count: Optional[int] = None
    veg: Optional[int] = 2
    soup_count: Optional[int] = None
    soup: Optional[int] = 1
    meal_type: Optional[str] = "lunch"
    selected_dishes: Optional[List[Any]] = None
    selected_recipe: Optional[dict] = None
    user_id: Optional[int] = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/recommend")
def recommend(req: RecommendRequest):
    """生成菜谱推荐"""
    from graph.graph import run_recommend

    params = {
        "people": req.people or 2,
        "meat_count": req.meat_count if req.meat_count is not None else (req.meat or 2),
        "veg_count": req.veg_count if req.veg_count is not None else (req.veg or 2),
        "soup_count": req.soup_count if req.soup_count is not None else (req.soup or 1),
        "meal_type": req.meal_type or "lunch",
        "selected_dishes": req.selected_dishes,
        "selected_recipe": req.selected_recipe,
        "user_id": req.user_id,
    }
    try:
        result = run_recommend(params)
        plans = result.get("plans") or []
        error = result.get("error")
        if error and not plans:
            raise HTTPException(status_code=500, detail=error)
        return {"success": True, "plans": plans}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ChatRequest(BaseModel):
    message: str
    user_id: Optional[str] = "guest"

@app.post("/chat")
async def chat(req: ChatRequest):
    """AI 对话接口 — SSE 流式返回"""
    async def generate():
        async for chunk in chat_handler.stream_chat(req.message, req.user_id or "guest"):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


class ChatSyncRequest(BaseModel):
    message: str
    user_id: Optional[str] = "guest"

@app.post("/chat/sync")
async def chat_sync(req: ChatSyncRequest):
    """非流式版本"""
    result = chat_handler.chat(req.message, req.user_id or "guest")
    if isinstance(result, dict):
        response = {"reply": result.get("reply",""), "dishes": result.get("dishes",[]), "success": True}
        if result.get("action"):
            response["action"] = result["action"]
        return response
    else:
        return {"reply": str(result), "dishes": [], "success": True}


class AssistantSessionRequest(BaseModel):
    session_id: Optional[str] = None
    user_id: Optional[str] = None


class AssistantMessageRequest(BaseModel):
    message: Optional[str] = None
    user_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    parent_task_id: Optional[str] = None


class AssistantActionPreviewRequest(BaseModel):
    action_type: str
    plan_version: int = 1
    payload: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = None


class AssistantActionConfirmRequest(BaseModel):
    action_type: str
    plan_version: int = 1
    preview_token: str
    idempotency_key: str
    payload: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = None


class AssistantUndoRequest(BaseModel):
    plan_version: Optional[int] = None
    user_id: Optional[str] = None


class AssistantTaskRequest(BaseModel):
    user_id: Optional[str] = None
    session_id: Optional[str] = None


def _assistant_scope(user_id: Optional[Any], session_id: Optional[str] = None) -> str:
    """Resolve an ownership scope without trusting a client-supplied user id.

    Java normally sends the authenticated id as ``user_id``. Guest sessions
    are deliberately scoped by their opaque session id, so two guests cannot
    share the old global ``guest`` conversation.
    """
    if user_id is not None and str(user_id).strip() and str(user_id).strip().lower() != "guest":
        return "user:" + str(user_id).strip()[:96]
    if session_id:
        return "guest:" + str(session_id)
    return "guest:" + uuid.uuid4().hex


def _assistant_error(status: int, code: str, message: str):
    """Return one stable error envelope for both direct and Java-proxied calls."""
    return JSONResponse(status_code=status, content={
        "success": False,
        "error_code": code,
        "errorCode": code,
        "message": message,
    })


def _assistant_invalid_session_error():
    return _assistant_error(422, "ASSISTANT_SESSION_ID_INVALID", "助手会话标识格式无效")


@app.post("/assistant/sessions")
def create_assistant_session(req: AssistantSessionRequest):
    session_id = req.session_id or uuid.uuid4().hex
    scope = _assistant_scope(req.user_id, session_id)
    try:
        session = assistant_engine.SESSION_STORE.create(scope, session_id=session_id)
    except ValueError as error:
        return _assistant_error(422, "ASSISTANT_SESSION_ID_INVALID", str(error))
    return {
        "success": True,
        "session_id": session["session_id"],
        "assistant_version": assistant_engine.ASSISTANT_VERSION,
        "task": {"id": session["session_id"], "type": "idle", "status": "ready", "progress": 0.0},
        "state": session.get("state", {}),
        "messages": session.get("messages", []),
    }


@app.get("/assistant/sessions/{session_id}")
def get_assistant_session(session_id: str, user_id: Optional[str] = None):
    try:
        session = assistant_engine.get_session(session_id, _assistant_scope(user_id, session_id))
    except ValueError:
        return _assistant_invalid_session_error()
    if not session:
        return _assistant_error(404, "ASSISTANT_SESSION_NOT_FOUND", "助手会话不存在或已过期")
    return {"success": True, "session_id": session_id, **session}


@app.post("/assistant/sessions/{session_id}/messages")
def send_assistant_message(session_id: str, req: AssistantMessageRequest):
    message = str(req.message or "").strip()
    if not message:
        return _assistant_error(422, "ASSISTANT_MESSAGE_INVALID", "消息不能为空")
    scope = _assistant_scope(req.user_id, session_id)
    try:
        # Reject malformed IDs before creating any session state. This also
        # keeps a bad client request from being interpreted as a new guest.
        assistant_engine.SESSION_STORE._session_id(session_id)
        return agent_runtime.RUNTIME.run(
            message, scope, session_id=session_id,
            idempotency_key=req.idempotency_key,
            parent_task_id=req.parent_task_id,
        )
    except agent_runtime.TaskInProgressError:
        return _assistant_error(409, "ASSISTANT_TASK_IN_PROGRESS", "当前会话已有任务生成中，请先停止后再发送")
    except ValueError:
        return _assistant_invalid_session_error()
    except Exception as error:
        # Keep a stable typed response for the mini program; do not expose
        # database credentials or model request details to clients.
        return _assistant_error(503, "ASSISTANT_SERVICE_UNAVAILABLE", "助手暂时不可用，请稍后重试")


@app.delete("/assistant/sessions/{session_id}")
def delete_assistant_session(session_id: str, user_id: Optional[str] = None):
    try:
        deleted = assistant_engine.delete_session(session_id, _assistant_scope(user_id, session_id))
    except ValueError:
        return _assistant_invalid_session_error()
    if not deleted:
        return _assistant_error(404, "ASSISTANT_SESSION_NOT_FOUND", "助手会话不存在或已过期")
    return {"success": True}


@app.post("/assistant/sessions/{session_id}/actions/preview")
def preview_assistant_action(session_id: str, req: AssistantActionPreviewRequest):
    try:
        result = assistant_engine.preview_action(
            session_id,
            _assistant_scope(req.user_id, session_id),
            req.action_type,
            req.plan_version,
            req.payload,
        )
    except ValueError:
        return _assistant_invalid_session_error()
    if not result.get("success"):
        status = 404 if result.get("error_code") == "ASSISTANT_SESSION_NOT_FOUND" else 409 if result.get("error_code") == "ASSISTANT_PLAN_VERSION_CONFLICT" else 422
        return JSONResponse(status_code=status, content=result)
    return result


@app.post("/assistant/sessions/{session_id}/undo")
def undo_assistant_plan(session_id: str, req: AssistantUndoRequest):
    try:
        result = assistant_engine.undo_last_plan(
            session_id,
            _assistant_scope(req.user_id, session_id),
            req.plan_version,
        )
    except ValueError:
        return _assistant_invalid_session_error()
    if not result.get("success"):
        status = 404 if result.get("error_code") == "ASSISTANT_SESSION_NOT_FOUND" else 409 if result.get("error_code") == "ASSISTANT_PLAN_VERSION_CONFLICT" else 422
        return JSONResponse(status_code=status, content=result)
    return result


@app.post("/assistant/sessions/{session_id}/actions/confirm")
def confirm_assistant_action(session_id: str, req: AssistantActionConfirmRequest):
    try:
        result = assistant_engine.confirm_action(
            session_id,
            _assistant_scope(req.user_id, session_id),
            req.action_type,
            req.plan_version,
            req.preview_token,
            req.idempotency_key,
            req.payload,
        )
    except ValueError:
        return _assistant_invalid_session_error()
    if not result.get("success"):
        status = 404 if result.get("error_code") == "ASSISTANT_SESSION_NOT_FOUND" else 409 if result.get("error_code") == "ASSISTANT_PLAN_VERSION_CONFLICT" else 422
        return JSONResponse(status_code=status, content=result)
    return result


@app.get("/assistant/tools")
def assistant_tools():
    tool_catalog = agent_runtime.agent_tools.catalog()
    action_catalog = assistant_engine.action_catalog()
    return {
        "success": True,
        "version": "2.0",
        "tools": tool_catalog.get("tools", []),
        "actions": action_catalog.get("actions", []),
        "read_only": action_catalog.get("read_only", True),
        "skills": action_catalog.get("skills", []),
    }


@app.get("/assistant/tasks/{task_id}")
def get_assistant_task(task_id: str, user_id: Optional[str] = None, session_id: Optional[str] = None):
    task = agent_runtime.RUNTIME.get_task(task_id, _assistant_scope(user_id, session_id))
    if not task:
        return _assistant_error(404, "ASSISTANT_TASK_NOT_FOUND", "助手任务不存在或已过期")
    return {"success": True, **task}


@app.get("/assistant/tasks/{task_id}/events")
def get_assistant_task_events(task_id: str, user_id: Optional[str] = None, session_id: Optional[str] = None):
    task = agent_runtime.RUNTIME.get_task(task_id, _assistant_scope(user_id, session_id))
    if not task:
        return _assistant_error(404, "ASSISTANT_TASK_NOT_FOUND", "助手任务不存在或已过期")
    return {"success": True, "task_id": task_id, "status": task.get("status"), "events": task.get("events", [])}


@app.post("/assistant/tasks/{task_id}/cancel")
def cancel_assistant_task(task_id: str, req: Optional[AssistantTaskRequest] = None):
    req = req or AssistantTaskRequest()
    task = agent_runtime.RUNTIME.cancel_task(task_id, _assistant_scope(req.user_id, req.session_id))
    if not task:
        return _assistant_error(404, "ASSISTANT_TASK_NOT_FOUND", "助手任务不存在或已过期")
    return {"success": True, **task}
