"""FastAPI 入口 - 菜谱推荐服务"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Any

app = FastAPI(
    title="吃什么 - 菜谱推荐服务",
    description="基于 LangGraph + 通义千问的健康饮食搭配推荐",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
