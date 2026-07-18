"""MySQL 连接与菜品查询"""
import json
import random
import time
import pymysql
from typing import List, Dict, Any, Optional

from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

# 内存缓存（避免每次推荐都全量查询 4 万行）
_cache: Dict[str, Any] = {}
CACHE_TTL_SECONDS = 300  # 5 分钟过期

# 采样配置：每类菜品随机取多少条
SAMPLE_SIZE_PER_TYPE = 300

# 数据库中文类型 → 英文映射
TYPE_CN_TO_EN = {
    "荤菜": "meat", "主菜": "meat",
    "素菜": "veg", "蔬菜": "veg",
    "汤": "soup", "汤品": "soup",
    "甜品": "dessert", "甜点": "dessert",
    "主食": "staple", "staple": "staple",
}


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


def _map_type(db_type: str) -> str:
    """将数据库 type 映射为 meat/veg/soup/dessert/staple"""
    if not db_type:
        return "veg"
    t = db_type.strip()
    if t in ("meat", "荤菜", "主菜"):
        return "meat"
    if t in ("veg", "素菜", "蔬菜"):
        return "veg"
    if t in ("soup", "汤", "汤品"):
        return "soup"
    if t in ("dessert", "甜品", "甜点"):
        return "dessert"
    if t in ("staple", "主食"):
        return "staple"
    return "veg"


def _infer_tags(dish: Dict[str, Any]) -> List[str]:
    """根据 name、cl 推断标签（当 food 表无 tags 列时）"""
    tags = []
    name = (dish.get("name") or "").lower()
    cl = (dish.get("cl") or "").lower()
    text = name + " " + cl
    if "辣" in text or "川" in text or "椒" in text or "豆瓣" in text:
        tags.append("川味")
    if "清蒸" in text or "白灼" in text or "清淡" in text or "清炒" in text:
        tags.append("清淡")
    if "滋补" in text or "炖" in text or "煲" in text:
        tags.append("滋补")
    if "家常" in text or "快手" in text:
        tags.append("家常")
    if "凉" in text or "拌" in text:
        tags.append("凉菜")
    return tags if tags else ["家常"]


def _sample_dishes_by_cn_type(db_type_cn: str, limit: int) -> List[Dict[str, Any]]:
    """按中文类型随机窗口采样（用 ID 偏移代替 ORDER BY RAND()）"""
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            # 先获取该类型的总数（走索引，很快）
            cur.execute(
                "SELECT COUNT(*) as cnt FROM food WHERE TYPE = %s",
                (db_type_cn,)
            )
            total = cur.fetchone()["cnt"]
            if total == 0:
                return []

            # 随机偏移：用独立 Random 实例，不影响全局随机状态
            max_offset = max(0, total - limit)
            seed = int(time.time() / 30) + hash(db_type_cn) % 10000
            rng = random.Random(seed)
            offset = rng.randint(0, max_offset) if max_offset > 0 else 0

            # LIMIT + OFFSET 走主键索引，性能很好
            cur.execute(
                "SELECT ID as id, NAME as name, TYPE as type, CL as cl, FL as fl, STEP as step "
                "FROM food WHERE TYPE = %s ORDER BY ID LIMIT %s OFFSET %s",
                (db_type_cn, limit, offset)
            )
            rows = cur.fetchall()

        result = []
        for r in rows:
            if r.get("id") is None:
                continue
            dish = {
                "id": r["id"],
                "name": r.get("name") or "",
                "type": TYPE_CN_TO_EN.get(r.get("type", ""), "veg"),
                "cl": r.get("cl") or "",
                "fl": r.get("fl") or "",
                "step": r.get("step") or "",
                "tags": _infer_tags(r),
            }
            result.append(dish)
        return result
    finally:
        conn.close()


def fetch_all_dishes() -> List[Dict[str, Any]]:
    """随机窗口采样：每类取 300 条，4 类共 ~1200 条（替代全量 4 万行）

    策略：
    - 按中文类型分别查询（荤菜/素菜/汤品/汤/主菜/蔬菜）
    - 每类用 LIMIT 300 OFFSET random_offset，窗口位置每 30 秒变化
    - 合并映射到英文类型（meat/veg/soup）
    - 结果缓存 5 分钟
    """
    cached = _cache_get("all_dishes")
    if cached is not None:
        return cached

    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT TYPE FROM food WHERE TYPE IS NOT NULL AND TYPE != ''")
            db_types = [r["TYPE"] for r in cur.fetchall()]
    finally:
        conn.close()

    all_dishes = []
    for cn_type in db_types:
        batch = _sample_dishes_by_cn_type(cn_type, SAMPLE_SIZE_PER_TYPE)
        all_dishes.extend(batch)

    # 如果采样结果太少（数据库总行数不足），降级到全量查询
    if len(all_dishes) < 50:
        return _fetch_all_dishes_fallback()

    _cache_set("all_dishes", all_dishes)
    return all_dishes


def _fetch_all_dishes_fallback() -> List[Dict[str, Any]]:
    """降级：全量查询（仅在采样结果太少时触发）"""
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT ID as id, NAME as name, TYPE as type, CL as cl, FL as fl, STEP as step "
                "FROM food ORDER BY ID"
            )
            rows = cur.fetchall()
        result = []
        for r in rows:
            if r.get("id") is None:
                continue
            dish = {
                "id": r["id"],
                "name": r.get("name") or "",
                "type": _map_type(r.get("type") or ""),
                "cl": r.get("cl") or "",
                "fl": r.get("fl") or "",
                "step": r.get("step") or "",
                "tags": _infer_tags(r),
            }
            result.append(dish)
        _cache_set("all_dishes", result)
        return result
    finally:
        conn.close()


def fetch_dishes_by_ids(ids: List[int]) -> List[Dict[str, Any]]:
    """根据 ID 列表批量查询菜品"""
    if not ids:
        return []
    conn = _get_connection()
    try:
        placeholders = ",".join(["%s"] * len(ids))
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT ID as id, NAME as name, TYPE as type, CL as cl, FL as fl, STEP as step FROM food WHERE ID IN ({placeholders})",
                ids,
            )
            rows = cur.fetchall()
        result = []
        for r in rows:
            dish = {
                "id": r["id"],
                "name": r.get("name") or "",
                "type": _map_type(r.get("type") or ""),
                "cl": r.get("cl") or "",
                "fl": r.get("fl") or "",
                "step": r.get("step") or "",
                "tags": _infer_tags(r),
            }
            result.append(dish)
        return result
    finally:
        conn.close()


def fetch_recent_dish_names(user_id: Optional[int], limit: int = 12) -> List[str]:
    """从 recipe_records 获取用户近期食用过的菜品名称"""
    if not user_id:
        return []
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISH_IDS FROM recipe_records
                WHERE USER_ID = %s
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
