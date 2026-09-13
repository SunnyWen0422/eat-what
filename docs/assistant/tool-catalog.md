# Agent 工具目录

版本：2.0.0。所有工具均由服务端白名单执行，参数使用 JSON Schema。

## 查询工具

`search_dishes`、`search_by_ingredients`、`get_dish_details`、`get_dish_methods`、`get_user_context`、`get_calendar_context`、`get_shopping_list`、`check_plan_constraints`。

## 当前任务转换工具

`scale_recipe_ingredients`、`compose_meal_plan`、`replace_plan_dish`、`compare_dishes`、`build_shopping_preview`、`build_calendar_preview`。

转换工具可以修改当前任务副本，不修改 MySQL 基础菜库。`scale_recipe_ingredients` 使用服务端 Decimal 计算，数量无法解析时返回 `needs_adjustment`。

## 用户数据写入工具

`create_calendar_records`、`update_calendar_records`、`delete_calendar_records`、`add_shopping_items`、`update_shopping_items`、`delete_shopping_items`。

这些工具都标记 `mutates=true`、`requires_confirmation=true`。没有来自确认接口的上下文时，执行器必须拒绝。模型可以提出动作，但不能自行确认。

## 工具返回约束

查询结果只返回完成当前任务需要的字段和有限条数；菜品带真实 ID、名称、类型、原料、步骤、标签、时长和 `source_confidence`。写入工具由 Java 业务服务执行，返回业务结果和版本，不返回数据库凭据。
