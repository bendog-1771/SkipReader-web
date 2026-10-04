# SkipReader · 一跃

2026-10-04 采用 SkipReader 作为英文主名，中文辅助名「一跃」。图标延续用户选择的深绿色底、米色书页与金色圆点，以螺旋上升的金色轨迹表达跃进。轨迹交替从书后与书前经过，中央一段掠过书页下方留白并连接书脊；书页遮挡后方轨迹，形成空间层次，末端指向金色圆点。

设计源文件：`assets/skipreader-icon-master.png`。安装图标：`assets/skipreader-icon.png`（512×512）和 `assets/skipreader-icon-192.png`（192×192）。`assets/skipreader-icon.svg` 仅为嵌入 PNG 的兼容包装，并非矢量源。制作方式和编辑提示词见 `assets/skipreader-icon-design.md`；可运行 `node scripts/render-brand-icon.cjs` 重新准备安装尺寸。

安装描述使用带内容摘要的图标地址，方便浏览器发现图标更新。PWA ID、启动地址与作用域保留原值。标题栏默认纸白色 `#f3efe7`；`src/web/main.ts` 在阅读主题改变时从 CSS `--bg` 更新 `theme-color`，夜间同时声明 dark color-scheme。支持此机制的浏览器会使用当前主题色；系统标题栏最终显示由浏览器和操作系统控制。

命名检索发现「跃读」曾用于其他阅读产品，因此未采用它作为本应用的中文主名。现有公开检索不能代替商标核查，也不能证明名称在所有地区均可注册；若以后正式商业化，应另行核查相关名称与标识。

网址继续使用原 GitHub 仓库路径，以保留本机数据来源和安装识别。IndexedDB 名称、备份 schema、阅读日志和 PWA ID 的旧标识是兼容协议，不应因为改名直接替换。Windows 旧版仍保持原品牌，网页仓库专门维护 SkipReader 网页版。
