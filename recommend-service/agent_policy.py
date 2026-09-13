"""Global policy loader for the model-driven meal assistant.

The policy is deliberately scenario-neutral.  It describes invariants that
apply to every request; the model chooses the concrete tools and skills at
runtime.  Policy files are versioned and read-only at runtime.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional


DEFAULT_POLICY: Dict[str, Any] = {
    "policy_version": "2.0.0",
    "scope": "global",
    "invariants": [
        "database_read_only",
        "database_facts_only",
        "current_task_mutations_allowed",
        "hard_constraints_first",
        "user_write_requires_confirmation",
        "user_scope_isolation",
        "no_arbitrary_code_or_sql",
        "dynamic_skill_selection",
        "explicit_model_degradation",
    ],
    "data_boundaries": {
        "database": "read_only",
        "current_task": "read_write",
        "user_calendar": "read_write_after_confirmation",
        "user_shopping_list": "read_write_after_confirmation",
        "user_preferences": "read_only_unless_explicitly_confirmed",
    },
    "model_must_not": [
        "invent_dish_ids",
        "invent_ingredient_quantities",
        "execute_arbitrary_sql",
        "execute_scripts_or_system_commands",
        "read_other_users_data",
        "write_without_preview_and_confirmation",
        "modify_database_source_records",
    ],
    "model_may": [
        "select_tools_dynamically",
        "combine_tools_and_skills",
        "reshape_current_task_plan",
        "scale_quantities_using_tool",
        "propose_user_calendar_and_shopping_mutations",
    ],
}


class PolicyError(ValueError):
    """Raised when a policy file is malformed or violates its contract."""


def _validate(policy: Dict[str, Any]) -> Dict[str, Any]:
    if policy.get("scope") != "global":
        raise PolicyError("agent policy must have global scope")
    if not str(policy.get("policy_version") or "").strip():
        raise PolicyError("agent policy version is required")
    invariants = policy.get("invariants")
    if not isinstance(invariants, list) or "database_read_only" not in invariants:
        raise PolicyError("agent policy invariants are incomplete")
    if "user_write_requires_confirmation" not in invariants:
        raise PolicyError("user writes must require confirmation")
    return policy


def policy_path() -> Path:
    configured = os.getenv("ASSISTANT_POLICY_PATH")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[1] / "docs" / "assistant" / "agent-policy.json"


def rules_directory() -> Path:
    configured = os.getenv("ASSISTANT_RULES_DIR")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[1] / "docs" / "assistant"


def _load_rule_documents() -> Dict[str, str]:
    """Load the developer-authored Markdown rules alongside the JSON policy.

    The JSON file is the machine-readable safety contract.  These documents
    provide the model with the human-readable operating guidance requested by
    the project.  Missing optional documents do not make the service
    unavailable; the validated JSON defaults remain the safety floor.
    """
    result: Dict[str, str] = {}
    for filename in ("agent.md", "spec.md", "data-policy.md"):
        target = rules_directory() / filename
        try:
            text = target.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if text:
            result[filename] = text[:12000]
    return result


def load_policy(path: Optional[os.PathLike] = None) -> Dict[str, Any]:
    """Load a developer-published global policy, falling back to safe defaults."""
    target = Path(path) if path else policy_path()
    if target.exists():
        try:
            with target.open(encoding="utf-8") as handle:
                policy = _validate(json.load(handle))
                policy["rule_documents"] = _load_rule_documents()
                return policy
        except (OSError, json.JSONDecodeError, TypeError) as error:
            raise PolicyError(f"unable to load agent policy: {error}") from error
    policy = dict(DEFAULT_POLICY)
    policy["rule_documents"] = _load_rule_documents()
    return policy


def policy_hash(policy: Optional[Dict[str, Any]] = None) -> str:
    value = policy or load_policy()
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
