"""Fixed-recipe client: Java owns optional selection and equal-share nutrition."""
import os
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse
import httpx


def scale_recipe(dish_id, servings=None, user_id=None, optional_overrides=None):
    """The compatibility endpoint's servings field means diners, never a multiplier."""
    if isinstance(dish_id, bool) or not isinstance(dish_id, int) or dish_id < 1:
        raise ValueError("Canonical recipe ID is required")
    target = None
    if servings is not None:
        try:
            target = Decimal(str(servings))
        except InvalidOperation:
            raise ValueError("Diners must be numeric") from None
        if isinstance(servings, bool) or not target.is_finite() or target < 1 or target > 50:
            raise ValueError("Diners must be between 1 and 50")
    if user_id is not None and (isinstance(user_id, bool) or not isinstance(user_id, int) or user_id < 1):
        raise ValueError("Invalid authenticated user scope")
    if optional_overrides is not None and (not isinstance(optional_overrides, dict)
            or len(optional_overrides) > 100 or any(not isinstance(key, str) or not key or len(key) > 80
            or not isinstance(value, bool) for key, value in optional_overrides.items())):
        raise ValueError("Invalid canonical optional ingredient selection")
    base = os.environ.get("CATALOG_SERVICE_BASE_URL", "").rstrip("/")
    token = os.environ.get("MEAL_WORKSPACE_SERVICE_TOKEN", "")
    parsed = urlparse(base)
    if not token or parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Canonical calculation service is not configured")
    body = {"dishId": dish_id, "servings": str(target) if target is not None else None, "userId": user_id}
    if optional_overrides is not None:
        body["optionalOverrides"] = optional_overrides
    # No automatic retries or redirects; an internal credential must not escape its configured origin.
    with httpx.Client(timeout=10.0, follow_redirects=False, trust_env=False) as client:
        response = client.post(base + "/api/internal/catalog/scale", json=body, headers={"X-Service-Token": token})
        response.raise_for_status()
        result = response.json()
    try:
        actual = Decimal(str(result.get("diners"))) if result.get("diners") is not None else None
    except (InvalidOperation, AttributeError):
        raise ValueError("Invalid canonical calculation response") from None
    if (not isinstance(result, dict) or result.get("recipeId") != dish_id
            or not result.get("catalogRevision") or result.get("catalogContractVersion") != 4
            or not isinstance(result.get("ingredients"), list)
            or not isinstance(result.get("steps"), list) or "diners" not in result or actual != target
            or result.get("quantityPolicy") != "fixed-recipe-v1"
            or result.get("quantityBasis") != "fixed_recipe"
            or result.get("portionBasis") != "equal_share_reference"
            or "batches" in result or "stepTextBasisServings" in result
            or (target is None and (result.get("nutrition") or {}).get("perServing") is not None)):
        raise ValueError("Invalid canonical calculation response")
    return result
