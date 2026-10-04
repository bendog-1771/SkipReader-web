# eRead 免费查词后台

只查询单个词或简短词组，不接收书籍、笔记、阅读位置或原文上下文。普通读者无需 Cloudflare 账号。

## 发布

维护者使用 Cloudflare Workers **Free**，无需域名、数据库、付费 AI 或其他付费服务。

1. 在本目录运行 `npm ci` 安装官方发布工具。
2. 运行 `npm run login`，在 Cloudflare 官方网页完成授权，不分享密码或密钥。
3. 运行 `npm run check` 检查发布包，再运行 `npm run deploy` 发布。
4. 将输出的 `https://eread-dictionary.…workers.dev` 地址写入主项目 `web-site/dictionary-config.json` 的 `apiUrl`，重新构建并发布 GitHub Pages。所有读者自动使用默认服务，也可以在设置中更换服务地址。

`wrangler.toml` 的 `ALLOWED_ORIGINS` 允许指定的 GitHub Pages 域名及本地预览。如果更换网站域名，需要修改此列表。只接受 GET 与合法词语，固定上游地址；不提供任意网站代理，不返回上游 HTML。相同词语的同时请求共用一次查询。后台不配置请求日志或数据存储。

## 免费额度与可用性

Workers Free 有请求和计算额度，超额会拒绝请求；本项目不启用付费计划。具体额度以 [Cloudflare 官方说明](https://developers.cloudflare.com/workers/platform/pricing/) 为准。词典查询需要网络，第三方页面变化或访问限制可能使查词暂时不可用；不会绕过验证页面或访问控制。

## 内容来源

必应查询复用桌面版本的公开词条提取方式，并分别提取页面的中文及英文释义。网页版目前只开放必应查词；免费英文补充服务尚未开放。页面、收藏和导出保留来源及许可链接。

遵守 [Microsoft 服务条款](https://www.microsoft.com/servicesagreement/) 及 [Free Dictionary API](https://dictionaryapi.dev/) 返回的词条许可。本程序不授予第三方内容的再发布权；维护者与读者须遵守适用条款和内容许可。

本地开发运行主项目 `npm run start:web`，由本地测试服务执行同一后台模块，无需 Cloudflare 账号。真实的 Cloudflare 可用性需要发布后验证，不能由本地成功推定。
