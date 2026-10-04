# SkipReader 网页版维护与交接手册

更新：2026-10-05。维护者 GitHub：bendog-1771。正式网站：https://bendog-1771.github.io/eRead-web/ 。仓库：https://github.com/bendog-1771/eRead-web 。网页版 v0.4.0，旧名 eRead Web。

## 本机最新状态：跃境开发分支

当前网页源码已移至 `C:\Users\benbe\Documents\Codex\projects\SkipReader-web`，分支 `feature/yujing-atmospheres`。正式线上仍为 v0.4.0，没有发布本轮变化。先读 [YUJING.md](YUJING.md) 了解接入、数据范围、音频授权与回退。默认关闭跃境；关闭恢复原设置。修改前标签 `before-yujing-2026-10-04`，源码包在相邻 `SkipReader-backups/2026-10-04-before-yujing`。

2026-10-05 新一轮：入口移到侧栏「我的笔记」下方，导航图标统一笔画。新增默认开启的 `matchTheme`（仅跃境已开启时生效）；`palette.js` 将六主题用于全部场景、灯光和刷词界面，旧设置自动补齐。`ocean-shader.js` 连续色散波、距离过滤细波、Fresnel / 日光反射；`sky-shader.js` 为天空及倒影提供同一云场。星轨使用 20px / 手机 16px 的屏幕字号、四条进动环、碰撞避让与手机点选区。声音能量使用 ref；文字测量有缓存；暂停后 WebGL 停止重复重绘。补充中文和带重音字母原句的答前遮词。

新书岛 `assets/yuejing/refined/book-island.glb`、源文件 `reading-garden.blend`，脚本 `scripts/build-refined-book-island.py`。原生审计无警告、26,860 三角面；导出 12 材质，干净重新导入三角面一致，网页使用阴影与同主题灯光。旧模型保留用于回退。精修前提交 `4e28412`，标签 `before-yuejing-refinement-2026-10-05`；备份在相邻 `SkipReader-backups/2026-10-05-refinement`。参考设计技能与取舍见 [DESIGN-REFINEMENT.md](DESIGN-REFINEMENT.md)。

原 `eRead` 目录只保留指引和启动转发；旧桌面开发版、个人材料在相邻 `SkipReader-legacy`。以前共用目录的网页发布副本、后台和压缩包在该目录的 `archives/web-before-split`。不要将旧桌面目录或个人材料上传到网页仓库。

跃境入口：`src/web/yujing/Yujing.tsx`；3D/Canvas：`scene-engine.js`；音频与资源清理：`audio.ts`；独立演示：`lab.tsx`。设置只增加可选 `yujing`，旧数据库、网址、协议与安装标识不变。Three.js 按需加载，默认关闭时不创建画布。构建同时输出 `lab.html`，演示不访问用户书库。新增 `test:yujing`、`test:storage`；原回归继续执行。声音权限窗口使用模拟轨道检查，真实系统声音还须用户在浏览器手动授权。

本轮优化已弃用车窗，旧设置 `scene: train` 自动转为 `island`。入口明确称为「跃境」，现位于左侧笔记下方，删除圆形「余」主页按钮。书卡透明、气候面板跟随六种主题、阅读底色独立 0–100%，搜索栏紧凑、管理按钮为三点。星轨恢复 v1 的暖色线框与 850 颗星，最多 48 个实际生词；题目总是显示原文例句。中文短句分割、鼠标风场、选区旁入风、快速按键与场景资源清理均已修正。

实际使用本机 Steam Blender 5.2.2 LTS，运行自有脚本 `scripts/build-yuejing-blender.py`，带 `--factory-startup --disable-autoexec --python-exit-code 1`。`assets/yuejing` 包含原创书岛 GLB、FFT 海面 GLB 与可编辑 `.blend`；`.blend` 不进入网页包。GLB 由构建器按文件加载，随网页离线缓存。没有安装原生工具或插件，没有修改个人 Blender 配置。脚本 `export-yujing-models.mjs` 只复制这些素材到艺术实验目录。

这轮前的提交为 `a052342`，标签 `before-yuejing-polish-2026-10-04`；备份 `SkipReader-before-yuejing-polish.zip` 位于相邻备份目录。归档旧车窗素材留在 `abandoned-carriage`。内部 `yujing` 名称保留以兼容旧设置，界面统一称跃境。

检查记录：原浏览器功能 91 项，跃境 40 项、稳定性 22 项、精修 48 项，旧库升级 7 项，合并加密 18 项、同步后台 21 项、词典后台 16 项。详见 `reports` 中记录；授权捕获使用模拟音轨，实际系统声音需要浏览器共享授权。正式网站与后台均未部署。

## 新对话直接复制这段话

> 请维护我的 SkipReader（一跃）网页版。仓库：https://github.com/bendog-1771/eRead-web ，网站：https://bendog-1771.github.io/eRead-web/ 。先阅读 HANDOVER.md 和 README.md，检查实际源码、线上版本、未提交修改和账号授权。我没有编程基础，请用中文解释。保持免费方案、普通 DOM 正文、第三方浏览器插件兼容、笔记生词、阅读位置、桌面安装、本地完整备份与可选加密云同步。维护已有用户数据，不要更换来源域名、清空数据或破坏兼容标识。请完成测试再发布。本次需要：……

仓库现在包含可独立重建的完整网页版，不再只保存压缩发布文件。换电脑时下载源码或克隆仓库即可；提供仓库链接不代表自动授予写权限，维护助手需要实际有效的 GitHub / Cloudflare 官方授权。不要发送密码、令牌、恢复卡。原本机共用工作区是 C:\Users\benbe\Documents\Codex\projects\eRead，包含 Windows 旧版及一些个人文件，不能整个文件夹直接上传。

## GitHub 基础

仓库相当于项目文件夹；commit 是一次带说明的版本快照；main 是正式版本分支；Actions 是自动构建检查与发布记录；Issues 用于记录问题；Pull Request 是请维护者审查合并一组修改。

**公开不等于所有人都能改。**其他人能浏览、下载和 fork（复制到自己的账号）。拥有写权限的协作者才能直接改你的仓库；普通用户只能提出 Pull Request，由你决定是否合并。不要随意给别人 Write / Admin 权限。仓库 Settings → Collaborators 可以检查协作者。

修改少量说明文件：打开文件 → 铅笔 Edit → 修改 → Preview 查看 → Commit changes 填写修改理由。修改程序优先新建分支，创建 Pull Request，检查 Actions 成功后合并。main 的每次更新都会触发网站发布。

查看上线：Actions → Deploy SkipReader Web → 最新任务。绿色表示成功，红色进入失败步骤看日志；没有成功之前不要认为网站已更新。代码版本与用户书库是两套独立数据：GitHub 回退代码不会自动恢复读者笔记，读者的历史恢复在应用内进行。

## 目录和修改入口

| 路径 | 用途 |
| --- | --- |
| src/web/main.ts | 启动、安装、更新、在线状态 |
| src/web/api.ts | IndexedDB、本地备份、查词、API 适配 |
| src/web/importer.ts | 四种书籍格式和安全正文清理 |
| src/web/protection.ts | 文件夹权限、定时备份、账号、合并、历史恢复 |
| src/web/sync-model.ts | 可同步记录、跨设备引用、删除标记、HKDF / AES-GCM |
| src/web/ProtectionPanel.tsx | 设置中的数据保护界面 |
| src/renderer/app/App.tsx | 共用界面、阅读、朗读、划线、笔记、生词 |
| src/renderer/shared/styles/app.css / src/web/web.css | 共享样式与网页样式 |
| src/shared / src/preload.d.ts | 类型、默认值、导出、接口定义 |
| assets/skipreader-icon-master.png / skipreader-icon-design.md | 图标原图与制作记录；512/192 PNG 为安装图标，SVG 为位图包装 |
| scripts/build-web.cjs | 从源码构建、许可、安装文件和离线缓存 |
| scripts/*regression* | 功能与后台检查 |
| dictionary-worker | 必应词典后台 |
| sync-worker | 加密学习记录服务和建表 SQL |
| web-site/*-config.json | 两个已公开的服务地址 |
| .github/workflows/pages.yml | 源码检查和 GitHub Pages 发布 |

共享界面保留少量 Windows 条件分支，但网页只执行 Web 分支。此仓库不包含旧 Windows 应用的主进程或个人书籍。不要为了清理旧名破坏协议。

## 本地修改、检查和发布

安装 Node.js 24；在源码根目录运行 README 中的安装、检查、构建和预览命令。部署前至少运行类型检查、test:sync、test:dictionary、build:web；界面变动再运行相关浏览器检查。浏览器脚本优先使用本地 Playwright，Windows 有 Edge 时使用 Edge，其他系统使用 Playwright Chromium。首次可运行 npx playwright install chromium。

提交到 main 自动检查并发布网站。浏览器已有离线缓存时等待「更新版本」或刷新，不要建议用户清除网站数据来更新。部署失败保留代码，查看失败原因修复；回退使用 GitHub 的 revert / 撤销提交或创建逆向变更，不强制覆盖别人提交。

后台修改需要另行部署：npm ci --prefix dictionary-worker → npm run login --prefix dictionary-worker。查词使用 npm run deploy --prefix dictionary-worker；同步使用 scripts/deploy-sync.ps1。后台数据库 ID 是公开资源标识，登录令牌是秘密。没有新增服务时不要求读者或维护者重复注册。

## 当前云服务与免费约束

查词：https://eread-dictionary.eread-dictionary-worker.workers.dev ，只发送查询词语。同步：https://skipreader-sync.eread-dictionary-worker.workers.dev ，Worker 名 skipreader-sync，D1 名 skipreader-sync，绑定 ID 57244f47-e7bd-406b-a394-30fa81176ba3。当前均使用 Cloudflare 免费计划，没有启用付费。

读者使用客户端随机生成的高熵登录恢复码，下载恢复卡后开启同步。没有邮箱验证、邮件密码或第三方账号绑定。恢复卡遗失后无法找回加密记录。云同步只含学习数据及书籍关联元数据；完整书籍留本地，跨设备需要同一份文件。可以手动用邮箱／网盘存完整备份，但没有接入 QQ 邮箱同步。

每份云学习文档约 500KB 上限，历史最多 10 个，注册 IP 每小时 5 次，账号总数上限 3,000。总数据库容量和请求配额仍可能更早耗尽；运营者须监测。不能把有限免费额度描述为无限容量。详见 sync-worker/README.md 和官方链接。

学习记录合并以记录 ID + 逻辑时间戳 + 设备标识确定，同记录以较新版本为准，删除通过 tombstone 保留，上传用 revision CAS 避免覆盖。恢复历史创建新时间戳并同步。新设备通过书文件内容哈希和章节序号重关联笔记，缺书时记录仍可查看但不能定位正文。书文件不同会有不同哈希，不承诺跨版本自动定位。

## 兼容、备份与隐私

IndexedDB 名 eRead-web，当前版本 3，state / html / chapterText 是原有书库，controls 保存目录句柄和云账号。旧版本原地升级添加 controls。阅读位置 localStorage 日志键 eread-web-position-journal-v1，应用继续兼容旧网页备份 schema eRead-web-backup 和旧桌面备份，PWA id 为 ./。名称变化不能清空这些记录。

自动文件备份只在应用打开、有修改、达到间隔且获准写入时运行。重新打开可能需手动再次授权。文件备份包含完整本地书库且未加密，恢复卡不包含书籍，两者均不上传 GitHub。controls / 恢复密钥不进入普通书库备份。清理仅匹配 SkipReader 自动备份的严格文件名，不能递归清空目录。新备份写入并关闭成功后才清理旧文件。

公网同步使用 TLS + 浏览器 AES-GCM 加密。Worker 收到派生认证令牌而非恢复密钥，数据库保存令牌摘要、密文、版本和时间。私有响应不缓存，关闭 Worker 观测日志。身份、密钥、备份内容不进诊断日志；书籍 HTML 必须清理脚本、事件和不安全 URL，保持普通 DOM 并防止导入内容获取恢复密钥。

用户可以退出云账号，已保存本地内容仍保留；删除云账号需要明确确认，会永久删除该账号当前云记录与历史。其他账号和本地数据不删除。恢复云版本也需要明确确认，因为会改写学习记录并影响其他设备。

## 后续改进可以做什么

可继续改善大体量文档的增量同步、冲突比较、跨书文件版本人工关联、浏览器关闭时后台限制提示、服务容量监测和用户自托管。它们不代表当前已支持。若考虑常规邮箱登录，要先解决正式邮件服务、账号找回及免费额度，不要用未配置的邮件服务向用户承诺可登录。

程序、许可声明公开，读者书籍和笔记不公开。必须尊重书籍、词典和组件许可，不提供第三方内容再发布保证。名称检索不能代替正式商标核查。不要承诺插件在所有浏览器独立窗口都可运行。
