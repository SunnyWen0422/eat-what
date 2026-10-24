"""FastAPI 入口 - 菜谱推荐服务"""
from fastapi import FastAPI, HTTPException, Header, Body, Request
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from fastapi.responses import StreamingResponse, JSONResponse
import uuid
from threading import Lock
import rag
import chat_handler
import assistant_engine
import agent_runtime

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(application):
    from assistant_v4_provider import ManagedV4Provider
    async with ManagedV4Provider() as provider:
        application.state.v4_provider=provider
        try: yield
        finally: application.state.v4_provider=None

app = FastAPI(
    lifespan=lifespan,
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
    """The retired route must not create a second selection algorithm."""
    raise HTTPException(status_code=410, detail="Use the authenticated meal workspace recommendation endpoint")


class ChatRequest(BaseModel):
    message: str
    user_id: Optional[str] = "guest"

@app.post("/chat")
async def chat(req: ChatRequest):
    raise HTTPException(status_code=410, detail="Legacy planning is retired; use the shared meal workspace")


class ChatSyncRequest(BaseModel):
    message: str
    user_id: Optional[str] = "guest"

_chat_sync_lock = Lock()


@app.post("/chat/sync")
def chat_sync(req: ChatSyncRequest):
    raise HTTPException(status_code=410, detail="Legacy planning is retired; use the shared meal workspace")


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

@app.get('/assistant/sessions')
def list_assistant_sessions(user_id: Optional[str] = None, cursor: Optional[str] = None, limit: int = 20):
    if not user_id or not str(user_id).isdigit() or int(user_id)<1:
        return _assistant_error(401,'AUTH_REQUIRED','请先登录查看历史')
    try:return {'success':True,**assistant_engine.SESSION_STORE.list_sessions(_assistant_scope(user_id),cursor,limit)}
    except ValueError:return _assistant_error(422,'ASSISTANT_CURSOR_INVALID','历史分页参数无效，请重新读取')


@app.post("/assistant/sessions/{session_id}/messages")
def send_assistant_message(session_id: str, req: AssistantMessageRequest):
    raise HTTPException(status_code=410, detail="Legacy planning is retired; use the shared meal workspace")


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
    raise HTTPException(status_code=410, detail="Legacy planning is retired; use the shared meal workspace")


class AssistantPlanCommandRequest(BaseModel):
    action: str
    plan_version: int
    request_id: str
    user_id: Optional[str] = None
    date: Optional[str] = None
    meal_type: Optional[str] = None
    dish_id: Optional[Any] = None

@app.post("/assistant/sessions/{session_id}/plan-commands")
def command_assistant_plan(session_id: str, req: AssistantPlanCommandRequest):
    raise HTTPException(status_code=410, detail="Legacy planning is retired; use the shared meal workspace")

@app.post("/assistant/sessions/{session_id}/undo")
def undo_assistant_plan(session_id: str, req: AssistantUndoRequest):
    raise HTTPException(status_code=410, detail="Legacy planning is retired; use the shared meal workspace")


@app.post("/assistant/sessions/{session_id}/actions/confirm")
def confirm_assistant_action(session_id: str, req: AssistantActionConfirmRequest):
    raise HTTPException(status_code=410, detail="Legacy planning is retired; use the shared meal workspace")


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


class WorkspaceTaskRequest(BaseModel):
    workspace: Dict[str, Any]
    userId: int


@app.get("/internal/v4/assistant/capabilities")
def assistant_v4_capabilities(x_service_token: Optional[str] = Header(default=None)):
    import hmac,os
    configured=os.getenv("MEAL_WORKSPACE_SERVICE_TOKEN","")
    if not configured or not x_service_token or not hmac.compare_digest(x_service_token,configured):
        raise HTTPException(status_code=403,detail="internal service authorization required")
    return {"contractRevision":"maturity.2","uiFeatures":["clarification_v1","handoff_v1"],"recommendationPolicyVersion":"balanced-v1"}

@app.get("/internal/v4/assistant/reply-capabilities")
def assistant_reply_capabilities(x_service_token: Optional[str] = Header(default=None)):
    import hmac, os
    configured = os.getenv("MEAL_WORKSPACE_SERVICE_TOKEN", "")
    if not configured or not x_service_token or not hmac.compare_digest(x_service_token, configured):
        raise HTTPException(status_code=403, detail="internal service authorization required")
    return {"replyContracts": ["meal_reply.v1", "meal_reply.v2"]}


@app.post("/internal/v4/assistant/step")
async def assistant_v4_step(request: Request, req: Any = Body(...), x_service_token: Optional[str] = Header(default=None)):
    import hmac
    import os
    from assistant_v4_schema import StepValidationError
    from assistant_v4_step import run_step_async
    configured = os.getenv("MEAL_WORKSPACE_SERVICE_TOKEN", "")
    if not configured or not x_service_token or not hmac.compare_digest(x_service_token, configured):
        raise HTTPException(status_code=403, detail="internal service authorization required")
    import asyncio
    async def disconnected():
        while not await request.is_disconnected():
            await asyncio.sleep(.05)
    work = asyncio.create_task(run_step_async(req, getattr(app.state, "v4_provider", None)))
    connection = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait({work, connection}, return_when=asyncio.FIRST_COMPLETED)
        if work in done:
            return await work
        # Client disconnect stops only this request's awaitable. It cannot undo a
        # committed Java write or guarantee that a remote supplier stops billing.
        raise HTTPException(status_code=499, detail="request disconnected")
    except StepValidationError:
        raise HTTPException(status_code=400, detail="invalid assistant step") from None
    finally:
        for task in (work, connection):
            if not task.done(): task.cancel()
        await asyncio.gather(work, connection, return_exceptions=True)


@app.post("/internal/v4/meal-task")
def workspace_task(req: WorkspaceTaskRequest, x_service_token: Optional[str] = Header(default=None)):
    import os
    import workspace_agent
    if not workspace_agent.authorized(x_service_token or "", os.getenv("MEAL_WORKSPACE_SERVICE_TOKEN", "")):
        raise HTTPException(status_code=403, detail="internal service authorization required")
    if req.userId < 1 or len(str((req.workspace.get("context") or {}).get("requirements", ""))) > 2000:
        raise HTTPException(status_code=400, detail="invalid task context")
    try:
        return workspace_agent.run_task(req.workspace, req.userId)
    except Exception:
        # Raw text and provider errors never enter application logs or the public response.
        return {"needsInput": True, "executionStatus":"failed", "failureClass":"WorkspaceTaskFailed", "message": "智能理解暂不可用，请明确本餐限制后重试", "dishIds": []}
