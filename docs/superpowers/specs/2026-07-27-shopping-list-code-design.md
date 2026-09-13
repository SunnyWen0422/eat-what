# 购物清单代码设计文档

**版本**：v1.0（可执行设计）
**日期**：2026-07-27
**关联需求**：[2026-07-27-shopping-list-requirements.md](./2026-07-27-shopping-list-requirements.md)
**目标基线**：`origin/main` 提交 `9a52ee3`

## 0. 设计结论

本功能采用“服务端权威计算 + 前端本地即时反馈”的双层架构：

1. 用户从选菜页、推荐结果、菜谱详情或日历餐次发起“加入购物清单”。
2. 前端把菜品 ID、目标人数和本地上下文提交给预览接口。
3. Java 后端读取菜品结构化食材，解析数量、单位和基准人数，生成可审阅的预览。
4. 用户可以在预览中修改数量、单位或移除项目。
5. 确认接口会重新加载菜品数据并校验预览版本，不能直接信任前端传入的最终数量。
6. 确认成功后，前端先更新本地显示，再同步服务端；失败时保留本地操作队列。

这样可以同时满足计算正确性、增删查改准确性、弱网可用和页面即时反馈。

主视图按菜品展示；在此基础上增加可折叠的“采购总量汇总”。汇总只用于采购时快速查看，不参与数据写回，也不能替代菜品明细。

## 1. 不可违反的业务不变量

### 1.1 数量计算

- 当前选菜上下文的 `targetPeople` 是本次换算人数。
- 系统清洗数据的 `fl` 约定为“2 名成年人总量 + 15% 冗余”，源食材数量已经包含这 15%，换算时只按人数比例计算，不再次增加冗余。
- 已确认：`ingredients_amounts` 的数量已包含 15% 冗余，服务端和前端降级计算都不得再次加成。
- 公式：`targetAmount = sourceAmount * targetPeople / basePeople`。
- `basePeople` 的来源优先级：结构化基准人数、用户菜谱人数、当前数据约定的 2 人；不存在可靠值时不得猜测。
- 只有精确数值、数值范围和可解析分数参与自动换算。
- “适量”“少许”“未知单位”等定性项目保留原文并标记 `NEEDS_ADJUSTMENT`。
- 质量、体积和计数是三个不同单位族，禁止跨族自动换算。
- 计数单位计算为小数时，内部保留精确值，采购展示向上取整并显示“约”。
- 用户修改后的值标记为 `userOverride=true`，后续重算不能覆盖。

### 1.2 数据正确性

- 原始菜品字段 `food.ingredients_amounts` 永远保留，不直接覆盖或改写。
- 解析后的 `dish_ingredient` 是可重建的派生数据，必须记录 `sourceHash`。
- 食材必须按菜品分组保存和展示；不同菜品即使规范化名称、单位和形态相同也不得合并。
- 同一道菜内才允许在规范化名称、单位族和形态/处理方式兼容时合并。
- 未知食材不能因为无法归一化而丢失，必须以原文项目展示。
- 每个服务端写请求必须带 `requestId`，同一用户同一请求只生效一次。
- 所有读写都按当前登录用户 ID 隔离，客户端传入的 `listId`、`itemId` 和 `sourceDishId` 都必须在服务端二次授权。

### 1.3 用户体验

- 任何写操作先更新本地状态，再等待网络同步。
- 网络请求期间保留已有清单和预览，不显示空白页或无限 loading。
- 旧请求响应不得覆盖新请求结果；每个页面使用递增的 `requestVersion`。
- 同步失败显示页面内状态和重试入口，不使用阻塞式错误弹窗。
- 清空全部属于破坏性操作，必须二次确认。

## 2. 代码边界与文件清单

### 2.1 后端新增文件

```text
backend/src/main/java/com/eatwhat/controller/ShoppingListController.java
backend/src/main/java/com/eatwhat/service/ShoppingListService.java
backend/src/main/java/com/eatwhat/service/ShoppingPreviewService.java
backend/src/main/java/com/eatwhat/service/IngredientParserService.java
backend/src/main/java/com/eatwhat/service/IngredientNormalizationService.java
backend/src/main/java/com/eatwhat/service/ShoppingListMergeService.java
backend/src/main/java/com/eatwhat/entity/IngredientCatalog.java
backend/src/main/java/com/eatwhat/entity/DishIngredient.java
backend/src/main/java/com/eatwhat/entity/ShoppingList.java
backend/src/main/java/com/eatwhat/entity/ShoppingDish.java
backend/src/main/java/com/eatwhat/entity/ShoppingItem.java
backend/src/main/java/com/eatwhat/entity/ShoppingRequestLog.java
backend/src/main/java/com/eatwhat/dto/ShoppingPreviewRequest.java
backend/src/main/java/com/eatwhat/dto/ShoppingPreviewResponse.java
backend/src/main/java/com/eatwhat/dto/ShoppingPreviewItemDTO.java
backend/src/main/java/com/eatwhat/dto/ShoppingDishDTO.java
backend/src/main/java/com/eatwhat/dto/ShoppingBatchAddRequest.java
backend/src/main/java/com/eatwhat/dto/ShoppingListResponse.java
backend/src/main/java/com/eatwhat/dto/ShoppingItemPatchRequest.java
backend/src/main/java/com/eatwhat/dto/ShoppingClearRequest.java
backend/src/main/java/com/eatwhat/dto/ShoppingSyncResponse.java
backend/src/main/java/com/eatwhat/mapper/IngredientCatalogMapper.java
backend/src/main/java/com/eatwhat/mapper/DishIngredientMapper.java
backend/src/main/java/com/eatwhat/mapper/ShoppingListMapper.java
backend/src/main/java/com/eatwhat/mapper/ShoppingDishMapper.java
backend/src/main/java/com/eatwhat/mapper/ShoppingRequestLogMapper.java
backend/src/main/java/com/eatwhat/util/DecimalQuantity.java
backend/src/main/java/com/eatwhat/util/RequestIdValidator.java
```

### 2.2 后端修改文件

```text
backend/src/main/java/com/eatwhat/entity/Dish.java
backend/src/main/java/com/eatwhat/service/CustomDishService.java
backend/src/main/java/com/eatwhat/service/DishQueryService.java
backend/src/main/java/com/eatwhat/mapper/DishMapper.java
backend/src/main/java/com/eatwhat/config/WebMvcConfig.java
backend/src/test/java/com/eatwhat/controller/ControllerEndpointInventoryTest.java
```

修改原则：不改变已有菜品、推荐、菜谱记录接口的 JSON 结构；只新增购物清单相关能力，并让菜品查询继续返回原始 `ingredientsAmounts`。

### 2.3 前端新增文件

```text
pages/shopping-list/shopping-list.js
pages/shopping-list/shopping-list.wxml
pages/shopping-list/shopping-list.wxss
pages/shopping-list/shopping-list.json
pages/shopping-preview/shopping-preview.js
pages/shopping-preview/shopping-preview.wxml
pages/shopping-preview/shopping-preview.wxss
pages/shopping-preview/shopping-preview.json
utils/shopping-list.js
utils/shopping-ingredients.js
tests/shopping-ingredients.test.js
tests/shopping-list-state.test.js
```

### 2.4 前端修改文件

```text
app.json
utils/api.js
pages/profile/profile.wxml
pages/profile/profile.js
pages/customize/customize.wxml
pages/customize/customize.js
pages/result/result.wxml
pages/result/result.js
pages/dish-detail/dish-detail.wxml
pages/dish-detail/dish-detail.js
pages/calendar-detail/calendar-detail.wxml
pages/calendar-detail/calendar-detail.js
```

新增页面不放入 tabBar，入口从“我的”和菜品操作进入，避免改变现有主导航结构。

### 2.5 数据库和脚本文件

```text
backend/shopping_list_schema.sql
backend/shopping_list_backfill.sql
scripts/backfill_shopping_ingredients.py
scripts/audit_shopping_ingredients.py
tests/test_shopping_ingredient_backfill.py
```

`shopping_list_schema.sql` 只负责结构；`shopping_list_backfill.sql` 只允许在隔离数据库执行。生产迁移不由本任务自动执行。

## 3. 数据库设计

### 3.1 `ingredient_catalog`

用途：保存规范化食材名称、别名和安全单位族。

```sql
CREATE TABLE ingredient_catalog (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  canonical_name VARCHAR(120) NOT NULL,
  aliases JSON NOT NULL,
  unit_family VARCHAR(16) NULL,
  default_unit VARCHAR(32) NULL,
  metadata_version INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ingredient_catalog_name (canonical_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

首版目录由 6,665 条离线菜品数据提取候选名称，再由审计脚本输出别名冲突和待人工确认项。未进入目录的食材仍可作为原文项目使用。

### 3.2 `dish_ingredient`

用途：保存每道菜解析后的食材明细，是菜品原始文本的可重建索引。

```sql
CREATE TABLE dish_ingredient (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dish_id INT NOT NULL,
  sequence_no INT NOT NULL,
  source_text VARCHAR(500) NOT NULL,
  canonical_name VARCHAR(120) NULL,
  quantity_kind VARCHAR(16) NOT NULL,
  quantity_value DECIMAL(12,4) NULL,
  quantity_min DECIMAL(12,4) NULL,
  quantity_max DECIMAL(12,4) NULL,
  unit_code VARCHAR(32) NULL,
  unit_family VARCHAR(16) NULL,
  category VARCHAR(32) NULL,
  preparation VARCHAR(255) NULL,
  base_people DECIMAL(8,2) NULL,
  source_allowance_percent DECIMAL(6,2) NULL,
  parse_status VARCHAR(24) NOT NULL,
  parse_message VARCHAR(255) NULL,
  source_hash CHAR(64) NOT NULL,
  metadata_version INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dish_ingredient_sequence (dish_id, sequence_no),
  KEY idx_dish_ingredient_name (canonical_name),
  KEY idx_dish_ingredient_status (parse_status),
  CONSTRAINT fk_dish_ingredient_dish
    FOREIGN KEY (dish_id) REFERENCES food(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`parse_status` 取值：`PARSED`、`PARTIAL`、`NEEDS_ADJUSTMENT`、`FAILED`。表中任何解析结果都必须可追溯到 `source_text` 和 `source_hash`。

### 3.3 `shopping_list`

每个登录用户一张清单。访客不写此表，只写前端按用户身份隔离的本地缓存。

```sql
CREATE TABLE shopping_list (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_shopping_list_user (user_id),
  KEY idx_shopping_list_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.4 `shopping_dish`

购物清单中的菜品分组。它是来源、人数和展示的隔离边界，同名食材在不同 `shopping_dish_id` 下永远不合并。

```sql
CREATE TABLE shopping_dish (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  list_id BIGINT NOT NULL,
  selection_key VARCHAR(96) NOT NULL,
  source_dish_id INT NOT NULL,
  source_dish_name VARCHAR(255) NOT NULL,
  source_recipe_id BIGINT NULL,
  target_people DECIMAL(8,2) NOT NULL,
  dish_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shopping_dish_list
    FOREIGN KEY (list_id) REFERENCES shopping_list(id),
  UNIQUE KEY uk_shopping_dish_selection (list_id, selection_key),
  KEY idx_shopping_dish_list_order (list_id, dish_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.5 `shopping_item`

```sql
CREATE TABLE shopping_item (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  list_id BIGINT NOT NULL,
  shopping_dish_id BIGINT NOT NULL,
  source_line_no INT NOT NULL,
  normalized_name VARCHAR(120) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  quantity_kind VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
  quantity_value DECIMAL(12,4) NULL,
  quantity_min DECIMAL(12,4) NULL,
  quantity_max DECIMAL(12,4) NULL,
  quantity_text VARCHAR(80) NULL,
  unit_code VARCHAR(32) NULL,
  unit_family VARCHAR(16) NULL,
  checked TINYINT(1) NOT NULL DEFAULT 0,
  user_override TINYINT(1) NOT NULL DEFAULT 0,
  source_recipe_id BIGINT NULL,
  source_dish_id INT NULL,
  source_ingredient_id BIGINT NULL,
  source_quantity_text VARCHAR(80) NULL,
  source_base_people DECIMAL(8,2) NULL,
  target_people DECIMAL(8,2) NULL,
  calculation_status VARCHAR(24) NOT NULL DEFAULT 'CALCULATED',
  source_key VARCHAR(160) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shopping_item_list
    FOREIGN KEY (list_id) REFERENCES shopping_list(id),
  CONSTRAINT fk_shopping_item_dish
    FOREIGN KEY (shopping_dish_id) REFERENCES shopping_dish(id),
  KEY idx_shopping_item_list_checked (list_id, checked),
  KEY idx_shopping_item_dish_checked (shopping_dish_id, checked),
  UNIQUE KEY uk_shopping_item_source (shopping_dish_id, source_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`source_key` 对同一菜品分组内的来源项目使用稳定键；手动项目传 `NULL`，利用 MySQL 对多个 `NULL` 不互斥的行为允许重复手动添加。不同菜品即使 `normalized_name` 相同也必须保留不同的 `shopping_dish_id`。

### 3.6 `shopping_request_log`

用途：实现写请求幂等，防止重复点击、网络重试造成重复项目。

```sql
CREATE TABLE shopping_request_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  operation VARCHAR(32) NOT NULL,
  response_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_shopping_request_user (user_id, request_id),
  KEY idx_shopping_request_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

保留周期由定时清理任务处理；本任务只实现查询和写入，不添加新的调度基础设施。

## 4. 食材解析与换算实现

### 4.1 输入格式

优先解析 `food.ingredients_amounts` 的结构化格式：

```text
食材|数量|单位|类别|处理方式|用量来源###食材|数量|单位|类别|处理方式|用量来源
```

兼容回退格式：

- `cl` 以 `#` 分隔的 `名称:数量单位` 文本。
- 只有名称或自由文本的自定义菜品。

解析器不得修改源文本，所有清洗结果写入 `DishIngredient`。

### 4.2 `IngredientParserService`

接口：

```java
public interface IngredientParserService {
    ParsedDishIngredients parse(Dish dish);
}
```

实现步骤：

1. 读取 `ingredientsAmounts`，按 `###` 切分项目。
2. 对每个项目按 `|` 切分，最多消费前六个字段，后续字段合并到来源说明。
3. 清理首尾空白和全角标点，不删除原始文本。
4. 解析数量类型：精确数值、范围、分数/混合数、定性文本、未知。
5. 解析单位并映射到 `unitCode` 与 `unitFamily`。
6. 从 `fl` 或来源说明提取 `basePeople` 和 `sourceAllowancePercent`。
7. 通过 `IngredientNormalizationService` 解析规范化名称。
8. 产生 `parseStatus` 与可读 `parseMessage`。

### 4.3 数量解析规则

支持：

- `345`、`345.5`、`1/2`、`1又1/2`。
- `2-3`、`2～3`、`2至3`，保存上下限。
- `适量`、`少许`、`适当`，保存原文并标记需要调整。
- 空数量、未知单位或单位与数值粘连异常，标记 `FAILED` 或 `NEEDS_ADJUSTMENT`。

单位标准化：

| 单位族 | `unitCode` 示例 | 可转换范围 |
| --- | --- | --- |
| MASS | `g`, `kg` | 克和千克 |
| VOLUME | `ml`, `l` | 毫升和升 |
| COUNT | `piece`, `egg`, `slice` | 只有同一计数语义 |
| TEXT | `適量`, `少许`, `unknown` | 不参与数值换算 |

不得把“一个鸡蛋”换算成克，也不得把“少许盐”伪造为固定克数。

### 4.4 基准人数解析

`IngredientParserService` 从菜品 `fl` 和结构化来源说明中使用以下正则候选：

```text
(\d+(?:\.\d+)?)\s*(?:名?成年人|人|份)
\+\s*(\d+(?:\.\d+)?)\s*%\s*(?:冗余|余量)
```

当前清洗数据的典型值为 `2名成年人总量+15%冗余`。`sourceAllowancePercent` 只用于解释和审计，不参与二次加成。

### 4.5 换算与显示

```java
ScaledQuantity scale(ParsedQuantity source,
                     BigDecimal basePeople,
                     BigDecimal targetPeople)
```

- `targetPeople <= 0` 直接返回参数错误。
- `source.quantityKind == QUALITATIVE` 时不计算数值。
- 精确数值：按比例计算。
- 数值范围：上下限分别按比例计算。
- `COUNT` 展示值使用向上取整，前缀“约”；数据库保留未取整的 `quantityValue`。
- `MASS`/`VOLUME` 保留最多两位小数，去除尾随零。
- 目标人数变化时只重建未被用户覆盖的项目。

### 4.6 食材分组与同菜合并

第一层键是菜品分组：

```text
shoppingDish.selectionKey
```

不同 `selectionKey` 永远不能合并。第二层才在同一道菜内使用合并键：

```text
shoppingDishId + canonicalName + unitFamily + normalizedVariant
```

其中 `normalizedVariant` 包含切丝、切片、去皮等会影响采购形态的处理信息。只有同一道菜内的合并键完全一致才合并数量；否则保留独立明细。不同菜品的相同食材必须各自显示来源菜名和用量。

## 5. 后端接口契约

所有接口挂在现有 `@RequestMapping` 的 `/shopping-list` 下，沿用 `AuthInterceptor` 注入的 `currentUserId`。未登录用户不调用服务端清单接口。

### 5.1 生成预览

```http
POST /api/shopping-list/preview
Content-Type: application/json
```

请求：

```json
{
  "dishIds": [10170, 10171],
  "recipeId": null,
  "targetPeople": 4,
  "clientRequestId": "preview-uuid"
}
```

响应：

```json
{
  "previewId": "preview-uuid",
  "targetPeople": 4,
  "dishes": [
    {
      "selectionKey": "dish-10170-0",
      "dishId": 10170,
      "dishName": "青椒肉丝",
      "targetPeople": 4,
      "items": [
        {
          "clientKey": "dish-10170-ing-2",
          "canonicalName": "猪里脊",
          "displayName": "猪里脊",
          "quantityKind": "EXACT",
          "quantityValue": 690,
          "quantityText": "690克",
          "unitCode": "g",
          "sourceQuantityText": "345克",
          "sourceDishId": 10170,
          "sourceDishName": "青椒肉丝",
          "sourceBasePeople": 2,
          "calculationStatus": "CALCULATED",
          "warnings": []
        }
      ]
    },
    {
      "selectionKey": "dish-10171-1",
      "dishId": 10171,
      "dishName": "丝瓜炒鸡蛋",
      "targetPeople": 4,
      "items": []
    }
  ],
  "warnings": [],
  "metadataVersion": 1,
  "expiresAt": "2026-07-27T23:45:00+08:00"
}
```

预览不写购物清单；`previewId` 只用于前端关联和日志，不作为信任边界。

### 5.2 确认批量添加

```http
POST /api/shopping-list/items:batch-add
```

请求：

```json
{
  "requestId": "add-uuid",
  "previewId": "preview-uuid",
  "targetPeople": 4,
  "dishes": [
    {
      "selectionKey": "dish-10170-0",
      "items": [
        {
          "clientKey": "dish-10170-ing-2",
          "quantityValue": 680,
          "quantityText": "680克",
          "unitCode": "g",
          "userOverride": true
        }
      ]
    }
  ],
  "expectedListVersion": 12
}
```

服务端事务内执行：

1. 校验 `requestId` 是否已经成功处理，已处理则原样返回历史响应。
2. 校验用户、菜品、预览来源和清单版本。
3. 重新读取 `dish_ingredient`，检查客户端项目是否属于本次预览。
4. 对未覆盖项目重新计算；对覆盖项目校验数值范围和单位族。
5. 按 `selectionKey` 创建或复用 `shopping_dish` 分组。
6. 只在同一个 `shopping_dish_id` 内按合并键更新或插入 `shopping_item`，不同菜品绝不合并。
7. 清单 `version + 1`。
8. 写入 `shopping_request_log` 和响应快照。

### 5.3 查询清单

```http
GET /api/shopping-list?status=all
```

`status` 可取 `all`、`pending`、`checked`。响应包含清单版本、分组项目、数量统计、同步时间和元数据版本。

### 5.4 修改项目

```http
PATCH /api/shopping-list/items/{itemId}
```

请求字段可选：`displayName`、`quantityValue`、`quantityText`、`unitCode`、`checked`、`userOverride`、`expectedListVersion`。所有更新都必须带当前用户过滤。

### 5.5 删除与清空

```http
DELETE /api/shopping-list/items/{itemId}
POST /api/shopping-list:clear
```

清空请求：

```json
{
  "requestId": "clear-uuid",
  "scope": "completed",
  "expectedListVersion": 13
}
```

`scope=all` 只由前端二次确认后发送，服务端仍按同一权限和幂等规则处理。

### 5.6 冲突响应

版本冲突返回 HTTP `409`：

```json
{
  "errorCode": "SHOPPING_LIST_VERSION_CONFLICT",
  "message": "购物清单已在其他设备更新",
  "serverVersion": 14,
  "serverList": {}
}
```

前端保留本地变更，展示“保留本地/使用云端/合并可合并项目”三个动作，不自动覆盖任一侧。

## 6. 后端类职责

### 6.1 `ShoppingListController`

- 只做参数格式校验、登录身份读取和 HTTP 状态映射。
- 不解析食材、不拼 SQL、不直接操作 Mapper。
- 将 `409`、`401`、`404`、`422` 和 `500` 映射为统一错误结构。

### 6.2 `ShoppingPreviewService`

- 批量加载菜品和用户菜谱。
- 获取或重建 `dish_ingredient`。
- 调用解析、规范化、换算和同菜分组服务。
- 生成不可变的预览 DTO 和 warning 列表。

### 6.3 `IngredientParserService`

- 纯函数优先，不依赖 HTTP、用户状态和数据库事务。
- 所有数量解析规则使用 `BigDecimal`，禁止 `double`。
- 输出解析状态和原因，方便单元测试覆盖边界输入。

### 6.4 `IngredientNormalizationService`

- 从 `ingredient_catalog` 加载名称和别名。
- 未知名称返回原文和 `UNKNOWN`，不擅自猜测。
- 目录版本变化时只影响新预览，不修改已保存项目。

### 6.5 `ShoppingListMergeService`

- 负责菜品分组内的合并键、同单位数量相加和非兼容项目拆分。
- 明确拒绝跨 `shoppingDishId` 合并请求。
- 不改变用户覆盖值。
- 对范围和定性数量只做同类合并，不把它们强行转换成精确值。

### 6.6 `ShoppingListService`

- 负责清单 CRUD、版本号、幂等日志和事务边界。
- 所有写操作使用 `@Transactional`。
- 先插入/校验 `shopping_request_log`，再更新清单，避免重复写入。

## 7. 前端实现设计

### 7.1 `utils/shopping-ingredients.js`

负责纯前端降级解析和展示格式化，不作为登录用户的权威计算器。

导出：

```javascript
parseIngredientText(text)
normalizeLocalIngredient(item)
scaleLocalQuantity(item, basePeople, targetPeople)
mergeLocalItems(items)
formatShoppingQuantity(item)
```

本地解析只用于：

- 未登录用户离线操作。
- 后端预览超时后的临时展示。
- 已缓存菜品的首屏预览。

本地降级结果必须标记 `source: 'local-fallback'`，不能伪装成服务端权威结果。

### 7.2 `utils/shopping-list.js`

负责用户隔离缓存、待同步队列和页面状态：

```javascript
const STORAGE_KEYS = {
  list: 'shoppingList',
  pendingOps: 'shoppingListPendingOps',
  syncMeta: 'shoppingListSyncMeta',
  pendingSelection: 'pendingShoppingSelection'
}

loadLocalShoppingList()
saveLocalShoppingList(list)
enqueueShoppingOperation(operation)
flushShoppingOperations()
beginShoppingSelection(selection)
consumeShoppingSelection()
```

缓存 key 必须通过现有 `getUserStorageKey` 生成，访客和登录用户不能共享数据。

### 7.3 预览页面

`pages/shopping-preview/` 通过 `pendingShoppingSelection` 读取：

```javascript
{
  dishIds: [10170, 10171],
  recipeId: null,
  targetPeople: 4,
  source: 'customize'
}
```

页面状态：

```text
idle -> loadingPreview -> previewReady
                         -> previewPartial
                         -> previewFailedWithLocalFallback
previewReady -> confirming -> confirmed
                            -> confirmFailedWithLocalState
```

关键行为：

- `previewRequestVersion` 防止旧预览覆盖新人数。
- 调整人数只重算未被手动覆盖的项目。
- 确认按钮显示待提交项目数，重复点击由 `confirmInFlight` 拦截。
- 预览失败时展示已选菜品和本地解析结果，不让页面空白。
- 确认成功后跳转购物清单页，并显示新增菜品数、食材行数和需调整数量；不显示跨菜品合并数量。

### 7.4 购物清单页面

`pages/shopping-list/` 页面状态：

```javascript
{
  dishes: [],
  statusFilter: 'pending',
  loading: true,
  refreshing: false,
  syncState: 'unknown',
  pendingCount: 0,
  checkedCount: 0,
  requestVersion: 0,
  mutationInFlight: false,
  errorMessage: ''
}
```

展示结构：

1. 顶部同步状态和待购买数量。
2. “全部/待购买/已完成”分段控制。
3. 按菜品显示稳定的菜品卡片/分组，菜品名称和目标人数固定在分组头部。
4. 每个菜品分组内再按食材类别展示明细；每项显示复选框、名称、数量、单位和“需调整/约”提示。
5. 相同食材出现在不同菜品分组时必须保留两行，并显示各自菜品来源。
6. 左滑或更多菜单提供编辑、删除；不使用难以发现的纯文字长按钮。
7. 空状态提供“从菜谱添加”和“手动添加”。
8. 清空已完成可直接操作，清空全部必须确认。
9. 提供可折叠的“采购总量汇总”，只合并安全单位族且保留无法合并项目的独立行。

### 7.5 入口接入

- `pages/customize/customize.js`：复用 `selectedIds` 和 `buildSelectedList`，新增 `onAddSelectedToShoppingList`。
- `pages/result/result.js`：对当前方案新增 `onAddPlanToShoppingList`，使用当前推荐人数。
- `pages/dish-detail/dish-detail.js`：单道菜新增加入入口。
- `pages/calendar-detail/calendar-detail.js`：餐次详情新增批量加入入口。
- `pages/profile/profile.js`：新增导航到购物清单。
- 所有入口通过 `beginShoppingSelection` 写入临时选择，不把大数组塞进 URL。

## 8. 接口客户端设计

在 `utils/api.js` 增加：

```javascript
createShoppingPreview(payload)
getShoppingList(status)
batchAddShoppingItems(payload)
patchShoppingItem(itemId, payload)
deleteShoppingItem(itemId, payload)
clearShoppingList(payload)
```

统一复用现有 `request`：

- 自动带 token。
- 复用重试和请求去重。
- 对 `409` 不自动重试，交给页面冲突处理。
- 对预览请求使用短生命周期缓存，人数或菜品 ID 改变时立即失效。
- 写请求使用客户端 UUID 作为 `requestId`，重试时保持不变。

## 9. 数据迁移与重建流程

### 9.1 离线回填

`scripts/backfill_shopping_ingredients.py`：

1. 读取 `outputs/dish-replacement-20260718/food_import.csv`。
2. 解析 6,665 条 `ingredients_amounts` 和 `fl`。
3. 生成 `ingredient_catalog` 候选、`dish_ingredient` 回填 SQL 和审计 CSV。
4. 输出解析成功率、未知单位、重复名称、疑似别名和失败样本。

### 9.2 审计阈值

脚本失败条件：

- 菜品 ID 重复。
- 结构化食材数量与源文本数量不一致。
- `PARSED` 项目丢失原始文本。
- 质量、体积、计数单位被错误跨族转换。
- 解析成功率低于 98%。

低于完整数值解析但可展示的项目计入 `PARTIAL`，不得静默删除。

### 9.3 线上迁移原则

- 只生成迁移脚本，不连接生产数据库。
- 先备份 `food` 和用户相关表，再创建新表。
- 新列和新表均可回滚，不修改已有 `ingredients_amounts`。
- 后端在 `dish_ingredient` 缺失时允许实时解析并记录待回填状态，保证灰度期间仍可用。

## 10. 测试设计

### 10.1 Java 单元测试

新增：

```text
backend/src/test/java/com/eatwhat/service/IngredientParserServiceTest.java
backend/src/test/java/com/eatwhat/service/IngredientNormalizationServiceTest.java
backend/src/test/java/com/eatwhat/service/ShoppingListMergeServiceTest.java
backend/src/test/java/com/eatwhat/service/ShoppingPreviewServiceTest.java
backend/src/test/java/com/eatwhat/service/ShoppingListServiceTest.java
backend/src/test/java/com/eatwhat/controller/ShoppingListControllerTest.java
```

必须覆盖：

- `345克`、`2-3个`、`1/2个`、`适量`、未知单位。
- 2 人到 4 人、6 人的比例换算。
- 源数据已含 15% 冗余时不重复加成。
- 克/千克、毫升/升的安全换算。
- 计数向上取整但保留精确值。
- 同一道菜内同名同单位合并、不同菜品不合并、不同单位拆分、不同处理方式拆分。
- 用户覆盖值不被重算覆盖。
- 旧 `cl` 回退和解析失败警告。
- 用户越权、版本冲突、重复 `requestId` 和清空确认。

### 10.2 前端测试

新增：

```text
tests/shopping-ingredients.test.js
tests/shopping-list-state.test.js
tests/shopping-preview-experience.test.js
```

覆盖：

- 本地解析和格式化。
- 本地缓存用户隔离。
- 预览人数竞态和旧响应丢弃。
- 重复点击确认、超时、失败后保留列表。
- 离线队列顺序、重试和登录后合并。
- 清空全部二次确认和取消行为。

### 10.3 集成验证

按顺序执行：

```powershell
npm.cmd run test:frontend
mvn -q -f backend\pom.xml test
python -m pytest recommend-service\tests tests -q
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-all.ps1
```

数据库集成测试使用隔离 MySQL，不连接生产库；没有数据库时仍必须通过纯解析器和服务层测试。

## 11. 实施顺序

### 阶段 1：解析器和离线数据

1. 增加纯 Java `IngredientParserService` 和 `BigDecimal` 数量模型。
2. 编写 Python 回填/审计脚本。
3. 生成隔离数据库 SQL 和报告。
4. 先锁定解析规则和测试样例。

完成标准：回填审计通过，解析器测试覆盖所有数量类型。

### 阶段 2：后端预览和清单 CRUD

1. 创建 schema、实体、Mapper 和 DTO。
2. 实现预览接口和服务端重算校验。
3. 实现清单查询、批量添加、编辑、删除、清空。
4. 加入版本控制和幂等日志。
5. 完成权限、冲突和事务测试。

完成标准：Java 测试和隔离 MySQL 测试通过。

### 阶段 3：前端预览和清单页面

1. 增加 API 封装和本地状态模块。
2. 增加预览页和清单页。
3. 接入自定义选菜、推荐结果、菜品详情、日历详情和个人中心。
4. 实现加载、空状态、失败、离线和冲突反馈。

完成标准：前端测试通过，所有入口都能进入预览并返回清单。

### 阶段 4：联调和发布前检查

1. 使用固定菜品样例验证 2/4/6 人用量。
2. 验证重复点击、断网、恢复网络和多设备版本冲突。
3. 执行完整验证脚本。
4. 仅提交代码、迁移脚本和审计报告，不提交生成缓存或本地凭据。

## 12. 完成定义

以下条件全部满足才允许认为功能完成：

- 用户能从自定义选菜中选择多道菜，预览并加入清单。
- 推荐结果、菜品详情和日历餐次至少有一个批量加入入口，其余入口按阶段 3 完成。
- 购物清单按菜品分组展示；炸猪排和葱烧大排都使用猪排时，必须保留两道菜各自的猪排用量。
- 食材名称、数量、单位、来源和计算状态可查询、可编辑、可删除。
- 2/4/6 人换算结果通过固定样例测试，不重复计算源冗余。
- 解析失败不丢数据、不伪造数量，并给用户清晰提示。
- 登录用户跨设备同步，访客离线可用，冲突不静默覆盖。
- 所有 CRUD 都执行用户隔离、版本校验和幂等保护。
- 前端没有空白等待、重复提交或旧响应覆盖新状态的问题。
- 前端、Java、Python、隔离数据库和仓库验证全部通过。

## 13. 暂不执行的事项

- 不直接连接生产 MySQL 或修改线上服务。
- 不把购物清单做成商城、价格或库存系统。
- 不在没有别名证据时自动合并“猪里脊/肉丝”等可能不同的食材。
- 不使用机器学习猜测食材数量或单位。
- 不删除现有 `cl`、`fl`、`ingredients_amounts` 字段。
