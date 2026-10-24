"""MySQL 连接与菜品查询"""
import json
import time
import pymysql
from typing import List, Dict, Any, Optional

from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

# 内存缓存（避免每次推荐都全量查询 4 万行）
_cache: Dict[str, Any] = {}
CACHE_TTL_SECONDS = 300  # 5 分钟过期

def _cache_get(key: str):
    entry = _cache.get(key)
    if not entry:
        return None
    if time.time() - entry["time"] >= CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    return entry["value"]


def _cache_set(key: str, value: Any) -> None:
    _cache[key] = {"value": value, "time": time.time()}


def _get_connection():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def fetch_catalog_revision() -> str:
    from canonical_catalog import read_metadata, revision
    connection = _get_connection()
    try:
        return revision(read_metadata(connection))
    finally:
        connection.close()


def fetch_canonical_catalog(ids=None):
    from canonical_catalog import read_catalog
    connection = _get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
            cursor.execute("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY")
        return read_catalog(connection, ids)
    finally:
        connection.close()


def fetch_all_dishes() -> List[Dict[str, Any]]:
    current = fetch_catalog_revision()
    cached = _cache_get("all_dishes:" + current)
    if cached is not None:
        return cached
    metadata, dishes = fetch_canonical_catalog()
    _cache.clear()
    _cache_set("all_dishes:" + metadata["catalogRevision"], dishes)
    return dishes


def fetch_dishes_by_ids(ids: List[int]) -> List[Dict[str, Any]]:
    if not ids:
        return []
    return fetch_canonical_catalog(ids)[1]


def fetch_recent_dish_names(user_id: Optional[int], limit: int = 12) -> List[str]:
    """Read recent planned dish names for recommendation variety, not consumption counts."""
    if not user_id:
        return []
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISH_IDS FROM recipe_records
                WHERE USER_ID = %s AND is_deleted = 0
                ORDER BY RECORD_DATE DESC, MEAL_TYPE DESC
                LIMIT 50
                """,
                (user_id,),
            )
            rows = cur.fetchall()
        dish_ids_set = set()
        for row in rows:
            s = row.get("DISH_IDS") or row.get("dish_ids") or "[]"
            try:
                ids = json.loads(s)
                if isinstance(ids, list):
                    dish_ids_set.update(int(x) for x in ids if x)
            except (json.JSONDecodeError, ValueError, TypeError):
                continue
        if not dish_ids_set:
            return []
        dishes = fetch_dishes_by_ids(list(dish_ids_set))
        names = [d["name"] for d in dishes[:limit]]
        return names
    finally:
        conn.close()


def _json_list(value: Any) -> List[str]:
    """Decode a preference JSON column without trusting malformed legacy data."""
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        raw = value
    else:
        try:
            raw = json.loads(str(value))
        except (json.JSONDecodeError, TypeError, ValueError):
            raw = [item for item in str(value).replace("，", ",").split(",") if item.strip()]
    if not isinstance(raw, (list, tuple, set)):
        return []
    return list(dict.fromkeys(str(item).strip() for item in raw if str(item).strip()))


def fetch_user_assistant_context(user_id: Optional[int]) -> Dict[str, Any]:
    """Read the small, non-sensitive context used to rank assistant results.

    This is deliberately read-only and best-effort. Missing legacy tables,
    malformed JSON or a transient database failure return an empty context so
    the assistant can still use the dish index and explicit request filters.
    """
    empty = {
        "preferred_cuisine_codes": [],
        "preferred_tag_codes": [],
        "excluded_tag_codes": [],
        "excluded_ingredients": [],
        "favorite_dish_ids": [],
        "max_cook_minutes": None,
        "avoid_recent_days": None,
    }
    if not user_id:
        return empty
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "SELECT PREFERRED_CUISINES, PREFERRED_TAGS, EXCLUDED_TAGS, "
                    "EXCLUDED_INGREDIENTS, MAX_COOK_MINUTES, AVOID_RECENT_DAYS "
                    "FROM user_preference WHERE USER_ID = %s",
                    (user_id,),
                )
                row = cur.fetchone() or {}
            except Exception:
                # Older deployments may not have duration/recency columns;
                # retain the preference and exclusion context in that case.
                try:
                    cur.execute(
                        "SELECT PREFERRED_CUISINES, PREFERRED_TAGS, EXCLUDED_TAGS, "
                        "EXCLUDED_INGREDIENTS FROM user_preference WHERE USER_ID = %s",
                        (user_id,),
                    )
                    row = cur.fetchone() or {}
                except Exception:
                    row = {}
            try:
                cur.execute(
                    "SELECT DISH_ID FROM favorite_dishes WHERE USER_ID = %s "
                    "ORDER BY CREATE_TIME DESC LIMIT 100",
                    (user_id,),
                )
                favorites = cur.fetchall() or []
            except Exception:
                favorites = []
        result = {
            "preferred_cuisine_codes": _json_list(row.get("PREFERRED_CUISINES", row.get("preferred_cuisines"))),
            "preferred_tag_codes": _json_list(row.get("PREFERRED_TAGS", row.get("preferred_tags"))),
            "excluded_tag_codes": _json_list(row.get("EXCLUDED_TAGS", row.get("excluded_tags"))),
            "excluded_ingredients": _json_list(row.get("EXCLUDED_INGREDIENTS", row.get("excluded_ingredients"))),
            "favorite_dish_ids": [
                int(item.get("DISH_ID", item.get("dish_id")))
                for item in favorites
                if item.get("DISH_ID", item.get("dish_id")) is not None
            ],
            "max_cook_minutes": row.get("MAX_COOK_MINUTES", row.get("max_cook_minutes")),
            "avoid_recent_days": row.get("AVOID_RECENT_DAYS", row.get("avoid_recent_days")),
        }
        return result
    except Exception:
        return empty
    finally:
        conn.close()


def fetch_user_calendar_context(user_id: Optional[int], dates: Optional[List[str]] = None,
                                meal_types: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Read only the authenticated user's calendar rows for assistant tools."""
    if not user_id:
        return []
    conn = _get_connection()
    try:
        clauses = ["USER_ID = %s", "is_deleted = 0"]
        params: List[Any] = [user_id]
        valid_dates = [str(item) for item in dates or [] if str(item).strip()]
        if valid_dates:
            placeholders = ",".join(["%s"] * len(valid_dates))
            clauses.append(f"DATE_FORMAT(RECORD_DATE, '%%Y-%%m-%%d') IN ({placeholders})")
            params.extend(valid_dates)
        valid_meals = [str(item) for item in meal_types or [] if str(item).strip()]
        if valid_meals:
            placeholders = ",".join(["%s"] * len(valid_meals))
            clauses.append(f"MEAL_TYPE IN ({placeholders})")
            params.extend(valid_meals)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT ID AS id, DATE_FORMAT(RECORD_DATE, '%%Y-%%m-%%d') AS record_date, "
                "MEAL_TYPE AS meal_type, RECIPE_NAME AS recipe_name, DISH_IDS AS dish_ids "
                "FROM recipe_records WHERE " + " AND ".join(clauses) + " ORDER BY RECORD_DATE, MEAL_TYPE LIMIT 100",
                params,
            )
            rows = cur.fetchall() or []
        return rows
    except Exception:
        return []
    finally:
        conn.close()


def fetch_user_shopping_context(user_id: Optional[int]) -> Dict[str, Any]:
    """Return a bounded, read-only snapshot of the user's shopping list."""
    if not user_id:
        return {"available": False, "list": None, "dishes": []}
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, version, metadata_version FROM shopping_list WHERE user_id = %s", (user_id,))
            shopping = cur.fetchone()
            if not shopping:
                return {"available": True, "list": None, "dishes": []}
            cur.execute(
                "SELECT id, selection_key, dish_id, dish_name, target_people FROM shopping_dish WHERE shopping_list_id = %s ORDER BY id LIMIT 100",
                (shopping["id"],),
            )
            dishes = cur.fetchall() or []
            for dish in dishes:
                cur.execute(
                    "SELECT id, source_line_no, canonical_name, display_name, quantity_value, quantity_text, unit_code, checked, calculation_status FROM shopping_item WHERE shopping_dish_id = %s ORDER BY source_line_no LIMIT 100",
                    (dish["id"],),
                )
                dish["items"] = cur.fetchall() or []
            return {"available": True, "list": shopping, "dishes": dishes}
    except Exception:
        return {"available": False, "list": None, "dishes": []}
    finally:
        conn.close()
