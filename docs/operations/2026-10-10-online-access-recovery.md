# 线上数据库访问核对与恢复步骤

检查时间：2026-10-10 00:17–00:37（北京时间）。本轮仅执行只读诊断，没有部署、迁移、重启业务服务、修改安全组或重置凭据。

## 已确认的事实

数据库并非一直无法访问：2026-10-08 云助手通道曾在服务器本机用应用账户成功只读查询 MySQL。数据库 `food` 的 6,665 道系统菜与导出备份一致。当时线上尚没有完整 V4 表结构；网页所需的新公开接口也未经部署确认。这与“数据库连接失败”是不同问题。

本轮实例身份、公网地址和区域已与既有资料核对；云 API 凭据可用。ECS 状态为 Running，云助手版本 2.2.4.1097，但状态为 false，最后心跳是北京时间 2026-10-09 21:11:06。只读命令 `t-bj06zj9f332wbuo` 被中止，错误为 `ClientNotRunning`，没有执行 SQL。

本机普通 TCP 连接成功不等于服务可用：协议探测中 SSH 22、MySQL 3306 未返回握手；旧端口 3294/8004 连接被重置；域名 HTTPS 健康和公开目录 GET 请求均超时。安全组当前包含允许 22、3306、80、443 的规则，但这不能证明操作系统防火墙、服务监听及出站网络正常，也不能排除本机到服务器的链路问题。没有为排查修改任何规则。

阿里云控制台截图为 Ubuntu 24.04.3 LTS 登录界面。缓存控制台日志更新于 10 月 4 日，其中未检出 OOM、内核 panic、磁盘满的标记；缓存很旧，**不能据此排除本次内存、磁盘或服务故障**。尚未确认当前 MySQL 状态和密码有效性，不应猜测数据库损坏。

## 最小恢复路径

1. 使用阿里云 ECS 控制台的 VNC 登录现有实例。当前没有可用 SSH 会话；本机数据库密码不等于操作系统管理员密码，不能用它重置服务器账户。
2. 先只读查看系统和代理状态：

   ```sh
   date -Is
   uptime
   free -m
   df -h
   systemctl is-active aliyun.service
   systemctl status aliyun.service --no-pager
   ss -lnt
   ```

   系统日志可能含运维信息，只在受控位置审阅，避免直接粘贴整份应用配置或原始日志。
3. **经用户批准后**，如果 `aliyun.service` 存在且处于 inactive/failed，仅启动该代理：

   ```sh
   sudo systemctl start aliyun.service
   systemctl is-active aliyun.service
   ```

   不把代理启动与重启 MySQL、Java、Nginx、整台 ECS 混在一起。若代理已 active 但无心跳，先核对 DNS、路由、出站网络和代理日志；不直接重装、不扩大安全组、不关闭 TLS 验证。
4. 云 API 返回 `CloudAssistantStatus=true` 后，复用既有固定只读查询脚本。凭据仍由服务器的 `/www/wwwroot/backend/application-prod.yml` 在内存读取；连接只允许服务器回环地址、应用账户和 `food` 数据库。每次查询使用 READ ONLY、执行超时和 ROLLBACK，仅输出表结构和汇总，不拉取用户原始信息。
5. 再核对公网及服务器回环接口、线上 JAR 与表结构。即便 SQL 可读，也不能把网页目录可用或 V4 已上线标记为通过。

如果 VNC 也无法登录，需要用户提供现有受控登录通道或由服务器管理员执行上述检查。**不要求把任何密码发到聊天**；当前数据库访问恢复尚未完成。

## 网页数据为何仍可能为空

网页默认请求同源 `/api/public/catalog/dishes`，浏览器不直接连 MySQL，数据库密码也不会进入网页包。旧线上服务缺接口或新服务仍关闭公开目录时，网页会显示不可用状态。单纯换数据库地址无法解决这层问题。

当前公开目录仍默认关闭、允许菜品编号仍为空。后续上线需要：确认公开内容范围；备份与核对迁移血缘；部署新接口；显式配置已批准菜品；核对同源路由、旧小程序接口和回滚。未经验证的食材、份量和做法不能标成 VERIFIED 来强行启用配餐。该发布工作须另行授权。

官方依据：[ClientNotRunning 排查与代理启动方式](https://www.alibabacloud.com/help/en/ecs/user-guide/check-execution-results-and-troubleshoot-common-issues)、[云助手心跳状态定义](https://www.alibabacloud.com/help/en/ecs/developer-reference/api-ecs-2014-05-26-describecloudassistantstatus)。
