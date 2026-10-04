# 跃境 · 2026-10-05 设计与制作约定

阅读是主角，风景承接书中的文字。四种场景共用应用的纸色、墨色与强调色；保持原来的阅读字体、用户图片与可关闭入口。默认跟随主题，仍可取消跟随并单独选择光照时刻。

配色依据原主题：纸张 #f3efe7 / #25221d / #2f6f62；夜间 #111417 / #ebeff2 / #76bdce；羊皮纸 #eee3cf / #34291b / #8c4d33；森林 #e8eee8 / #1f2b22 / #31694a；晴蓝 #eaf0f5 / #20262c / #376d92；暮色 #efeaf0 / #2e2630 / #735a84。场景只补充海色、天空与日光，不另造一套界面字体或主题。

布局：书库左侧「全部书籍 → 我的收藏 → 我的生词 → 我的笔记 → 跃境」。手机入口占独立一行。阅读工具栏保留入口。刷词左侧专注题目与原句，右侧为较大的可拾取星轨；窄屏将星轨作为独立可见区域放在题目之前。

| Before | After | Why |
| --- | --- | --- |
| 顶部孤立的跃境按钮 | 笔记下方、与导航相同的笔画图标 | 入口有固定位置，避开统计 |
| 所有主题固定蓝绿背景 | 六主题驱动全部画布、模型灯光和刷词界面 | 文字与风景协调 |
| 四帧海面慢速循环 | 保留 Blender 海面，叠加连续色散波与距离过滤的细波 | 近处自然更明显，远处不闪动 |
| 简单锥形小岛 | 分层石质浮岛、读书亭、木结构与植被 | 让 Blender 建模直接进入实际界面 |
| 细小词语与静止线圈 | 屏幕字号固定、轨道缓慢进动、手机独立空间 | 可读、可点，反馈清楚 |

交互使用短促的颜色/透明度反馈；不为按键答题附加过场。鼠标风场平滑跟随，暂停及「减少动态效果」同时冻结所有环境动画。声音数据直接更新画布，界面能量条节流。

模型合同：自制、确定性生成，保存原始 .blend 与重建脚本；GLB 使用 Y-up，尺度以场景单位为准。书岛目标少于 70,000 三角形、12 种材质，合并静态同材质物件，保留浮动书页。检查原生模型、重新导入、浏览器实际画面以及资源释放。海水采用视觉上具有物理依据的实时波浪，不宣称是工程级流体模拟。

参考技能：Emil design engineering、Anthropic frontend-design、Vercel React best practices、Blender 3D asset generation。技能下载到用户的 Codex skills 目录，不引入网站运行依赖；本轮没有安装原生程序或 Blender 插件。

技能出处与本机说明：

- [Emil design engineering](https://github.com/emilkowalski/skills/tree/main/skills/emil-design-eng)：主题一致、键盘直接反馈、平滑鼠标风场与减少动态效果。
- [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)：先定阅读场景与结构，再落实图形与排版。
- [Vercel React best practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)：声音与瞬时数据使用 ref，避免频繁重渲染。
- [Blender 3D asset generation](https://github.com/lovecatisgood-sudo/3d-asset-generation-blender-unity-game-development-skills/tree/main/skills/blender-3d-asset-generation)：确定性建模、模型预算、原生审计、干净重导入与多视角校验。

另下载了 Emil 的 improve-animations 说明，供未来专项审计参考，本轮未执行它的只读规划流程。没有下载模型或贴图、安装外部可执行插件，网站不依赖这些技能文件。技能在下一轮 Codex 会话可自动发现，本轮已直接读取适用说明。
