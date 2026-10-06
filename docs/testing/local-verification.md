# 本机 V4 开发与验证

当前项目为 `project/`，分支 `codex/v4-local-integration-20261006`，基础提交 `c152550`。本机前端开关已开启，API 为 `http://127.0.0.1:18780/api`。Java 仅以 `local-v4` Profile、回环地址和 `eatwhat_v4_local_*` 数据库启动。原生产配置没有用于此环境。

## 微信开发者工具体验

导入本项目目录，使用本机模拟器。项目私有设置已关闭 URL 域名检查；前端会登录独立的合成本地账号，无需调用真实微信登录。首页、结果页使用同一当前餐工作区，可打开需求输入弹层、生成与确认安排、查看整餐做法、加入采购清单、填写实付和记录实吃。

语音按钮固定弹出“抱歉，该功能暂不可用”；语音服务保持关闭，不加载语音供应商凭据。官方参考价尚无已验证批次，缺价显示空缺，不用合成价格填充。菜库为合成测试数据，做法用于核验步骤交互，不能据此评价真实菜谱内容质量。

`127.0.0.1` 指当前电脑，实体手机不能直接访问这一地址。本次不涉及真机发布。自动化工具需要开发者工具“设置 → 安全 → 服务端口”，当前尚未获得开启确认，因此不能把原生编译通过说成逐页原生交互通过。

## 持久隔离服务

依赖 Python 3.12、PyMySQL、python-dotenv、Java 21（交付字节码目标 Java 8）、MySQL 8。脚本不会初始化已有 `.local-v4/mysql`，不会连接旧数据库，也不覆盖历史数据。

```powershell
python scripts/local_v4.py status
python scripts/local_v4.py restart
python scripts/local_v4.py stop
# 仅首次且不存在本地运行记录时：
python scripts/local_v4.py start --java D:/Java/bin/java.exe --mysqld 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe'
```

脚本不替换现有数据。重启沿用原数据库端口、凭据、Token 与模型预算。停止前核对 PID 对应命令，避免停止 PID 已被复用的其他服务。凭据仅位于忽略目录 `.local-v4`，该目录同时排除在微信打包之外。

本次用户授权真实模型请求总计最多 20 次。`python scripts/local_v4.py model` 使用本机已有 DeepSeek 配置，查询账号仅有隔离数据库 SELECT 权限；索引也写入 `.local-v4`。预算按实际请求先计数，失败亦计费额，跨重启保留，不自动重置。服务重启不自动再次启动模型。手动启动前确认 18781 未占用。

## 普通回归

安装到专用环境，不修改系统 Python：

```powershell
python -m pip install -r scripts/requirements-verification.txt
python -m pip install -r recommend-service/requirements.txt
./scripts/verify.ps1 -PythonExecutable <python.exe> -MavenExecutable <mvn.cmd> -MavenRepository <专用缓存目录> -Offline
```

Windows CairoSVG 需要 Cairo DLL。可将已验证的 Cairo 目录同时写入 `CAIROCFFI_DLL_DIRECTORIES` 和 PATH。脚本先检查依赖，检查 JSON/代码语法、敏感标记、迁移清单、Node/Python 回归和 Java 测试打包；任一退出非零即停止。

本机最终命令使用 Codex 捆绑 Python、`work/v4-development/verification-deps` 与 `work/assistant-chain-venv/Lib/site-packages`。前者是测试依赖的独立副本，避开旧依赖目录 ACL 导致的不可读命名空间；没有更改旧目录安全控制。Maven 缓存位于包装目录 `.m2`。原 `.pytest_cache` ACL 导致 Windows `tempfile.mkdtemp` 重试挂起，Token 测试改用忽略目录 `.test-artifacts/ui-token`；未删除旧缓存或失败用例。

Mock 回归、MySQL/HTTP 联调、模型联调、WXML/WXSS 编译、模拟器交互和真机验收分别记录，不能互相替代。最终证据见 [本次实施验收记录](../planning/2026-10-06-local-v4-implementation.md)。

## 发布边界

当前 `utils/config.js` 明确指向本机且开启 V4，属于本机体验配置。未经独立发布验收不可上传。发布前必须决定 API、登录方式、两端能力开关、迁移血缘、稳定基础库及真实菜谱数据，完成适用真机验收；此任务没有执行生产迁移或发布。
