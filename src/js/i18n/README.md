# 中英文文案维护

默认语言为简体中文，语言和标注参数仍保存在 `illustrator_sci_plugin_settings`，已有语言选择继续保留。`en.json` 与 `zh_CN.json` 的 key 和占位参数必须保持一致，缺少中文条目时回退到英文。

Svelte 组件中使用 `{$t('common.copy')}`，提示使用 `title={$t('labels.editingHint')}`，动态参数使用 `{$t('relative.multipleValues', { count: 2 })}`。语言切换由 store 驱动，表单值不依赖 DOM 文本更新。

构建会同时导入字典并复制原始 JSON 到安装包的 `js/i18n`。生产面板通过本地 XHR 加载这些文件，因此修改安装目录里的 JSON 后重新打开面板即可生效；开发模式直接使用源码字典和 Vite 更新。

Illustrator 不读取翻译文件。原有 `sciError(key, args)` 经宿主入口转换为错误响应，前端负责翻译；JSON 中的 `{0}`、`{1}` 对应宿主参数顺序。

运行 `pnpm test` 检查文案完整性、持久化和生产界面交互。测试使用 DOM/CEP 适配器，实际 Illustrator 验收见 [开发文档](../../../docs/development.md)。
