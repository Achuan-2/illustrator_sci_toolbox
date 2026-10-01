# 中英文文案维护

插件默认使用英文。用户可以在 Settings / 设置 Tab 中切换 English 或简体中文，切换立即生效，语言保存在现有的 `illustrator_sci_plugin_settings` localStorage 设置中。

`en.json` 和 `zh_CN.json` 使用相同的 key。新增或修改文案时，同时维护两个文件；中文缺少某个 key 时会回退到英文。

HTML 文本使用 `data-i18n="common.copy"`，提示、占位文本和图片说明分别使用 `data-i18n-title`、`data-i18n-placeholder` 和 `data-i18n-alt`。不要把 key 放在包含其他子元素的容器上，因为翻译会替换其文本内容。

JavaScript 文案通过 `I18n.t('relative.multipleValues', { count: 2 })` 获取，JSON 中使用 `{count}` 作为占位参数。需要随语言切换更新的动态属性通过 `I18n.bind(element, 'placeholder', key, params)` 绑定。

Illustrator ExtendScript 不读取语言文件。错误通过 `sciError('errors.countMismatch', [actualCount, savedCount])` 返回 key 和参数，在面板中通过 `I18n.formatError(result)` 翻译；JSON 使用 `{0}`、`{1}` 对应参数顺序。

在项目根目录运行 `node --test tests/i18n.test.cjs`，检查文案完整性、设置记忆和错误信息。测试使用 DOM 与 CEP 模拟，不代表 Illustrator 内的实际界面验收。现有打包脚本会复制整个 `client` 目录，无需单独配置语言文件。
