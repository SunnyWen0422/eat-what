# 吃什么独立网页版

网页版与微信小程序共享源码仓库和公开菜库服务，前端分别构建。网页的个人计划、收藏、采购和备份保存在当前浏览器的 IndexedDB，不会自动同步到微信账号。

## 本地连接线上菜库

使用 Node.js 24.x，在 `web` 目录执行：

```powershell
npm ci
npm run dev:online
```

打开终端显示的本机地址。开发服务器仅把公开菜库的 GET 请求代理到 `https://chishenme.icu`，不会代理用户、聊天或写入接口，也不会传递账号令牌或 Cookie。浏览器不保存数据库凭据。`npm run dev` 保留没有线上代理的隔离模式。

2026-10-10 实测：本地代理与线上均返回 404，说明本地链路已连通，但线上 Java 尚没有 `/api/public/catalog/dishes`。需部署匹配后端，并配置获准公开的菜品编号，才会显示线上菜库。数据库本身可以访问，不能把该 404 解释成数据库密码错误。

## 检查与发布

```powershell
npm run typecheck
npm test -- --run
npm run build
npm run boundaries
npm run online:check
npm run e2e -- --project=chromium
```

浏览器回归会强制关闭线上代理并使用隔离响应。不会调用外部模型或修改线上记录。完整仓库验证见 `../docs/testing/local-verification.md`。

静态发布包需要同域后端路由，开发代理不进入静态网页。公开接口默认关闭，允许编号默认空，最多 500 道；它不会把私人菜谱公开。上线与跨浏览器验收见 `../docs/superpowers/specs/2026-10-09-eatwhat-independent-web-design.md`。
