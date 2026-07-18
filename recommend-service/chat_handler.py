"""AI 对话处理 — 意图识别 + DeepSeek API + 检索增强"""
import json, re, asyncio, time, logging
import httpx

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
log = logging.getLogger('chat_handler')
from typing import Dict, List, AsyncGenerator

from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL
import rag

SYSTEM_PROMPT = """你是"吃什么"小程序的AI助手。你是一个专业的美食推荐师，熟悉中国各地菜系。

你的能力：
1. 根据用户需求推荐菜谱搭配（荤素汤搭配，考虑人数口味）
2. 根据食材反向推荐能做的菜
3. 回答菜品的做法、热量、难度
4. 根据用户偏好（川菜/粤菜/清淡/低卡）调整推荐
5. 帮用户把喜欢的菜"加入我的菜谱"永久保存

特别注意：
- 当用户说"加入菜谱/收藏/保存/加入我的"且你刚推荐过菜品，你要回复"已帮你把【菜名】加入自定义菜谱！"并用【】标注具体菜名
- 推荐时每道菜格式：**菜名** + 🔥热量 + ⭐难度
- 语气亲切自然，像朋友聊天一样，不要用机器人腔
- 回复控制在200字以内，用表情符号点缀"""

# 会话记忆（内存 + JSON文件持久化，避免重启丢失）
import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MEMORY_FILE = os.getenv("CHAT_MEMORY_FILE", os.path.join(BASE_DIR, "chat_memory.json"))
_conversations: Dict[str, List[Dict]] = {}

def _save_memory():
    try:
        with open(MEMORY_FILE, "w") as f:
            json.dump(_conversations, f, ensure_ascii=False)
    except: pass

def _load_memory():
    global _conversations
    if os.path.exists(MEMORY_FILE):
        try:
            with open(MEMORY_FILE) as f:
                _conversations = json.load(f)
        except: _conversations = {}

_load_memory()

def get_history(user_id: str) -> List[Dict]:
    return _conversations.get(user_id, [])[-10:]  # 保留最近 10 轮

def append_history(user_id: str, role: str, content: str):
    if user_id not in _conversations:
        _conversations[user_id] = []
    _conversations[user_id].append({"role": role, "content": content})
    if len(_conversations[user_id]) > 20:
        _conversations[user_id] = _conversations[user_id][-20:]
    if role == "assistant":
        _save_memory()

def _detect_intent(msg: str) -> str:
    """快速意图识别"""
    msg = msg.strip()
    if any(w in msg for w in ["食材", "有", "冰箱", "家里有"]):
        return "ingredient_match"
    if any(w in msg for w in ["加入", "收藏", "保存", "加入我的", "添加到", "记下来", "收录"]):
        return "add_custom"
    if any(w in msg for w in ["推荐", "吃什么", "来个", "来几", "搭配", "晚饭", "午饭", "早餐", "中午", "晚上", "今天吃"]):
        return "recommend"
    if any(w in msg for w in ["做法", "怎么", "步骤", "怎么做", "怎样"]):
        return "howto"
    if any(w in msg for w in ["换", "替换", "换掉", "不想吃"]):
        return "replace"
    if any(w in msg for w in ["找", "搜", "有没有", "有没有"]):
        return "search"
    if any(w in msg for w in ["川菜", "粤菜", "清淡", "低卡", "辣", "喜欢", "偏好"]):
        return "preference"
    return "chat"

def _extract_ingredients(msg: str) -> List[str]:
    """从消息中提取食材关键词"""
    # 常见食材词表
    common = ["猪肉","牛肉","羊肉","鸡肉","鸭肉","鱼肉","虾","蟹","蛋","鸡蛋","鸭蛋",
              "西红柿","番茄","土豆","白菜","青菜","菠菜","豆腐","萝卜","冬瓜","南瓜",
              "黄瓜","茄子","豆角","西兰花","菜花","辣椒","青椒","洋葱","姜","蒜","葱",
              "排骨","五花肉","里脊","鸡腿","鸡胸","鸡翅","鱼","带鱼","鲫鱼","草鱼",
              "面条","米饭","面粉","玉米","红薯","紫薯","牛奶","酸奶","芝士","奶酪",
              "蘑菇","香菇","木耳","银耳","红枣","枸杞","豆腐皮","千张","粉丝","粉条"]
    found = []
    for ing in common:
        if ing in msg:
            found.append(ing)
    # 也尝试用分词提取
    extracted = re.findall(r'[和、，,](\w+)', msg)
    for w in extracted:
        if len(w) >= 2 and w not in found:
            found.append(w)
    return list(set(found))

def _format_dish(d: Dict) -> str:
    kcal = d.get("kcal", 0) or 0
    diff = d.get("difficulty", "")
    diff_cn = {"简单":"⭐","普通":"⭐⭐","困难":"⭐⭐⭐"}.get(diff, "")
    name = d.get("name","")
    return f"{name} " + (f"🔥{kcal}千卡" if kcal else "") + (f" {diff_cn}" if diff_cn else "")

def _format_dishes(dishes: List[Dict], title: str = "") -> str:
    if not dishes: return ""
    lines = [f"【{title}】" if title else ""]
    for i, d in enumerate(dishes[:8], 1):
        lines.append(f"{i}. {_format_dish(d)}")
    return "\n".join(filter(None, lines))

def _build_context(dishes: List[Dict]) -> str:
    """构建检索上下文注入 prompt"""
    if not dishes: return ""
    lines = ["以下是数据库中匹配的菜品（按相关度排序）："]
    for d in dishes[:15]:
        name = d.get("name","")
        cl = d.get("cl","")[:80]
        step = d.get("step","")[:100]
        kcal = d.get("kcal",0) or 0
        lines.append(f"- {name} | 材料:{cl} | 做法:{step} | 热量:{kcal}千卡")
    return "\n".join(lines)

def _match_dishes(reply: str) -> List[Dict]:
    """从 AI 回复文本中匹配数据库中的菜品"""
    rag.load_index()
    matched = []
    # 遍历所有菜品名，找回复中出现的
    for d in rag._dish_meta[:]:  # 遍历已加载的元数据
        name = d.get("name", "")
        if len(name) >= 3 and name in reply:
            matched.append({"id": d["id"], "name": name, "type": d.get("type",""),
                          "image": d.get("image",""), "kcal": d.get("kcal",0),
                          "difficulty": d.get("difficulty","")})
            if len(matched) >= 8:
                break
    return matched

def _save_custom_if_match(user_id: str) -> str:
    """从最近对话中提取菜品名并保存为用户自定义菜谱"""
    if user_id == "guest" or not user_id:
        return ""
    try:
        uid = int(user_id)
    except:
        return ""
    history = _conversations.get(user_id, [])
    if len(history) < 2:
        return ""
    last_ai = ""
    for h in reversed(history):
        if h["role"] == "assistant":
            last_ai = h["content"]
            break
    if not last_ai:
        return ""
    # 在AI回复中找菜品名
    rag.load_index()
    for d in rag._dish_meta[:]:
        name = d.get("name", "")
        if len(name) >= 3 and name in last_ai:
            # 保存到数据库
            try:
                from db import _get_connection
                conn = _get_connection()
                cur = conn.cursor()
                cur.execute("INSERT INTO food (NAME, TYPE, CL, FL, STEP, user_id) VALUES (%s,%s,%s,%s,%s,%s)",
                           (name, d.get("type","veg"), d.get("cl",""), "", d.get("step","")[:500], uid))
                conn.commit()
                conn.close()
                log.info("Custom dish saved: user=%s dish=%s", uid, name)
                return name
            except Exception as e:
                log.error("Save custom dish failed: %s", e)
                return ""
    return ""

def chat(message: str, user_id: str = "guest") -> dict:
    """非流式对话 — 在已有事件循环上下文中安全调用。
    返回 {"reply": "...", "dishes": [...]}"""
    import httpx
    rag.load_index()
    intent = _detect_intent(message)
    context_dishes = []
    extra_context = ""

    if intent == "ingredient_match":
        ings = _extract_ingredients(message)
        if ings:
            context_dishes = rag.search_by_ingredients(ings, 10)
            extra_context = f"用户食材: {', '.join(ings)}\n" + _build_context(context_dishes)
    elif intent == "add_custom":
        # 从对话历史中找到AI最近推荐的菜品名，保存为用户自定义菜谱
        context_dishes = rag.search_semantic(message, 5)
        extra_context = _build_context(context_dishes)
        # 尝试匹配菜名并保存
        saved = _save_custom_if_match(user_id)
        if saved:
            reply = f"✅ 已把【{saved}】加入你的自定义菜谱！可以在「我的→自定义菜品」中查看。"
            append_history(user_id, "user", message)
            append_history(user_id, "assistant", reply)
            return {"reply": reply, "dishes": context_dishes[:3]}
    else:
        context_dishes = rag.search_semantic(message, 15)
        extra_context = _build_context(context_dishes)

    history = get_history(user_id)
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    msgs.extend(history)
    if extra_context:
        msgs.append({"role": "system", "content": extra_context})
    msgs.append({"role": "user", "content": message})

    reply = ""
    try:
        resp = httpx.post(
            f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
            json={"model":"deepseek-chat","messages":msgs,"stream":False,"temperature":0.7,"max_tokens":800},
            timeout=30
        )
        data = resp.json()
        reply = data["choices"][0]["message"]["content"]
    except Exception as e:
        reply = _generate_fallback(intent, context_dishes, message)

    append_history(user_id, "user", message)
    append_history(user_id, "assistant", reply)
    
    # 优先用检索到的上下文菜谱（更准确），其次尝试从 AI 回复中匹配
    dishes = _match_dishes(reply)
    if (not dishes or len(dishes) < len(context_dishes)) and context_dishes:
        # 合并：检索结果 + 文本匹配结果，去重
        seen_ids = set(d["id"] for d in dishes)
        for d in context_dishes[:10]:
            if d["id"] not in seen_ids:
                dishes.append({"id": d["id"], "name": d.get("name",""), "type": d.get("type",""),
                               "image": d.get("image",""), "kcal": d.get("kcal",0),
                               "difficulty": d.get("difficulty","")})
                seen_ids.add(d["id"])
        dishes = dishes[:10]
    
    return {"reply": reply, "dishes": dishes}

async def stream_chat(message: str, user_id: str = "guest") -> AsyncGenerator[str, None]:
    """流式对话入口 — 适合支持 SSE 的场景"""
    async for chunk in _chat_async(message, user_id):
        yield chunk

async def _chat_inner(message: str, user_id: str) -> str:
    """内部非流式实现"""
    full = ""
    async for chunk in _chat_async(message, user_id):
        full += chunk
    return full

async def _chat_async(message: str, user_id: str = "guest") -> AsyncGenerator[str, None]:
    intent = _detect_intent(message)
    history = get_history(user_id)
    append_history(user_id, "user", message)

    # 根据意图构建上下文
    context_dishes = []
    extra_context = ""

    if intent == "ingredient_match":
        ings = _extract_ingredients(message)
        if ings:
            context_dishes = rag.search_by_ingredients(ings, 10)
            extra_context = f"用户食材: {', '.join(ings)}\n" + _build_context(context_dishes)
    elif intent in ("recommend", "replace", "preference"):
        context_dishes = rag.search_semantic(message, 15)
        extra_context = _build_context(context_dishes)
    elif intent == "howto":
        context_dishes = rag.search_semantic(message, 5)
        extra_context = _build_context(context_dishes)
    elif intent == "search":
        context_dishes = rag.search_semantic(message, 10)
        extra_context = _build_context(context_dishes)

    # 构建消息
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    if extra_context:
        messages.append({"role": "system", "content": extra_context})

    full_reply = ""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream(
                "POST",
                f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
                json={"model": "deepseek-chat", "messages": messages, "stream": True, "temperature": 0.7, "max_tokens": 800}
            ) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]": break
                        try:
                            chunk = json.loads(data)
                            delta = chunk["choices"][0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                full_reply += content
                                yield content
                        except: pass
    except Exception as e:
        # 降级：用检索结果直接回复
        fallback = _generate_fallback(intent, context_dishes, message)
        full_reply = fallback
        yield fallback

    append_history(user_id, "assistant", full_reply)

def _generate_fallback(intent: str, dishes: List[Dict], msg: str) -> str:
    """当 DeepSeek 不可用时的规则降级"""
    if not dishes:
        return "抱歉，没有找到匹配的菜品。请试试换个说法，比如'推荐今天的晚餐'或'家里有鸡蛋和番茄能做什么'。"

    if intent == "ingredient_match":
        ings = _extract_ingredients(msg)
        prefix = f"根据您提到的食材（{', '.join(ings[:5])}），为您找到了以下菜品：\n\n" if ings else "为您找到以下匹配的菜品：\n\n"
        return prefix + "\n".join(f"🍽️ {_format_dish(d)}" for d in dishes[:6])

    if intent in ("recommend", "preference"):
        return "为您推荐以下菜品：\n\n" + "\n".join(f"🍽️ {_format_dish(d)}" for d in dishes[:8])

    if intent == "howto":
        d = dishes[0] if dishes else None
        if d:
            step = d.get("step","").replace("#","\n")
            return f"📖 {d['name']} 的做法：\n\n{step[:400]}"
        return "抱歉，没找到这道菜的详细做法。"

    return "为您找到以下匹配的菜品：\n" + "\n".join(f"• {_format_dish(d)}" for d in dishes[:6])
