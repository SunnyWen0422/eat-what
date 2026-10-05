> V4 深绿实施基线（更新 2026-10-05）：下列已批准决策优先于后面的原始参考文本；外部原件未改动。源码/验收口径见 [详细设计](../eat-what-agent-fullstack-detailed-design.md) 与 [开发者说明](../eat-what-developer-change-guide.md)。

## 本版已采纳的基线

- 品牌深绿 `#28634E`，浅底 `#EDF3ED`，页面 `#F8F7F2`，卡片白，正文 `#25332B`，辅助 `#617066`。
- 单一 `design/tokens.json` 生成 WXSS 与原生 JS；字号 24/18/16/14/13/12px，主要按钮 48px，触控至少 44px。36 图标名称、四 Tab 选中变体和五类 SVG/PNG 插画，全部 25 页及内部功能接入。
- 今天/结果/助手使用 Java/MySQL 的同一当前餐工作区；未确认草稿可恢复。聊天用于进一步表达需求，不独立维护菜单。
- “就吃这个”保存明确显示的日期/餐次，空槽直接确认，已有安排展示替换；不自动采购或创建实际。计划、购物、实际和回顾分别驱动。
- 无文本/结构化操作用规则，自由文本用只读 Agent；明确限制和保留项不能因降级放宽。可靠解释过且上下文未变可规则降级，其余澄清。
- 人数 1–50、首次默认两人；午晚餐按批准人数公式，早餐使用独立场景候选；手动菜数不会被人数覆盖。整餐时间是已知用时依次合计，与单菜筛选分开。
- 仅明确修改常用人数/长期偏好；临时要求不反写。首版采集基础曝光/接受/业务反馈，不自动学习、不新增推断记忆。
- 回顾只统计明确实际，不给无依据热量。已有食材用于推荐和采购核对，不扣库存。
- 草稿 30 天、事件 90 天；正式计划/实际/回执保留。版本/归属/幂等及账号回调隔离是跨设备契约。
- 家庭协作、营养核算、库存账本、跨餐复用优化属于后续版本。原文中自动学习、橙色品牌或其他超出范围建议不构成本版要求。
- 字号、间距、圆角与控件尺寸共20维必须实际影响模板产物和原生JS值；相对字号以动态body基准计算。修改模板/Token后重新生成，禁止只改生成WXSS。`body/body=1em`以有效运行基准变化验证。
- 点击节点本身保证44px下限，主要按钮经完整样式级联保持48px；选中、禁用、placeholder、弹层和图片上的文字背景纳入声明对比检查。收藏使用实心选中资产，发送按钮保留可见文字。
- 当前 V4 开关默认关闭；本轮按用户要求只做源码/VM、生成和隔离 MySQL/HTTP 检查，不执行微信开发者工具或原生编译。历史编译证据另行登记，真实原生交互及 iOS/Android 全量验收未完成，不声称已发布。


- 最终代码复核补修：收藏读取不能覆盖当前换菜，提交候选按当前菜单复核 ID/名称排重；购物改名省略未经主动确认的预填数量。相同数量的主动输入允许确认，失败保留意图；旧待重试请求原样保留。

## 原始参考正文（需按上面的本版决策解读）

---
project: 今天我们吃什么 / eat-what
status: Deep Green Implementation Baseline / Native Acceptance Pending
target: V4+
title: Eat What UI Design System
type: Visual Design System & Icon Implementation Specification
updated: 2026-10-03
version: 1.1-green
---

# Eat What UI Design System

> 「今天我们吃什么」微信小程序视觉设计与 Icon 实施规范。\
> 目标读者：产品设计、前端开发 Agent、Codex、人工开发者。\
> 本规范用于统一整个小程序的视觉完成度，不局限于 Agent 页面。

## 1. 文档定位

现有两份 V4 文档负责定义产品方向、Agent
架构和前端交互；本文负责定义这些页面最终应该"长什么样"。

后续开发遵循以下规则：

-   不允许不同页面各自设计按钮、Card、颜色和圆角。
-   不允许混用多套风格明显不同的 Icon。
-   不使用 Emoji 作为正式 UI Icon。
-   新页面优先复用 Design Token、基础组件和已有 Icon。
-   Agent/Codex 不得自行改变品牌色、Icon
    线宽、按钮层级等核心规范；确需调整时先更新本文档。
-   本文是 Visual Baseline，而不是单张效果图。

------------------------------------------------------------------------

# 2. 视觉目标

产品应从"功能已经能用"升级为"视觉上明显属于同一个成熟产品"。

核心关键词：

> **Warm · Rounded · Simple · Smart**

即：

-   **温暖**：家庭、做饭、吃饭的亲和感；
-   **圆润**：柔和曲线，避免冷硬科技感；
-   **简洁**：信息优先，装饰克制；
-   **聪明**：通过层级、状态和 Agent
    品牌符号体现智能，而不是堆"AI"字样。

正式视觉方向：

# Warm Rounded Line / 温暖圆润简笔风

定位介于"纯工具软件"和"强卡通产品"之间：

``` text
冷硬工具 ←──── 温暖圆润简笔风 ────→ 儿童/娱乐卡通
```

它应该具有简笔画的亲和力、几何 UI 的成熟度和少量品牌人格。

禁止方向：

-   Emoji 风；
-   写实食物 Icon；
-   3D 拟物；
-   强玻璃拟态；
-   大面积科技蓝紫渐变；
-   高饱和彩虹配色；
-   所有食物拟人化；
-   机器人头像作为 Agent 核心形象。

------------------------------------------------------------------------

# 3. 双层视觉体系

## 3.1 Functional UI Layer

用于
TabBar、Button、List、Card、搜索、收藏、日历、购物、设置、详情、表单等。

特点：

> 克制、圆润、线性、清晰。

正式小 Icon 必须最终规范化为矢量资产。

## 3.2 Brand Illustration Layer

用于 Logo、Agent、Onboarding、Empty、Loading、Success 和特殊品牌状态。

特点：

> 温暖简笔 + 轻度人格化。

允许餐盘、小碗、菜篮、菜叶、星芒出现轻微手绘感，但避免幼稚。

------------------------------------------------------------------------

# 4. 品牌视觉母题

建立四个可重复组合的母题：

  母题        含义
  ----------- -----------------------------
  餐盘 / 碗   一餐、推荐、家庭吃饭
  星芒 `✦`    Agent、智能、自动完成、推荐
  菜叶        食材、新鲜、清淡、家庭做饭
  菜篮        买菜、购物清单、采购

其中 `✦` 是 Agent 的品牌符号，但不能滥用到普通设置、删除、返回等
Foundation Icon。

------------------------------------------------------------------------

# 5. Color Tokens

V1 建议值：

``` text
Brand Primary        #28634E
Brand Primary Hover  #F55E3D
Brand Soft           #FFF0EB
Brand Soft Strong    #FFE1D8

Page Background      #FFF9F4
Surface Primary      #FFFFFF
Surface Secondary    #FFF5EE

Text Primary         #2B2927
Text Secondary       #6F6A66
Text Tertiary        #9C9691
Text Disabled        #C4BFBB
Text On Brand        #FFFFFF

Border Light         #EEE7E1
Border Default       #E4DCD5
Divider              #F0E9E3

Success              #5EAA72
Success Soft         #EDF7F0
Warning              #D99A35
Warning Soft         #FFF5DF
Danger               #D95858
Danger Soft          #FDEEEE
Info                 #668FC7
Info Soft            #EDF3FA
```

业务辅助色：

``` text
Vegetable            #73B879
Staple / Egg         #E8B84F
Cool Accent          #78A9D1
Dessert Accent       #C98AB5
```

规则：业务色用于轻量识别，不让页面变成彩虹界面。

------------------------------------------------------------------------

# 6. Typography

优先使用微信/系统字体。

  Token             Size Weight    用途
  --------------- ------ --------- ----------------
  Display           28px 600       极少量品牌标题
  Page Title        24px 600       页面标题
  Section Title     18px 600       区块标题
  Card Title        16px 500/600   卡片标题
  Body              14px 400       正文
  Body Strong       14px 500       强调正文
  Secondary         13px 400       辅助信息
  Caption           12px 400       标签、说明

同级页面不得自行创建相近但不同的字号体系。

------------------------------------------------------------------------

# 7. Spacing / Radius / Shadow

统一间距：

``` text
4 / 8 / 12 / 16 / 20 / 24 / 32
```

推荐：

``` text
Page Horizontal Padding  16
Section Gap              24
Card Padding             16
Card Internal Gap        12
Inline Gap                8
Compact Gap               4
```

圆角：

``` text
Radius XS       6
Radius SM      10
Radius MD      14
Radius LG      18
Radius XL      24
Radius Pill   999
```

阴影只分：

``` text
None / Soft / Floating
```

普通 Card 默认使用 Surface + Border 建立层级，不给所有 Card 加重阴影。

------------------------------------------------------------------------

# 8. Icon System

完整 Icon 分四层：

``` text
Foundation
├── 基础 UI 操作

Food & Meal
├── 吃饭业务语义

Agent
├── 产品特色能力

Brand Illustration
└── 品牌与状态插画
```

## 8.1 Foundation Icons

第一批：

``` text
arrow-left
arrow-right
chevron-down
chevron-up
close
more
search
filter
add
minus
edit
delete
share
refresh
check
favorite
favorite-filled
settings
info
warning
history
calendar
statistics
user
users
clock
camera
image
sync
```

这类 Icon 优先追求识别性，不强行加入食物元素。

## 8.2 Food & Meal Icons

``` text
recipe
dish
ingredient
meat
vegetable
soup
staple
dessert
rice-bowl
cooking-pot
shopping-basket
pantry
fridge
spicy
light-taste
low-oil
nutrition
calorie
difficulty
servings
cuisine
cooking-method
meal-breakfast
meal-lunch
meal-dinner
```

使用抽象简笔轮廓，不写实。

## 8.3 Agent Icons

``` text
agent-spark
agent-arrange
agent-recommend
agent-regenerate
agent-replace-dish
agent-adjust
agent-explain
agent-plan
agent-pantry
agent-thinking
```

组合语法：

``` text
餐盘 + ✦   → 帮我安排
单菜 + ↻   → 换一道
餐盘 + ↻   → 换一套
信息 + ✦   → 推荐理由
日历 + ✦   → 智能规划
冰箱 + ✦   → 根据库存推荐
```

不设计"机器人头"。

------------------------------------------------------------------------

# 9. Icon Master 规范

所有正式小 Icon 使用统一 Master：

``` text
Canvas          24 × 24
Safe Area       ≥ 2px
Base Stroke     2px
Stroke Cap      round
Stroke Join     round
Primary Style   outline
```

允许约 `1.8–2.1px` 光学校正，但不同 Icon 不能出现明显线宽差。

必须统一：

-   黑度；
-   视觉面积；
-   重心；
-   留白；
-   曲线圆润程度。

Filled Variant 仅用于：

-   TabBar Selected；
-   Favorite Selected；
-   Checkbox / Selected；
-   少量强状态。

当显示尺寸 ≤20px 时减少内部细节。

------------------------------------------------------------------------

# 10. Icon 使用原则

### 适合 Icon-only

-   返回；
-   关闭；
-   收藏；
-   更多；
-   搜索；
-   编辑；
-   明确的删除入口；
-   高频且用户熟悉的操作。

### 适合 Icon + Text

-   换一道；
-   保存到计划；
-   加入购物；
-   调整；
-   推荐理由；
-   首次出现的重要业务操作。

### 必须保留清晰文字

-   帮我安排；
-   就吃这个；
-   生成购物清单；
-   保存本周计划；
-   重大危险操作；
-   用户难以仅通过图形理解的业务动作。

原则：

> Icon 提高扫描效率，文字保证语义。

不是所有文字按钮都要加 Icon，也不是所有按钮都应该变成 Icon-only。

------------------------------------------------------------------------

# 11. Button Hierarchy

## Primary

页面当前最重要操作：

``` text
帮我安排
就吃这个
确认加入
保存计划
```

建议 48px 高、Brand Primary 实心、白字、Radius MD。

> 一个视口原则上只保留一个主要 Primary Action。

## Secondary

例如：

``` text
调整一下
查看详情
```

Brand Soft / 白底 + 品牌色文字，可带轻边框。

## Tertiary

例如：

``` text
↻ 换一套
稍后再说
```

弱背景或无背景。

## Icon Button

例如：

``` text
♡   ⋯   ×   ↻
```

图形可为 20\~24px，但实际触控区域建议至少约 44×44px。

## Destructive

用于：

``` text
删除记录
清空购物清单
```

使用 Danger 语义，重大不可逆操作需要确认。

------------------------------------------------------------------------

# 12. 基础组件

第一批统一：

``` text
Button
IconButton
Chip
Card
ListItem
Input
SearchBar
BottomSheet
Modal
Toast
EmptyState
LoadingState
SectionHeader
Tag
Avatar
Checkbox
```

## Chip

用于：

``` text
2人
30分钟
清淡
冰箱食材
三菜一汤
```

Selected 使用 Brand Soft + Brand Primary。

## Card

统一：

``` text
Radius     16~18
Padding    16
Gap        12
Surface    White
Border     Light
Shadow     None / Soft
```

Card 类型：

``` text
DishCard
RecipeCard
MealPlanCard
CalendarCard
ShoppingSummaryCard
NutritionCard
AgentResultCard
PreferenceCard
```

连续设置项应使用 List，不要每一行都套 Card。

## List

推荐结构：

``` text
[Icon Container]  Title                 >
                  Secondary Text
```

Icon Container 建议 32\~40px、浅色背景、圆角统一。

## Modal / Bottom Sheet

``` text
轻量设置 / 筛选 → Bottom Sheet
明确确认         → Modal
复杂编辑         → 独立页面
```

------------------------------------------------------------------------

# 13. TabBar

V4 目标：

``` text
今天
菜谱
计划
我的
```

Icon：

``` text
today      = 餐盘 + 轻量星芒
recipes    = 圆角菜谱卡
plan       = 日历 + 用餐语义
profile    = 圆润人物轮廓
```

状态：

``` text
Unselected → Outline + Text Secondary
Selected   → Filled / Duotone + Brand Primary
```

选中状态允许轻微形态变化，不只是换颜色。

------------------------------------------------------------------------

# 14. 典型页面视觉规则

## 14.1 今天

品牌感最强，但保持留白。

未开始：

``` text
晚上好
今天晚饭怎么安排？

今晚 · 2人 >

[ 告诉我你想怎么吃…… ]

[ 帮我安排 ]

30分钟   清淡   冰箱食材
```

已生成：

``` text
今晚建议

[ MealPlan Card ]

约30分钟 · 适合2人

✓ 符合清淡偏好
✓ 最近没有重复

[ 就吃这个 ]

↻ 换一套      调整一下
```

不得重新把大量旧参数堆回第一屏。

## 14.2 菜谱

Card 推荐：

``` text
[图片]

宫保鸡丁                  ♡
30分钟 · 中等 · 420 kcal
```

不要在每张卡片上排列多个文字按钮。

## 14.3 菜品详情

``` text
Hero Image

宫保鸡丁                    ♡
经典川味 · 下饭

◷            ◉            ♨
30分钟        中等          420 kcal
烹饪时间      难度          每份

食材                    2人份 >

鸡胸肉                  300g
花生                     50g

做法

① 处理鸡肉
② 调制料汁
③ 下锅翻炒
```

时间、难度、热量使用统一业务 Icon。

## 14.4 计划 / 日历

日历状态：

``` text
● 已安排
◐ 部分安排
○ 未安排
```

重点操作：

``` text
+ 安排这一餐
让助手安排剩余几天
```

视觉必须体现"饮食计划"，不能像普通 Calendar。

## 14.5 购物清单

使用 Checkbox + 分类 + 数量：

``` text
蔬菜

○ 番茄                    2个
○ 西兰花                  1颗

肉蛋奶

✓ 鸡胸肉                 300g
○ 鸡蛋                    4个
```

编辑 / 删除优先放 Swipe、More 或详情，不给每个 Item 堆三个文字按钮。

## 14.6 我的

避免纯文字设置页：

``` text
[头像]  Sunny
        已记录 36 餐

我的吃饭

♡   我的收藏                       >
    24 道喜欢的菜

▤   我的菜谱                       >
    8 道家庭菜

◔   饮食统计                       >
    最近 30 天

饮食与偏好

≛   饮食偏好                       >
    清淡 · 少辣

⚙   设置                           >
ⓘ   关于                           >
```

------------------------------------------------------------------------

# 15. Empty / Loading / Error / Success

禁止重要空页面只显示"暂无数据"。

### 收藏为空

``` text
[餐盘 + 小爱心简笔插画]

还没有收藏喜欢的菜

遇到想再吃一次的，
就把它留在这里。

[ 去看看菜谱 ]
```

### 购物为空

``` text
[空菜篮简笔插画]

今天还不用买东西

安排好一餐后，
我可以帮你整理需要购买的食材。

[ 安排今天晚餐 ]
```

### 计划为空

``` text
[日历 + 小餐盘]

这周还没有安排

[ 帮我安排 ]
```

普通 Loading 使用轻量 Spinner；Agent Loading 使用 `✦` 品牌动画。

Error：

``` text
连接出了点问题

[ 重新加载 ]
```

不得向用户直接暴露 Stack Trace / Java Exception / Python Exception。

轻量成功操作优先 Toast：

``` text
✓ 已加入购物清单
```

------------------------------------------------------------------------

# 16. Brand Illustration

正式风格：

> 温暖圆润简笔 + 极少量填色。

规则：

-   2\~3 个主要对象；
-   大量留白；
-   Brand Primary + 最多 1\~2 个辅助色；
-   不写实；
-   不做复杂背景；
-   不做大面积渐变；
-   允许轻微手绘感。

角色化程度：

``` text
功能 UI       0%
业务 Icon     5%
品牌 Icon    15%
Empty 插画   30%
Onboarding   40%
```

越接近功能操作越克制，越接近品牌表达越允许人格。

------------------------------------------------------------------------

# 17. 生图与矢量绘制职责

## 生图负责

-   Visual Direction 探索；
-   Moodboard；
-   Empty State 概念；
-   Onboarding；
-   品牌插画；
-   宣传视觉。

## 矢量设计负责正式产品资产

以下不得直接把生成式图片当最终资源：

-   Foundation Icon；
-   TabBar Icon；
-   高频业务 Icon；
-   Button Icon；
-   16\~24px 操作 Icon。

正式流程：

``` text
生图探索
↓
确认视觉语言
↓
矢量重绘
↓
24×24 Master 校正
↓
组件内验证
↓
导出正式资产
```

------------------------------------------------------------------------

# 18. Asset Directory

``` text
assets/
├── icons/
│   ├── foundation/
│   ├── navigation/
│   ├── food/
│   ├── context/
│   ├── agent/
│   └── action/
├── illustrations/
│   ├── empty/
│   ├── onboarding/
│   ├── success/
│   └── agent/
└── brand/
    ├── logo/
    └── marks/
```

命名统一 `kebab-case`：

``` text
favorite.svg
favorite-filled.svg
shopping-basket.svg
meal-dinner.svg
agent-replace-dish.svg
```

禁止：

``` text
icon1.svg
new_icon.svg
heart2-final.svg
```

------------------------------------------------------------------------

# 19. 微信小程序落地原则

1.  Master 永远保留 SVG。
2.  PNG 仅作为平台需要时的导出产物。
3.  不以 PNG 作为唯一源文件。
4.  同一 Icon 不复制多个手工修改版本。
5.  可行时由组件状态控制颜色。
6.  TabBar 等受微信平台资源格式约束的区域按实际要求导出。
7.  Design Token 集中管理，不散落在各页面 WXSS。
8.  页面优先组合公共组件，不复制组件样式。

建议全局维护概念 Token：

``` text
color-brand-primary
color-brand-soft
color-text-primary
color-text-secondary
color-surface-page
color-surface-card
color-border-light
color-danger

space-1 ... space-6

radius-sm
radius-md
radius-lg
radius-pill
```

------------------------------------------------------------------------

# 20. Accessibility

最低要求：

-   重要文字有足够对比度；
-   状态不能只依赖颜色；
-   Icon-only Button 必须有明确语义；
-   点击区域建议至少约 44×44px；
-   Disabled 状态明显；
-   Danger 操作不能只靠红色表达；
-   避免低对比小字号正文。

------------------------------------------------------------------------

# 21. Motion

原则：

> 反馈 \> 装饰。

允许：

-   Tab Selected；
-   Favorite 轻微缩放；
-   Checkbox 完成；
-   Bottom Sheet；
-   Agent 星芒 Loading；
-   Card 内容更新；
-   Success。

避免持续漂浮、频繁弹跳和影响操作速度的动画。

建议：

``` text
Micro Interaction     120~180ms
Component Transition  180~240ms
Page / Sheet          220~320ms
```

------------------------------------------------------------------------

# 22. 第一批正式 Icon

先做约 32 个，不直接一次画 60 个。

### Navigation

``` text
today
recipes
plan
profile
```

### Foundation

``` text
arrow-left
chevron-right
close
more
search
filter
add
edit
delete
share
refresh
check
favorite
favorite-filled
settings
info
history
calendar
statistics
clock
users
```

### Business

``` text
recipe
ingredient
shopping-basket
nutrition
servings
cooking-pot
```

### Agent

``` text
agent-spark
agent-arrange
agent-regenerate
agent-replace-dish
agent-adjust
```

第一批完成后必须先在真实组件和页面中验证视觉重量，再扩展完整库。

------------------------------------------------------------------------

# 23. 第一批品牌插画

先做 5 张：

``` text
empty-favorites
empty-shopping
empty-plan
agent-thinking
meal-success
```

验收要求：

> 去掉文字后，五张插画仍应明显属于同一个品牌。

------------------------------------------------------------------------

# 24. 实施阶段

## Phase 0 --- UI Audit

扫描现有：

-   页面；
-   按钮；
-   Icon；
-   字体；
-   颜色；
-   Card；
-   Modal；
-   Empty；
-   Loading；
-   重复样式。

产出 `UI Inventory`，不要直接全项目替换。

## Phase 1 --- Foundation

建立
Color、Typography、Spacing、Radius、Shadow、Button、Chip、Card、List、Input。

## Phase 2 --- Foundation Icons

完成高频基础 Icon。

## Phase 3 --- Business Icons

完成 Food / Meal / Shopping / Calendar / Nutrition Icon。

## Phase 4 --- Core Page Migration

顺序：

1.  今天；
2.  菜谱；
3.  菜品详情；
4.  计划；
5.  购物清单；
6.  我的。

## Phase 5 --- Secondary Pages

收藏、自定义菜、偏好、统计、设置、关于、管理页面。

## Phase 6 --- Brand Illustration

补充 Empty、Loading、Onboarding、Success、Agent 状态。

------------------------------------------------------------------------

# 25. Agent / Codex 强约束

自动化开发 Agent 修改 UI 时必须：

1.  优先复用 Token；
2.  优先复用公共 Component；
3.  优先复用已有 Icon；
4.  不引入第二套 Icon Library；
5.  不使用 Emoji 作为正式 Icon；
6.  不局部重新定义品牌色；
7.  不随意改变 Radius；
8.  不给所有 Card 加 Shadow；
9.  不把所有操作改成 Icon-only；
10. 不给所有文字按钮机械添加 Icon；
11. 保持 Primary Action 唯一性；
12. 危险操作使用 Destructive 语义；
13. 新 Icon 遵循 24×24 Master；
14. 新视觉先归类 Foundation / Food / Agent / Illustration；
15. 规范无法覆盖需求时，先提出规范扩展。

------------------------------------------------------------------------

# 26. 视觉验收 Checklist

## 一致性

-   [ ] 使用统一颜色 Token
-   [ ] 使用统一 Typography
-   [ ] 使用统一 Spacing
-   [ ] 使用统一 Radius
-   [ ] Icon 来自同一系统

## 层级

用户能否在 1\~2 秒内判断：

-   [ ] 这是什么页面
-   [ ] 当前最重要信息是什么
-   [ ] 最主要操作是什么

## 操作

-   [ ] 没有多个同权重 Primary Button
-   [ ] 没有大量纯文字按钮堆积
-   [ ] 次要操作合理进入 Icon / More / Swipe
-   [ ] Icon-only 操作仍然容易理解

## 状态

关键页面必须覆盖：

``` text
Default
Loading
Empty
Error
Disabled
Selected
Success
```

只设计"有数据状态"不视为完成。

## 品牌

去掉 Logo 后，页面仍应能通过：

``` text
暖色
圆润
简笔 Icon
Card
餐盘
星芒
```

识别为同一个产品。

------------------------------------------------------------------------

# 27. 禁止模式

``` text
❌ Emoji 作为正式 Icon
❌ 多套第三方 Icon 风格混搭
❌ 页面自行定义随机品牌色
❌ 所有按钮都是实心主按钮
❌ 所有功能都是文字按钮
❌ 所有功能都变成 Icon-only
❌ 每张 Card 都有重阴影
❌ 高饱和彩虹配色
❌ 强拟物食物 Icon
❌ AI 机器人作为 Agent 核心形象
❌ 大量科技蓝紫渐变
❌ 空页面只写“暂无数据”
❌ 为“高级感”牺牲可读性
```

------------------------------------------------------------------------

# 28. 最终视觉预期

最终「今天我们吃什么」应该呈现：

> **功能 UI 克制，业务 Icon 有辨识度，品牌插画有温度，Agent
> 视觉有记忆点。**

整体感受：

``` text
基础操作的专业性
+
家庭吃饭的温暖感
+
简笔画的亲和力
+
Agent 的轻智能感
```

用户从首页进入菜谱、详情、收藏、计划、购物、统计和设置时，应始终感觉自己处于同一个完整产品，而不是进入不同开发阶段留下的多个页面。

------------------------------------------------------------------------

# 29. 八条最终原则

1.  **少装饰，多层级。**
2.  **少颜色，多一致性。**
3.  **少文字按钮堆积，多合理组件。**
4.  **Icon 用于提高识别，不用于填满页面。**
5.  **功能区域成熟克制，品牌区域允许轻卡通。**
6.  **正式小 Icon 最终必须规范化为矢量资产。**
7.  **生图负责探索与插画，Design System 负责一致性。**
8.  **任何新页面都应该像"今天我们吃什么"的页面，而不是一个新项目。**

------------------------------------------------------------------------

# 30. 下一阶段交付物

本规范确认后，视觉实施按以下顺序继续：

``` text
01 Visual Direction Board
02 Design Tokens
03 Foundation Components
04 Icon Master Template
05 First 32 Icons
06 First 5 Brand Illustrations
07 Today Page High-Fidelity Mockup
08 Recipe Detail High-Fidelity Mockup
09 Profile Page High-Fidelity Mockup
10 Full UI Migration Plan
```

正式批量开发前设置一个视觉验收节点：

> **Visual Direction Board + 第一批 Icon + 3 个典型页面 Mockup**

该节点确认后，再批量扩展 Icon Library
和页面，避免在错误视觉方向上进行大规模返工。
