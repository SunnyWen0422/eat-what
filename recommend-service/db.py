"""MySQL 连接与菜品查询"""
import json
import pymysql
from typing import List, Dict, Any, Optional

from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME


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
    """将数据库 type 映射为 meat/veg/soup"""
    if not db_type:
        return "veg"
    t = db_type.strip()
    if t in ("荤菜", "主菜"):
        return "meat"
    if t in ("素菜", "蔬菜"):
        return "veg"
    if t in ("汤", "汤品"):
        return "soup"
    # 根据名称推断
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


def fetch_all_dishes() -> List[Dict[str, Any]]:
    """从 food 表获取所有菜品，映射 type 并补充 tags"""
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT ID as id, NAME as name, TYPE as type, CL as cl, FL as fl, STEP as step FROM food ORDER BY ID"
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
