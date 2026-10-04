# eRead Web 维护与交接手册

更新日期：2026-10-04（北京时间）。维护者：GitHub `bendog-1771`。

本文记录实际状态、操作入口和待讨论方案。新对话应重新检查文件和线上状态；这里的计划不表示已实现。

## 1. 给新对话的开场白

可以复制以下文字，并在最后写本次想改的功能：

> 请继续维护我的 eRead 网页版。仓库：https://github.com/bendog-1771/eRead-web ，正式网站：https://bendog-1771.github.io/eRead-web/ 。请先阅读仓库 HANDOVER.md 和 README.md，再核对当前源码、线上版本及未发布修改。我没有编程基础，请用中文解释。项目坚持免费，正文需要保持普通 DOM，以便第三方浏览器插件识别；保留笔记、生词、阅读位置和桌面安装。当前完整源码主要在我电脑的 C:\Users\benbe\Documents\Codex\projects\eRead，远端仓库主要是发布文件，请不要把远端发布文件当作完整源码。本次需求是：……

在能访问本机的对话中，把上述本机文件夹选为项目。换电脑或没有本机文件访问权限时，仅提供仓库链接无法恢复尚未上传的源码，需要先提供完整源码副本。

新对话不一定继承上一段聊天的全部内容。GitHub、Cloudflare 登录授权也要检查是否仍有效；不在聊天、手册或仓库中填写密码、访问令牌和授权配置。

## 2. 当前线上状态

| 项目 | 位置／状态 |
| --- | --- |
| 正式网站 | https://bendog-1771.github.io/eRead-web/ |
| GitHub 仓库 | https://github.com/bendog-1771/eRead-web ，公开，主分支 main |
| 网站发布 | GitHub Actions：Deploy eRead Web；GitHub Pages source 为 workflow |
| 查词后台 | https://eread-dictionary.eread-dictionary-worker.workers.dev |
| 查词后台部署 | Cloudflare Workers Free，worker 名 eread-dictionary |
| 用户数据 | 各浏览器自己的 IndexedDB，部分阅读位置另有 localStorage 日志 |
| 云同步／自动文件备份 | 尚未实现，不要向用户描述为已经可用 |
| 新名字及图标 | 尚未选定，候选见 BRANDING.md |

当前查词后台只接收查询词语，不接收书籍、笔记、阅读位置或原文上下文，也没有数据库绑定。GitHub 发布程序不包含读者的个人数据。

网站的 main 更新会触发发布。GitHub 上修改 dictionary-worker 并不会自动更新 Cloudflare 后台，后台要单独部署。

## 3. 源码与发布文件在哪里

当前完整工作区：`C:\Users\benbe\Documents\Codex\projects\eRead`。它包含原 Windows 桌面版和网页版；工作区根目录目前并非完整项目的 Git 仓库。

远端 eRead-web 仓库当前保存 public 网页发布文件、查词后台、部署配置和文档。尚未保存完整前端源码、主项目依赖清单和全部测试脚本。这是维护上的已知不足；优先安排源码整理、上传和可重建的自动发布。

| 本机路径 | 用途 |
| --- | --- |
| src/web/main.ts | 网页入口、应用启动及安装／更新相关逻辑 |
| src/web/api.ts | 浏览器数据、备份、网页查词等适配 |
| src/web/importer.ts | 导入书籍和清理正文 |
| src/renderer/app/App.tsx | 桌面／网页共用的大部分界面与阅读逻辑 |
| src/renderer/shared/styles/app.css | 共用界面样式 |
| src/shared | 类型、默认设置、学习内容导出 |
| assets/eread-icon.svg、assets/eread-icon.png | 构建时复制的图标源文件 |
| scripts/build-web.cjs | 网页构建、许可证、缓存清单与安装描述文件生成 |
| scripts/serve-web.cjs | 本地网页预览和本地查词接口 |
| scripts/export-web-files.cjs | 选出允许公开的文件，并复制后台发布文件 |
| scripts/package-web.cjs | 生成网页发布 ZIP |
| web-site | 网页发布目录、文档、部署配置 |
| dictionary-worker | 查词后台的实际维护目录 |
| reports | 本机检查结果和截图，不作为用户数据发布 |
| publish/eRead-web | 辅助上传的独立仓库副本，不是完整前端源码 |

build-web 会重新生成 public 中的若干文件，功能修改应落在源码和构建脚本中。主项目与 dictionary-worker 使用不同的依赖目录。

## 4. 已实现的产品要求

- 免费、公开网址、可安装到 Edge／Chrome 的独立窗口。
- 阅读正文保留主页面普通 DOM；划线覆盖层不截获鼠标事件。
- EPUB、TXT、Markdown、DOCX 导入；书库、目录、分页、搜索、排版、书签。
- 我的笔记、生词本、编辑、原文定位和多种导出；网页完整 JSON 备份及桌面完整 JSON 备份导入。
- 每章独立记录阅读位置，切换和重新打开时恢复。
- Web Speech 朗读：起读方式、第一句高亮、暂停／继续、句子切换、语速、跟随正文。
- 柔和的朗读／定位高亮；与文本留间距的直线和较平滑的波浪线。
- 可选内置查词，默认关闭；只开放必应，展示实际能取得的中英文释义，收藏时保留来源与原文。
- 不提供网页 AI 提问；帮助与关于只泛指第三方浏览器插件，不推广具体插件品牌。
- 保留第三方组件许可和词典来源说明。程序不提供书籍下载或第三方内容再发布授权。

安装后的插件行为与实际声音仍需在维护者的浏览器配置中体验，不能只依据模拟朗读测试宣称全部设备效果一致。

## 5. 修改、检查、发布

以下操作在完整本机工作区执行，不能在目前远端发布仓库中直接运行。先检查现有依赖和运行中的预览，不要随意覆盖本机修改。

```text
npm run typecheck:web
npm run build:web
npm run start:web
```

本地预览通常为 http://localhost:5174/ 。build:web 会生成 web-site/public。共享代码有修改时，还需运行 `npm run typecheck`，确认桌面版没有类型错误。

针对实际改动选择检查：

| 检查脚本 | 范围 |
| --- | --- |
| node scripts/web-regression.cjs | 导入、DOM、本地数据、备份、离线等基础功能 |
| node scripts/web-ux-regression.cjs | 不同窗口宽度、笔记、导出和界面操作 |
| node scripts/web-feature-regression.cjs | 阅读位置、朗读高亮、划线、可选查词等 |
| node scripts/dictionary-worker-regression.mjs | 后台解析、输入与来源限制、错误处理 |
| node scripts/check-dictionary-browser.cjs | 隔离浏览器验证公网必应查询，需要本地预览 |
| node scripts/check-web-deployment.cjs | 正式站加载、真实查词、保存、安装缓存和离线 |

浏览器检查脚本目前依赖这台 Windows 电脑的 Edge 和 Playwright 路径。换环境时需配置相应依赖，不能假设仓库下载后即可运行。

网页发布：用 export-web-files 生成的文件清单复制到远端仓库对应位置，保留目录结构，再提交 main。只发布清单中允许公开的文件，避免将 node_modules、.wrangler、tools、个人备份、报告和凭据整包上传。

现有 prepare-web-publication.cjs、publish-web.ps1、publish-web-api.cjs 是这台电脑的辅助工具，有固定仓库和 GitHub CLI 路径。API 上传脚本会重新读取远端 main，并拒绝强制更新；但不能不检查就把旧的本机文件覆盖到新的远端版本。API 上传后的远端提交可能与辅助本机副本的提交历史不同，下一次工作要先核对。

发布后在 GitHub Actions 确认成功，再检查正式网站。运行 `npm run package:web` 可生成完整发布 ZIP；仓库 ZIP 只备份程序，不能备份浏览器里的书籍或笔记。

查词后台另行发布：见 [dictionary-worker/README.md](dictionary-worker/README.md)。实际维护先修改本机 dictionary-worker，再同步公开副本；使用官方登录授权，保持 Free 计划。不要把私密数据保存逻辑直接接到当前无需用户认证的查词接口上。

## 6. 数据保护和故障定位

- 目前用户操作会自动保存到浏览器，但没有浏览器之外的自动副本。用户主动清除网站数据后可能丢失。
- 应用已请求持久存储；浏览器可能不批准，获批也不能阻止用户主动清除。
- localhost 和正式站的数据不同。迁移前先设置 → 备份与日志 → 导出备份，再在目标站导入。
- 同一域名下不同路径不应被假设为独立的安全存储边界。更换网址前要评估 origin、IndexedDB 名称、安装应用 id、start_url、scope 和缓存。
- 安装应用仍使用浏览器数据，不等于永久保存。下载的备份文件要留在浏览器之外。
- 查词失败先分辨网站是否正常、浏览器到后台是否通、后台上游页面是否变化及免费额度。此前曾出现命令行 DNS／网络异常而 Edge 实际查询成功，应结合真实浏览器验证。
- CORS 限制浏览器来源，不等于用户身份验证；将来私密同步接口必须有真正的认证与访问控制。
- 页面旧版本可尝试应用内更新提示或 Ctrl+Shift+R；避免首先让用户清除网站数据，这可能破坏书籍和笔记。

## 7. 待讨论的云保存方案

用户希望免费、可恢复、能在多设备同步，并询问每个人是否能使用自己的云账号。尚未选定或实现方案。

1. 用户自己部署 Cloudflare Worker＋D1：可提供独立的公开模板及 Deploy to Cloudflare 按钮；官方支持自动创建绑定资源。用户完成 Cloudflare／GitHub 或 GitLab 授权部署，再在阅读器连接自己的服务。需要设计私有认证、恢复方式、历史版本和升级流程。模板当前尚不存在。
2. 阅读器直接提供 Cloudflare OAuth 登录并创建用户自己的数据库：Cloudflare 当前支持第三方公开 OAuth 客户端和浏览器 PKCE。不过公开客户端要求通过 DNS TXT 记录验证 client URL 域名；维护者无法为现有 github.io 域名设置该记录，不能承诺仅靠当前 Pages 地址即可启用。绝不让用户把 Cloudflare 全局 API Key 粘贴进网页。
3. 用户授权自己的 OneDrive 应用文件夹，或 Google Drive 应用数据区域：用个人网盘容量保存同步内容，用户无需维护数据库。接入仍需开发者应用注册、权限配置及真实浏览器测试，不是已有功能。

无论选择哪种，需实现离线后重试、设备间合并、误删恢复、同步状态和导出。不要用简单的“新设备全量覆盖云端”代替同步。优先保存笔记、生词、书签、进度，整本书上传作为明确的可选项。

参考：
- [Cloudflare OAuth 客户端与域名验证](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/)
- [Cloudflare 官方部署按钮](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [D1 免费额度](https://developers.cloudflare.com/d1/platform/pricing/)
- [OneDrive 应用文件夹](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder)
- [Google Drive 应用数据](https://developers.google.com/workspace/drive/api/guides/appdata)

## 8. 下一步和更新手册

建议优先顺序：保存完整源码和可重建流程 → 自动文件备份 → 选定云同步方式 → 选定新品牌并迁移图标／安装名称。

每次维护结束更新这份手册：改了什么、哪些实际验证通过、是否已上线、是否仍有已知限制和用户待定选择。不写入访问令牌和个人数据，不把计划标成已完成。
