"""LangGraph 推荐状态定义"""
from typing import TypedDict, List, Dict, Any, Optional


class RecommendationState(TypedDict, total=False):
    """推荐图状态"""
    people: int
    meat_count: int
    veg_count: int
    soup_count: int
    meal_type: str
    selected_dishes: Optional[List[Dict[str, Any]]]
    user_id: Optional[int]
    dishes: List[Dict[str, Any]]
    grouped_dishes: Dict[str, List[Dict[str, Any]]]
    recent_dish_names: List[str]
    plans: List[Dict[str, Any]]
    error: Optional[str]
