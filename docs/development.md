# 开发与发布

伪彩仅使用原生图层上色。`PseudocolorPanel.svelte` 同时显示伪彩和合并通道两个分组，各自复用固定操作类型的 `PseudocolorLayersPanel.svelte`，共享忙碌状态；伪彩应用成功后清理旧通道设置，避免使用失效引用。`PseudocolorColorSelect.svelte` 提供带渐变色块的下拉框，支持方向键、Enter、Escape 和点击外部关闭。`pseudocolorLayers.ts` 定义七种单色、通道默认值和尺寸校验。旧像素处理设置会被忽略，旧复杂色表恢复为红色。默认替换原图，手动保留选项仍可持久化。

宿主 `pseudocolorLayers.jsx` 在隔离混合的组合中依次创建黑色背景、正常混合的原图副本和使用 Darken 的染色矩形，避免抗锯齿边缘露出彩色底层。透明区域为黑色，彩色图片保留原 RGB 分量。已有伪彩组合再次应用时直接更新染色层，保持对象、位置和尺寸；通过对象 note 标记及旧版结构兼容识别结果，重命名后仍可操作。

色卡模块使用独立的 `illustrator_sci_plugin_palettes` 本地存储记录，避免将用户色卡混入插件设置或宿主文档。`paletteCatalog.ts` 保存默认分组和初始色值，`paletteLibrary.ts` 负责内容校验、HEX 规范化与复制格式，`PalettePanel.svelte` 提供色卡编辑，`PaletteGroupManager.svelte` 提供分组管理弹窗及键盘焦点约束。`palettes` 保存用户新增色卡及默认色卡的修改，按稳定 ID 合并显示，来源链接从目录读取；`deletedPaletteIds` 记录默认色卡删除状态，防止修改被删除后恢复初始色卡。删除分组依据合并后的实际所属关系处理移入和移出的色卡。`deletedGroupIds` 记录已删除的预置分组，`groupNames` 保存预置分组的自定义显示名称，所有字段保持旧版 version 1 记录兼容。旧版个人分组的色卡迁移到可用分组，只有恢复孤立数据且无可用分组时才生成恢复分组。无法读取存储时保留原记录，保存失败时保留当前面板中的修改并提示。复制优先使用 Clipboard API，CEP 旧版或权限拒绝时使用 `execCommand('copy')`，完成后恢复焦点及文本选择。自动化检查涵盖剪贴板接口模拟、编辑、删除确认和重新读取，不代表实机剪贴板验收。

合并支持 2–7 个同尺寸灰度图片或已有伪彩组合，混合选择也可使用。已有伪彩图沿用当前单色设置，其余图片使用默认色；读取通道后可单独改色或排除通道。合并使用组合内的原图副本，按左上角对齐，上层通道使用 Screen 混合，并保留全部输入对象。读取仅读取名称、边界和引用，不生成预览文件；应用前验证文档、父对象、原图、颜色层、边界和混合属性。创建失败移除本次生成的组合，修改失败恢复旧颜色及元数据。`tests/illustrator-pseudocolor-layers.ps1` 在临时文档中验证七色渲染、边缘、原位改色、旧版结果、通道合并、会话校验和回滚；`tests/panel.test.ts` 验证分组、色块预览、键盘操作和旧设置迁移。

项目基于 [Bolt CEP](https://github.com/hyperbrew/bolt-cep) 的 `vite-cep-plugin`、Svelte 5、TypeScript 和 Vite。开发环境使用 Node.js 22 或以上、项目指定的 pnpm；安装包的宿主范围为 Illustrator CC 2018（22.0）及以上、CEP 8 及以上，前端按 Chromium 57 编译。这个范围是兼容目标，实际兼容性仍需要记录宿主验收结果。

生产入口先加载浏览器 API 补丁（`globalThis`、`queueMicrotask`、`replaceAll`、`Promise.allSettled` 和 `Promise.finally`），并检测 flex gap，为旧版 CEP 使用 margin 间距。宿主脚本继续保持 ES3。根据 [Adobe CEP 版本表](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_8.x/Documentation/CEP%208.0%20HTML%20Extension%20Cookbook.md)，CC 2017 及更早版本使用 Chromium 41 或更旧引擎，缺少 Svelte 5 所需的原生 Proxy，因此不在当前安装包范围内。扩大 manifest 范围不能解决这一限制。

旧版 Illustrator 应使用 `pnpm build` 生成的静态产物或签名安装包验证；Vite 开发服务和 HMR 不属于旧版宿主的兼容承诺。开发工具的 Node.js 要求不影响安装包在 Illustrator 内的运行。

## 本地开发

```powershell
pnpm install
pnpm build
pnpm dev
```

首次构建会按 Bolt 的默认行为，将 `dist/cep` 链接到当前用户的 Adobe CEP 扩展目录，扩展 ID 仍是 `com.example.achuanPlugin.panel`。启用对应 CEP 版本的 PlayerDebugMode，重启 Illustrator，在“窗口 → 扩展功能 → SCI Toolbox”打开面板。已有同 ID 的手动安装目录可能阻止创建链接，需要先将该安装目录移到备份位置，再运行 `pnpm symlink`。不要把整个源码仓库复制到扩展目录。

`pnpm dev` 使用固定端口 3000，面板会跳转到本地开发服务；浏览器也可以打开 `http://127.0.0.1:3000/`，根地址会跳转到 `/main/index.html` 预览界面。浏览器预览不提供 Illustrator 文档操作，点击功能会显示相应提示。

Svelte 和 CSS 修改通过 Vite HMR 更新。`src/jsx` 中的宿主入口、算法或 JSON2 修改会重新生成 `dist/cep/jsx/index.js`，触发面板整页刷新，并在下一次操作前重新加载宿主代码。整页刷新会重置复制的数据、标注编辑会话等临时状态，已经写入 Illustrator 文档的内容不受影响，也不会因刷新自动执行文档操作。

开发服务与生产文件页面具有不同 origin，localStorage 彼此独立。生产环境沿用 `illustrator_sci_plugin_settings` 存储键；切换开发模式后需要在开发页面重新设置语言和标注参数，不要将其误判为生产设置丢失。

停止开发后运行 `pnpm build`，恢复面板的静态入口，随后重新打开面板。`pnpm symlink` 和 `pnpm delsymlink` 用于管理开发链接。

## 代码结构

| 路径 | 职责 |
| --- | --- |
| `src/js/main/App.svelte` | 导航、面板生命周期和语言状态 |
| `src/js/components` | 按功能拆分的 Svelte 表单与交互 |
| `src/js/stores` | 持久设置和临时表单状态 |
| `src/js/services` | CEP 适配、串行调用及功能操作 |
| `src/js/i18n` | 可编辑的中英文 JSON 与翻译逻辑 |
| `src/shared/host.ts` | 宿主操作、参数类型和响应协议 |
| `src/jsx/ilst/arrange.jsx` | 保留的 Illustrator ES3 算法 |
| `src/jsx/index.ts` | 插件命名空间内的统一宿主入口 |
| `vite.es.config.ts` | JSON2、算法与入口的 ES3 构建 |
| `cep.config.ts` | 扩展 ID、最低宿主版本、面板和签名配置 |

宿主算法集中在私有作用域中，通过 `$['com.example.achuanPlugin'].call()` 调用。前端参数统一序列化，宿主错误返回 `{ ok: false, error, args }`，翻译在前端完成。`ScriptPath` 不再指向前端脚本；桥接层等待宿主初始化成功后再执行操作。构建的 `jsx/index.js` 必须保留 UTF-8 BOM，确保 `$.evalFile()` 正确读取包含中文的脚本；缺少 BOM 时可能报“类型错误：无法转换”，导致所有宿主操作初始化失败。

## 验证

```powershell
pnpm check
pnpm test
pnpm zip
pnpm verify:package
```

`pnpm test` 先构建，然后验证宿主 ES3 语法、无原生 JSON 的运行环境、调用队列与参数安全、设置记忆、翻译、标签预览和实际生产 Svelte 包的 DOM 交互。DOM/CEP 适配器不等于 Illustrator 验收：排图、位置、尺寸、标签、边框和选择操作仍需在 Illustrator 中验证。

## 打包与本地发布

`pnpm zxp` 生成签名安装包；`pnpm zip` 先生成签名 ZXP，再将同一文件复制为 `.zip`。两个文件内容完全相同，仅扩展名不同，分别用于安装器安装和手动解压安装。

```text
dist/zxp/illustrator_sci_toolbox_v<version>.zxp
dist/zip/illustrator_sci_toolbox_v<version>.zip
```

ZIP 解压后，将整个扩展文件夹复制到 CEP 扩展目录，确保 `CSXS/manifest.xml` 位于该文件夹的直接子目录中。Windows 目录为 `%APPDATA%\Adobe\CEP\extensions`，macOS 目录为 `~/Library/Application Support/Adobe/CEP/extensions`。重启 Illustrator 后打开插件。本地调试可使用 `dist/cep`。

版本号以 `package.json` 为单一来源。发布前更新版本号及 `CHANGELOG.md` 对应版本条目，提交并推送本次版本的代码。安装项目依赖和 GitHub CLI，运行 `gh auth login` 登录后，在 Git Bash 或其他 Bash 环境执行：

```bash
bash release.sh
```

脚本从自身目录运行，读取 `origin` 对应的 GitHub 仓库，并确认当前 HEAD 已上传。随后提取对应版本说明，执行测试、类型检查、打包和包验证，再通过 `gh release create` 发布对应 CHANGELOG 及百度、夸克网盘地址。ZIP 和 ZXP 仅保存在本地，不作为 GitHub Release 附件上传；本地安装包需自行上传到网盘。网盘链接保存在 `scripts/release-notes.mjs` 的发布说明页脚中。版本 Release 已存在时，只使用 `gh release edit` 更新发布说明，不修改已有附件，也不删除或移动已有 tag。新 tag 由 GitHub 基于当前 HEAD 创建。打包时在签名前递归排除 `.debug` 和 `node_modules`；验证检查排除项、版本号、ZIP/ZXP 字节一致性及 ZXP 签名。时间戳签名、测试或验证失败都会停止发布。

使用 `bash release.sh --no-release` 只生成并验证本地安装包和发布说明，不需要 GitHub 登录。脚本不自动暂存、提交或推送代码；项目不再使用 GitHub workflows，普通构建、测试和打包命令也不会发布 Release。

## Illustrator 回归检查

实际验收应包含主面板打开、关闭、重新打开和宿主代码刷新；中英文切换与设置恢复；单对象和多对象相对位置、画板参考、顺序与强制粘贴；排图的三种尺寸模式、自动布局和边缘对齐；宽高复制与单维缩放；标注添加、更新、编号撤回、实时偏移与滚轮；四角交换、间距复制粘贴、选择过滤和边框。需在生产包及开发模式分别确认，并记录 Illustrator 版本。
