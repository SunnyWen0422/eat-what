"""LangGraph 推荐图构建与编译"""
from langgraph.graph import StateGraph, START, END

from graph.nodes import (
    fetch_dishes,
    fetch_user_context,
    health_filter,
    llm_recommend,
    validate_plans,
)
from graph.state import RecommendationState


def build_graph():
    """构建并编译推荐图"""
    workflow = StateGraph(RecommendationState)

    workflow.add_node("fetch_dishes", fetch_dishes)
    workflow.add_node("fetch_user_context", fetch_user_context)
    workflow.add_node("health_filter", health_filter)
    workflow.add_node("llm_recommend", llm_recommend)
    workflow.add_node("validate_plans", validate_plans)

    workflow.add_edge(START, "fetch_dishes")
    workflow.add_edge("fetch_dishes", "fetch_user_context")
    workflow.add_edge("fetch_user_context", "health_filter")
    workflow.add_edge("health_filter", "llm_recommend")
    workflow.add_edge("llm_recommend", "validate_plans")
    workflow.add_edge("validate_plans", END)

    return workflow.compile()


# 单例图
_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


def run_recommend(params: dict) -> dict:
    """执行推荐流程"""
    graph = get_graph()
    initial: RecommendationState = {
        "people": params.get("people", 2),
        "meat_count": params.get("meat_count", params.get("meat", 2)),
        "veg_count": params.get("veg_count", params.get("veg", 2)),
        "soup_count": params.get("soup_count", params.get("soup", 1)),
        "meal_type": params.get("meal_type", "lunch"),
        "selected_dishes": params.get("selected_dishes") or (params.get("selected_recipe") or {}).get("selectedDishes"),
        "user_id": params.get("user_id"),
    }
    result = graph.invoke(initial)
    return result
