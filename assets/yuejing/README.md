# 跃境原创场景

由本机 Blender 5.2.2 LTS 和 `scripts/build-yuejing-blender.py` 创建。所有几何和材质为本项目原创，不使用第三方场景或读者数据。

| 文件 | 网页用途 |
| --- | --- |
| book-island.glb | 云上书岛：浮岛、书籍、盆景、拱线及浮动书页 |
| ocean.glb | 海的慢呼吸：21,025 顶点 FFT 海面，基础形态与三个波浪目标 |
| yuejing-scenes.blend | 可编辑的源场景，包含海洋修改器；不进入网页下载 |
| refined/book-island.glb | 当前网页使用的精修读书庭院，26,860 三角面、12 材质 |
| refined/reading-garden.blend | 精修庭院可编辑源场景，不进入网页下载 |

浏览器通过 GLTFLoader 加载 GLB。海面替换为动态反射材质，四种形态连续混合；书页以独立对象轻微浮动。默认关闭功能时不创建画布。模型只在首次进入对应场景时解析，重复切换复用对象；离线缓存包含两份 GLB。

重建命令（Windows，使用此电脑已有的 Steam Blender）：

```powershell
& 'D:\steam\steamapps\common\Blender\blender.exe' --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/build-yuejing-blender.py
& 'D:\steam\steamapps\common\Blender\blender.exe' --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/build-refined-book-island.py
```

在其他电脑调整程序路径即可。脚本只生成本目录的素材，不读取个人项目、不保存用户偏好。重建后运行网页构建与跃境检查。运行 `node scripts/export-yujing-models.mjs` 可更新艺术实验目录中的编辑副本。

旧 `book-island.glb` 保留作回退；当前导入路径为 `refined/book-island.glb`。精修脚本包含确定性随机种子、静态同材质合并、曲线封口/焊接、法线检查、干净重导入和四视角渲染。原生模型审计无警告。glTF 为保存硬边与法线而拆分顶点，重新导入的网格可出现正常的拆分边界；源模型拓扑审计与三角面复核一并保留。网页上的海面使用连续色散波与距离过滤细波，而非仅靠四张形态缓慢循环。设计约定见根目录 `DESIGN-REFINEMENT.md`。
