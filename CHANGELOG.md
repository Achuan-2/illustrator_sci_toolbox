## v2.4.0 / 20260816

- 🎨 网格布局新增Object Size选择项：保持原来大小、自动调整、自定义大小
- 🎨 新增Grid Order：更智能检测对象顺序
- 🎨 网格布局新增Align Edges
- 🎨 网格布局新增Auto Layout，自动检测每行排列数目
- 🎨 新增Selection Tab：支持选择文本和排除文本

## v2.3.0 / 20251212
- ✨子图交换位置功能增强：支持基于左上、左下、右上、右下四个角点交换
- 🐛添加图片边框：修复画板设置为CMYK，无法设置图片border颜色问题

## v2.2.0 / 20251209

- ✨支持添加 border

## v2.1.0 / 20251127

- ✨ 新增间距均匀分布功能，方便统一不同宽高的形状之间的间距 [#21](https://github.com/Achuan-2/illustrator_sci_plugin/issues/21)
- ✨间距复制粘贴 [#22](https://github.com/Achuan-2/illustrator_sci_plugin/issues/22)

## v2.0.0 / 20250919

- ✨ Image Label设置字体颜色 [#18](https://github.com/Achuan-2/illustrator_sci_plugin/issues/18)
- ✨ Label Template添加(a)和(A) [#17](https://github.com/Achuan-2/illustrator_sci_plugin/issues/17)

## v1.9.1 / 20250917
- 🐛 updateLabel的vertical order和horizontal order效果反了

## v1.9.0 / 20250917

- ✨ Image Label 添加字体加粗选项

## v1.8.0 / 20250914

- ✨新增“Select Only Text”按钮，可以快速过滤出选择对象中的文本框，方便更新Label和移动label
- ✨新增“Update Labels”按钮，可以快速更新选择对象中的Label编号和字体大小、Template（字母是大写还是小写）
- ✨Label的样式支持自动保存，下次打开illustrator依然生效
- ✨Label index支持每次添加标签或者更新标签后，是否自动更新编号
- ✨Label index下方添加预览编号功能，方便知道数字与字母之间的对应关系

## v1.7.0 / 20250913
- ✨ 复制相对位置的ΔY需要取反 [#12](https://github.com/Achuan-2/illustrator_sci_plugin/issues/12)
  - ΔX：right为正，left为负
  - ΔY：down为正，up为负



## v1.6.0 / 20250910

- ✨尝试添加验证文件，无需设置playerdebugmode，也能使用插件

## v1.5.0 / 20250910

- [✨排列图片row gap和column gap支持设置为0](https://github.com/Achuan-2/illustrator_sci_plugin/issues/10)
- [✨改进添加标签交互](https://github.com/Achuan-2/illustrator_sci_plugin/issues/11)

## v1.3.0 / 20250810
- ✨ 新增About Tab [#6](https://github.com/Achuan-2/illustrator_sci_plugin/issues/6)

<img width="582" height="801" alt="PixPin_2025-08-10_10-44-17" src="https://github.com/user-attachments/assets/4165dd8d-6e8d-4c29-b142-53702517cf2a" />

## v1.2.0 / 20250809

- ✨ 图片添加标签新增计数器 [#5](https://github.com/Achuan-2/illustrator_sci_plugin/issues/5)
  - 支持计数器自动更新，这样就能做到label编号自动递增，并且支持修改计数器


## v1.1.0 / 20250809
- ✨ 复制粘贴相对位置，支持复制单个形状的位置并粘贴（基于画板位置） [#3](https://github.com/Achuan-2/illustrator_sci_plugin/issues/3)
- ✨ 复制粘贴位置支持设置如果复制和粘贴的条目不对，依然允许粘贴 [#1](https://github.com/Achuan-2/illustrator_sci_plugin/issues/1)
- ✨ 复制粘贴位置支持以画布为参考，可以同步跨画板的形状位置了 [#4](https://github.com/Achuan-2/illustrator_sci_plugin/issues/4)
- ✨ 支持交换形状位置 [#2](https://github.com/Achuan-2/illustrator_sci_plugin/issues/2)



## v1.0.0 / 20250806

- 第一次发布，包含功能
  - 复制粘贴相对位置：快速实现不同图同一个位置添加同一个标注，一个图排版好，就可以复制粘贴给其他图​
  - 形状大小批量复制：复制一个形状的宽高或者手动输入宽高，点击Paste Size即可对选择的形状进行批量粘贴形状，宽高前有勾选框，默认全部勾选，只勾选其中一个，比如只勾选宽度则只粘贴宽度，高度根据原来宽高比自动调整​
  - 一键排列图片：可以批量调整图片宽高、一键排列整齐​
  - 一键添加label​