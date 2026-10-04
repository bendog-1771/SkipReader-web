# SkipReader 加密学习记录同步

正式服务：`https://skipreader-sync.eread-dictionary-worker.workers.dev`。维护者使用 Cloudflare Workers Free + D1；读者不需要 Cloudflare 账号。网站只通过 HTTPS 访问这个服务。

## 数据和身份

浏览器生成 256 位随机恢复密钥，格式为 `SKIP1.` 加 base64url。HKDF-SHA256 分别派生身份令牌和不可导出的 AES-GCM-256 密钥。服务只接收身份令牌，并保存其 SHA256；恢复密钥、解密密钥从不上传。账号 ID 为令牌摘要前 32 个十六进制字符。每次上传使用新的 96 位随机 nonce，并校验固定附加数据。

加密内容包括笔记、生词、书签、生词本、阅读位置、每章位置和书籍关联元数据。完整正文、封面、背景图片、设备设置、恢复卡不上传。服务能看到账号标识、版本、时间、加密大小和学习内容摘要，不能直接看到解密内容。当前浏览器保存恢复密钥以保持登录；恢复卡必须自行保管，系统没有找回密码功能。

服务保留当前版本及最多 10 个有学习内容变动的历史版本。只有阅读位置变动时更新当前版本，不挤占学习内容历史。每次 PUT 必须携带读到的版本号，冲突返回 409，客户端重新合并；历史恢复通过新时间戳发布为最新版本。删除账号会删除该账号的当前数据和全部历史。

## 免费限制

不启用付费计划。每账号一次同步的明文限制为 500,000 字节，传输加密包上限 720,000 字符。服务最多允许 3,000 个账号，并限制每个 IP 每小时创建 5 个账号；这不是保证可以容纳 3,000 个满容量账号。免费数据库空间与请求额度会先产生实际限制。超限时停止相关云操作，本地功能继续工作。不要承诺永久免费无限容量或永久可靠托管。

官方额度：[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)、[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)、[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)。运营者应定期在 Cloudflare 面板检查空间和请求量。

## 部署和维护

本仓库查词后台的依赖目录提供统一 Wrangler 工具：

```powershell
npm ci --prefix dictionary-worker
npm run login --prefix dictionary-worker
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-sync.ps1
```

部署脚本查找或创建 `skipreader-sync` 数据库，将数据库 ID 写入 `sync-worker/wrangler.toml`，执行幂等的建表 SQL，然后发布 Worker。数据库 ID 是资源标识，不是访问密钥。换账号或复制项目时需要重新运行脚本，不要沿用其他人的数据库绑定。不要删除正式数据库来解决普通部署失败。

其他系统可以使用已登录的 Wrangler 手工执行同样步骤：创建数据库、修改绑定、执行 `schema.sql`、部署配置。Cloudflare 登录只通过官方浏览器授权；不把密码、OAuth 凭据、API 令牌或恢复卡写到仓库。

网站连接地址在 `web-site/sync-config.json`。后台允许的网页来源在 `wrangler.toml`。换地址需更新这两处并分别发布后台与前端。GitHub Actions 不自动部署 Cloudflare。

Node 24 下运行 `npm run test:sync`，覆盖实际 SQL 的账号隔离、容量、版本竞争、历史限制和删除，以及浏览器加密、合并、删除标记和书籍重关联。`npm run test:protection` 使用两个独立浏览器环境测试真实配置的服务，会创建并删除临时账号。浏览器文件备份测试使用隔离的真实目录句柄，仅替代系统文件夹选择器，不访问使用者的文件夹。

## 操作与隐私

允许来源通过 CORS 白名单限制；用户仍需要自己的高熵身份令牌。私有响应 `no-store`，网页缓存不缓存云端请求。后台未启用观测日志，不记录笔记和密钥。注册限流只使用 IP 的摘要小时桶并清理过期桶。未提供跨账号查询接口，代码不能依赖隐藏 API 地址获得安全。

账号删除无法撤销。恢复卡遗失时维护者也不能解密数据或找回账号，用户应该定期保存独立的完整书库文件备份。恢复卡等同账号钥匙，分享它会给予对方读取、修改和删除该账号的权限。
