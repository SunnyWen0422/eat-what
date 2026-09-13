"""Versioned, inspectable skills used by the meal-planning assistant.

These are guardrail contracts, not free-form prompts.  The language parser
selects one skill; candidate retrieval and write previews still enforce the
rules in code.
"""
from __future__ import annotations

from typing import Any, Dict


SKILLS: Dict[str, Dict[str, Any]] = {
    "meal_plan": {
        "label": "一餐搭配",
        "required": ["meal_types", "people"],
        "guardrails": ["database_candidates_only", "hard_exclusions_first", "confirm_before_write"],
    },
    "ingredient_match": {
        "label": "现有食材利用",
        "required": ["available_ingredients"],
        "guardrails": ["current_task_only", "ingredient_aliases_are_not_substitutions", "hard_exclusions_first"],
    },
    "period_plan": {
        "label": "周期安排",
        "required": ["dates", "meal_types", "people"],
        "guardrails": ["bounded_generation", "avoid_repeated_when_requested", "confirm_before_write"],
    },
    "replace_dish": {
        "label": "局部换菜",
        "required": ["replace_target"],
        "guardrails": ["preserve_unspecified_dishes", "immutable_plan_history", "hard_exclusions_first"],
    },
    "howto": {
        "label": "做法解释",
        "required": ["dish_name"],
        "guardrails": ["read_only", "database_steps_only", "no_fake_dish_ids"],
    },
}


def skill_for_intent(intent: str) -> str:
    if intent == "ingredient_match":
        return "ingredient_match"
    if intent == "period_plan":
        return "period_plan"
    if intent == "replace":
        return "replace_dish"
    if intent == "howto":
        return "howto"
    return "meal_plan"


def catalog() -> Dict[str, Any]:
    return {
        "version": "1.0",
        "skills": [
            {"id": skill_id, "label": spec["label"], "required": list(spec["required"]), "guardrails": list(spec["guardrails"])}
            for skill_id, spec in SKILLS.items()
        ],
    }
