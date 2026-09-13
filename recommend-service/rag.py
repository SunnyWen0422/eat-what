"""菜品辅助索引：别名归一、字段加权检索和可解释的候选排序。

索引只是数据库菜品数据的可重建副本。它只帮助召回和排序；任何
后续的保存、购物清单或日历写入仍必须由 Java 主服务校验并执行。
"""
import json
import os
import re
from collections import Counter
from typing import Any, Dict, Iterable, List, Optional, Tuple

from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
from db import _get_connection, _map_type

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
META_PATH = os.getenv("DISH_META_PATH", os.path.join(BASE_DIR, "dish_meta.json"))
INGREDIENT_PATH = os.getenv("INGREDIENT_MAP_PATH", os.path.join(BASE_DIR, "ingredient_map.json"))

_dish_meta = []
_ingredient_map = {}

# 这里保存的是同义词归一，而不是“可以互相替换”的关系。比如猪排与
# 排骨不是同一种食材，不能为了提高召回率而错误合并。
INGREDIENT_ALIASES = {
    "西红柿": "番茄",
    "番茄": "番茄",
    "番茄酱": "番茄酱",
    "洋柿子": "番茄",
    "鸡蛋": "鸡蛋",
    "鸡子": "鸡蛋",
    "蛋": "鸡蛋",
    "马铃薯": "土豆",
    "土豆": "土豆",
    "青椒": "青椒",
    "尖椒": "青椒",
    "小葱": "葱",
    "大葱": "葱",
    "香葱": "葱",
    "生姜": "姜",
    "老姜": "姜",
    "大蒜": "蒜",
    "五花": "五花肉",
    "五花肉": "五花肉",
    "里脊肉": "里脊",
    "猪里脊": "里脊",
}

TAG_ALIASES = {
    "清淡": "LIGHT",
    "少油": "LIGHT",
    "低脂": "LIGHT",
    "家常": "HOME_STYLE",
    "快手": "HOME_STYLE",
    "辣": "SPICY",
    "麻辣": "SPICY",
    "川味": "SPICY",
    "川菜": "SPICY",
}


def normalize_ingredient(value: Any) -> str:
    """Convert harmless ingredient aliases to one canonical token.

    Quantity and parenthetical preparation notes are removed, but the function
    does not guess substitutions. This makes constraints such as ``不要番茄``
    reliable without treating related foods as identical.
    """
    text = str(value or "").strip().lower()
    if not text:
        return ""
    text = re.sub(r"[（(].*?[)）]", "", text)
    text = re.sub(r"(?:约|适量|少许|若干|一把|半个|几个|[0-9.]+\s*(?:克|g|kg|毫升|ml|mL|勺|个|根|块|片|只|条))", "", text)
    text = re.sub(r"\s+", "", text).strip("，,、;；。")
    return INGREDIENT_ALIASES.get(text, text)


def _split_codes(value: Any) -> List[str]:
    if isinstance(value, (list, tuple, set)):
        raw = value
    else:
        raw = re.split(r"[,，、/|;；\s]+", str(value or ""))
    codes: List[str] = []
    for item in raw:
        token = str(item or "").strip()
        if not token:
            continue
        upper = token.upper()
        codes.append(TAG_ALIASES.get(token, TAG_ALIASES.get(upper, upper)))
    return list(dict.fromkeys(codes))


def _values(value: Any) -> List[Any]:
    """Treat a scalar filter value as one item instead of iterating characters."""
    if value is None or value == "":
        return []
    return list(value) if isinstance(value, (list, tuple, set)) else [value]


def _dish_ingredients(dish: Dict[str, Any]) -> List[str]:
    existing = dish.get("ingredients")
    if isinstance(existing, (list, tuple, set)):
        values = existing
    else:
        values = parse_ingredients(dish.get("cl", "") or dish.get("ingredients_amounts", ""))
    normalized = [normalize_ingredient(value) for value in values]
    return [value for value in dict.fromkeys(normalized) if value]


def _dish_tag_codes(dish: Dict[str, Any]) -> List[str]:
    codes = _split_codes(dish.get("tag_codes"))
    if codes:
        return codes
    tags = dish.get("tags", "")
    tag_text = " ".join(map(str, tags)) if isinstance(tags, (list, tuple, set)) else str(tags or "")
    inferred = _split_codes(tag_text)
    name_and_doc = f"{dish.get('name', '')} {tag_text} {dish.get('doc', '')}"
    if any(word in name_and_doc for word in ("辣", "川", "椒", "豆瓣")):
        inferred.append("SPICY")
    if any(word in name_and_doc for word in ("清蒸", "白灼", "清淡", "清炒", "少油")):
        inferred.append("LIGHT")
    return list(dict.fromkeys(inferred))


def _dish_cuisine_codes(dish: Dict[str, Any]) -> List[str]:
    codes = _split_codes(dish.get("cuisine_code") or dish.get("cuisine_codes"))
    if codes:
        return codes
    text = f"{dish.get('name', '')} {dish.get('tags', '')}"
    inferred = []
    if "川" in text or "麻辣" in text:
        inferred.append("SICHUAN")
    if "粤" in text or "白灼" in text:
        inferred.append("CANTONESE")
    return inferred


def _cook_minutes(dish: Dict[str, Any]) -> Optional[int]:
    raw = dish.get("cook_minutes", dish.get("cookTime", dish.get("cook_time")))
    if raw is None or raw == "":
        return None
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        match = re.search(r"(\d+)", str(raw))
        return int(match.group(1)) if match else None

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
        # 辅助元数据是可选的；旧库没有新字段时仍可退回到原始菜品字段。
        with conn.cursor() as cur:
            try:
                cur.execute(
                    f"SELECT ID, NAME, TYPE, CL, TAGS, METHODS, KCAL, DIFFICULTY, IMAGE, "
                    f"STEPS as steps, INGREDIENTS_AMOUNTS, CUISINE_CODE, TAG_CODES, COOK_MINUTES "
                    f"FROM food WHERE user_id IS NULL AND COALESCE(is_published, 1) = 1 "
                    f"AND STEPS IS NOT NULL AND STEPS != '' {limit}"
                )
            except Exception:
                cur.execute(
                    f"SELECT ID, NAME, TYPE, CL, TAGS, METHODS, KCAL, DIFFICULTY, IMAGE, "
                    f"STEPS as steps, INGREDIENTS_AMOUNTS "
                    f"FROM food WHERE user_id IS NULL AND COALESCE(is_published, 1) = 1 "
                    f"AND STEPS IS NOT NULL AND STEPS != '' {limit}"
                )
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

        rcuisine = r.get('CUISINE_CODE', r.get('cuisine_code', '')) or ''
        rtag_codes = r.get('TAG_CODES', r.get('tag_codes', '')) or ''
        rcook_minutes = r.get('COOK_MINUTES', r.get('cook_minutes', None))
        d = {"id":rid, "name":rname, "type":_map_type(rtype),
             "cl":rcl, "kcal":rkcal, "difficulty":rdiff,
             "tags":rtags, "methods":rmethods, "step":rsteps,
             "image":rimage, "cuisine_code":rcuisine, "tag_codes":rtag_codes,
             "cook_minutes":rcook_minutes, "ingredients":parse_ingredients(rcl), "doc":""}
        d["doc"] = _make_doc(d)
        meta_list.append(d)
        for ing in parse_ingredients(rcl):
            for key in {ing, normalize_ingredient(ing)}:
                if not key:
                    continue
                if key not in ing_map:
                    ing_map[key] = []
                ing_map[key].append(rid)

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
    matched_counts: Counter = Counter()
    for item in items:
        normalized = normalize_ingredient(item)
        matches = list(_ingredient_map.get(normalized, []) or _ingredient_map.get(str(item), []))
        if not matches:
            for k, v in _ingredient_map.items():
                key = normalize_ingredient(k)
                if normalized and (normalized in key or key in normalized):
                    matches.extend(v)
        matched_counts.update(matches)
    if not matched_counts:
        return []
    by_id = {d["id"]:d for d in _dish_meta}
    ranked = sorted(matched_counts, key=lambda dish_id: (-matched_counts[dish_id], str(by_id.get(dish_id, {}).get("name", "")), str(dish_id)))
    return [dict(by_id[i]) for i in ranked[:top_k] if i in by_id]


def _query_tokens(query: str) -> List[str]:
    text = str(query or "").strip().lower()
    if not text:
        return []
    tokens = [text] if len(text) >= 2 else []
    try:
        import jieba
        tokens.extend(token.strip().lower() for token in jieba.cut(text) if len(token.strip()) >= 2)
    except Exception:
        tokens.extend(token for token in re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z0-9]{2,}", text))
    # Phrases commonly supplied as filters should still be meaningful without jieba.
    for token in ("清淡", "家常", "快手", "番茄", "西红柿", "鸡蛋", "晚餐", "午餐", "早餐"):
        if token in text:
            tokens.append(token)
    return list(dict.fromkeys(token for token in tokens if token))


def _normalised_set(values: Iterable[Any]) -> set:
    return {str(value).strip().upper() for value in values or [] if str(value).strip()}


def _ingredient_matches_exclusion(excluded: str, ingredient: str) -> bool:
    """Match a natural ingredient root without confusing dish descriptors.

    ``鱼`` should cover ``鱼肉``/``鱼片`` in source data, but not a name such
    as ``鱼香茄子`` where 鱼 is a cooking-style word rather than an ingredient.
    """
    if not excluded or not ingredient:
        return False
    if excluded == ingredient:
        return True
    suffixes = {
        "鱼": ("肉", "片", "块", "柳", "头", "尾"),
        "鸡": ("肉", "腿", "胸", "翅", "蛋"),
        "猪": ("肉", "排", "肋", "里脊"),
        "牛": ("肉", "腩", "排"),
        "羊": ("肉", "排"),
    }
    return excluded in suffixes and any(ingredient == excluded + suffix for suffix in suffixes[excluded])


def _matches_filters(dish: Dict[str, Any], filters: Dict[str, Any]) -> Tuple[bool, List[str]]:
    tag_codes = _normalised_set(_dish_tag_codes(dish))
    cuisine_codes = _normalised_set(_dish_cuisine_codes(dish))
    ingredients = set(_dish_ingredients(dish))
    exclude_tags = _normalised_set(_values(filters.get("exclude_tag_codes")))
    include_tags = _normalised_set(_values(filters.get("include_tag_codes")))
    allowed_cuisines = _normalised_set(_values(filters.get("cuisine_codes")))
    allowed_types = _normalised_set(_values(filters.get("types")))
    excluded_types = _normalised_set(_values(filters.get("exclude_types")))
    excluded_ingredients = {normalize_ingredient(value) for value in _values(filters.get("exclude_ingredients"))}
    excluded_ids = {str(value) for value in _values(filters.get("exclude_ids"))}

    if str(dish.get("id")) in excluded_ids:
        return False, []
    if exclude_tags.intersection(tag_codes):
        return False, []
    if "MEAT" in exclude_tags and str(dish.get("type", "")).lower() == "meat":
        return False, []
    if allowed_types and str(dish.get("type", "")).upper() not in allowed_types:
        return False, []
    if str(dish.get("type", "")).upper() in excluded_types:
        return False, []
    if allowed_cuisines and not allowed_cuisines.intersection(cuisine_codes):
        return False, []
    if any(_ingredient_matches_exclusion(excluded, ingredient) for excluded in excluded_ingredients for ingredient in ingredients):
        return False, []
    max_minutes = filters.get("max_cook_minutes")
    minutes = _cook_minutes(dish)
    try:
        if max_minutes is not None and minutes is not None and minutes > int(max_minutes):
            return False, []
    except (TypeError, ValueError):
        pass

    reasons: List[str] = []
    if include_tags.intersection(tag_codes):
        reasons.append("符合口味偏好")
    if allowed_cuisines.intersection(cuisine_codes):
        reasons.append("符合菜系偏好")
    available = {normalize_ingredient(value) for value in _values(filters.get("available_ingredients"))}
    overlap = available.intersection(ingredients)
    if overlap:
        reasons.append("可利用现有食材：" + "、".join(sorted(overlap)))
    if max_minutes is not None and minutes is not None and minutes <= int(max_minutes):
        reasons.append("预计制作时间符合要求")
    return True, reasons


def search_candidates(query: str = "", filters: Optional[Dict[str, Any]] = None, top_k: int = 20) -> List[Dict]:
    """Search database-indexed dishes with hard constraints before ranking.

    The scoring is deliberately transparent and deterministic: exact names and
    matched database fields outrank vague text similarity.  It is BM25-like in
    spirit without adding a memory-heavy external vector service.
    """
    load_index()
    filters = dict(filters or {})
    tokens = _query_tokens(query)
    available = {normalize_ingredient(value) for value in _values(filters.get("available_ingredients"))}
    include_tags = _normalised_set(_values(filters.get("include_tag_codes")))
    preferred_tags = _normalised_set(_values(filters.get("preferred_tag_codes")))
    preferred_cuisines = _normalised_set(_values(filters.get("preferred_cuisine_codes")))
    favorite_ids = {str(value) for value in _values(filters.get("favorite_dish_ids"))}
    recent_names = {str(name).strip() for name in _values(filters.get("recent_dish_names")) if str(name).strip()}
    scored: List[Tuple[float, str, str, Dict[str, Any]]] = []

    for source in _dish_meta:
        allowed, reasons = _matches_filters(source, filters)
        if not allowed or not source.get("id"):
            continue
        dish = dict(source)
        name = str(dish.get("name", ""))
        name_lower = name.lower()
        doc = str(dish.get("doc", "")) + " " + str(dish.get("tags", "")) + " " + str(dish.get("methods", ""))
        doc_lower = doc.lower()
        tag_codes = _normalised_set(_dish_tag_codes(dish))
        ingredients = set(_dish_ingredients(dish))
        score = 0.0
        for token in tokens:
            if token == name_lower:
                score += 36
                reasons.append("菜名完全匹配")
            elif token in name_lower:
                score += 14
                reasons.append("菜名匹配")
            elif token in doc_lower:
                score += 4
        overlap = available.intersection(ingredients)
        score += 8 * len(overlap)
        score += 5 * len(include_tags.intersection(tag_codes))
        preferred_overlap = preferred_tags.intersection(tag_codes)
        cuisine_overlap = preferred_cuisines.intersection(_normalised_set(_dish_cuisine_codes(dish)))
        score += 4 * len(preferred_overlap)
        score += 10 * len(cuisine_overlap)
        if preferred_overlap:
            reasons.append("符合已保存的口味偏好")
        if cuisine_overlap:
            reasons.append("符合已保存的菜系偏好")
        if str(dish.get("id")) in favorite_ids:
            score += 8
            reasons.append("你收藏过这道菜")
        if name in recent_names:
            score -= 10
            reasons.append("近期吃过，已降低优先级")
        minutes = _cook_minutes(dish)
        if filters.get("max_cook_minutes") is not None and minutes is None:
            # Unknown time is allowed but should not outrank known quick dishes.
            score -= 0.5
        dish["ingredients"] = _dish_ingredients(dish)
        dish["tag_codes"] = _dish_tag_codes(dish)
        dish["cuisine_codes"] = _dish_cuisine_codes(dish)
        dish["cook_minutes"] = minutes
        dish["match_reasons"] = list(dict.fromkeys(reasons))
        dish["source_confidence"] = "database"
        scored.append((score, name, str(dish.get("id")), dish))

    scored.sort(key=lambda item: (-item[0], item[1], item[2]))
    return [item[3] for item in scored[:max(1, int(top_k or 20))]]

def search_semantic(query: str, top_k: int = 10) -> List[Dict]:
    """Compatibility wrapper for legacy chat callers."""
    results = search_candidates(query, top_k=top_k)
    # Legacy semantic search returned no arbitrary dishes when no word matched.
    return [dish for dish in results if dish.get("match_reasons") or not query.strip()]
