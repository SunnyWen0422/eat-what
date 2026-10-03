"""Task-oriented meal planning assistant.

This module keeps the model at the language boundary.  Parsing, candidate
selection, ownership and action previews remain deterministic Python code so a
model response can never invent a dish id or silently write application data.
"""
from __future__ import annotations

import copy
import json
import logging
import re
import secrets
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence

import rag
from assistant_store import AssistantStore
from assistant_skills import catalog as skill_catalog, skill_for_intent
from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL

log = logging.getLogger(__name__)
ASSISTANT_VERSION = "2.0"
SESSION_STORE = AssistantStore()

_INGREDIENTS = (
    "鸡蛋", "番茄", "西红柿", "土豆", "猪肉", "牛肉", "羊肉", "鸡肉", "鸭肉", "鱼肉", "虾", "蟹",
    "排骨", "五花肉", "里脊", "鸡腿", "鸡胸", "鸡翅", "鱼", "带鱼", "鲫鱼", "草鱼", "白菜", "青菜",
    "菠菜", "豆腐", "萝卜", "冬瓜", "南瓜", "黄瓜", "茄子", "豆角", "西兰花", "菜花", "辣椒", "青椒",
    "洋葱", "姜", "蒜", "葱", "面条", "米饭", "面粉", "玉米", "红薯", "紫薯", "牛奶", "酸奶", "芝士",
    "蘑菇", "香菇", "木耳", "银耳", "红枣", "枸杞", "粉丝", "粉条",
)

_MEAL_LABELS = {"breakfast": "早餐", "lunch": "午餐", "dinner": "晚餐"}
_TYPE_ORDER = ("meat", "veg", "soup", "staple", "dessert")


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "").strip())


def _parse_people(text: str) -> Optional[int]:
    match = re.search(r"(\d{1,2})\s*(?:个人|人份|人)", text)
    if match:
        return max(1, min(50, int(match.group(1))))
    chinese = {"一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
    match = re.search(r"([一两二三四五六七八九十])\s*(?:个人|人份|人)", text)
    return chinese.get(match.group(1)) if match else None


def _meal_types(text: str) -> List[str]:
    result: List[str] = []
    if any(token in text for token in ("早餐", "早饭", "早上")):
        result.append("breakfast")
    if any(token in text for token in ("午餐", "午饭", "中餐", "中午")):
        result.append("lunch")
    if any(token in text for token in ("晚餐", "晚饭", "晚点", "今晚", "晚上")):
        result.append("dinner")
    return result or ["dinner"]


def _parse_dates(text: str, now: datetime) -> List[str]:
    current = now.date()
    iso_dates = re.findall(r"(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)", text)
    if iso_dates:
        # Explicit day values from the date picker take priority over relative wording.
        try:
            return list(dict.fromkeys(date.fromisoformat(value).isoformat() for value in iso_dates))[:31]
        except ValueError as error:
            from plan_commands import PlanCommandError
            raise PlanCommandError("日期无效，请重新选择日期") from error
    if "明天" in text:
        return [(current + timedelta(days=1)).isoformat()]
    if "后天" in text:
        return [(current + timedelta(days=2)).isoformat()]
    if "今天" in text or "今晚" in text or "现在" in text:
        return [current.isoformat()]
    # A named weekday is one date, not a request for N days (下周三 != 下周三天).
    # Do not mistake “下周三个工作日” for the weekday “下周三”.
    weekday_match = re.search(r"下(?:个)?(?:周|星期)([一二三四五六日天])(?![个天])", text)
    if weekday_match:
        weekday = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}[weekday_match.group(1)]
        monday = current - timedelta(days=current.weekday()) + timedelta(days=7)
        return [(monday + timedelta(days=weekday)).isoformat()]
    # “下周” means the next Monday through Sunday relative to the current date.
    if "下周" in text or "下个星期" in text or "下星期" in text:
        monday = current - timedelta(days=current.weekday()) + timedelta(days=7)
        available = [monday + timedelta(days=i) for i in range(7)]
        if "工作日" in text or "周一到周五" in text:
            available = [day for day in available if day.weekday() < 5]
        elif "周末" in text:
            available = [day for day in available if day.weekday() >= 5]
        count_match = re.search(r"(?:下周|下个星期|下星期)(?:安排)?(?:三个|三|四个|四|五个|五|两天|两|一天|一)?", text)
        chinese_counts = {"一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7}
        count = None
        if count_match:
            fragment = count_match.group(0)
            for key, value in chinese_counts.items():
                if key in fragment:
                    count = value
                    break
        return [day.isoformat() for day in (available[:count] if count else available)]
    if "周末" in text:
        days_until_saturday = (5 - current.weekday()) % 7
        if days_until_saturday == 0 and current.weekday() >= 5:
            saturday = current
        else:
            saturday = current + timedelta(days=days_until_saturday)
        return [(saturday + timedelta(days=i)).isoformat() for i in range(2)]
    date_match = re.search(r"(\d{1,2})月(\d{1,2})(?:日|号)?", text)
    if date_match:
        year = current.year
        month, day = int(date_match.group(1)), int(date_match.group(2))
        try:
            parsed = date(year, month, day)
            if parsed < current and month <= current.month:
                parsed = date(year + 1, month, day)
            return [parsed.isoformat()]
        except ValueError:
            pass
    return [current.isoformat()]


def _avoidance_spans(text: str) -> List[tuple]:
    """Return spans belonging to explicit negative ingredient clauses."""
    spans: List[tuple] = []
    marker = re.compile(r"(?:不要|不吃|忌口|忌用|排除|别放|不想吃|不想要)")
    boundary = re.compile(r"[，。！？；;,.]|(?:但是|而是|但|家里有|冰箱|帮我|安排|推荐|想吃|今晚|今天)")
    for match in marker.finditer(text):
        tail = text[match.end():]
        end_match = boundary.search(tail)
        end = match.end() + (end_match.start() if end_match else len(tail))
        spans.append((match.start(), end))
    return spans


def _inside_span(position: int, spans: Iterable[tuple]) -> bool:
    return any(start <= position < end for start, end in spans)


def _extract_ingredients(text: str, ignored_spans: Optional[Iterable[tuple]] = None) -> List[str]:
    """Extract known ingredients in the order they occur in the message."""
    ignored = list(ignored_spans or [])
    occurrences = []
    for ingredient in _INGREDIENTS:
        for match in re.finditer(re.escape(ingredient), text):
            if not _inside_span(match.start(), ignored):
                occurrences.append((match.start(), -len(ingredient), ingredient))
    occurrences.sort(key=lambda item: (item[0], item[1]))
    found: List[str] = []
    canonical_seen = set()
    for _, _, ingredient in occurrences:
        canonical = rag.normalize_ingredient(ingredient)
        if canonical and canonical not in canonical_seen:
            # Keep the user's canonical-friendly wording for display while
            # treating 西红柿/番茄 as one retrieval ingredient.
            found.append("番茄" if canonical == "番茄" else ingredient)
            canonical_seen.add(canonical)
    return found


def _extract_avoided_ingredients(text: str, spans: Iterable[tuple]) -> List[str]:
    avoided: List[str] = []
    seen = set()
    for start, end in spans:
        for ingredient in _extract_ingredients(text[start:end]):
            canonical = rag.normalize_ingredient(ingredient)
            if canonical and canonical not in seen:
                avoided.append(ingredient)
                seen.add(canonical)
    return avoided


def _availability_spans(text: str) -> List[tuple]:
    """Locate clauses that explicitly describe ingredients on hand.

    Scanning every ingredient-looking word makes a dish name such as
    “番茄炒蛋” look like inventory.  Only text following an availability
    marker is considered current-task inventory.
    """
    spans: List[tuple] = []
    marker = re.compile(r"(?:家里有|冰箱(?:里)?有|现有(?:食材)?|手边有|(?<!没)有(?=[^，。！？；;]*?(?:鸡蛋|番茄|西红柿|土豆|猪肉|牛肉|鸡肉|鱼|虾|豆腐|白菜|青菜|菠菜|排骨|面条|米饭)))")
    boundary = re.compile(r"[，。！？；;,.]|(?:不要|不吃|忌口|排除|帮我|安排|推荐|想吃|但是|而是)")
    for match in marker.finditer(text):
        tail = text[match.end():]
        end_match = boundary.search(tail)
        end = match.end() + (end_match.start() if end_match else len(tail))
        spans.append((match.end(), end))
    return spans


def _intent(text: str) -> str:
    if any(token in text for token in ("换掉", "换一道", "替换")):
        return "replace"
    if "不想吃" in text and any(token in text for token in ("这道菜", "这个", "这份")):
        return "replace"
    named_weekday = re.search(r"下(?:个)?(?:周|星期)[一二三四五六日天](?![个天])", text)
    if any(token in text for token in ("几天", "工作日", "周末", "一周", "连续")) or ("下周" in text and not named_weekday):
        return "period_plan"
    if any(token in text for token in ("家里有", "冰箱", "现有食材", "有鸡蛋", "有番茄")):
        return "ingredient_match" if not any(token in text for token in ("安排", "晚饭", "晚餐", "今晚", "午饭", "早餐", "吃什么")) else "plan_meal"
    if any(token in text for token in ("怎么做", "做法", "步骤", "如何制作")):
        return "howto"
    if any(token in text for token in ("安排", "推荐", "吃什么", "搭配", "晚饭", "午饭", "早餐", "晚餐", "今晚", "晚上", "中午", "早上")):
        return "plan_meal"
    return "chat"


def parse_user_request(message: str, now: Optional[datetime] = None) -> Dict[str, Any]:
    text = _clean_text(message)
    current = now or datetime.now()
    include: List[str] = []
    exclude: List[str] = []
    if any(token in text for token in ("清淡", "少油", "低脂")):
        include.append("LIGHT")
    if any(token in text for token in ("家常", "快手")):
        include.append("HOME_STYLE")
    if any(token in text for token in ("不要辣", "不辣", "别辣", "无辣")):
        exclude.append("SPICY")
    elif "辣" in text:
        include.append("SPICY")
    if any(token in text for token in ("素食", "纯素", "不吃肉", "全素")):
        exclude.append("MEAT")
    max_minutes = 30 if any(token in text for token in ("别太复杂", "简单点", "快手", "省事", "不麻烦")) else None
    dates = _parse_dates(text, current)
    meals = _meal_types(text)
    period = len(dates) > 1 or any(token in text for token in ("几天", "工作日", "周末", "一周", "连续"))
    intent = _intent(text)
    if period:
        intent = "period_plan"
    # Accept both natural word orders: “保留汤” and “汤保留”。
    preserve = re.findall(r"(?:保留|留下)([^，。！？]+)", text)
    preserve += re.findall(r"([^，。！？]+?)(?:保留|留下)", text)
    preserve = list(dict.fromkeys(item.strip() for item in preserve if item.strip()))
    replace_target = re.findall(r"(?:把|将)?([^，。！？]+?)(?:换掉|换一道|替换)", text)
    replace_target += re.findall(r"(?:换一道|换一个|替换)([^，。！？]+)", text)
    replace_target = list(dict.fromkeys(item.strip() for item in replace_target if item.strip()))
    negative_spans = _avoidance_spans(text)
    availability_spans = _availability_spans(text)
    available: List[str] = []
    for start, end in availability_spans:
        available.extend(_extract_ingredients(text[start:end], negative_spans))
    available = list(dict.fromkeys(available))
    return {
        "message": message,
        "intent": intent,
        "skill": skill_for_intent(intent),
        "people": _parse_people(text) or 2,
        "meal_types": meals,
        "dates": dates,
        "period_label": "、".join(dates) if len(dates) > 1 else (("今天" if dates[0] == current.date().isoformat() else dates[0]) if dates else ""),
        "include_tag_codes": list(dict.fromkeys(include)),
        "exclude_tag_codes": list(dict.fromkeys(exclude)),
        "exclude_ingredients": _extract_avoided_ingredients(text, negative_spans),
        "available_ingredients": available,
        "max_cook_minutes": max_minutes,
        "remember_ingredients": False,
        "avoid_repeated": any(token in text for token in ("不要重复", "别重复", "不重样", "尽量不要重复")),
        "preserve": preserve,
        "replace_target": replace_target,
    }


def _candidate_key(dish: Dict[str, Any]) -> str:
    return str(dish.get("id") or dish.get("name") or "")


def _candidate_types(dishes: Sequence[Dict[str, Any]], type_name: str) -> List[Dict[str, Any]]:
    return [dish for dish in dishes if str(dish.get("type", "")).lower() == type_name]


def _choose_dishes(request: Dict[str, Any], candidates: Sequence[Dict[str, Any]], used: set) -> List[Dict[str, Any]]:
    selected: List[Dict[str, Any]] = []
    # A single dish is a better result than an invented or stale id. For a
    # larger dinner, add one meat, one vegetable and one soup when available.
    wanted_types = ["meat", "veg", "soup"]
    if request.get("people", 2) <= 1:
        wanted_types = ["meat", "veg"]
    if request.get("intent") == "ingredient_match" and request.get("available_ingredients"):
        wanted_types = ["meat", "veg", "soup", "staple"]
    for type_name in wanted_types:
        options = [dish for dish in _candidate_types(candidates, type_name) if _candidate_key(dish) not in used]
        if not options:
            continue
        choice = options[0]
        selected.append(dict(choice))
        used.add(_candidate_key(choice))
    if not selected:
        for candidate in candidates:
            if _candidate_key(candidate) not in used:
                selected.append(dict(candidate))
                used.add(_candidate_key(candidate))
                break
    return selected


def _term_matches_dish(term: str, dish: Dict[str, Any]) -> bool:
    """Match a user's short target such as “肉菜” or “汤” to a dish."""
    value = _clean_text(term).lower()
    if not value:
        return False
    dish_type = str(dish.get("type", "")).lower()
    type_words = {
        "肉菜": "meat", "荤菜": "meat", "肉": "meat", "主菜": "meat",
        "素菜": "veg", "蔬菜": "veg", "青菜": "veg",
        "汤": "soup", "汤品": "soup", "主食": "staple", "甜品": "dessert",
    }
    if value in type_words:
        return dish_type == type_words[value]
    return value in _clean_text(dish.get("name", "")).lower()


def _replacement_plan(
    request: Dict[str, Any],
    candidates: Sequence[Dict[str, Any]],
    previous_plan: Dict[str, Any],
    version: int,
) -> Dict[str, Any]:
    """Apply a local replacement to an existing plan without rewriting it in place."""
    meals = copy.deepcopy(previous_plan.get("meals") or [])
    warnings: List[str] = []
    preserve_terms = request.get("preserve") or []
    target_terms = request.get("replace_target") or []
    target = None
    target_meal = None

    # Prefer an explicitly named target; otherwise replace the first dish that
    # is not explicitly marked for keeping.  This keeps “汤保留，肉菜换一道”
    # understandable without asking the user to repeat the whole plan.
    for meal in meals:
        for dish in meal.get("dishes") or []:
            if not dish.get("locked") and any(_term_matches_dish(term, dish) for term in target_terms):
                target, target_meal = dish, meal
                break
        if target:
            break
    locked_target = any(dish.get("locked") and any(_term_matches_dish(term,dish) for term in target_terms)
                        for meal in meals for dish in meal.get("dishes") or [])
    if locked_target:
        from plan_commands import PlanCommandError
        raise PlanCommandError("这道菜已保留，请先解除保留")
    if target is None:
        for meal in meals:
            for dish in meal.get("dishes") or []:
                if not dish.get("locked") and not any(_term_matches_dish(term, dish) for term in preserve_terms):
                    target, target_meal = dish, meal
                    break
            if target:
                break

    if target is None:
        warnings.append("没有找到可以替换的菜，原方案已保留")
    else:
        target_type = str(target.get("type", "")).lower()
        existing_ids = {
            _candidate_key(dish)
            for meal in meals
            for dish in meal.get("dishes") or []
            if dish is not target
        }
        replacement = next(
            (
                dict(candidate)
                for candidate in candidates
                if str(candidate.get("type", "")).lower() == target_type
                and _candidate_key(candidate) not in existing_ids
                and _candidate_key(candidate) != _candidate_key(target)
            ),
            None,
        )
        if replacement is None:
            warnings.append("当前条件下没有同类型替代菜，原方案已保留")
        else:
            replacement["replaced_from"] = target.get("id")
            replacement["match_reasons"] = list(dict.fromkeys(
                list(replacement.get("match_reasons") or []) + ["按你的要求替换"]
            ))
            dishes = target_meal.get("dishes") or []
            target_index = dishes.index(target)
            dishes[target_index] = replacement

    # Explicitly preserved dishes receive a small display marker; no data is
    # otherwise changed and the old plan remains available in plan_history.
    for meal in meals:
        for dish in meal.get("dishes") or []:
            if any(_term_matches_dish(term, dish) for term in preserve_terms):
                dish["preserved"] = True
                dish["match_reasons"] = list(dict.fromkeys(
                    list(dish.get("match_reasons") or []) + ["按你的要求保留"]
                ))

    return {
        "version": version,
        "source": previous_plan.get("source", "database"),
        "period": copy.deepcopy(previous_plan.get("period") or {
            "dates": request.get("dates") or [],
            "meal_types": request.get("meal_types") or [],
            "people": request.get("people", 2),
        }),
        "meals": meals,
        "warnings": list(dict.fromkeys(list(previous_plan.get("warnings") or []) + warnings)),
        "provenance": [
            {"dish_id": dish.get("id"), "source": "database"}
            for meal in meals for dish in meal.get("dishes") or [] if dish.get("id")
        ],
    }


def build_plan(
    request: Dict[str, Any],
    dishes: Sequence[Dict[str, Any]],
    previous_plan: Optional[Dict[str, Any]] = None,
    version: Optional[int] = None,
) -> Dict[str, Any]:
    candidates = [dict(dish) for dish in dishes if dish.get("id")]
    version = int(version if version is not None else int((previous_plan or {}).get("version", 0) or 0) + 1)
    if previous_plan and request.get("intent") == "replace":
        return _replacement_plan(request, candidates, previous_plan, version)
    meals: List[Dict[str, Any]] = []
    used_ids: set = set()
    used_ingredients: set = set()
    warnings: List[str] = []
    for current_date in request.get("dates") or [date.today().isoformat()]:
        for meal_type in request.get("meal_types") or ["dinner"]:
            selected = _choose_dishes(request, candidates, used_ids if request.get("avoid_repeated") else set())
            if request.get("avoid_repeated"):
                # If the period is longer than the candidate pool, allow a
                # repeat only after recording the reason instead of hiding it.
                if not selected:
                    warnings.append("菜库候选不足，后续餐次可能需要重复")
            for dish in selected:
                ingredients = {rag.normalize_ingredient(item) for item in rag._dish_ingredients(dish)}
                if request.get("avoid_repeated") and ingredients.intersection(used_ingredients):
                    dish.setdefault("match_reasons", []).append("已尽量避开重复主料")
                used_ingredients.update(ingredients)
            meals.append({
                "date": current_date,
                "meal_type": meal_type,
                "label": _MEAL_LABELS.get(meal_type, meal_type),
                "dishes": selected,
            })
    if not candidates:
        warnings.append("当前条件下没有找到可确认的数据库菜品")
    return {
        "version": version,
        "source": "database" if candidates else "none",
        "period": {"dates": request.get("dates") or [], "meal_types": request.get("meal_types") or [], "people": request.get("people", 2)},
        "meals": meals,
        "warnings": list(dict.fromkeys(warnings)),
        "provenance": [{"dish_id": dish.get("id"), "source": "database"} for meal in meals for dish in meal["dishes"]],
    }


def _friendly_reply(request: Dict[str, Any], plan: Dict[str, Any]) -> str:
    count = sum(len(meal.get("dishes", [])) for meal in plan.get("meals", []))
    if not count:
        return "我暂时没找到同时满足这些条件的菜。可以放宽口味、时间或忌口中的一项，我再帮你安排。"
    if request.get("intent") == "period_plan":
        return f"我先安排了 {len(plan.get('meals', []))} 个餐次，共 {count} 道菜。你可以保留某道菜，或只替换其中一餐。"
    return f"按你说的条件，我安排了 {count} 道菜。先看看这套，想换哪一道直接告诉我。"


def _split_steps(value: Any) -> List[str]:
    if isinstance(value, (list, tuple)):
        raw = value
    else:
        raw = re.split(r"[#\n]+", str(value or ""))
    steps: List[str] = []
    for item in raw:
        text = re.sub(r"^\s*(?:\d+[.、)]|步骤\s*\d+[:：]?)\s*", "", str(item or "")).strip()
        if text:
            steps.append(text[:500])
    return steps[:20]


def _build_howto(candidates: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not candidates:
        return None
    dish = dict(candidates[0])
    steps = _split_steps(dish.get("step") or dish.get("steps") or dish.get("methods"))
    return {
        "dish_id": dish.get("id"),
        "dish_name": dish.get("name", ""),
        "steps": steps,
        "source": "database",
        "steps_status": "available" if steps else "not_recorded",
    }


def _howto_candidates(request: Dict[str, Any], candidates: Sequence[Dict[str, Any]], previous_plan: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Keep a how-to lookup from presenting an unrelated zero-score dish."""
    message = _clean_text(request.get("message", ""))
    verbs = ("怎么做", "如何制作", "做法", "步骤", "怎样做")
    query = message
    for verb in verbs:
        query = query.replace(verb, "")
    query = query.strip("，。！？？ ")
    if query:
        # The remaining text often contains polite framing such as
        # “请告诉我红烧排骨”.  A dish name inside that text is the reliable
        # signal; requiring the whole query to be inside the name would miss
        # the exact record and could leave an unrelated search hit visible.
        matched = [dish for dish in candidates if _clean_text(dish.get("name", "")) and _clean_text(dish.get("name", "")) in query]
        if matched:
            return matched
    # “这个怎么做” can refer to the current plan.  It is safe to reuse only
    # those already-confirmed database IDs, never an arbitrary search result.
    if previous_plan:
        previous = _plan_dishes(previous_plan)
        if previous:
            return previous
    return []


def _plan_dishes(plan: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not plan:
        return []
    result: List[Dict[str, Any]] = []
    seen = set()
    for meal in plan.get("meals") or []:
        for dish in meal.get("dishes") or []:
            key = _candidate_key(dish)
            if key and key not in seen:
                result.append(dict(dish))
                seen.add(key)
    return result


def _action_list(plan: Dict[str, Any]) -> List[Dict[str, Any]]:
    payload = {"plan_version": plan.get("version", 1), "meals": plan.get("meals", [])}
    return [
        {"type": "SAVE_CALENDAR", "label": "保存到日历", "requires_confirmation": True, "payload": payload},
        {"type": "ADD_SHOPPING_LIST", "label": "加入购物清单", "requires_confirmation": True, "payload": payload},
    ]


def _scope_session(user_scope: str, session_id: Optional[str]) -> Dict[str, Any]:
    if session_id:
        existing = SESSION_STORE.get(session_id, user_scope)
        if existing:
            return existing
    return SESSION_STORE.create(user_scope, session_id=session_id)


def _local_candidates(request: Dict[str, Any], user_scope: str) -> List[Dict[str, Any]]:
    recent_names: List[str] = []
    saved_context: Dict[str, Any] = {}
    if str(user_scope).startswith("user:"):
        try:
            from db import fetch_recent_dish_names, fetch_user_assistant_context
            user_id = int(str(user_scope).split(":", 1)[1])
            saved_context = fetch_user_assistant_context(user_id) or {}
            recent_names = fetch_recent_dish_names(user_id, limit=12)
        except Exception:
            # Recommendation must remain available when the optional history
            # query is unavailable; it only affects a small ranking bonus.
            recent_names = []
    filters = {
        "include_tag_codes": request.get("include_tag_codes"),
        "exclude_tag_codes": list(dict.fromkeys(
            list(saved_context.get("excluded_tag_codes") or []) + list(request.get("exclude_tag_codes") or [])
        )),
        "exclude_ingredients": list(dict.fromkeys(
            list(saved_context.get("excluded_ingredients") or []) + list(request.get("exclude_ingredients") or [])
        )),
        "available_ingredients": request.get("available_ingredients"),
        "max_cook_minutes": request.get("max_cook_minutes") if request.get("max_cook_minutes") is not None else saved_context.get("max_cook_minutes"),
        "recent_dish_names": recent_names,
        "preferred_cuisine_codes": saved_context.get("preferred_cuisine_codes") or [],
        "preferred_tag_codes": saved_context.get("preferred_tag_codes") or [],
        "favorite_dish_ids": saved_context.get("favorite_dish_ids") or [],
    }
    query = request.get("message", "")
    return rag.search_candidates(query, filters=filters, top_k=30)


def _inherit_follow_up_context(request: Dict[str, Any], previous_request: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Carry the prior meal context into short follow-up instructions.

    Replacement messages usually contain only the requested change.  We copy
    the prior constraints while keeping any newly explicit exclusions and
    targets from the current message.  The original request is never mutated.
    """
    if not previous_request:
        return request
    merged = copy.deepcopy(previous_request)
    merged.update({"message": request.get("message", ""), "intent": request.get("intent", "replace"), "skill": request.get("skill", "replace_dish")})
    # These fields are meaningful only when the follow-up explicitly supplies
    # them; parser defaults (two people/today/dinner) must not erase context.
    text = _clean_text(request.get("message", ""))
    if _parse_people(text) is not None:
        merged["people"] = request["people"]
    if any(token in text for token in ("今天", "今晚", "明天", "后天", "下周", "周末", "月")):
        merged["dates"] = request["dates"]
        merged["period_label"] = request.get("period_label", "")
    if any(token in text for token in ("早餐", "早饭", "午餐", "午饭", "中餐", "晚餐", "晚饭", "晚上")):
        merged["meal_types"] = request["meal_types"]
    for key in ("include_tag_codes", "exclude_tag_codes", "exclude_ingredients", "available_ingredients"):
        if request.get(key):
            merged[key] = list(dict.fromkeys(list(merged.get(key) or []) + list(request[key])))
    if request.get("max_cook_minutes") is not None:
        merged["max_cook_minutes"] = request["max_cook_minutes"]
    merged["preserve"] = request.get("preserve") or []
    merged["replace_target"] = request.get("replace_target") or []
    merged["avoid_repeated"] = bool(request.get("avoid_repeated") or merged.get("avoid_repeated"))
    return merged


def _safe_model_reply(message: str, context: Dict[str, Any]) -> Optional[str]:
    """Optional wording pass. Model output is never used as structured data."""
    if not DEEPSEEK_API_KEY:
        return None
    try:
        import httpx
        response = httpx.post(
            f"{DEEPSEEK_BASE_URL.rstrip('/')}/v1/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
            json={
                "model": DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": "把给定的餐食安排说明润色成简洁、自然的中文，不新增菜名、数量或事实。只返回一句话。"},
                    {"role": "user", "content": json.dumps({"request": message, "reply": context.get("reply", "")}, ensure_ascii=False)},
                ],
                "temperature": 0.2,
                "max_tokens": 120,
            },
            timeout=8,
        )
        content = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
        if content and len(content) <= 240:
            return str(content).strip()
    except Exception as error:
        log.info("DeepSeek wording pass unavailable: %s", error)
    return None


def handle_message(message: str, user_scope: str, session_id: Optional[str] = None, now: Optional[datetime] = None) -> Dict[str, Any]:
    session = _scope_session(user_scope, session_id)
    request = parse_user_request(message, now=now)
    previous_state = session.get("state") or {}
    previous_plan = previous_state.get("plan") if isinstance(previous_state.get("plan"), dict) else None
    previous_request = previous_state.get("request") if isinstance(previous_state.get("request"), dict) else None
    if request.get("intent") == "replace" and previous_plan:
        request = _inherit_follow_up_context(request, previous_request)
    candidates = _local_candidates(request, user_scope)

    # How-to questions are read-only lookups.  They must not create a fake
    # meal plan or expose save actions, and their steps come only from the
    # indexed dish record.
    if request.get("intent") == "howto":
        howto_matches = _howto_candidates(request, candidates, previous_plan)
        howto = _build_howto(howto_matches)
        if howto:
            reply = f"我找到【{howto['dish_name']}】的做法。"
            if howto["steps"]:
                reply += "按菜库记录的步骤操作即可。"
            else:
                reply += "菜库暂未记录完整步骤，你可以打开菜品详情查看。"
            status = "ready"
            source = "database"
            dishes = [dict(howto_matches[0])] if howto_matches else []
        else:
            reply = "我暂时没找到这道菜的可靠做法记录，可以换个菜名再试试。"
            status = "needs_input"
            source = "none"
            dishes = []
            howto = None
        SESSION_STORE.append_message(session["session_id"], user_scope, "user", message)
        SESSION_STORE.append_message(session["session_id"], user_scope, "assistant", reply)
        state = copy.deepcopy(previous_state)
        state.update({
            "request": request,
            "howto": howto,
            "alternatives": [],
            "task": {"type": request["intent"], "status": status, "progress": 1.0},
        })
        SESSION_STORE.update_state(session["session_id"], user_scope, state)
        return {
            "success": True,
            "assistant_version": ASSISTANT_VERSION,
            "session_id": session["session_id"],
            "task": {"id": session["session_id"], "type": request["intent"], "status": status, "progress": 1.0},
            "reply": reply,
            "intent": request,
            "skill": request.get("skill"),
            "plan": previous_plan,
            "dishes": dishes,
            "howto": howto,
            "alternatives": [],
            "actions": [],
            "warnings": [],
            "source": source,
        }

    next_version = int(previous_state.get("next_plan_version") or ((previous_plan or {}).get("version", 0) + 1))
    plan = build_plan(request, candidates, previous_plan=previous_plan, version=next_version)
    from plan_commands import next_plan_state
    plan = next_plan_state(previous_state, plan).get("plan")
    status = "ready" if any(meal.get("dishes") for meal in plan.get("meals", [])) else "needs_input"
    reply = _friendly_reply(request, plan)
    model_reply = _safe_model_reply(message, {"reply": reply, "plan": plan})
    if model_reply:
        reply = model_reply
    SESSION_STORE.append_message(session["session_id"], user_scope, "user", message)
    SESSION_STORE.append_message(session["session_id"], user_scope, "assistant", reply)
    history_all = list(previous_state.get("plan_history") or [])
    # If the user previously undid a change, start a new active branch while
    # retaining the abandoned snapshots in a bounded archive for audit/undo
    # transparency.  The current plan is never silently rewritten.
    discarded: List[Dict[str, Any]] = []
    if previous_plan and history_all:
        active_version = int(previous_plan.get("version", 0) or 0)
        active_index = next(
            (index for index in range(len(history_all) - 1, -1, -1)
             if int(history_all[index].get("version", -1) or -1) == active_version),
            len(history_all) - 1,
        )
        discarded = history_all[active_index + 1:]
        history = history_all[:active_index + 1]
    else:
        history = history_all
    # Keep immutable snapshots for undo/history while bounding the sidecar
    # payload.  The current plan is always the last item.
    history.append(copy.deepcopy(plan))
    archive = list(previous_state.get("plan_archive") or [])
    archive.extend(copy.deepcopy(discarded))
    selected_keys = {_candidate_key(dish) for dish in _plan_dishes(plan)}
    alternatives = [dict(candidate) for candidate in candidates if _candidate_key(candidate) not in selected_keys][:3]
    state = {
        "request": request,
        "plan": plan,
        "alternatives": alternatives,
        "plan_history": history[-10:],
        "plan_archive": archive[-10:],
        "active_plan_version": plan.get("version"),
        "next_plan_version": int(plan.get("version", 0) or 0) + 1,
        "task": {"type": request["intent"], "status": status, "progress": 1.0},
    }
    SESSION_STORE.update_state(session["session_id"], user_scope, state)
    return {
        "success": True,
        "assistant_version": ASSISTANT_VERSION,
        "session_id": session["session_id"],
        "task": {"id": session["session_id"], "type": request["intent"], "status": status, "progress": 1.0},
        "reply": reply,
        "intent": request,
        "skill": request.get("skill"),
        "plan": plan,
        "dishes": _plan_dishes(plan),
        "howto": None,
        "alternatives": alternatives,
        "actions": _action_list(plan) if status == "ready" else [],
        "warnings": plan.get("warnings", []),
        "source": plan.get("source", "none"),
        "can_undo": len(state["plan_history"]) > 1,
    }


def get_session(session_id: str, user_scope: str) -> Optional[Dict[str, Any]]:
    session = SESSION_STORE.get(session_id, user_scope)
    if not session:
        return None
    state = session.get("state") or {}
    plan = state.get("plan") if isinstance(state.get("plan"), dict) else None
    task = state.get("task") if isinstance(state.get("task"), dict) else None
    session["plan"] = plan
    session["task"] = task
    session["howto"] = state.get("howto")
    session["alternatives"] = state.get("alternatives") or []
    session["actions"] = _action_list(plan) if plan and task and task.get("status") == "ready" and task.get("type") != "howto" else []
    history = state.get("plan_history") or []
    session["can_undo"] = bool(plan and len(history) > 1)
    return session


def delete_session(session_id: str, user_scope: str) -> bool:
    return SESSION_STORE.delete(session_id, user_scope)


def undo_last_plan(session_id: str, user_scope: str, plan_version: Optional[int] = None) -> Dict[str, Any]:
    """Restore the preceding plan snapshot, preserving the current snapshot."""
    session = SESSION_STORE.get(session_id, user_scope)
    if not session:
        return {"success": False, "error_code": "ASSISTANT_SESSION_NOT_FOUND", "message": "助手会话不存在或已过期"}
    state = copy.deepcopy(session.get("state") or {})
    current = state.get("plan") if isinstance(state.get("plan"), dict) else None
    history = list(state.get("plan_history") or [])
    if not current or len(history) < 2:
        return {"success": False, "error_code": "ASSISTANT_UNDO_UNAVAILABLE", "message": "没有可撤销的方案修改"}
    if plan_version is not None and int(current.get("version", 0)) != int(plan_version):
        return {"success": False, "error_code": "ASSISTANT_PLAN_VERSION_CONFLICT", "message": "方案已更新，请重新确认"}
    active_version = int(current.get("version", 0) or 0)
    active_index = next(
        (index for index in range(len(history) - 1, -1, -1)
         if int(history[index].get("version", -1) or -1) == active_version),
        len(history) - 1,
    )
    if active_index <= 0:
        return {"success": False, "error_code": "ASSISTANT_UNDO_UNAVAILABLE", "message": "没有可撤销的方案修改"}
    restored = copy.deepcopy(history[active_index - 1])
    archive = list(state.get("plan_archive") or [])
    archive.append(copy.deepcopy(current))
    state["plan"] = restored
    state["plan_archive"] = archive[-10:]
    state["active_plan_version"] = restored.get("version")
    state["task"] = {"type": "plan_meal", "status": "ready", "progress": 1.0}
    state["howto"] = None
    state["alternatives"] = []
    SESSION_STORE.append_message(session_id, user_scope, "assistant", f"已恢复到方案 {restored.get('version', 1)}，刚才的方案仍保留在历史记录中。")
    SESSION_STORE.update_state(session_id, user_scope, state)
    reply = f"已恢复到方案 {restored.get('version', 1)}，刚才的方案仍保留在历史记录中。"
    return {
        "success": True,
        "assistant_version": ASSISTANT_VERSION,
        "session_id": session_id,
        "task": {"id": session_id, "type": "plan_meal", "status": "ready", "progress": 1.0},
        "reply": reply,
        "intent": {"intent": "undo"},
        "plan": restored,
        "dishes": _plan_dishes(restored),
        "howto": None,
        "alternatives": [],
        "actions": _action_list(restored),
        "warnings": restored.get("warnings", []),
        "source": restored.get("source", "none"),
        "can_undo": active_index - 1 > 0,
    }


def preview_action(session_id: str, user_scope: str, action_type: str, plan_version: int = 1,
                   payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    session = SESSION_STORE.get(session_id, user_scope)
    if not session:
        return {"success": False, "error_code": "ASSISTANT_SESSION_NOT_FOUND", "message": "助手会话不存在或已过期"}
    plan = session.get("state", {}).get("plan") or {}
    if int(plan.get("version", 0)) != int(plan_version):
        return {"success": False, "error_code": "ASSISTANT_PLAN_VERSION_CONFLICT", "message": "方案已更新，请重新确认"}
    # SAVE_CALENDAR and ADD_SHOPPING_LIST are retained as compatibility
    # aliases for the existing mini-program.  The v2 action names cover the
    # complete confirmed CRUD surface for calendar and shopping data.
    allowed = {
        "SAVE_CALENDAR", "CREATE_CALENDAR", "UPDATE_CALENDAR", "DELETE_CALENDAR",
        "ADD_SHOPPING_LIST", "UPDATE_SHOPPING_LIST", "DELETE_SHOPPING_LIST",
    }
    if action_type not in allowed:
        return {"success": False, "error_code": "ASSISTANT_ACTION_NOT_ALLOWED", "message": "不支持此操作"}
    dishes = [dish for meal in plan.get("meals", []) for dish in meal.get("dishes", [])]
    preview_token = secrets.token_urlsafe(32)
    state = copy.deepcopy(session.get("state") or {})
    previews = dict(state.get("pending_previews") or {})
    # Store the server-owned snapshot behind a short-lived opaque token.  The
    # token is never derived from client data and is required for confirmation.
    previews[preview_token] = {
        "action_type": action_type,
        "plan_version": int(plan_version),
        "plan": copy.deepcopy(plan),
        "payload": copy.deepcopy(payload or {}),
        "created_at": datetime.now().timestamp(),
    }
    state["pending_previews"] = dict(list(previews.items())[-12:])
    SESSION_STORE.update_state(session_id, user_scope, state)
    return {
        "success": True,
        "action": {
            "type": action_type,
            "requires_confirmation": True,
            "plan_version": plan_version,
            "dish_ids": [dish["id"] for dish in dishes if dish.get("id")],
            "preview_token": preview_token,
            "payload": copy.deepcopy(payload or {}),
        },
        # Return a server-owned snapshot so the client can never confirm a
        # locally mutated or stale plan after the version check.
        "plan": copy.deepcopy(plan),
    }


def confirm_action(session_id: str, user_scope: str, action_type: str, plan_version: int,
                   preview_token: str, idempotency_key: str,
                   payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Authorize a previously previewed user-data action.

    This endpoint only authorizes the server-owned snapshot.  Java executes
    the actual calendar/shopping write after this check, so the model never
    receives a direct write capability.
    """
    if not str(preview_token or "").strip() or not str(idempotency_key or "").strip():
        return {"success": False, "error_code": "ASSISTANT_CONFIRMATION_INVALID", "message": "确认凭证和幂等键不能为空"}
    session = SESSION_STORE.get(session_id, user_scope)
    if not session:
        return {"success": False, "error_code": "ASSISTANT_SESSION_NOT_FOUND", "message": "助手会话不存在或已过期"}
    state = copy.deepcopy(session.get("state") or {})
    plan = state.get("plan") or {}
    if int(plan.get("version", 0) or 0) != int(plan_version):
        return {"success": False, "error_code": "ASSISTANT_PLAN_VERSION_CONFLICT", "message": "方案已更新，请重新确认"}
    consumed = dict(state.get("consumed_actions") or {})
    previous = consumed.get(str(idempotency_key))
    if previous:
        if previous.get("type") != action_type or int(previous.get("plan_version", 0)) != int(plan_version):
            return {"success": False, "error_code": "ASSISTANT_IDEMPOTENCY_CONFLICT", "message": "幂等键已用于其他操作"}
        return {"success": True, "already_confirmed": True, "action": previous}
    preview = (state.get("pending_previews") or {}).get(str(preview_token))
    if not preview or preview.get("action_type") != action_type or int(preview.get("plan_version", 0)) != int(plan_version):
        return {"success": False, "error_code": "ASSISTANT_PREVIEW_INVALID", "message": "预览已失效，请重新预览"}
    if datetime.now().timestamp() - float(preview.get("created_at", 0)) > 10 * 60:
        return {"success": False, "error_code": "ASSISTANT_PREVIEW_EXPIRED", "message": "预览已过期，请重新预览"}
    if payload is not None and not isinstance(payload, dict):
        return {"success": False, "error_code": "ASSISTANT_CONFIRMATION_INVALID", "message": "动作数据格式无效"}
    action = {
        "type": action_type,
        "plan_version": int(plan_version),
        "preview_token": str(preview_token),
        "idempotency_key": str(idempotency_key),
        "plan": copy.deepcopy(preview.get("plan") or plan),
        "payload": copy.deepcopy(payload if payload is not None else (preview.get("payload") or {})),
    }
    consumed[str(idempotency_key)] = action
    state["consumed_actions"] = dict(list(consumed.items())[-20:])
    SESSION_STORE.update_state(session_id, user_scope, state)
    return {"success": True, "already_confirmed": False, "action": action}


def action_catalog() -> Dict[str, Any]:
    return {
        "version": ASSISTANT_VERSION,
        "actions": [
            "CREATE_CALENDAR", "UPDATE_CALENDAR", "DELETE_CALENDAR",
            "ADD_SHOPPING_LIST", "UPDATE_SHOPPING_LIST", "DELETE_SHOPPING_LIST",
            # Compatibility aliases used by the current mini-program UI.
            "SAVE_CALENDAR",
        ],
        "read_only": False,
        **skill_catalog(),
    }
