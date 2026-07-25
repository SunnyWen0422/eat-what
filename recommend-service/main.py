"""FastAPI 入口 - 菜谱推荐服务"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any
from fastapi.responses import StreamingResponse
import rag
import chat_handler

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
