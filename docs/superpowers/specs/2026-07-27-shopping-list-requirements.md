# 购物清单功能需求文档

**版本**：v1.1（评审稿）
**日期**：2026-07-27
**适用项目**：EatWhat 微信小程序、Spring Boot 后端、MySQL 数据库

## 1. 背景与问题

当前用户可以保存菜谱和查看日历记录，但从菜谱到实际采购之间仍缺少一个轻量的执行工具。用户需要手动抄录食材，且多道菜使用同名食材时容易丢失菜品来源和各自用量，买完后也没有清晰的完成状态。

购物清单功能用于承接“推荐菜谱/已保存菜谱 -> 采购准备”这条链路。第一版只解决清单整理和同步，不扩展到电商、价格、库存或配送。

## 2. 产品目标

1. 用户可以从一份或多份已保存菜谱快速生成购物清单。
2. 食材必须按菜品分组展示，保留每道菜的独立用量和来源；同一道菜内才允许安全合并重复行。
3. 用户可以在采购过程中快速勾选、取消、删除和清空项目。
4. 登录用户的清单可以跨设备同步；网络异常时仍能查看和操作本地清单。
5. 所有加载、保存、失败和离线状态都有即时反馈，不出现长时间空白或无限加载。

### 2.1 已确认的用量决策

采用“按用餐人数自动换算，支持手动修正”的方案：

- 当前选菜页的用餐人数是本次清单的 `targetPeople`。
- 系统菜品的标准基准来自菜品份量字段。当前清洗数据统一记录为“2 名成年人总量 + 15% 冗余”，该冗余已经包含在源数据数量中，换算时不得再次叠加。
- 已确认：`ingredients_amounts` 中的数量已经包含这 15% 冗余，计算时只执行人数比例换算。
- 可解析的数值按比例换算：`targetAmount = sourceAmount × targetPeople / basePeople`。
- 无法确认标准人数、数量或单位时，不猜测，不静默换算；原样显示并标注“需按实际情况调整”。
- 用户在预览或清单中手动改过的数量视为用户覆盖值，后续同步和刷新不得自动改回计算值。

## 3. 用户范围与入口

### 3.1 普通用户

普通登录用户可以创建、查看、编辑和同步自己的购物清单。未登录用户可以在本地使用清单，但不能获得跨设备同步能力。

### 3.2 入口

- 个人中心新增“购物清单”入口。
- 菜谱结果页提供“加入购物清单”操作。
- 日历详情页对已保存的餐次菜谱提供“加入购物清单”操作。
- 自定义菜谱详情可加入购物清单。

## 4. 第一版范围

### 4.1 包含

- 从一份或多份菜谱提取食材。
- 手动新增食材。
- 编辑食材名称、数量和单位。
- 按菜品分组展示食材和用量；同一道菜内仅安全合并重复行。
- 勾选/取消购买状态。
- 删除单项、清空已完成项、清空全部项。
- 按“待购买/已完成”查看。
- 登录用户服务端保存和同步。
- 未登录用户本地保存。
- 弱网、超时、接口失败和离线降级反馈。

### 4.2 不包含

- 商品价格、比价、库存、商店或配送信息。
- 食材营养换算和精确重量换算。
- 自动识别品牌、规格或包装商品。
- 多人共享清单和协同编辑。
- 多个清单、分类清单或周期性采购计划。
- 自动从未保存的推荐结果永久创建清单。

## 5. 核心用户流程

### 5.1 从菜谱生成清单

1. 用户在结果页、日历详情页或自定义菜谱详情点击“加入购物清单”。
2. 前端提取菜谱食材，展示即将加入的项目预览。
3. 系统为每道菜建立独立清单分组，按该菜的目标人数计算其食材用量。
4. 页面立即更新清单，并显示“已加入 X 道菜、Y 项食材”；不同菜品的同名食材不得合并。
5. 登录状态下后台异步同步；同步失败时保留本地结果并提示“已保存到本机，稍后重试”。

### 5.2 采购勾选

1. 用户打开“购物清单”页面，默认显示待购买项。
2. 点击项目复选框后，项目移动到已完成区域或变为已完成状态。
3. 用户可以切换“全部/待购买/已完成”。
4. 页面保留清单内容，不因刷新或短暂网络失败而清空。

### 5.3 手动维护

1. 用户点击“添加食材”。
2. 输入食材名称，数量和单位可选。
3. 提交后立即显示新项目。
4. 用户可以编辑或删除项目；空名称和超长文本需要在前端拦截。

### 5.4 用量计算与预览

1. 用户点击“加入购物清单”后，先打开预览，不直接静默写入。
2. 预览顶部显示本次用餐人数，可直接调整；调整后重新计算全部可计算项目。
3. 每个项目显示菜品来源、原始用量、换算后的采购用量和计算状态。
4. 用户可以在预览中取消某个食材、修改数量或单位，再确认加入。
5. 预览只读计算结果；只有点击确认后才写入购物清单。
6. 预览计算失败时保留已显示的菜品和可解析项目，并逐项提示缺失原因，不清空页面。

## 6. 功能需求

### FR-01 清单展示

- 展示待购买数量、已完成数量和最近同步状态。
- 项目至少显示：名称、数量、单位、完成状态。
- 空清单显示明确的空状态，并提供“从菜谱添加”和“手动添加”入口。
- 加载期间显示骨架或局部加载状态，保留已有清单内容。

### FR-02 从菜谱添加

- 支持一次添加一份菜谱或一组餐次菜谱。
- 默认使用菜谱中的食材原文；如果存在规范化名称，则使用规范化名称用于同一道菜内的安全匹配，保留原始文本用于展示或审计。
- 每道菜单独计算、单独展示食材；不同菜品即使规范化名称和单位相同也不得合并。
- 同一道菜内只有名称、单位族和形态/处理方式兼容的重复行才允许合并。
- 单位不同或数量无法安全相加时不强行换算，作为两条项目保留。
- 重复点击同一菜谱的添加操作必须幂等，不重复增加相同来源的项目。
- 添加前必须生成可审阅的食材预览，用户确认后才写入清单。
- 预览请求应携带本次目标人数，不能依赖前端临时修改后的显示文本。

### FR-03 手动添加与编辑

- 食材名称必填，长度建议为 1-80 个字符。
- 数量和单位可选，数量允许整数、小数或原始文本（如“适量”）。
- 名称去除首尾空白；空名称、控制字符和超长内容不得提交。
- 编辑后只在当前菜品分组内重新执行合并检查，不得跨菜品合并，也不得覆盖另一条不同单位的项目。
- 用户手动改过的数量、单位或名称必须记录为 `user_override`，不再被菜谱重新计算覆盖。

### FR-04 勾选与删除

- 支持单项勾选和取消勾选。
- 支持删除单项。
- 支持“清空已完成”。
- “清空全部”必须二次确认，并明确不可恢复提示。
- 删除和清空操作完成后立即更新本地视图，再异步同步服务端。

### FR-05 同步与离线

- 登录用户以服务端清单为同步主体，本地缓存用于首屏和离线操作。
- 未登录用户只写入本地隔离存储，登录后提供“合并本地清单”选项。
- 同步采用版本号或更新时间检测冲突，禁止静默覆盖用户刚刚修改的本地内容。
- 服务端失败、超时或网络不可用时，保留本地操作队列并提示同步状态。
- 页面重新进入、网络恢复或用户主动点击重试时触发同步。

### FR-06 来源追踪

- 由菜谱生成的项目记录来源菜谱 ID；手动项目来源为空。
- 用户删除项目后，不得因为旧来源再次同步而自动恢复，除非用户重新点击“加入购物清单”。
- 项目展示不强制显示来源，但详情或操作反馈中可以显示“来自某某菜谱”。

### FR-07 食材解析与换算

- 优先解析清洗数据的结构化格式：`食材|数量|单位|类别|处理方式|用量来源`，多项之间以 `###` 分隔。
- 兼容旧菜品的 `cl` 文本格式，但只能得到名称或原始文本时，项目必须标记为不可自动换算。
- 解析结果必须保留原始文本、规范化名称、数量类型、数值、单位和解析状态，便于审计和回放。
- 数量类型至少包括：精确数值、数值范围、分数/混合数、定性用量（适量/少许）、未知。
- 只允许在明确的同类单位族内换算：质量（克/千克）、体积（毫升/升）、计数（个/只/枚）。质量、体积和计数之间禁止自动互换。
- 同一食材只有在同一菜品分组内，且规范化名称、单位族和形态/处理方式均兼容时才能合并；不同菜品永远不合并。
- 精确数值按人数比例换算；范围按上下限分别换算；定性用量保留原文并提示用户调整；未知数量不得伪造数值。
- 计数单位的计算结果可以是小数，但采购展示默认向上取整并显示“约”，同时保留精确计算值供用户修改。
- 克、毫升等连续单位保留最多两位小数，去除无意义的尾随零；展示层不得改变服务端保存的精确值。
- 菜品基准人数的优先级为：显式结构化基准人数 > 菜谱配置人数 > 当前数据约定的 2 人；不存在可靠基准时进入不可换算状态，不使用猜测值。

### FR-08 计算审计

- 每个由菜谱生成的清单项目记录源菜品 ID、源食材文本、源数量、源单位、基准人数、目标人数、换算结果和解析状态。
- 清单展示可以简化审计字段，但服务端不能只保存最终字符串，否则无法解释或重算。
- 菜品食材数据版本变化时，不自动覆盖已经加入的清单项目；用户重新添加菜品时生成新的计算结果。

## 7. 数据模型建议

为保证“买多少”的正确性，建议将菜品食材解析结果和用户购物清单分开保存，避免把整份清单压缩为不可查询的 JSON。

### 7.1 `ingredient_catalog`

```sql
CREATE TABLE ingredient_catalog (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  canonical_name VARCHAR(120) NOT NULL,
  aliases JSON NOT NULL,
  unit_family VARCHAR(16) NULL,
  default_unit VARCHAR(32) NULL,
  metadata_version INT NOT NULL DEFAULT 1,
  UNIQUE KEY uk_ingredient_catalog_name (canonical_name)
);
```

### 7.2 `dish_ingredient`

```sql
CREATE TABLE dish_ingredient (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dish_id BIGINT NOT NULL,
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
  source_hash CHAR(64) NOT NULL,
  metadata_version INT NOT NULL DEFAULT 1,
  UNIQUE KEY uk_dish_ingredient_sequence (dish_id, sequence_no),
  KEY idx_dish_ingredient_name (canonical_name),
  KEY idx_dish_ingredient_status (parse_status)
);
```

`dish_ingredient` 是可重建的派生数据，必须保留原始菜品字段作为回退来源。解析失败时记录失败原因，不删除原始文本。

### 7.3 `shopping_list`

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
);
```

### 7.4 `shopping_dish`

购物清单中的菜品分组。它是展示和来源隔离的边界，同一道菜的所有食材都挂在该分组下。

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
);
```

### 7.5 `shopping_item`

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
  source_dish_id BIGINT NULL,
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
);
```

说明：`source_key` 用于防止同一菜品分组内重复添加；手动项目可为空。`quantity_text` 保留用户可读文本，数值字段用于准确计算和后续编辑。不同菜品即使 `normalized_name` 相同也必须保留不同的 `shopping_dish_id`。

## 8. API 需求

所有接口沿用现有 `/api` 前缀、鉴权拦截器和统一错误响应格式。接口名称可在实现计划阶段按现有 Controller 命名约定调整。

### 8.1 获取清单

`GET /api/shopping-list`

返回清单版本、项目列表、待购买数量、已完成数量和服务端更新时间。

### 8.2 生成预览

`POST /api/shopping-list/preview`

请求包含菜品 ID、目标人数和可选的用户菜谱 ID。响应返回按菜品分组的食材预览、每项来源、原始/计算用量、解析状态、警告和预览版本。该接口不修改购物清单。

### 8.3 确认批量添加

`POST /api/shopping-list/items:batch-add`

请求包含预览版本、按菜品分组的用户确认项目和幂等请求 ID。服务端负责重新校验来源、幂等校验、同一道菜内的安全合并和清单版本更新，不能直接信任前端传入的最终数量。

### 8.4 修改项目

`PATCH /api/shopping-list/items/{itemId}`

支持修改名称、数量、单位和完成状态。

### 8.5 删除项目

`DELETE /api/shopping-list/items/{itemId}`

### 8.6 批量清理

`POST /api/shopping-list:clear`

请求参数区分 `completed` 和 `all`，`all` 必须由前端二次确认后调用。

### 8.7 版本冲突

- 请求携带客户端已知 `version`。
- 版本落后时返回可识别的冲突错误，不直接覆盖服务端数据。
- 前端重新读取服务端清单，展示本地与服务端差异，再由用户选择合并或以服务端为准。

## 9. 交互与反馈要求

- 首屏优先展示本地缓存；网络同步在后台进行。
- 添加、勾选、编辑和删除操作必须在 200ms 级别内给出本地视觉反馈，不等待接口返回。
- 同步状态至少包括：未同步、同步中、已同步、同步失败、离线。
- 同步失败不使用阻塞式全屏弹窗；使用页面内状态条或轻提示，并提供重试。
- 清空全部属于破坏性操作，必须二次确认。
- 错误信息使用用户可理解的中文，不展示原始堆栈或数据库错误。
- 清单项目较多时使用稳定列表布局，避免勾选后页面跳动导致误触。
- 加入清单预览按“主料/配菜/辅料/调味料/无法确认”分组，支持按来源展开查看。
- 对“适量”“未知单位”“无法识别基准人数”等项目使用明显但不阻塞的警示样式，允许用户继续加入并手动修正。
- 目标人数调整只影响本次预览，不修改用户的长期偏好或菜谱原始数据。

## 10. 权限与数据隔离

- 用户只能读取、修改和删除自己的清单项目。
- 所有服务端查询必须按当前登录用户 ID 过滤，不能仅凭 `listId` 授权。
- 未登录请求只允许使用本地清单，不允许通过接口读写共享清单。
- 管理员接口不复用普通用户清单接口的隐式权限，若未来需要后台查看必须另行设计审计权限。

## 11. 验收标准

### 功能验收

- 从结果页和日历详情添加菜谱后，清单中出现正确食材。
- 同一道菜内同名同单位食材能够安全合并；不同菜品的同名食材始终分开显示；不同单位不被错误换算。
- 重复添加同一菜谱不会重复创建项目。
- 手动添加、编辑、勾选、取消、删除、清空已完成和清空全部均可用。
- 登录用户在重新登录或换设备后可以恢复已同步清单。
- 未登录用户在离线状态下可以继续查看和操作本地清单。
- 选择 2 人、4 人和 6 人时，结构化食材按基准人数正确比例换算，且不会重复叠加源数据中的 15% 冗余。
- 范围数量、适量、未知单位和计数单位均按规则展示，不产生虚假的精确数值。
- 用户在预览中修改数量后，确认加入和后续同步均保留该修改。

### 可靠性验收

- 首屏不会因同步接口慢而空白或无限加载。
- 重复点击、重复请求和旧响应不会覆盖较新的本地操作。
- 接口超时或失败后，用户仍能看到本地清单和明确重试入口。
- 版本冲突不会静默丢失用户修改。
- 服务端可以根据清单项目的审计字段解释“这个数量是如何计算出来的”。

### 测试验收

- 前端覆盖添加、合并、勾选、删除、清空、离线和重复提交。
- Java 后端覆盖权限、幂等、合并规则、版本冲突和清空操作。
- 解析器覆盖结构化食材、旧文本回退、比例换算、范围/定性数量、单位族隔离和计数向上取整。
- 前后端集成测试覆盖预览与确认之间的数量篡改、重复请求和菜品数据版本变化。
- 数据库集成测试覆盖用户隔离、外键和唯一约束。
- 执行 `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1` 通过。

## 12. 分阶段交付建议

### 第一期：本地可用闭环

- 购物清单页面。
- 从菜谱添加、按菜品分组预览、按人数换算、手动添加、同菜内安全合并、勾选和删除。
- 本地缓存与完整反馈状态。

### 第二期：登录同步

- 食材目录、菜品食材解析表、购物清单表和 Java API。
- 登录用户同步、版本控制和离线操作队列。
- 前后端权限与集成测试。

### 第三期：体验增强

- 来源菜谱展示。
- 批量选择和批量删除。
- 更细的食材规范化规则和可配置合并策略。

## 13. 明确的产品决策

- 第一版只有一个购物清单，按用户隔离。
- 第一版不做价格、库存和商城跳转。
- 不强制转换不同单位，避免产生错误采购数量。
- 任何网络失败都不能阻塞本地查看和操作。
- 先完成普通用户闭环，再考虑共享清单和运营能力。
