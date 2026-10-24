"""Retired standalone selection graph; use the shared Java meal workspace."""


def _retired(*args, **kwargs):
    raise RuntimeError("Standalone selection is retired; use the shared meal workspace")


llm_recommend = _retired
validate_plans = _retired
fetch_dishes = _retired
fetch_user_context = _retired
health_filter = _retired
