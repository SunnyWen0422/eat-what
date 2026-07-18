"""LangGraph 推荐图节点"""
import json
import random
from pathlib import Path
from typing import Any, List

from langchain_core.prompts import ChatPromptTemplate
from langchain_qwq import ChatQwen

import db
from config import DASHSCOPE_API_KEY
from graph.state import RecommendationState


def _format_dish_list(dishes: List[dict]) -> str:
    return "\n".join(
        f"- id={d.get('id')}, name={d.get('name')}, tags={d.get('tags', [])}"
        for d in (dishes or [])[:30]
    )


def _load_prompt() -> str:
    p = Path(__file__).parent.parent / "prompts" / "recommendation.txt"
    return p.read_text(encoding="utf-8")


def llm_recommend(state: RecommendationState) -> RecommendationState:
    """调用通义千问生成推荐方案"""
    grouped = state.get("grouped_dishes") or {}
    meat_pool = grouped.get("meat", [])
    veg_pool = grouped.get("veg", [])
    soup_pool = grouped.get("soup", [])

    if not meat_pool and not veg_pool and not soup_pool:
        return {**state, "plans": [], "error": "无可用菜品"}

    people = state.get("people", 2)
    meat_count = state.get("meat_count", 2)
    veg_count = state.get("veg_count", 2)
    soup_count = state.get("soup_count", 1)
    meal_type = state.get("meal_type", "lunch")
    recent = state.get("recent_dish_names") or []
    selected = state.get("selected_dishes") or []

    selected_names = ", ".join(d.get("name", "") for d in selected) if selected else "无"
    recent_names = ", ".join(recent[:10]) if recent else "无"

    prompt_text = _load_prompt()
    prompt = ChatPromptTemplate.from_template(prompt_text)
    formatted = prompt.format(
        people=people,
        meat_count=meat_count,
        veg_count=veg_count,
        soup_count=soup_count,
        meal_type=meal_type,
        recent_names=recent_names,
        selected_names=selected_names,
        meat_list=_format_dish_list(meat_pool),
        veg_list=_format_dish_list(veg_pool),
        soup_list=_format_dish_list(soup_pool),
    )

    plans = []
    if DASHSCOPE_API_KEY:
        try:
            llm = ChatQwen(model="qwen-turbo", api_key=DASHSCOPE_API_KEY, max_tokens=4000)
            response = llm.invoke(formatted)
            content = response.content if hasattr(response, "content") else str(response)
            content = content.strip()
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            plans = json.loads(content)
            if not isinstance(plans, list):
                plans = [plans] if plans else []
        except (json.JSONDecodeError, Exception) as e:
            state["error"] = str(e)

    if not plans:
        plans = _rule_based_fallback(state)
    return {**state, "plans": plans}


def _rule_based_fallback(state: RecommendationState) -> List[dict]:
    """规则回退：随机选择满足条件的菜品"""
    grouped = state.get("grouped_dishes") or {}
    meat_pool = grouped.get("meat", [])
    veg_pool = grouped.get("veg", [])
    soup_pool = grouped.get("soup", [])
    recent = set(state.get("recent_dish_names") or [])
    selected = state.get("selected_dishes") or []

    meat_count = state.get("meat_count", 2)
    veg_count = state.get("veg_count", 2)
    soup_count = state.get("soup_count", 1)

    def pick(array: List[dict], n: int, exclude: set) -> List[dict]:
        candidates = [d for d in array if d.get("name") not in exclude]
        return random.sample(candidates, min(n, len(candidates)))

    result_plans = []
    for _ in range(3):
        exclude = recent.copy()
        meats = []
        vegs = []
        soups = []

        if selected:
            for d in selected:
                t = d.get("type", "veg")
                if t == "meat":
                    meats.append(d)
                elif t == "soup":
                    soups.append(d)
                else:
                    vegs.append(d)
                exclude.add(d.get("name", ""))

        if len(meats) < meat_count and meat_pool:
            extra = pick(meat_pool, meat_count - len(meats), exclude)
            meats.extend(extra)
            for d in extra:
                exclude.add(d.get("name", ""))
        if len(vegs) < veg_count and veg_pool:
            extra = pick(veg_pool, veg_count - len(vegs), exclude)
            vegs.extend(extra)
            for d in extra:
                exclude.add(d.get("name", ""))
        if len(soups) < soup_count and soup_pool:
            extra = pick(soup_pool, soup_count - len(soups), exclude)
            soups.extend(extra)

        dishes = meats + vegs + soups
        light_veg = grouped.get("_light_veg", [])
        all_spicy = all("川味" in (d.get("tags") or []) for d in (meats + vegs))
        if all_spicy and light_veg and vegs:
            vegs[0] = light_veg[0]
            dishes = meats + vegs + soups

        result_plans.append({"dishes": dishes})

    return result_plans


def _enrich_dishes(dishes: List[dict], all_dishes: List[dict]) -> List[dict]:
    """用完整菜品数据补齐 LLM 返回的简略信息"""
    by_id = {d.get("id"): d for d in all_dishes if d.get("id") is not None}
    by_name = {d.get("name", ""): d for d in all_dishes if d.get("name")}
    result = []
    for d in dishes:
        full = by_id.get(d.get("id")) or by_name.get(d.get("name", "")) or d
        if not isinstance(full.get("tags"), list):
            full = {**full, "tags": full.get("tags") or []}
        if isinstance(full.get("tags"), str):
            full = {**full, "tags": [t.strip() for t in (full["tags"] or "").split(",") if t.strip()]}
        result.append(full)
    return result


def validate_plans(state: RecommendationState) -> RecommendationState:
    """校验并修正方案，并补齐菜品完整信息"""
    plans = state.get("plans") or []
    meat_count = state.get("meat_count", 2)
    veg_count = state.get("veg_count", 2)
    soup_count = state.get("soup_count", 1)
    all_dishes = state.get("dishes") or []

    validated = []
    for plan in plans:
        dishes = plan.get("dishes") if isinstance(plan, dict) else []
        if not dishes:
            continue
        meats = [d for d in dishes if d.get("type") == "meat"]
        vegs = [d for d in dishes if d.get("type") == "veg"]
        soups = [d for d in dishes if d.get("type") == "soup"]

        if len(meats) < meat_count or len(vegs) < veg_count or len(soups) < soup_count:
            fallback = _rule_based_fallback(state)
            if fallback:
                dishes = fallback[0].get("dishes", [])
        dishes = _enrich_dishes(dishes, all_dishes)
        validated.append({"dishes": dishes})

    return {**state, "plans": validated[:3]}


def fetch_dishes(state: RecommendationState) -> RecommendationState:
    """从 MySQL 读取菜品，按 type 分组"""
    try:
        dishes = db.fetch_all_dishes()
        grouped = {
            "meat": [d for d in dishes if d.get("type") == "meat"],
            "veg": [d for d in dishes if d.get("type") == "veg"],
            "soup": [d for d in dishes if d.get("type") == "soup"],
            "dessert": [d for d in dishes if d.get("type") == "dessert"],
            "staple": [d for d in dishes if d.get("type") == "staple"],
        }
        return {
            **state,
            "dishes": dishes,
            "grouped_dishes": grouped,
        }
    except Exception as e:
        return {**state, "error": str(e), "dishes": [], "grouped_dishes": {}}


def fetch_user_context(state: RecommendationState) -> RecommendationState:
    """获取用户近期食用菜品名，用于去重"""
    user_id = state.get("user_id")
    recent = []
    if user_id:
        recent = db.fetch_recent_dish_names(user_id, limit=12)
    return {**state, "recent_dish_names": recent}


def health_filter(state: RecommendationState) -> RecommendationState:
    """规则层：餐次偏好、口味均衡"""
    grouped = state.get("grouped_dishes") or {}
    meal_type = state.get("meal_type") or "lunch"

    meat_pool = grouped.get("meat", [])
    veg_pool = grouped.get("veg", [])
    soup_pool = grouped.get("soup", [])

    # 早餐：优先清淡、素菜、汤
    if meal_type == "breakfast":
        meat_pool = [
            d for d in meat_pool
            if "清淡" in (d.get("tags") or []) or d.get("name", "").find("蒸") >= 0
        ]
        if not meat_pool:
            meat_pool = grouped.get("meat", [])  # 回退

    # 确保有清淡菜品可替换（避免全川味时无替换项）
    light_veg = [d for d in veg_pool if "清淡" in (d.get("tags") or [])]
    if not light_veg and veg_pool:
        light_veg = veg_pool[:3]

    return {
        **state,
        "grouped_dishes": {
            "meat": meat_pool,
            "veg": veg_pool,
            "soup": soup_pool,
            "_light_veg": light_veg,
        },
    }
