"""轻量版知识库 — jieba 关键词匹配 + 食材倒排索引"""
import json, re, os
from typing import List, Dict

from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
from db import _get_connection, _map_type

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
META_PATH = os.getenv("DISH_META_PATH", os.path.join(BASE_DIR, "dish_meta.json"))
INGREDIENT_PATH = os.getenv("INGREDIENT_MAP_PATH", os.path.join(BASE_DIR, "ingredient_map.json"))

_dish_meta = []
_ingredient_map = {}

def _make_doc(dish: Dict) -> str:
    name = dish.get("name","")
    cl = dish.get("cl","") or dish.get("ingredients","")
    step = dish.get("step","") or dish.get("steps","")
    tags = dish.get("tags","")
    if isinstance(tags, list): tags = ",".join(tags)
    return re.sub(r'\s+','', f"{name} {cl} {step} {tags}")[:500]

def parse_ingredients(cl: str) -> List[str]:
    if not cl: return []
    result = []
    for part in cl.replace(":","：").split('#'):
        seg = part.split('：')[0].split(':')[0].strip()
        seg = re.sub(r'[0-9]+克|适量|少许|若干|克|mL|ml|勺|个|根|块|片|只|条', '', seg).strip()
        if seg: result.append(seg)
    return result

def build_index(fast: bool = False):
    """从 MySQL 读取菜品，构建轻量索引"""
    conn = _get_connection()
    try:
        limit = "LIMIT 8000" if fast else ""
        # 使用 STEPS 列（详细步骤），STEP 列为空
        with conn.cursor() as cur:
            cur.execute(f"SELECT ID, NAME, TYPE, CL, TAGS, METHODS, KCAL, DIFFICULTY, IMAGE, "
                        f"STEPS as steps, INGREDIENTS_AMOUNTS "
                        f"FROM food WHERE STEPS IS NOT NULL AND STEPS != '' {limit}")
            rows = cur.fetchall()
    finally:
        conn.close()

    global _dish_meta, _ingredient_map
    meta_list, ing_map = [], {}
    for r in rows:
        # DictCursor 键名取决于 MySQL 返回的列名，不加 AS 时为大写
        rid = r.get('ID', r.get('id', 0))
        rname = r.get('NAME', r.get('name', ''))
        rtype = r.get('TYPE', r.get('type', ''))
        rcl = r.get('CL', r.get('cl', '')) or r.get('INGREDIENTS_AMOUNTS', '') or ''
        rtags = r.get('TAGS', r.get('tags', '')) or ''
        rmethods = r.get('METHODS', r.get('methods', '')) or ''
        rkcal = r.get('KCAL', r.get('kcal', 0)) or 0
        rdiff = r.get('DIFFICULTY', r.get('difficulty', '')) or ''
        rsteps = r.get('steps', r.get('STEPS', '')) or ''

        rimage = (r.get('IMAGE', r.get('image', '')) or '').replace('http:', 'https:')

        d = {"id":rid, "name":rname, "type":_map_type(rtype),
             "cl":rcl, "kcal":rkcal, "difficulty":rdiff,
             "tags":rtags, "methods":rmethods, "step":rsteps,
             "image":rimage, "doc":""}
        d["doc"] = _make_doc(d)
        meta_list.append(d)
        for ing in parse_ingredients(rcl):
            if ing not in ing_map: ing_map[ing] = []
            ing_map[ing].append(rid)

    with open(META_PATH,"w") as f: json.dump(meta_list,f,ensure_ascii=False)
    with open(INGREDIENT_PATH,"w") as f: json.dump(ing_map,f,ensure_ascii=False)
    _dish_meta, _ingredient_map = meta_list, ing_map
    print(f"[rag] Built index: {len(meta_list)} dishes, {len(ing_map)} ingredients")

def load_index():
    global _dish_meta, _ingredient_map
    if _dish_meta: return
    if os.path.exists(META_PATH):
        with open(META_PATH) as f: _dish_meta = json.load(f)
    if os.path.exists(INGREDIENT_PATH):
        with open(INGREDIENT_PATH) as f: _ingredient_map = json.load(f)
    print(f"[rag] Loaded: {len(_dish_meta)} dishes")

def search_by_ingredients(items: List[str], top_k: int = 10) -> List[Dict]:
    load_index()
    ids = set()
    for item in items:
        matches = _ingredient_map.get(item, [])
        if not matches:
            for k, v in _ingredient_map.items():
                if item in k or k in item: matches.extend(v)
        ids.update(matches[:5])
    if not ids: return []
    by_id = {d["id"]:d for d in _dish_meta}
    return [by_id[i] for i in list(ids)[:top_k] if i in by_id]

def search_semantic(query: str, top_k: int = 10) -> List[Dict]:
    """关键词匹配检索"""
    load_index()
    try:
        import jieba
        qwords = list(jieba.cut(query))
    except:
        qwords = list(query)

    scored = []
    for d in _dish_meta:
        doc = d.get("doc","") + d.get("name","")
        score = sum(2 if w in doc else 0 for w in qwords)
        if score > 0: scored.append((score, d))
    scored.sort(key=lambda x: -x[0])
    return [d for _, d in scored[:top_k]]
