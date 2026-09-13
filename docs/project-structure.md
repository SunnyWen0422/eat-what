# 项目结构

本仓库保留可运行的小程序、Java 后端、Python 推荐服务、数据库迁移脚本和功能说明文档。

## 运行代码

- `pages/`、`app.js`、`app.json`、`app.wxss`：微信小程序前端。
- `backend/src/main/`：Spring Boot 后端业务、控制器、数据库映射和权限控制。
- `recommend-service/`：FastAPI 推荐服务、模型驱动 Agent、规则降级和检索适配层。
- `utils/`：前端 API、推荐流程、购物清单和偏好处理。
- `backend/static/`：后台静态页面。

## 配置与部署

- `recommend-service/.env`：本地私密配置，不提交 Git。
- `recommend-service/.env.example`：配置模板。
- `backend/src/main/resources/application.yml.example`：Java 服务配置模板。
- `backend/*.sql`、根目录 `*.sql`：数据库结构和迁移脚本。
- `backend/deploy.sh`、`backend/server-setup.sh`、`backend/nginx-chishenme.conf`：服务器部署文件。
- `scripts/`：菜品导入、索引构建、数据回填和迁移检查脚本。

## 功能说明

- `README.md`：项目入口和运行说明。
- `FUNCTION_LIST.md`：功能清单。
- `SERVER.md`：服务器和数据库运维说明。
- `DEVELOPER.md`：开发约定和接口边界。
- `docs/assistant/`：模型驱动 Agent 规则、工具、数据权限和评测规范。
- `docs/database/`：食品库、购物清单数据库操作说明。
- `docs/superpowers/specs/`：各功能的设计规格文档。
- `docs/assistant-agent-guide.md`、`docs/assistant-agent-technical-and-user-manual.md`：Agent 使用与技术说明。

## 本次清理范围

已移除本地测试代码、测试依赖、测试报告、覆盖率文件、临时构建目录和重复的测试脚本；保留数据导入、数据库迁移、部署和索引维护所需文件。菜品替换和购物清单回填的正式 SQL、CSV、工作簿和审计资料仍保留在 `outputs/` 中。

运行时生成的 `.env`、SQLite 会话库、缓存和构建目录均由 `.gitignore` 排除，不应提交到远程仓库。
