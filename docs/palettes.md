# 色卡

色卡 tab 的分组位于顶部，右侧设置图标打开“管理分组”弹窗，可新增、重命名和删除任意分组，包括预置分组。默认分组为期刊配色、分类配色、连续配色和发散配色。主界面提供新增色卡和复制格式切换。左键点击颜色为 Illustrator 所选形状应用填充色，右键点击复制当前格式的颜色值：HEX 为 `#RRGGBB`，RGB 为 `rgb(R, G, B)`。右键复制不要求选择形状，成功后在右上角浮动提示，3 秒后自动关闭；连续复制会更新颜色值并重新计时。弹窗支持 Escape、关闭按钮或点击遮罩关闭。

填充支持路径、复合路径及组内形状，保留描边和对象位置。剪切蒙版、参考线、锁定或隐藏的对象、图片不参与填充；没有可填充形状时显示提示。默认未填充的路径会启用填充。自动化测试覆盖左右键分工及失败反馈，`tests/illustrator-palette-fill.ps1` 可在已运行的 Illustrator 中创建临时文档验证原生填充行为，并关闭测试文档返回原文档。

点击“新增色卡”，填写名称和所属分组，通过取色器或 HEX 输入设置颜色，再保存。每张色卡可只有一个颜色，也可加入多个颜色。支持带或不带 `#` 的三位、六位 HEX，保存时统一为大写六位格式。所有色卡（包括默认色卡）均可直接编辑、移动和删除，修改与删除状态会保存，重开面板后不会恢复原始色卡。默认色卡的来源链接保留用于追溯初始配色。管理分组弹窗中显示每组实际色卡数量，删除前会显示确认提示，包括其中全部色卡的数量。删除分组会删除当前属于该组的色卡；已移出的色卡保留，移入的默认色卡一起删除。全部分组删除后，可以从设置图标打开弹窗重新创建。

色卡内容与修改、色卡和分组删除状态、当前分组和复制格式保存在该插件的本地存储中，重开面板后恢复；更换电脑或清除插件本地存储不会迁移这些内容。旧版“我的色卡”中的色卡会迁移到可用分组；仅在需要恢复孤立色卡且无可用分组时创建恢复分组。色卡功能不需要选择 Illustrator 对象。

内置配色及来源：

| 分组 | 配色 | 来源 |
| --- | --- | --- |
| 期刊配色 | NPG / Nature、AAAS / Science、NEJM、Lancet、JAMA | [ggsci，Nan Xiao](https://nanx.me/ggsci/articles/ggsci.html) |
| 分类配色 | Okabe–Ito | [Masataka Okabe、Kei Ito](https://jfly.uni-koeln.de/color/) |
| 分类配色 | Bright、Muted、Vibrant | [Paul Tol](https://sronpersonalpages.nl/~pault/) |
| 分类配色 | Category10 | [D3](https://d3js.org/d3-scale-chromatic/categorical) |
| 分类配色 | Set2、Dark2、Paired | [ColorBrewer](https://colorbrewer2.org/) |
| 连续配色 | Viridis、Plasma、Magma、Cividis | [Matplotlib](https://matplotlib.org/stable/gallery/color/colormap_reference.html)，等间隔抽取 9 个颜色 |
| 连续配色 | Blues、Greens、Oranges | [ColorBrewer](https://colorbrewer2.org/) |
| 发散配色 | RdBu、RdYlBu、Spectral | [ColorBrewer](https://colorbrewer2.org/) |

期刊配色参考 ggsci 中受期刊图表启发的配色方案，不表示出版方要求使用这些颜色。连续配色色卡展示离散采样色值。

ColorBrewer acknowledgement: This product includes color specifications and designs developed by Cynthia Brewer (http://colorbrewer.org/). Copyright (c) 2002 Cynthia Brewer, Mark Harrower, and The Pennsylvania State University. [ColorBrewer license](https://colorbrewer2.org/export/LICENSE.txt).
