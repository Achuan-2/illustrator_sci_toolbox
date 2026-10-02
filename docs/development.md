# 开发与发布

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

`pnpm dev` 使用固定端口 3000，面板会跳转到本地开发服务；浏览器也可以打开 `http://localhost:3000/main/index.html` 预览界面。浏览器预览不提供 Illustrator 文档操作，点击功能会显示相应提示。

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

宿主算法集中在私有作用域中，通过 `$['com.example.achuanPlugin'].call()` 调用。前端参数统一序列化，宿主错误返回 `{ ok: false, error, args }`，翻译在前端完成。`ScriptPath` 不再指向前端脚本；桥接层等待宿主初始化成功后再执行操作。

## 验证

```powershell
pnpm check
pnpm test
pnpm zip
pnpm verify:package
```

`pnpm test` 先构建，然后验证宿主 ES3 语法、无原生 JSON 的运行环境、调用队列与参数安全、设置记忆、翻译、标签预览和实际生产 Svelte 包的 DOM 交互。DOM/CEP 适配器不等于 Illustrator 验收：排图、位置、尺寸、标签、边框和选择操作仍需在 Illustrator 中验证。

## 打包与 GitHub Actions 发布

`pnpm zxp` 生成签名安装包；`pnpm zip` 先生成签名 ZXP，再将同一文件复制为 `.zip`。两个文件内容完全相同，仅扩展名不同，分别用于安装器安装和手动解压安装。

```text
dist/zxp/SCI-Toolbox-<version>.zxp
dist/zip/SCI-Toolbox-<version>.zip
```

ZIP 解压后，将整个扩展文件夹复制到 CEP 扩展目录，确保 `CSXS/manifest.xml` 位于该文件夹的直接子目录中。Windows 目录为 `%APPDATA%\Adobe\CEP\extensions`，macOS 目录为 `~/Library/Application Support/Adobe/CEP/extensions`。重启 Illustrator 后打开插件。本地调试可使用 `dist/cep`。

版本号以 `package.json` 为单一来源。发布前更新版本号及 `CHANGELOG.md` 对应版本条目，提交后推送同版本的 `v<version>` tag。`.github/workflows/release.yml` 会安装锁定依赖、验证 tag、执行检查和测试、调用 Bolt 签名并复制 ZIP、校验两个文件内容完全相同及 ZXP 签名，再创建或更新 GitHub Release，同时上传 ZIP、ZXP 和对应版本说明。签名要求时间戳服务器成功，失败会停止发布。

普通分支提交及 PR 只运行 CI 检查。工作流使用仓库的 `GITHUB_TOKEN`，不需要本地 PowerShell 发布脚本或 `gh release`。构建、测试和打包命令本身不会提交代码、推送 tag 或发布 Release。

## Illustrator 回归检查

实际验收应包含主面板打开、关闭、重新打开和宿主代码刷新；中英文切换与设置恢复；单对象和多对象相对位置、画板参考、顺序与强制粘贴；排图的三种尺寸模式、自动布局和边缘对齐；宽高复制与单维缩放；标注添加、更新、编号撤回、实时偏移与滚轮；四角交换、间距复制粘贴、选择过滤和边框。需在生产包及开发模式分别确认，并记录 Illustrator 版本。
