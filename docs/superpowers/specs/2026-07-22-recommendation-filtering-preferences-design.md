# 推荐筛选、菜系标签与偏好设置设计

## 背景与现状

当前推荐链路已经具备前端本地降级和 Java 后端推荐，但筛选与偏好没有形成完整闭环：

- 首页“家常菜 / 快手菜 / 减脂餐”只改变 `activeTag`，没有进入推荐请求。
- 设置页偏好只保存在微信本地存储，Java 后端完全不知道用户偏好。
- 本地推荐依靠菜名和中文标签做模糊匹配，后端推荐只按菜品大类随机取候选。
- `tags` 把菜系、口味、场景、人群、饮食属性和设备混在一个逗号字符串中，无法稳定筛选。
- 现有 6,665 条系统菜中，6,265 条没有足够证据映射菜系，保留为空而不猜测。
- 数据源没有热量数据，所有 `kcal` 均为 `0`，当前“低卡优先”开关没有可信依据。
- 设置入口在个人中心仍提示“正在开发”，与已经存在的设置页不一致。

数据中的有效标签仍有使用价值，例如：家常菜 6,035 条、懒人食谱 417 条、川菜 162 条、粤菜 65 条、东北菜 74 条、香辣 126 条、麻辣 81 条、酸辣 88 条、酸甜 133 条、素食 1,386 条。设计需要承认数据覆盖差异，而不是假装所有菜品都有完整菜系和口味。

## 目标

1. 让首页快捷标签和推荐筛选真实影响推荐结果。
2. 将“本次筛选”和“长期偏好”分开，避免用户误解。
3. 建立稳定的菜系与标签代码体系，不再依赖中文字符串猜测。
4. 将用户偏好持久化到 Java 后端，并保留本地缓存用于离线展示。
5. 后端成为个性化推荐的权威实现，前端只在网络失败时降级。
6. 菜品浏览、搜索、自定义菜品和推荐共用同一套菜系/标签元数据。
7. 对数据不足、候选不足和未知菜系给出明确行为，不静默放宽忌口条件。

## 非目标

- 本轮不引入机器学习模型或向量化推荐。
- 本轮不实现营养数据库和热量估算；低卡设置先从界面移除。
- 本轮不建设标签管理后台，标签目录先随版本发布。
- 本轮不直接迁移生产数据库；生产迁移必须另行授权并先备份。
- 本轮只以 `outputs/dish-replacement-20260718/food_import.csv` 的 6,665 条离线数据为准，不读取或修改线上数据。

## 方案比较

### 方案 A：继续使用中文 `tags` 字符串

只在现有 JavaScript 和 SQL 中增加 `LIKE` / `indexOf` 判断。改动最少，但同义词、标签混组和数据缺失会持续制造错误，后端和前端也很难保持一致。

### 方案 B：增加规范化代码字段与偏好表（推荐）

保留现有中文 `tags` 用于展示，新增 `cuisine_code`、`tag_codes`、`cook_minutes` 作为筛选字段；新增用户偏好表；推荐服务使用纯 Java 条件解析和评分器。6,665 条数据规模下，逗号代码字段配合候选上限足够，迁移和维护成本可控。

### 方案 C：完整标签关系表

建立 `tag`、`dish_tag`、`user_preference_tag` 等多张关系表。查询能力最好，但当前标签目录尚未稳定，迁移和后台维护成本过高。等数据量或标签运营需求明显增长后再升级。

本轮采用方案 B，并把接口和服务边界设计成未来可以替换为方案 C，而不改前端协议。

## 核心语义

### 本次筛选

用户从首页或筛选页为当前一次推荐选择的条件，属于硬条件：

- 菜系：多选，任意匹配。
- 想吃标签：多选，任意匹配。
- 不要标签：多选，任意命中即排除。
- 忌口食材：任意命中即排除。
- 最长烹饪时间：超过即排除。

本次筛选不自动写入长期偏好，除非用户明确点击“保存为默认偏好”。

### 长期偏好

设置页保存的长期倾向，属于软加权：

- 偏好菜系。
- 偏好口味/场景标签。
- 永久不要的标签。
- 永久忌口食材。
- 避免近期重复的天数。

偏好菜系和偏好标签只提高分数，不会造成候选为空；永久排除项始终是硬条件。

## 元数据模型

### 菜品字段

在 `food` 表增加：

```sql
cuisine_code   VARCHAR(32)  NULL,
tag_codes      VARCHAR(500) NOT NULL DEFAULT '',
cook_minutes   INT          NULL,
metadata_version INT        NOT NULL DEFAULT 1
```

- `tags`：保留中文展示标签。
- `cuisine_code`：单一规范菜系代码，未知值为 `NULL`，不猜测。
- `tag_codes`：规范标签代码，逗号分隔，代码只来自目录。
- `cook_minutes`：从源数据的预计时间转换为整数。

初始菜系目录：`SICHUAN`、`CANTONESE`、`NORTHEAST`、`HUNAN`、`JIANGNAN`、`SHANDONG`、`FUJIAN`、`NORTHWEST`、`OTHER_REGIONAL`。稀有菜系仍可作为偏好，但筛选页必须展示可匹配数量。

初始标签组：

- `flavor`：`SPICY`、`NUMB_SPICY`、`SOUR_SPICY`、`SWEET_SOUR`、`TOMATO`、`LIGHT`。
- `scene`：`HOME_STYLE`、`QUICK`、`LOW_EFFORT`、`LUNCH`、`DINNER`、`GATHERING`。
- `diet`：`VEGETARIAN`、`HEALTHY`。
- `method`：`STEAM`、`STIR_FRY`、`BRAISE`、`STEW`、`BAKE`、`FRY`、`COLD_MIX`。

`QUICK` 由 `cook_minutes <= 20` 或“懒人食谱”等高置信标签生成；`HEALTHY` 只映射已有健康标签，不等同于低卡。

### 用户偏好表

```sql
CREATE TABLE user_preference (
  user_id BIGINT PRIMARY KEY,
  preferred_cuisines JSON NOT NULL,
  preferred_tags JSON NOT NULL,
  excluded_tags JSON NOT NULL,
  excluded_ingredients JSON NOT NULL,
  avoid_recent_days INT NOT NULL DEFAULT 7,
  version INT NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);
```

JSON 数组只保存规范代码或经过长度限制的食材文本。后端负责去重、代码校验和数量限制。

## API 设计

### 推荐选项

`GET /api/recommend/options`

返回菜系、标签组、每个选项的匹配菜品数和元数据版本。前端不再硬编码菜系列表。

### 用户偏好

- `GET /api/users/preferences`
- `PUT /api/users/preferences`

请求示例：

```json
{
  "preferredCuisineCodes": ["SICHUAN", "CANTONESE"],
  "preferredTagCodes": ["HOME_STYLE", "SPICY"],
  "excludedTagCodes": ["FRY"],
  "excludedIngredients": ["花生", "香菜"],
  "avoidRecentDays": 7,
  "version": 1
}
```

### 推荐请求

保留现有荤、素、汤、主食、甜品数量字段，新增：

```json
{
  "useSavedPreferences": true,
  "criteria": {
    "cuisineCodes": ["SICHUAN"],
    "includeTagCodes": ["QUICK"],
    "excludeTagCodes": ["FRY"],
    "excludedIngredients": ["花生"],
    "maxCookMinutes": 30
  }
}
```

请求中的排除条件与长期排除条件取并集；最长时间取更严格值；本次正向筛选不覆盖长期偏好评分。

响应增加：

```json
{
  "appliedCriteria": {},
  "warnings": [],
  "preferenceVersion": 1
}
```

候选不足时返回实际方案和 `warnings`，不静默取消硬筛选。

## 后端组件

- `RecommendationMetadataService`：加载代码目录、返回选项和数据计数。
- `UserPreferenceService`：偏好读取、校验、保存和默认值。
- `RecommendationCriteriaResolver`：合并本次筛选与长期偏好。
- `DishCandidateQueryService`：按大类和硬条件加载有限候选。
- `RecommendationScorer`：纯 Java 评分，无数据库依赖。
- `RecentDishService`：从近几天食谱记录提取最近菜品 ID。
- `RecommendationService`：编排候选查询、评分、去重和方案生成。

首版权重：偏好菜系 `+30`，每个偏好标签 `+12`（上限 `+24`），收藏 `+10`，餐次/场景匹配 `+8`，近期吃过 `-40`，最后增加 `0..4` 的稳定随机扰动。权重集中在评分器常量中并由测试锁定。

## 前端设计

### 首页

- 首页固定展示“家常菜、川菜、粤菜”三个快捷选择：家常菜映射 `HOME_STYLE` 标签，川菜和粤菜分别映射 `SICHUAN`、`CANTONESE` 菜系代码。
- 三个选项允许再次点击取消，切换和取消都必须有清晰的颜色、勾选图标、轻触震动和结果摘要反馈。
- 增加“筛选”入口，显示当前已选条件数量。
- 当前筛选保存在页面会话，不自动污染长期偏好。

### 推荐筛选页

新增 `pages/recommend-filter/`，按菜系、口味/场景、忌口食材、烹饪时间分组。菜系选项显示数据量；匹配量极低的选项放在“更多菜系”中。

### 偏好设置页

- 从后端读取和保存长期偏好，本地只做缓存。
- 删除没有数据支撑的低卡开关。
- 分为偏好菜系、偏好标签、永久排除、近期重复周期。
- 个人中心“设置偏好”直接跳转该页面，不再显示开发中提示。

### 菜品浏览和自定义菜品

- 菜品列表支持菜系、标签、烹饪方式和时间筛选。
- 搜索接口必须返回真实 `tags`、`cuisineCode` 和 `tagCodes`，不再返回空标签。
- 自定义菜品表单可选菜系和标签；未填写时保持未知，不自动猜测。

## 推荐流程

1. 前端加载元数据和偏好缓存。
2. 用户设置本次筛选并发起推荐。
3. 后端解析有效条件、加载用户偏好、永久排除、收藏和近期记录。
4. 按菜品大类查询候选，先执行硬过滤。
5. 评分器执行软偏好、收藏和近期重复加权。
6. 每类按权重无放回抽取，跨三个方案去重。
7. 返回应用条件、候选不足警告和元数据版本。
8. 网络失败或超时后，前端使用缓存菜品执行简化的同代码筛选，不绕过忌口条件。

推荐流改为后端优先；本地降级只在超时或失败后执行，避免页面先显示一套结果又被后台结果替换。

## 错误与降级

- 未知菜系菜品在无菜系筛选时正常参与；有菜系硬筛选时不参与。
- 永久排除和本次排除永不自动放宽。
- 正向筛选导致数量不足时返回部分方案和明确警告。
- 偏好接口失败时使用本地缓存，并提示“偏好暂未同步”。
- 元数据版本变化时清理无效代码，不丢弃仍有效的偏好。
- 本地降级必须复用规范代码，禁止回退到菜名猜菜系。

## 数据迁移与发布

1. 从现有 6,665 条离线 CSV 生成元数据审计报告和回填 SQL，不连接生产库。
2. 在隔离 MySQL 中验证新增字段、偏好表和回填结果。
3. 生产发布顺序：数据库备份与迁移、Java 后端、最后小程序。
4. 新请求字段均为可选，旧客户端可以继续工作。
5. 通过 `recommendation.preferences.enabled` 配置开关支持快速回退到旧推荐流程。

## 验收标准

- 首页快捷标签真实出现在推荐请求中并影响结果。
- 本次筛选是硬条件，长期偏好是软加权，永久排除永不放宽。
- 设置保存后重新登录或更换设备仍可恢复。
- 后端、菜品浏览和本地降级使用同一组规范代码。
- 低卡设置在没有营养数据前不再展示。
- 数据回填无非法代码，未知菜系保持未知并在审计报告中计数。
- 6,665 条数据规模下，本地 MySQL 推荐请求的 95 分位耗时不超过 800ms。
- 全部 Node、JUnit、Pytest、隔离 MySQL 测试通过。
