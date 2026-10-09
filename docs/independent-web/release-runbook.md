# 独立网页运行、验收与回滚手册

## 交付状态

当前为**待验收开发版**：源码、可搬运静态 ZIP、完整性清单和本地运行工具。默认根站 base=`/`，导航只有 `/#/today`、`/#/recipes`、`/#/calendar`、`/#/my`，不把个人偏好写入 URL。不含正式菜库、真实浏览器截图或可公开体验地址。

公共目录仅使用线上数据库的专用同源 GET API。后端默认关闭、空明确 ID allowlist；候选本地工具的 API 返回 503。因而公共菜谱/自动生成不能承诺可用，这比展示历史测试菜更真实。个人记录独立保存在浏览器，可继续查看与备份。仓库尚未声明通用项目开源/再分发许可，不应推定一般许可；本次用户授权的独立分支、草稿PR及Library候选交付仍可在已批准范围内进行。

本手册中的服务器操作都只是**获单独发布许可之后**的步骤。本轮未运行服务器命令、修改生效 Nginx、覆盖旧静态目录、启用接口或部署。

## 从源码复现静态候选

需要 Node.js 24.x；依赖及 integrity 固定在 `web/package-lock.json`。在 `web/` 中执行：

```sh
npm ci
npm run typecheck
npm test -- --run
npm run online:check
npm run boundaries
npm run build
npm run package:release -- candidate-20261009-r5
```

如已存在同 ID 的产物，打包拒绝覆盖；审阅原产物，或为新内容选择新 ID。相同 source/lock/license/资源和 release ID 会生成相同 ZIP 字节，固定 ZIP 时间为 1980-01-01，不带构建时钟。环境不同仍应比较实际 SHA256，不能直接假定一致。

打包命令重新以所给 release ID 构建，所有浏览器资源落到 `/web-assets/<releaseId>/`，文件名带 Vite hash；MIT 全文另有 SHA256 命名的 notice 文本，并由 HTML 的 license 链接保留。HTML 固定指向这一个版本。默认普通 build 的 `/assets/` 输出不能直接充当发布包。

自动检查包括：独立源码/产物边界、固定同源只读传输、后端默认关闭与空 allowlist、固定运行时依赖版本与 npm integrity、MIT 文本、HTML入口及解析后JS导入/资源字符串与CSS url资源闭包、逐文件摘要、来源指纹、危险 ID、额外文件与符号链接。CSS url()资源接受现有闭包检查；产品不用的import at-rule、image-set()及-webkit-image-set()明确拒绝，包括先解码CSS转义再忽略大小写的名称。即使本地import目标已存在也拒绝，不能以字符串样式表或图像源绕过检查。模块或资源动态引用无法静态确定时拒绝打包；引用缺失、跨release、逃逸或外部资源在首次receipt之前即拒绝。自动静态检查 receipt 不等于人类内容审核、数字签名或上线批准。

产物：

- `web/release/<releaseId>/`：index.html、web-assets、许可、manifest、SHA256SUMS、README、Node 本地工具和 Nginx 示例
- `web/release/<releaseId>.zip`：可搬运 ZIP，无 node_modules、个人数据、历史静态菜或测试 fixture
- release-manifest.json：候选状态、依赖、lock/source 指纹、逐文件大小和 SHA256；所有真实浏览器/线上数据标记保持 NOT_RUN/false

在类 Unix 系统解压后可执行 `sha256sum -c SHA256SUMS`。Windows 可使用 Node 启动前的自动逐文件验证。摘要能检测与清单是否一致，不能识别一份被整体替换的恶意包；应通过可信交付渠道取得外部 ZIP 摘要。

## 解压即运行

在专用新目录解压后，运行：

```sh
node tools/serve-release.ts . --port 4173
```

启动前核验清单，只监听 127.0.0.1。浏览器打开 `http://127.0.0.1:4173/`；Ctrl+C 停止。无需 npm install，也不要用 file:// 打开。

- `/` 和 `/index.html` 是入口，Cache-Control=no-cache
- 版本化哈希资源为 immutable；实际缺失资源返回 404
- `/api/` 返回明确本地 503 JSON，`/health` 返回 candidate-local-only 纯文本
- `/main`、ACME 和未知路径返回 404；该本地工具没有旧服务

以上是本地静态行为契约。它不是生产代理、旧 /main、健康检查或真实 API 无回归证明。换主机名、端口、协议或浏览器即换数据空间。真实浏览器/设备运行仍须按[验收记录](verification.md)补证。

## 个人数据与恢复

IndexedDB 按 origin 和浏览器 profile 隔离；隐私模式、存储拒绝、配额或清理网站数据可能使保存失效或记录消失。没有云账户同步。请定期导出 JSON 到自己控制的位置；内容含个人食谱、偏好、计划、实际和采购信息，不应随意转发。

计划与实际记录分开，复制计划不会声称已经吃过。个人/导入内容不会提升成公共已核验候选。正式恢复先解析、预览，再明确确认；整体写入在一个事务内完成。失败保留现有数据和输入。损坏或较新 schema 可 raw 导出，保留原文件待排查，不以清库或新建假空库恢复。跨标签代次变化应停止旧编辑并重新载入。

另一页面修改后，先“查看最新内容”再选择如何继续；仅查看不覆盖本页输入。“采用最新草稿”会明确放弃本页未保存的草稿和设置；“保留当前编辑并继续”后，若本页仍有未保存编辑，点击“保存当前编辑”，以审阅的修订为基线保存当前内容，完成后才保存到日历。组合修改原子保存；保存失败用“重试保存当前编辑”精确重试同一请求。再次外部写入仍会冲突，必须重新查看并选择；不需靠改锁定、忌口或菜数触发保存。

静态资源回滚只切文件指针，不清 IndexedDB、不重置 origin、不删除备份。旧应用遇到较新 schema 按只读处理；不要降库 schema。任何可恢复性承诺都必须由真实浏览器/多标签测试补证。

## 正式公开菜库的独立关口

1. 明确批准要公开的数据库 ID 和用途。检查系统菜、非私房、非用户所有、已发布与原文安全，核对来源许可。legacy 已发布标记不替代授权。
2. 逐项核实 quality profile 与当前 contentVersion；未知信息保持 UNKNOWN。明确原料/份量/步骤覆盖、生成池不足和硬忌口局限。记录实际公开/可生成数量，不沿用历史 18/305/372 数。
3. 用明确 allowlist 验证列表/count/detail、空表、未放行 ID、用户菜、NULL 标记、参数异常和默认关闭时的 503。真实 SQL 引擎与隔离测试须另授权。
4. 在真实同源代理上比较原 API、鉴权/CORS 与新端点响应。controller 的普通 OPTIONS 405 不覆盖上游预检策略。
5. 取得启用配置与发布许可后才将 enabled 改为 true 并填写已批准 ID。空 allowlist 是安全空结果，不自动放行全部菜。出错立即停用新接口，不改旧推荐/模型配置。

## 授权后部署前的基线核对

- 核实实际域名、HTTPS 证书覆盖与到期、HTTP 跳转、ACME、主机权限及必要合规手续；不能凭仓库地址认定服务器现状。
- 在重定向 www 前，核实 www 的历史浏览器数据、现有页面与流量。让有数据的使用者先从旧 origin 导出，到 `https://chishenme.icu` 导入并复核；服务端 301 不能搬 IndexedDB。
- 清点同 origin 旧脚本、旧 HTML 与访问权限。旧页面同源脚本能读同源个人库；本地数据不是防同源恶意脚本的隔离。评审实际 CSP、TLS、缓存和响应头，避免覆盖已有安全配置。
- 备份生效配置（含 nginx -T 输出）、原静态目录、旧 current 指针与每个旧资源版本；记录权限和摘要。不要覆盖 repo 的 backend/static 或旧 `/var/www/chishenme`。
- 准备受控预发布环境，先验证 nginx -t，检查 `/`、固定 hash 路由、真实缺失资源/未知路径 404，以及 /api/、/health、ACME、/main 与备份基线一致。HTTP route mock 或本地 helper 不能代替真实 API 比较。

## 文件布局与切换示例

推荐：

```text
/var/www/chishenme-web/releases/<releaseId>/index.html
/var/www/chishenme-web/assets/web-assets/<releaseId>/<hashed-file>
/var/www/chishenme-web/current -> releases/<releaseId>
/var/www/chishenme/main.html  # 继续保留旧页面
```

把已验证候选放进新的 releases/<releaseId>；将该版本 web-assets/<releaseId> 复制到独立 assets/web-assets/<releaseId>，对照 SHA256 核验并保留所有旧版本。**先资源、后入口**，不能把整个 release 目录公开成文件下载根目录。使用 `web/deploy/nginx-web.example.conf` 评审静态 location，保留原 server/TLS/http 跳转/CORS map 和 API 策略；API保持普通前缀，使现有点路径deny regex继续优先，ACME例外单独保留，未知路径不做广域 SPA fallback。HTML 要重新验证，哈希成功资源 immutable，404 不设一年缓存。

在授权、预发布与真机验收均通过之后，再创建同文件系统的新 current 符号链接，原子 rename 到 current；执行所需配置测试/受控 reload。记录发布 ID、配置摘要、切换前后响应和旧指针。任一门槛失败则保持旧站，不切换。

## 回滚

1. 停止继续放量，记录当前与目标旧 release ID、指针、错误及配置摘要。
2. 核对目标旧入口与其 retained assets 都仍存在；恢复旧 current 指针，必要时恢复备份的 Nginx 配置，先 nginx -t 后按授权 reload。
3. 再核对入口引用、真实缺资源 404、旧 /main、API/health/ACME 与基线。回滚静态网页不清库、不删除个人数据、不执行迁移。
4. 若新 schema 已被使用，旧网页必须显示只读/可导出状态；不能为让旧页可写而删库或降级。需要改数据库、共享备份或启用/停用服务时，按具体变更另外确认。

没有服务器权限或完整验收证据时，仅交付候选，保持待验收状态。
