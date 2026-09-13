# 菜品推荐助手 Agent 技术与使用手册

> v2 更新：模型负责动态选择工具和规划；本地规则作为显式降级与最终安全校验层。工具契约和全局规则见 `docs/assistant/`。

## 一、先说 API Key

当前仓库没有实际 DeepSeek Key：根目录和 `recommend-service` 下均没有 `.env`，当前环境变量也未发现 `DEEPSEEK_API_KEY`；`.env.example` 只有占位符。

没有 Key 时，模型驱动流程会明确降级，助手仍可使用本地规则解析、菜品索引、硬约束过滤、偏好排序、方案版本、换菜和撤销。配置有效 Key 后，Runtime 才会让 DeepSeek 动态选择工具、读取查询结果并生成结构化方案；模型仍不能越过程序校验和用户确认。Key 缺失不会自动导致页面不可用，但会减少复杂自然语言场景的适应能力。

配置真实 Key 后必须重启实际运行 Python 服务。Key 只放服务器环境变量或密钥管理系统，不能发在聊天、提交到 Git 或写进文档。当前没有核验远程服务器、容器或其他 Windows 用户的环境，因此不能据此断言远程服务没有 Key。

## 二、当前能力与边界

已实现：五栏导航、结构化助手会话、用户隔离、日期/餐次/人数解析、食材别名、菜库检索、忌口过滤、收藏和近期记录排序、换菜、撤销、做法查询、日历冲突保护、购物清单预览、超时重试和旧请求隔离；模型驱动 Runtime、全局规则加载、只读/变换工具白名单、结构化输出校验、任务状态与事件、预览凭证、确认接口、Java 侧日历/清单执行以及模型不可用时的规则降级也已接入。

仍属后续工作：真正的后台异步流式任务（当前请求仍同步等待结果）、跨重启的统一幂等日志、完整七天分段任务、AI 新菜草稿审核保存、模型可观测性和真实生产联调。以上项目不影响当前的单餐模型闭环和既有手动流程。

## 三、架构与数据流

```text
微信小程序 pages/chat + utils/api.js
  -> Java AssistantController（认证身份、限流、代理）
  -> Python main.py /assistant/*
  -> agent_runtime.py（模型工具循环、任务状态、严格校验）
  -> assistant_engine.py（规则降级、组合、版本、预览）
  -> rag.py / db.py（索引、菜库、偏好、收藏）
  -> assistant_store.py（SQLite 会话侧库）
  -> DeepSeek（可选；Key 缺失时自动降级）
用户确认 -> Python 确认凭证 -> Java AssistantActionService 或既有日历/购物流程
```

MySQL 是业务事实来源；推荐服务按设计只读。SQLite 只保存会话、消息和方案草稿，不是业务菜库。辅助索引默认是 `recommend-service/dish_meta.json` 与 `ingredient_map.json`，可用 `DISH_META_PATH`、`INGREDIENT_MAP_PATH` 配置。

## 四、源码职责

| 文件 | 职责 |
|---|---|
| `pages/chat/chat.js` | 会话恢复、输入回显、超时、重试、预览确认、账号切换隔离 |
| `utils/api.js` | 新助手 JSON 接口封装；助手请求不自动重试 |
| `backend/.../AssistantController.java` | 认证用户覆盖客户端 ID、限流、转发和错误映射 |
| `backend/.../AssistantGateway.java` | Java 到 Python 的 HTTP 代理，连接 5 秒、读取 30 秒 |
| `recommend-service/main.py` | FastAPI 路由、参数模型和状态码 |
| `recommend-service/agent_runtime.py` | 模型驱动工具循环、任务状态机、输出校验和规则降级 |
| `recommend-service/agent_tools.py` | 菜库、食材、偏好、日历、清单查询及当前任务变换工具 |
| `recommend-service/agent_policy.py` | 加载开发者发布的全局 JSON/Markdown 规则并生成版本哈希 |
| `recommend-service/model_client.py` | DeepSeek OpenAI 兼容客户端和模型故障分类 |
| `recommend-service/agent_schemas.py` | 工具调用与最终方案的结构校验 |
| `recommend-service/assistant_engine.py` | 规则降级、候选、方案、撤销、预览和兼容路径 |
| `recommend-service/assistant_skills.py` | 五类技能目录和守则元数据 |
| `recommend-service/assistant_store.py` | 用户作用域会话与消息、过期清理 |
| `recommend-service/rag.py`、`db.py` | 检索、别名、硬排除和个性化上下文 |

## 五、接口说明

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/assistant/sessions` | 创建会话 |
| GET | `/assistant/sessions/{id}` | 恢复会话和方案 |
| POST | `/assistant/sessions/{id}/messages` | 发送消息、生成方案 |
| POST | `/assistant/sessions/{id}/actions/preview` | 校验方案版本并返回日历/清单快照 |
| POST | `/assistant/sessions/{id}/undo` | 撤销到前一方案 |
| DELETE | `/assistant/sessions/{id}` | 删除会话 |
| GET | `/assistant/tools` | 查看技能和允许动作 |
| GET | `/assistant/tasks/{id}` | 查询任务状态和最终结果 |
| GET | `/assistant/tasks/{id}/events` | 查询阶段事件和进度 |
| POST | `/assistant/tasks/{id}/cancel` | 请求停止任务 |
| POST | `/assistant/sessions/{id}/actions/confirm` | 使用预览凭证确认用户数据写入 |

确认接口只接受服务端生成的 `preview_token`、方案版本和幂等键；模型不能直接确认。Java 侧对已确认动作执行权限校验，日历使用“存在则保留”的安全写入，购物清单复用既有来源菜品复核和请求日志。当前小程序页面仍保留原有的日历逐餐保存和购物预览流程，因此升级不会改变既有用户路径。

成功消息常见字段：`success`、`session_id`、`task`、`reply`、`intent`、`skill`、`plan`、`dishes`、`howto`、`alternatives`、`actions`、`warnings`、`source`、`can_undo`。菜品卡片必须使用结构化真实 `id`，不能从 `reply` 文本猜测。

错误包括：`ASSISTANT_SESSION_NOT_FOUND`（404）、`ASSISTANT_PLAN_VERSION_CONFLICT`（409）、`ASSISTANT_SESSION_ID_INVALID`/`ASSISTANT_MESSAGE_INVALID`（422）、`AI_BODY_TOO_LARGE`（413）、`AI_RATE_LIMITED`（限流）和 `ASSISTANT_SERVICE_UNAVAILABLE`（503）。客户端应兼容读取 `error_code` 与 `errorCode`。

## 六、用户使用方法

从底栏中间“助手”进入。可以点击“今晚吃什么”“看看冰箱”“清淡推荐”“搭配一桌”“查做法”，也可以直接输入：

- “今晚两个人，清淡一点，30 分钟内做好。”
- “家里有鸡蛋和番茄，安排一顿晚饭。”
- “汤保留，肉菜换一道，不要再炒了。”
- “安排下周三个工作日晚饭，尽量不要重复主料。”

看到方案后核对日期、餐次、菜名和警告。可进入菜品详情、换一道、撤销修改。满意后分别点击“保存到日历”或“加入清单”；两者互不自动触发。

局部换菜尽量写明菜名；“这个不要”依赖上下文，复杂指代可能需要再次明确。一次性“不想吃鱼”是当前条件，不会自动成为长期禁忌。番茄/西红柿是别名归一，猪排/排骨不是自动替代品。

## 七、保存和冲突行为

保存日历前会进行方案版本校验并取得服务器快照；已有同日期同餐次记录时提示差异，继续保存也使用 `preserveExisting=true` 保留旧记录。每餐独立写入，可能出现部分成功，失败后应先查看日历再重试。

加入购物清单会把服务器确认的菜品 ID、人数和日期餐次交给购物预览页。购物清单按菜展示食材并保留汇总；同一道菜多餐出现不能简单去重，否则会少算量。

## 八、配置、启动与索引

复制 `recommend-service/.env.example` 为 `.env`，配置 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 以及 MySQL 连接。当前默认模型为 `deepseek-flash`，代码请求 `${BASE_URL}/v1/chat/completions`。不要把 Base URL 填成已经带 `/v1/chat/completions` 的完整路径。

```powershell
Set-Location 'C:\Users\Administrator\Documents\Codex\2026-07-18\d-eatwhat\project\recommend-service'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe ..\scripts\build_assistant_index.py
.\.venv\Scripts\python.exe ..\scripts\audit_assistant_index.py --meta-path .\dish_meta.json --ingredient-path .\ingredient_map.json
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

`--fast` 只适合本地快速验证，最多 8,000 条。审计的 `success=true` 主要表示 ID 和名称完整，不代表菜系、别名、步骤和语义质量都合格。Python 端口应仅供受信任 Java 服务访问；不要直接公网暴露。

## 九、如何确认模型真的接通

1. 配置检查：确认 Key 非空且不是占位符，只输出“已配置/未配置”。
2. 提供方检查：在授权环境发送最小请求，区分认证失败、额度/限流、网络和响应格式错误。
3. 项目检查：助手响应中的 `mode` 为 `model` 时表示通过 Runtime 完成；为 `rule` 时表示已明确降级。对照结构化 `plan` 和 `policy_hash`，确认菜品 ID 来自工具结果。

页面会显示“智能 Agent”或“规则模式”提示；模型失败不会伪装成模型成功。正式上线仍建议增加不含密钥和原文的调用耗时、错误原因与模型版本指标。

## 十、安全边界

Java 会从认证上下文取得 `currentUserId` 并覆盖请求体用户 ID；Python 内部接口本身不独立验证 Java 凭证，必须保持内网访问。会话 ID、游客会话和 SQLite 文件都属于敏感数据。模型不能执行 SQL、脚本或直接写库；所有写操作必须经过程序白名单、版本校验和用户确认。

## 十一、维护与排障

- 推荐为空：检查硬约束是否冲突、索引是否为空/过期、菜品是否发布；不要偷偷放宽忌口。
- 503：依次检查 Java 到 Python 地址、Python 进程、依赖、数据库只读连接和索引文件。
- 填 Key 没变化：确认填入的是实际运行进程、没有占位符、服务已重启，并检查请求失败后是否发生回退。
- 409：方案已更新，重新恢复会话并确认，不要强行复用旧版本。
- 日历部分失败：按日期/餐次核对实际记录，再处理缺失项，避免重复提交。
- 超时或断网：保留输入和已显示内容；恢复会话后再判断是否已经生成，不能直接宣称写入成功。

发布前建议运行 `scripts/verify.ps1`、`mvn -f backend/pom.xml -DskipTests package`，并在微信开发者工具验证 320×568、375×812、390×844、414×896、键盘弹出、长文本和底栏安全区。

## 十二、后续实施顺序

下一步优先补后台异步/流式任务、跨重启幂等日志、多日分段任务、AI 草稿审核、模型可观测性和真实生产灰度。API Key 是模型调用前提，不是上述安全校验和业务规则的替代品。
