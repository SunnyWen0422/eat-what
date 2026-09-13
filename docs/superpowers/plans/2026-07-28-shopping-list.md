# 购物清单功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 为微信小程序增加可靠的购物清单能力：从选菜、推荐结果、菜品详情和日历餐次生成按菜品隔离的食材清单，支持人数换算、预览确认、增删查改、离线反馈和可折叠采购总量汇总。

**Architecture:** Java/Spring Boot 负责登录用户的权威解析、人数换算、按菜品分组、事务写入、版本控制和幂等；小程序负责即时状态、未登录本地清单、预览交互和失败降级。每个来源菜品拥有独立 shopping_dish 分组，shopping_item 只在同一道菜内按安全合并键合并；采购总量汇总是只读派生视图，不写回数据库，也不覆盖菜品明细。

**Tech Stack:** Spring Boot 2.7、MyBatis 注解 Mapper、Java 8 BigDecimal、MySQL 8.0、微信小程序原生页面、Node.js node:test、Python 3 标准库审计脚本。

---

## 1. 文件边界与实施约束

后端新增文件集中在 backend/src/main/java/com/eatwhat/ 的 entity、dto、mapper、service、controller 层；解析器与合并器保持纯函数优先。前端新增两个页面和两个纯工具模块，所有入口继续复用现有 utils/api.js、utils/util.js 和用户隔离 storage key。数据库只新增结构和隔离回填脚本，不连接生产库，不改写 food.ingredients_amounts。

实施时保持以下不可违反规则：

- ingredients_amounts 已包含 15% 冗余，只计算 sourceAmount * targetPeople / basePeople，禁止二次加成。
- 不同菜品即使食材名、单位和处理方式完全相同也绝不合并；同一道菜只合并安全兼容的明细。
- 预览失败、网络超时、重复点击和旧响应都必须有可见反馈，旧的可用内容不得被空白加载态覆盖。
- 所有服务端写请求带 UUID requestId，同一用户同一请求重复提交只产生一次效果。

## 2. Task 1: 建立测试基线和契约样例

**Files:**
- Create: backend/src/test/java/com/eatwhat/service/IngredientParserServiceTest.java
- Create: backend/src/test/java/com/eatwhat/service/ShoppingListMergeServiceTest.java
- Create: tests/frontend/shopping-ingredients.test.js
- Create: tests/frontend/shopping-list-state.test.js
- Modify: backend/src/test/java/com/eatwhat/controller/ControllerEndpointInventoryTest.java

- [ ] **Step 1: 写失败测试，先锁定关键业务不变量**

Java 测试先调用将要公开的纯函数接口：

~~~java
assertEquals(new BigDecimal("690"), parser.scale(new BigDecimal("345"), new BigDecimal("2"), new BigDecimal("4")));
assertEquals("SOURCE_ALLOWANCE_INCLUDED", parser.explainAllowance("2名成年人总量+15%冗余"));
assertEquals(2, mergeService.groupByDish(Arrays.asList(porkA, porkB)).size());
~~~

前端测试先断言本地降级模块导出的函数存在，并验证两道菜使用同名猪排时返回两个菜品组。

- [ ] **Step 2: 运行失败测试并记录失败原因**

运行：

~~~powershell
mvn -q -f backend\pom.xml -Dtest=IngredientParserServiceTest,ShoppingListMergeServiceTest test
npm.cmd run test:frontend -- --test-name-pattern="shopping"
~~~

预期：新增类和模块尚不存在，测试以 ClassNotFoundException 或模块导出缺失失败；已有测试不能因此失败。

- [ ] **Step 3: 补齐控制器端点清单测试用例**

在 ControllerEndpointInventoryTest 中加入以下精确路径断言：

~~~java
assertHasPost("/shopping-list/preview");
assertHasPost("/shopping-list/items:batch-add");
assertHasGet("/shopping-list");
assertHasPatch("/shopping-list/items/{itemId}");
assertHasDelete("/shopping-list/items/{itemId}");
assertHasPost("/shopping-list:clear");
~~~

- [ ] **Step 4: 提交测试基线**

~~~powershell
git add backend/src/test tests/frontend/shopping-ingredients.test.js tests/frontend/shopping-list-state.test.js
git commit -m "test: define shopping list contracts"
~~~

## 3. Task 2: 实现数量解析、人数换算和同菜合并

**Files:**
- Create: backend/src/main/java/com/eatwhat/util/DecimalQuantity.java
- Create: backend/src/main/java/com/eatwhat/service/IngredientParserService.java
- Create: backend/src/main/java/com/eatwhat/service/IngredientNormalizationService.java
- Create: backend/src/main/java/com/eatwhat/service/ShoppingListMergeService.java
- Create: backend/src/main/java/com/eatwhat/dto/IngredientParseResult.java
- Create: backend/src/main/java/com/eatwhat/dto/ShoppingPreviewItemDTO.java
- Modify: backend/src/test/java/com/eatwhat/service/IngredientParserServiceTest.java
- Modify: backend/src/test/java/com/eatwhat/service/ShoppingListMergeServiceTest.java

- [ ] **Step 1: 定义数量值对象和解析结果**

DecimalQuantity 使用 BigDecimal 保存精确值、范围上下界、单位族和展示文本；IngredientParseResult 固定包含 parseStatus、quantityKind、sourceText、message。状态枚举只允许 PARSED、PARTIAL、NEEDS_ADJUSTMENT、FAILED。

~~~java
public final class DecimalQuantity {
    private final BigDecimal value;
    private final BigDecimal min;
    private final BigDecimal max;
    private final String unitCode;
    private final String unitFamily;
    // 构造器、只读 getter、equals/hashCode
}
~~~

- [ ] **Step 2: 用测试驱动实现文本解析**

IngredientParserService.parse(String sourceText, String allowanceText) 必须覆盖 345克、2-3个、1/2个、适量、未知单位、空文本和 ### 分隔的结构化行。数字统一使用 new BigDecimal(String)，禁止 double。

~~~java
public IngredientParseResult parse(String sourceText, String allowanceText) {
    String text = sourceText == null ? "" : sourceText.trim();
    if (text.isEmpty()) return IngredientParseResult.failed(sourceText, "EMPTY_SOURCE");
    if (isQualitative(text)) return IngredientParseResult.needsAdjustment(text, "QUALITATIVE_QUANTITY");
    Matcher matcher = quantityPattern.matcher(text);
    if (!matcher.find()) return IngredientParseResult.needsAdjustment(text, "UNPARSED_QUANTITY");
    return buildResult(text, matcher, allowanceText);
}
~~~

单位归一化只允许质量、体积、计数族内部换算：克/千克、毫升/升可换算；质量与体积、体积与计数不得互换。

- [ ] **Step 3: 实现人数比例换算**

~~~java
public BigDecimal scale(BigDecimal source, BigDecimal basePeople, BigDecimal targetPeople) {
    if (source == null || basePeople == null || targetPeople == null || basePeople.signum() <= 0) {
        throw new IllegalArgumentException("人数或数量无效");
    }
    return source.multiply(targetPeople).divide(basePeople, 4, RoundingMode.HALF_UP).stripTrailingZeros();
}
~~~

当 allowanceText 包含“15%冗余”时只设置解释标记，不修改 source；计数展示在 DTO 层向上取整并保留原始精确值。

- [ ] **Step 4: 实现规范化和同菜合并**

ShoppingListMergeService.mergeWithinDish(Long shoppingDishId, List<ShoppingPreviewItemDTO>) 的合并键固定为：

~~~text
shoppingDishId + canonicalName + unitFamily + normalizedVariant
~~~

合并前校验 shoppingDishId 非空；若两个项目来自不同菜品分组，直接返回两个独立项目。单位族、处理形态或定性状态不兼容时保留独立行。

- [ ] **Step 5: 运行解析和合并测试**

~~~powershell
mvn -q -f backend\pom.xml -Dtest=IngredientParserServiceTest,ShoppingListMergeServiceTest test
~~~

预期：数量样例、15% 不重复加成、同菜合并、跨菜不合并、不同单位拆分全部通过。

- [ ] **Step 6: 提交解析器实现**

~~~powershell
git add backend/src/main/java/com/eatwhat/util/DecimalQuantity.java backend/src/main/java/com/eatwhat/service/IngredientParserService.java backend/src/main/java/com/eatwhat/service/IngredientNormalizationService.java backend/src/main/java/com/eatwhat/service/ShoppingListMergeService.java backend/src/main/java/com/eatwhat/dto/IngredientParseResult.java backend/src/main/java/com/eatwhat/dto/ShoppingPreviewItemDTO.java backend/src/test/java/com/eatwhat/service
git commit -m "feat: add ingredient quantity and dish-scoped merge rules"
~~~

## 4. Task 3: 建立数据库结构和离线回填审计

**Files:**
- Create: backend/shopping_list_schema.sql
- Create: backend/shopping_list_backfill.sql
- Create: scripts/backfill_shopping_ingredients.py
- Create: scripts/audit_shopping_ingredients.py
- Create: tests/test_shopping_ingredient_backfill.py

- [ ] **Step 1: 写隔离 schema**

backend/shopping_list_schema.sql 按顺序创建 ingredient_catalog、dish_ingredient、shopping_list、shopping_dish、shopping_item、shopping_request_log。shopping_item 必须包含：

~~~sql
shopping_dish_id BIGINT NOT NULL,
source_line_no INT NOT NULL,
user_override TINYINT(1) NOT NULL DEFAULT 0,
quantity_value DECIMAL(12,4) NULL,
quantity_text VARCHAR(255) NOT NULL,
UNIQUE KEY uk_item_source (shopping_dish_id, source_line_no),
CONSTRAINT fk_item_dish FOREIGN KEY (shopping_dish_id) REFERENCES shopping_dish(id)
~~~

每张表使用 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4；不修改 food 表原有字段。

- [ ] **Step 2: 实现回填脚本**

backfill_shopping_ingredients.py 读取 outputs/dish-replacement-20260718/food_import.csv，解析 ingredients_amounts 与 fl，输出：

~~~text
outputs/shopping-list-backfill/dish_ingredient.sql
outputs/shopping-list-backfill/ingredient_catalog_candidates.csv
outputs/shopping-list-backfill/audit-report.json
~~~

每条输出明细保留 dish_id、sequence_no、source_text、source_hash、解析状态和基准人数；解析失败只标记状态，不丢弃原文。

- [ ] **Step 3: 实现审计阈值**

audit_shopping_ingredients.py 在以下任一条件成立时返回退出码 1：菜品 ID 重复、源行丢失、source_hash 缺失、跨单位族换算、完整解析率低于 98%。审计报告必须统计 PARSED/PARTIAL/NEEDS_ADJUSTMENT/FAILED 数量、未知单位和疑似别名。

- [ ] **Step 4: 运行 Python 测试和离线审计**

~~~powershell
python -m pytest tests/test_shopping_ingredient_backfill.py -q
python scripts/backfill_shopping_ingredients.py --input outputs/dish-replacement-20260718/food_import.csv --output-dir outputs/shopping-list-backfill
python scripts/audit_shopping_ingredients.py --input-dir outputs/shopping-list-backfill
~~~

预期：测试通过，审计报告生成；不执行任何 MySQL 连接。

- [ ] **Step 5: 提交 schema 和脚本**

~~~powershell
git add backend/shopping_list_schema.sql backend/shopping_list_backfill.sql scripts/backfill_shopping_ingredients.py scripts/audit_shopping_ingredients.py tests/test_shopping_ingredient_backfill.py
git commit -m "feat: add isolated shopping ingredient schema and audit"
~~~

## 5. Task 4: 增加后端实体、DTO 和 Mapper

**Files:**
- Create: backend/src/main/java/com/eatwhat/entity/IngredientCatalog.java
- Create: backend/src/main/java/com/eatwhat/entity/DishIngredient.java
- Create: backend/src/main/java/com/eatwhat/entity/ShoppingList.java
- Create: backend/src/main/java/com/eatwhat/entity/ShoppingDish.java
- Create: backend/src/main/java/com/eatwhat/entity/ShoppingItem.java
- Create: backend/src/main/java/com/eatwhat/entity/ShoppingRequestLog.java
- Create: backend/src/main/java/com/eatwhat/dto/ShoppingDishDTO.java
- Create: backend/src/main/java/com/eatwhat/dto/ShoppingPreviewRequest.java
- Create: backend/src/main/java/com/eatwhat/dto/ShoppingPreviewResponse.java
- Create: backend/src/main/java/com/eatwhat/dto/ShoppingDishRequest.java
- Create: backend/src/main/java/com/eatwhat/dto/ShoppingListResponse.java
- Create: backend/src/main/java/com/eatwhat/dto/PurchaseSummaryDTO.java
- Create: backend/src/main/java/com/eatwhat/dto/PurchaseSummaryItemDTO.java
- Create: backend/src/main/java/com/eatwhat/dto/ShoppingBatchAddRequest.java
- Create: backend/src/main/java/com/eatwhat/dto/ShoppingItemPatchRequest.java
- Create: backend/src/main/java/com/eatwhat/dto/ShoppingClearRequest.java
- Create: backend/src/main/java/com/eatwhat/dto/ShoppingSyncResponse.java
- Create: backend/src/main/java/com/eatwhat/mapper/IngredientCatalogMapper.java
- Create: backend/src/main/java/com/eatwhat/mapper/DishIngredientMapper.java
- Create: backend/src/main/java/com/eatwhat/mapper/ShoppingListMapper.java
- Create: backend/src/main/java/com/eatwhat/mapper/ShoppingDishMapper.java
- Create: backend/src/main/java/com/eatwhat/mapper/ShoppingRequestLogMapper.java
- Modify: backend/src/main/java/com/eatwhat/entity/Dish.java
- Modify: backend/src/main/java/com/eatwhat/service/DishQueryService.java
- Modify: backend/src/test/java/com/eatwhat/controller/ControllerEndpointInventoryTest.java

- [ ] **Step 1: 按现有 Lombok/MyBatis 风格创建实体**

实体使用现有 @Data 风格；ID 使用 Long，菜品外键使用 Long，时间使用 Date。ShoppingDish 必须保存 selectionKey、dishId、dishName、targetPeople；ShoppingItem 必须保存 shoppingDishId、sourceLineNo、canonicalName、displayName、quantityValue、quantityText、unitCode、unitFamily、checked、userOverride、parseStatus。

- [ ] **Step 2: 建立 Mapper 的用户隔离 SQL**

所有查询和更新都把 user_id = #{userId} 放入 SQL 条件；批量查询使用 MyBatis foreach；插入 shopping_request_log 前以 (user_id, request_id) 唯一键检查幂等。ShoppingDishMapper 的更新和删除必须通过父级 shopping_list_id 再过滤一次。

- [ ] **Step 3: 固定列表响应 DTO**

ShoppingListResponse 结构固定为：

~~~java
private Long listId;
private Long version;
private List<ShoppingDishDTO> dishes;
private PurchaseSummaryDTO purchaseSummary;
private int pendingCount;
private int checkedCount;
private int metadataVersion;
~~~

purchaseSummary 只由服务层临时计算，不映射数据库表；它包含 mergeableItems 与 separateItems 两个列表，任何项目都带 sourceDishNames。

- [ ] **Step 4: 运行后端编译和端点清单测试**

~~~powershell
mvn -q -f backend\pom.xml -DskipTests compile
mvn -q -f backend\pom.xml -Dtest=ControllerEndpointInventoryTest test
~~~

- [ ] **Step 5: 提交持久化模型**

~~~powershell
git add backend/src/main/java/com/eatwhat/entity backend/src/main/java/com/eatwhat/dto backend/src/main/java/com/eatwhat/mapper backend/src/main/java/com/eatwhat/entity/Dish.java backend/src/main/java/com/eatwhat/service/DishQueryService.java backend/src/test/java/com/eatwhat/controller/ControllerEndpointInventoryTest.java
git commit -m "feat: add shopping list persistence models"
~~~

## 6. Task 5: 实现服务端预览接口

**Files:**
- Create: backend/src/main/java/com/eatwhat/service/ShoppingPreviewService.java
- Create: backend/src/main/java/com/eatwhat/controller/ShoppingListController.java
- Create: backend/src/main/java/com/eatwhat/util/RequestIdValidator.java
- Create: backend/src/test/java/com/eatwhat/service/ShoppingPreviewServiceTest.java
- Create: backend/src/test/java/com/eatwhat/controller/ShoppingListControllerTest.java
- Modify: backend/src/main/java/com/eatwhat/config/WebMvcConfig.java

- [ ] **Step 1: 写预览服务失败测试**

测试给定两个菜品 ID 和 targetPeople=4 时返回两个 ShoppingDishDTO，即使两道菜都有“猪排”也各自包含独立项目；给定缺少结构化回填时，服务调用 ingredientsAmounts 实时解析并返回 warning。

- [ ] **Step 2: 实现预览服务**

~~~java
public ShoppingPreviewResponse createPreview(Long userId, ShoppingPreviewRequest request) {
    validatePeople(request.getTargetPeople());
    List<Dish> dishes = dishQueryService.getDishesByIdsForUser(request.getDishIds(), userId);
    List<ShoppingDishDTO> groups = dishes.stream()
        .map(dish -> buildDishPreview(dish, request.getTargetPeople()))
        .collect(Collectors.toList());
    return new ShoppingPreviewResponse(request.getClientRequestId(), groups, warnings(groups), metadataVersion(groups));
}
~~~

buildDishPreview 的 selectionKey 使用 dish-{dishId}-{requestIndex}；每个项目保留 sourceDishId、sourceDishName、sourceQuantityText、sourceBasePeople 和 calculationStatus。预览接口不写清单。

- [ ] **Step 3: 实现控制器认证和错误映射**

控制器从 HttpServletRequest 读取 currentUserId；未登录返回 401；参数无效返回 422；菜品不可见返回 404；解析 warning 仍以 200 返回。控制器不直接调用 Mapper。

- [ ] **Step 4: 加入请求去重和旧响应保护测试**

测试同一 clientRequestId 的并发预览不会互相覆盖，人数变更后旧结果不能作为确认依据。RequestIdValidator 拒绝空值、超过 80 字符和非 [A-Za-z0-9_-] 字符。

- [ ] **Step 5: 运行预览测试并提交**

~~~powershell
mvn -q -f backend\pom.xml -Dtest=ShoppingPreviewServiceTest,ShoppingListControllerTest test
git add backend/src/main/java/com/eatwhat/service/ShoppingPreviewService.java backend/src/main/java/com/eatwhat/controller/ShoppingListController.java backend/src/main/java/com/eatwhat/util/RequestIdValidator.java backend/src/main/java/com/eatwhat/config/WebMvcConfig.java backend/src/test/java/com/eatwhat/service/ShoppingPreviewServiceTest.java backend/src/test/java/com/eatwhat/controller/ShoppingListControllerTest.java
git commit -m "feat: add shopping list preview API"
~~~

## 7. Task 6: 实现清单事务、幂等、冲突和采购汇总

**Files:**
- Create: backend/src/main/java/com/eatwhat/service/ShoppingListService.java
- Create: backend/src/test/java/com/eatwhat/service/ShoppingListServiceTest.java
- Modify: backend/src/main/java/com/eatwhat/controller/ShoppingListController.java
- Modify: backend/src/main/java/com/eatwhat/dto/ShoppingListResponse.java
- Modify: backend/src/main/java/com/eatwhat/mapper/ShoppingListMapper.java
- Modify: backend/src/main/java/com/eatwhat/mapper/ShoppingDishMapper.java
- Modify: backend/src/main/java/com/eatwhat/mapper/ShoppingRequestLogMapper.java

- [ ] **Step 1: 写事务服务失败测试**

测试覆盖：第一次 batch-add 创建清单和两个菜品组；重复 requestId 返回历史响应且项目数量不增加；跨用户 listId/itemId 返回 404；expectedListVersion 不匹配返回冲突对象；删除、清空 completed 和清空 all 的版本号单调递增。

- [ ] **Step 2: 实现批量添加事务**

~~~java
@Transactional
public ShoppingSyncResponse batchAdd(Long userId, ShoppingBatchAddRequest request) {
    ShoppingRequestLog existing = requestLogMapper.findSuccess(userId, request.getRequestId());
    if (existing != null) return existing.toResponse();
    ShoppingList list = getOrCreateListForUpdate(userId);
    checkVersion(list, request.getExpectedListVersion());
    for (ShoppingDishRequest dish : request.getDishes()) {
        ShoppingDish group = upsertDishGroup(list, dish);
        mergeWithinDish(group.getId(), dish.getItems());
    }
    list.setVersion(list.getVersion() + 1);
    shoppingListMapper.updateVersion(list);
    ShoppingSyncResponse response = buildResponse(list);
    requestLogMapper.insertSuccess(userId, request.getRequestId(), response);
    return response;
}
~~~

服务端重新读取 dish_ingredient 校验客户端来源；userOverride=true 项目只校验数值范围和单位族，不重新覆盖数量。

- [ ] **Step 3: 实现 CRUD 与清空**

实现 getList(userId, status)、patchItem(userId, itemId, patch)、deleteItem(userId, itemId)、clear(userId, clearRequest)；每个方法都在 Mapper 条件中绑定 userId，写入前锁定清单行并递增 version。scope=all 不在服务端绕过权限，仍按用户过滤。

- [ ] **Step 4: 实现只读采购汇总**

~~~java
private PurchaseSummaryDTO buildPurchaseSummary(List<ShoppingDishDTO> dishes) {
    Map<String, PurchaseSummaryItemDTO> safe = new LinkedHashMap<>();
    List<PurchaseSummaryItemDTO> separate = new ArrayList<>();
    for (ShoppingDishDTO dish : dishes) {
        for (ShoppingPreviewItemDTO item : dish.getItems()) {
            if (!isSafeUnitFamily(item) || item.isUserOverride()) {
                separate.add(summaryItem(item, dish.getDishName()));
                continue;
            }
            String key = item.getCanonicalName() + "|" + item.getUnitFamily() + "|" + item.getUnitCode();
            safe.compute(key, (ignored, current) -> current == null
                ? summaryItem(item, dish.getDishName())
                : current.add(item.getQuantityValue(), dish.getDishName()));
        }
    }
    return new PurchaseSummaryDTO(new ArrayList<>(safe.values()), separate);
}
~~~

汇总只合并同一安全单位族、同一单位代码且没有用户覆盖或处理形态冲突的项目；不能安全合并的项目进入 separateItems。汇总对象不落库，列表刷新时从当前菜品明细重新计算。

- [ ] **Step 5: 运行服务测试并提交**

~~~powershell
mvn -q -f backend\pom.xml -Dtest=ShoppingListServiceTest test
git add backend/src/main/java/com/eatwhat/service/ShoppingListService.java backend/src/main/java/com/eatwhat/controller/ShoppingListController.java backend/src/main/java/com/eatwhat/dto/ShoppingListResponse.java backend/src/main/java/com/eatwhat/mapper/ShoppingListMapper.java backend/src/main/java/com/eatwhat/mapper/ShoppingDishMapper.java backend/src/main/java/com/eatwhat/mapper/ShoppingRequestLogMapper.java backend/src/test/java/com/eatwhat/service/ShoppingListServiceTest.java
git commit -m "feat: add transactional shopping list CRUD and summary"
~~~

## 8. Task 7: 实现前端本地解析、用户隔离缓存和 API 封装

**Files:**
- Create: utils/shopping-ingredients.js
- Create: utils/shopping-list.js
- Modify: utils/api.js
- Modify: tests/frontend/shopping-ingredients.test.js
- Modify: tests/frontend/shopping-list-state.test.js

- [ ] **Step 1: 写本地纯函数测试**

测试 parseIngredientText('猪排|345|克')、scaleLocalQuantity、formatShoppingQuantity；断言 mergeLocalItems 只在同一 selectionKey 内合并。

- [ ] **Step 2: 实现本地解析和数量展示**

~~~javascript
function scaleLocalQuantity(item, basePeople, targetPeople) {
  if (!Number.isFinite(item.quantityValue) || !Number.isFinite(basePeople) || basePeople <= 0) {
    return { ...item, calculationStatus: 'NEEDS_ADJUSTMENT', source: 'local-fallback' }
  }
  return {
    ...item,
    quantityValue: item.quantityValue * targetPeople / basePeople,
    source: 'local-fallback',
    calculationStatus: 'CALCULATED'
  }
}
~~~

本地模块不得添加 15% 冗余；未知单位、定性数量、跨单位族和用户覆盖值都保留原文。

- [ ] **Step 3: 实现用户隔离缓存和待同步队列**

utils/shopping-list.js 统一通过现有 getUserStorageKey(baseKey) 生成 shoppingList、shoppingListPendingOps、shoppingListSyncMeta、pendingShoppingSelection 的 key；队列项保存 operationId、requestId、createdAt、payload，按创建顺序重试，成功后删除，失败后保留并展示数量。

- [ ] **Step 4: 在 utils/api.js 增加接口函数**

~~~javascript
function createShoppingPreview(payload) { return request('/shopping-list/preview', 'POST', payload) }
function getShoppingList(status = 'all') { return request('/shopping-list?status=' + status, 'GET') }
function batchAddShoppingItems(payload) { return request('/shopping-list/items:batch-add', 'POST', payload) }
function patchShoppingItem(itemId, payload) { return request('/shopping-list/items/' + itemId, 'PATCH', payload) }
function deleteShoppingItem(itemId, payload = {}) { return request('/shopping-list/items/' + itemId, 'DELETE', payload) }
function clearShoppingList(payload) { return request('/shopping-list:clear', 'POST', payload) }
~~~

对 409 不自动重试；写请求沿用已有请求去重，requestId 在重试中保持不变。

- [ ] **Step 5: 运行前端测试并提交**

~~~powershell
npm.cmd run test:frontend -- --test-name-pattern="shopping"
git add utils/shopping-ingredients.js utils/shopping-list.js utils/api.js tests/frontend/shopping-ingredients.test.js tests/frontend/shopping-list-state.test.js
git commit -m "feat: add local shopping state and API client"
~~~

## 9. Task 8: 实现预览页和确认流程

**Files:**
- Create: pages/shopping-preview/shopping-preview.js
- Create: pages/shopping-preview/shopping-preview.wxml
- Create: pages/shopping-preview/shopping-preview.wxss
- Create: pages/shopping-preview/shopping-preview.json
- Create: tests/frontend/shopping-preview-experience.test.js
- Modify: app.json

- [ ] **Step 1: 注册页面并建立状态模型**

在 app.json 追加 pages/shopping-preview/shopping-preview 和 pages/shopping-list/shopping-list，不加入 tabBar。预览页状态固定包含 previewRequestVersion、previewLoading、confirmInFlight、dishes、warnings、errorMessage。

- [ ] **Step 2: 写竞态和失败体验测试**

测试快速切换人数时旧响应被丢弃；重复点击确认只触发一个 batch-add；8 秒超时后仍显示已选菜品和本地解析结果；确认失败时不清空预览数据。

- [ ] **Step 3: 实现预览加载、编辑和确认**

~~~javascript
async loadPreview() {
  const version = ++this.previewRequestVersion
  this.setData({ previewLoading: true, errorMessage: '' })
  try {
    const result = await api.createShoppingPreview(this.selection)
    if (version !== this.previewRequestVersion) return
    this.setData({ dishes: result.dishes || [], warnings: result.warnings || [], previewLoading: false })
  } catch (error) {
    if (version !== this.previewRequestVersion) return
    this.setData({ dishes: buildLocalFallback(this.selection), previewLoading: false, errorMessage: '网络较慢，已显示本地预览' })
  }
}
~~~

数量编辑只修改当前 selectionKey 的项目并设置 userOverride=true；确认时显示项目数和需调整数，confirmInFlight 为真时禁用重复提交。成功后先写本地状态，再跳转清单页。

- [ ] **Step 4: 实现 WXML/WXSS 反馈**

页面必须始终有加载阶段文本、局部 skeleton 或已有内容；不得使用全屏空白 loading 覆盖旧预览。每个菜品使用独立分组，项目显示名称、数量、单位、来源行和警告标签。

- [ ] **Step 5: 运行体验测试并提交**

~~~powershell
npm.cmd run test:frontend -- --test-name-pattern="shopping-preview"
git add pages/shopping-preview app.json tests/frontend/shopping-preview-experience.test.js
git commit -m "feat: add shopping preview and confirm flow"
~~~

## 10. Task 9: 实现按菜品清单页和可折叠采购汇总

**Files:**
- Create: pages/shopping-list/shopping-list.js
- Create: pages/shopping-list/shopping-list.wxml
- Create: pages/shopping-list/shopping-list.wxss
- Create: pages/shopping-list/shopping-list.json
- Modify: tests/frontend/shopping-list-state.test.js

- [ ] **Step 1: 写清单状态测试**

测试 dishes 的数据结构始终按菜品渲染；两个菜品含同名猪排时 DOM 模型包含两行来源；切换 all/pending/checked 不改变分组归属；编辑数量后采购汇总即时重算。

- [ ] **Step 2: 实现加载和本地优先显示**

页面 onShow 先读取本地清单并渲染，再静默请求服务端；服务端响应较慢时保留本地内容和同步状态。失败时显示“已保留本地清单，待联网同步”及待同步数量，不把 dishes 清空。

- [ ] **Step 3: 实现菜品分组 CRUD**

~~~javascript
onToggleItem(e) { return this.mutateItem(e, { checked: !e.currentTarget.dataset.checked }) }
onEditItem(e) { return this.mutateItem(e, collectPatch(e)) }
onDeleteItem(e) { return this.deleteItem(e.currentTarget.dataset.itemId) }
onClearCompleted() { return this.clearItems('completed') }
~~~

所有局部更新使用 setData 修改对应 dishes[index].items[index]；请求失败时写入待同步队列并回滚或保留明确的本地 pending 状态。

- [ ] **Step 4: 实现折叠采购总量汇总**

页面增加 summaryExpanded 状态和 purchaseSummary 派生数据。汇总只接收服务端 purchaseSummary 或本地 buildPurchaseSummary(dishes) 的只读结果：安全单位族同名同单位合并，无法合并的项目保留独立行并列出 sourceDishNames。汇总没有编辑入口，编辑必须回到菜品明细。

- [ ] **Step 5: 实现空状态、确认和冲突反馈**

空状态提供“从菜谱添加”和“手动添加”；清空全部弹窗二次确认；409 显示“保留本地/使用云端/合并可合并项目”，不自动覆盖任一侧。删除、清空和冲突处理期间按钮显示进行中状态，避免重复请求。

- [ ] **Step 6: 运行前端测试并提交**

~~~powershell
npm.cmd run test:frontend -- --test-name-pattern="shopping-list"
git add pages/shopping-list tests/frontend/shopping-list-state.test.js
git commit -m "feat: add dish-grouped shopping list and purchase summary"
~~~

## 11. Task 10: 接入所有入口并保持导航稳定

**Files:**
- Modify: pages/customize/customize.js
- Modify: pages/customize/customize.wxml
- Modify: pages/result/result.js
- Modify: pages/result/result.wxml
- Modify: pages/dish-detail/dish-detail.js
- Modify: pages/dish-detail/dish-detail.wxml
- Modify: pages/calendar-detail/calendar-detail.js
- Modify: pages/calendar-detail/calendar-detail.wxml
- Modify: pages/profile/profile.js
- Modify: pages/profile/profile.wxml
- Modify: utils/shopping-list.js
- Modify: tests/frontend/page-contracts.test.js

- [ ] **Step 1: 写入口契约测试**

断言自定义选菜页存在 onAddSelectedToShoppingList，结果页存在 onAddPlanToShoppingList，菜品详情和日历详情存在加入入口，个人中心存在购物清单导航；所有入口调用 beginShoppingSelection，不把大数组拼到 URL。

- [ ] **Step 2: 接入自定义选菜**

复用 selectedIds 和 buildSelectedList；无选择时显示提示；有选择时写入 { dishIds, targetPeople, source: 'customize' } 并 wx.navigateTo({ url: '/pages/shopping-preview/shopping-preview' })。

- [ ] **Step 3: 接入推荐结果、菜品详情和日历详情**

结果页使用当前推荐人数；单菜详情使用 targetPeople=2；日历餐次携带该餐次菜品列表和保存的人数。每个入口都先写临时选择，再跳转预览页，返回后保留原页面状态。

- [ ] **Step 4: 接入个人中心**

在个人中心增加“购物清单”菜单项，点击只跳转清单页，不改变 tabBar 顺序和主导航样式。

- [ ] **Step 5: 运行页面契约测试并提交**

~~~powershell
npm.cmd run test:frontend -- --test-name-pattern="page-contracts"
git add pages/customize pages/result pages/dish-detail pages/calendar-detail pages/profile utils/shopping-list.js tests/frontend/page-contracts.test.js
git commit -m "feat: connect shopping list entry points"
~~~

## 12. Task 11: 集成验证、文档检查和交付门槛

**Files:**
- Modify: docs/superpowers/specs/2026-07-27-shopping-list-requirements.md
- Modify: docs/superpowers/specs/2026-07-27-shopping-list-code-design.md
- Modify: docs/testing/full-functional-test-matrix.md
- Create: docs/database/shopping-list-import.md

- [ ] **Step 1: 更新测试矩阵和数据库导入说明**

测试矩阵加入“按菜品不合并猪排”“采购总量汇总可折叠”“编辑后汇总实时重算”“预览超时保留本地内容”“重复 requestId 不重复写入”五个场景。导入说明明确：先在隔离 MySQL 执行 schema，再审计回填 SQL，生产迁移需人工审批。

- [ ] **Step 2: 运行完整本地验证**

~~~powershell
npm.cmd run test:frontend
mvn -q -f backend\pom.xml test
python -m pytest recommend-service\tests tests -q
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-all.ps1
~~~

预期：前端、Java、Python、静态检查和全量脚本全部通过；数据库测试只连接隔离实例或在无数据库时跳过连接测试而保留纯函数测试结果。

- [ ] **Step 3: 做静态差异检查**

~~~powershell
git diff --check
git status --short
~~~

预期：差异无空白错误；outputs/ 等既有未跟踪目录不加入提交。

- [ ] **Step 4: 提交交付文档**

~~~powershell
git add docs/superpowers/specs/2026-07-27-shopping-list-requirements.md docs/superpowers/specs/2026-07-27-shopping-list-code-design.md docs/testing/full-functional-test-matrix.md docs/database/shopping-list-import.md
git commit -m "docs: finalize shopping list implementation guidance"
~~~

## 13. 完成标准

- 预览和清单页面在网络慢、接口失败、重复点击和旧响应到达时始终保留可用内容并给出反馈。
- 任何两道不同菜品的同名食材都能在主视图中看到两条独立明细，并显示各自来源菜名。
- 采购总量汇总可折叠、可重算、只读，不能改变按菜品保存的数据。
- 服务端人数换算不重复增加 15% 冗余；用户覆盖值不会被后续刷新覆盖。
- CRUD、版本冲突、幂等、用户隔离和离线队列均有自动化测试。
- 生产数据库没有被本计划自动连接或迁移；所有 schema/backfill 文件可在隔离环境单独执行。
