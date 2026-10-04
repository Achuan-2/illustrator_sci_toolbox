<div align="center">

[English](README_EN.md) | 简体中文
</div>

<img width="2406" height="762" alt="image" src="https://github.com/user-attachments/assets/c719fa09-747f-452f-852e-108c0f80862a" />


## Star History

<a href="https://www.star-history.com/?repos=Achuan-2%2Fillustrator_sci_toolbox&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=Achuan-2/illustrator_sci_toolbox&type=date&theme=dark&legend=top-left&sealed_token=-oezg8f6EWOb9qHf-7P2h51krd95lWkq6wvAGw7OaEpHFYQB34wEayk1dyvTjUCbNm1f1wWi13ogYaYxk4TzXA0G0Q4ZfBqB57V2fYj0IIOidElP5gSI62tblaTqYc_VKCV5wNOXUgq2Yb10K7uBV-AqjDfLVcLjyJ0jEHG5R8f07zMTONho-UhPIJtH" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=Achuan-2/illustrator_sci_toolbox&type=date&legend=top-left&sealed_token=-oezg8f6EWOb9qHf-7P2h51krd95lWkq6wvAGw7OaEpHFYQB34wEayk1dyvTjUCbNm1f1wWi13ogYaYxk4TzXA0G0Q4ZfBqB57V2fYj0IIOidElP5gSI62tblaTqYc_VKCV5wNOXUgq2Yb10K7uBV-AqjDfLVcLjyJ0jEHG5R8f07zMTONho-UhPIJtH" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=Achuan-2/illustrator_sci_toolbox&type=date&legend=top-left&sealed_token=-oezg8f6EWOb9qHf-7P2h51krd95lWkq6wvAGw7OaEpHFYQB34wEayk1dyvTjUCbNm1f1wWi13ogYaYxk4TzXA0G0Q4ZfBqB57V2fYj0IIOidElP5gSI62tblaTqYc_VKCV5wNOXUgq2Yb10K7uBV-AqjDfLVcLjyJ0jEHG5R8f07zMTONho-UhPIJtH" />
 </picture>
</a>


## 1 开发背景

之前为了组会做ppt快速排图、导入markdown笔记，写了一个ppt插件，开源在Github：[Achuan-2/SlideSCI](https://github.com/Achuan-2/SlideSCI)，博客：[SlideSCI README](https://mp.weixin.qq.com/s/_NrGwjJnEta0oT5a6EKdiA)

而写论文时，我还是用adobe illustrator来组图，但发现组图有时好累

- 比如我需要不同图同一个位置添加同一个标注，原生非常麻烦，因为只能获取绝对位置，得自己计算相对位置
- 比如我需要图片批量改宽高，全选图片后，输入具体值，但实际改的是整体大小，每个图片的大小并不是我输入的具体值
- 比如我要给图片添加label，一个个标签添加，要改编号，还要对齐也好累

## 2 功能介绍

- 比例尺（Scalebar）：打开比例尺页后，选中图片会自动加载 FOV 和已有比例尺参数；编辑 FOV 或已有比例尺后自动保存，无需读取或保存按钮。FOV 支持 nm、μm、mm、cm、m、inch，保存在图片对象备注中并保留原有备注。比例尺单位默认跟随 FOV，也可单独选择；更换比例尺单位时换算数值并保留实际尺长。支持横向 Width / 纵向 Height、厚度（pt）、比例尺颜色、文字显示、字体颜色、字号、加粗和四角位置，默认与图片编组。未添加比例尺的图片保留“添加比例尺”按钮。自动尝试读取链接 TIFF 中的 ImageJ、OME 或明确 FOV 信息；粘贴 / 嵌入丢失标定元数据时，可直接填写 FOV，普通打印 DPI 不会当作显微标定。

  横向比例尺只需填写 FOV 宽度，纵向只需填写 FOV 高度，另一维可保持未知。文字按四角位置对齐比例尺对应边缘：横向左 / 右对齐，纵向上 / 下对齐。修改后的比例尺与文字样式、代表长度会自动记忆，重新打开面板或为其他图片添加比例尺时复用；新图片的单位仍默认跟随自身 FOV，已有比例尺优先加载图片自身参数。

  制作放大图时，已有比例尺会继承样式、单位和默认代表长度，也可为每个放大图单独调整。比例尺按裁剪区域的实际 FOV 和放大图当前尺寸重新计算，裁剪修改和手动调整放大图尺寸后会同步更新（需开启“放大图自动更新”）。比例尺长度不能超过对应区域的 FOV。原图单独调整尺寸后，编辑比例尺参数会按新尺寸重新绘制；整体缩放图片与比例尺编组则会保持正确比例。

- 色卡：顶部提供“期刊配色、分类配色、连续配色、发散配色”四个默认分组，内置 23 套常用科研配色，包括 NPG、AAAS、NEJM、Lancet、JAMA、Okabe–Ito、Paul Tol、ColorBrewer 和 Viridis 等。左键点击颜色为所选形状应用填充色，右键复制 HEX 或 RGB 值；通过分组右侧的设置图标打开管理弹窗，新增、重命名和删除任意分组。在任意分组创建命名色卡，通过取色器或 HEX 输入添加一个或多个颜色。所有色卡（包括默认色卡）均支持直接编辑、调整所属分组和删除。色卡修改、色卡与分组删除状态、分组名称、当前分组和复制格式自动保存在本地。配色来源见 [色卡说明](docs/palettes.md)。

- 合并通道（Merge Channels）：在伪彩页的“合并通道”分组中合并 2–7 张同尺寸灰度图片或已有伪彩组合，也支持混合选择。伪彩图沿用已有颜色，灰度图按所选顺序使用红、绿、蓝等默认颜色；点击“读取所选通道”可分别设置颜色和是否参与合并，颜色下拉框显示渐变色块预览。合并使用组合内保留的原图，各通道按左上角对齐，以滤色模式叠加，生成可编辑组合并保留全部原图；同色通道的滤色叠加与逐像素加色算法不同。

- 图片伪彩：伪彩页同时显示“伪彩”和“合并通道”两个分组。仅使用可编辑图层上色，支持红、绿、蓝、青、品红、黄和灰度，颜色下拉框及其选项显示黑色到目标色的渐变预览。默认在原位置替换原图；勾选“保留原图”可在右侧生成副本。选中已有伪彩组合后再次应用会原位修改颜色，保持位置、尺寸和原图副本。支持早期组合，新组合重命名后仍可识别。黑色背景和变暗混合避免边缘露出彩色底层，透明区域显示黑色；彩色图按原 RGB 分量上色。无需导出、像素处理或重新嵌入图片，不覆盖链接源文件。

<img width="2656" height="1508" alt="image" src="https://github.com/user-attachments/assets/a5174868-ee60-4b83-982a-84734649d3e4" />


- 一键添加子图label和更新label

  - 添加label

    ![PixPin_2025-09-10_16-34-58](https://assets.b3logfile.com/siyuan/1610205759005/assets/PixPin_2025-09-10_16-34-58-20250910163500-46cw2gv.png)

    添加子图label后，offset 输入框变红，修改值就会自动实时更改label offset，还支持悬浮输入框鼠标滚轮滚动快速实时移动label

    注：要退出这个状态只需要随意点击其他按钮、输入框即可

    ![减少帧数2](https://assets.b3logfile.com/siyuan/1610205759005/assets/减少帧数2-20251128232313-i4ncm0a.gif)
  - 更新label

    根据设置的样式和编号来一键更新Label已有编号，子图重排、更新编号模板的时候就不需要自己一个个重写编号了

    批量选中label一键更新

    ![PixPin_2025-11-28_23-07-13](https://assets.b3logfile.com/siyuan/1610205759005/assets/PixPin_2025-11-28_23-07-13-20251128230731-2wk5yaa.gif)

    根据设置的label index编号来一个个更新

    ![减少帧数](https://assets.b3logfile.com/siyuan/1610205759005/assets/减少帧数-20251128232207-13i4s6e.gif)
- 一键排列图片（Grid Layout）：可以批量调整图片宽高、一键排列整齐

  - Auto Layout：勾选后自动根据选中对象当前的排布识别行与列，一键排列整齐（适合先大致摆好位置，再用本功能快速对齐），此时无需设置 Columns
    - Align Edges：勾选后每行对象的左右边缘对齐。在“自动调整”模式下支持自定义 Column Gap，插件会自动等比缩放各行高度填满总宽度；在其它模式下，行内间距自动均分
    - Layout Width：Align Edges 下可设置布局后的总宽度（mm），左边缘锚定当前位置、右边缘对齐到该宽度；填 0 表示保持当前整体宽度
  - Columns：设置要排成几列
  - Row Gap：行间距
  - Column Gap：列间距
  - Object Size（对象大小）：
    - 保持原来大小（Keep Original Size）：排列时保留每个对象的原始尺寸
    - 自动调整（Auto Adjust）：自动等比缩放，使同一行对象高度对齐（单列时按首个对象宽度对齐）
    - 自定义大小（Custom Size）：可单独或同时指定 Resize Width 和 Resize Height
  - Order：判断对象的先后顺序，插件支持根据网格位置（grid order，默认，自动识别行并按“从上到下、同行从左到右”的阅读顺序排列）、垂直位置、水平位置以及图层顺序来确定对象顺序。（illustrator没法获取选择顺序，只能根据位置和图层顺序来确定对象顺序）

  ![PixPin_2025-08-06_17-59-37](https://fastly.jsdelivr.net/gh/Achuan-2/PicBed@pic/assets/PixPin_2025-08-06_17-59-37-20250806175940-zw3soci.png)

  ![PixPin_2025-08-06_17-59-37](https://github.com/user-attachments/assets/3baad6da-798d-449b-9023-69c8698db78e)
- 复制粘贴相对位置：

  使用说明

  - 复制一个对象的相对位置时，默认以画板为参考
  - 复制两个对象以上的相对位置，默认以第一个对象为参考对象，复制后面的对象对于第一个对象的相对位置，可以更改Order来调整对象顺序，插件支持根据网格位置（grid order，默认）、垂直位置、水平位置以及图层顺序来确定对象顺序。如果你想以最后一个对象为参考对象，可以把“Reverse Order”打上勾，这样就是以最后一个对象为参考点
  - 当需要对多个对象进行跨画布统一位置时，勾选Artboard Reference

  使用场景

  - 复制一个对象的相对位置时，默认以画板为参考，这样可以先把一个形状移出去，然后对下面的形状进行改动，然后再粘贴回原来位置
  - 快速实现不同图同一个位置添加同一个标注，一个图排版好，就可以复制粘贴给其他图
  - 快速统一排列方式：如果已经排好了一组图，想对另一组图也按照之前那组图的排布方式排布，也可以一键复制并粘贴相对位置就瞬间排好了
  - 快速统一label位置：一个图加了label，其他图的label位置也需要一样，也可以快速统一
  - 可以基于画布复制多选形状的位置，进行跨画布统一位置

  ![PixPin_2025-09-10_16-18-33](https://fastly.jsdelivr.net/gh/Achuan-2/PicBed@pic/assets/PixPin_2025-09-10_16-18-33-20250910161836-eiui89p.png)

  ![PixPin_2025-08-06_17-59-37](https://github.com/user-attachments/assets/6a85f732-a325-4864-a7af-5cb9dc0796e4)
- 形状大小批量复制

  复制一个形状的宽高或者手动输入宽高，点击Paste Size即可对选择的形状进行批量粘贴形状。

  宽高前有勾选框，默认全部勾选，只勾选其中一个，比如只勾选宽度则只粘贴宽度，高度根据原来宽高比自动调整

  ![PixPin_2025-08-06_17-56-39](https://fastly.jsdelivr.net/gh/Achuan-2/PicBed@pic/assets/PixPin_2025-08-06_17-56-39-20250806175650-enk1w8e.png)
- 交换两个形状的位置

  按九宫格选择交换基准：左上、上居中、右上、左居中、居中、右居中、左下、下居中、右下。每个按钮带有对应位置图标，交换时保持两个对象的原始尺寸。

  用途

  - 一组图已经排版好，复制一份，然后用swap position功能，把新图和原来的图替换
  - 组图后需要修改，交换两个图的位置

  <img width="602" height="527" alt="image" src="https://github.com/user-attachments/assets/04b2afa9-94db-4ed9-a380-6b6517e629e4" />


  ![PixPin_2025-08-06_17-59-37](https://github.com/user-attachments/assets/b1024d68-50e9-402a-9034-8ffc22f5947b)
- 排列分布

  - 对齐对象：水平居左、居中、居右，垂直顶对齐、居中、底对齐，以及水平与垂直同时居中。以选中对象的整体边界为基准，至少选择两个对象；按钮提供图标和悬停提示。
  - 分布对象：按水平左边缘、中心、右边缘，或垂直顶边缘、中心、底边缘等距离分布。至少选择三个对象，两端对象保持不动，中间对象只沿对应方向移动。

  - 间距均匀分布功能：一键统一不同宽高的形状之间的水平/垂直间距

    ![水平间距均匀分布-20251128204458-56dc2da](https://github.com/user-attachments/assets/971991ff-cec1-4488-b862-26534e445522)

    > ps：写完这个功能我才发现illustrator的分布间距功能本身就是支持均匀分布的（捂脸，我之前一直以为只能指定固定值，否则不能点击，看到网上的教程也只说用于固定间距，没说可以均匀分布，大意了，不过写了就写了吧）
    >
    > ![image](https://github.com/user-attachments/assets/6059211c-131e-45e2-bfac-5914016e8eb9)
    >
  - 间距复制粘贴功能：快速复制粘贴水平/垂直间距

    官方的分布间距只能指定值，而不能获取值，如果原先已经排好了两个形状的间距，想批量应用到其他形状，就可以用本功能

    下面是一个例子：在画一个流程图，矩形和箭头的间距调整了一个满意的，然后就可以复制这个间距，快速批量应用于其他矩形和箭头，统一这个间距

    ![复制粘贴间距-20251128205250-r9vjwbw](https://github.com/user-attachments/assets/0567f2aa-6a3c-4757-9ffd-f1fc3cf12d58)
- 一键添加图片边框

  <img width="1024" height="1098" alt="image" src="https://github.com/user-attachments/assets/9a192d43-71b8-430a-8e92-e05c9b241437" />

  > 补充：发现illustrator添加图片有蒙版功能，可以快速添加蒙版之后也能设置描边，并且会随着图片移动而移动，也挺方便的。本质上也是illustrator添加了一个和图片等大的矩形，然后创建剪切蒙版，相当于是给这个剪切组添加描边


## 3 如何安装本插件


### 3.1 下载插件

本插件安装包的兼容目标为 Illustrator CC 2018（22.0）及以上。

下载插件 ZXP 安装包或 ZIP 分发包（选一个就好）


百度网盘地址：https://pan.baidu.com/s/1zRVdx0TtWFCZi0rwfZkUBw?pwd=ftit

夸克网盘地址：https://pan.quark.cn/s/12bf0d38de47

### 3.2. 安装方法

     
#### 方法一: zxp文件安装

下载zxp文件后，安装[ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/?srsltid=AfmBOoo-EVsObqPpzaZW0PvdAs_QcLleVQPtl2Yy00HAkA4rzndfdAcI)，打开软件拖进zxp文件进行安装

<img alt="PixPin_2025-09-10_20-49-35" src="https://github.com/user-attachments/assets/d2b7c2a6-65f6-438a-9b52-5ce08b614717" style="width: 50%;" />

<img alt="PixPin_2025-09-13_09-22-10" src="https://github.com/user-attachments/assets/3abec6d2-b8ef-4e5e-ad24-3e0bc68a9f0c" style="width: 50%;" />

<img alt="PixPin_2025-09-13_09-22-15" src="https://github.com/user-attachments/assets/bf0359aa-f05c-4a88-97f0-9196a83b93ea" style="width: 50%;" />

安装后记得重启illustrator！！！
    
#### 方法二：zip文件安装

ZIP 与 ZXP 内容相同，仅扩展名不同。下载 ZIP 后解压为文件夹，将整个文件夹复制到 Adobe 插件目录，安装后重启 Illustrator。

不同系统的Adobe 插件目录：

- Windows：

  - 按 `Win+R` 输入 `%APPDATA%\Adobe\CEP\extensions` 并回车。
- MacOS：

  - 目录：`~/Library/Application Support/Adobe/CEP/extensions`
   

### 3.3 设置PlayerDebugMode（如果能正常使用可跳过）
   
如果打开插件面板显示空白，请按以下方法开启PlayerDebugMode进行修复：
    
- Windows 解决方法：
  - **手动设置**：`Win+R` 输入 `regedit` 打开注册表，进入 `HKEY_CURRENT_USER\Software\Adobe\`，在对应的 `CSXS.版本号`（如 CSXS.9、CSXS.10、CSXS.11 等）项下新建字符串值 `PlayerDebugMode` 并设置数值数据为 `1`。

    <img width="1902" height="1103" alt="image" src="https://github.com/user-attachments/assets/9d2e4b7d-201b-48e6-95ea-4dc02bdf0986" />

- Mac 系统解决方法：

  - 打开终端，输入命令（支持主流版本一键设置）：

    ```bash
    for v in 6 7 8 9 10 11 12 13 14 15 16; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done && killall -u `whoami` cfprefsd
    ```

> 设置完成后记得完全退出并重启 Illustrator。



## 4 如何打开插件

- 窗口-扩展功能，选择本插件

  ![](https://fastly.jsdelivr.net/gh/Achuan-2/PicBed/assets/20260816181448-2026-08-16.png)
- 窗口可以拖拽到侧栏方便使用

  ![](https://fastly.jsdelivr.net/gh/Achuan-2/PicBed/assets/20260816181518-2026-08-16.png)

## 5 开发与发布

项目架构为 Bolt CEP + Svelte + TypeScript，使用 pnpm 管理依赖。

常用开发流程如下：

```bash
pnpm install
pnpm build  # 检查、构建并启动或复用热更新服务
pnpm dev    # 直接启动或复用热更新服务，首次自动生成扩展文件
pnpm zxp    # 生成静态扩展和签名安装包
```

## ❤️用爱发电

开源与创作不易，如果喜欢我的作品，欢迎给我赞赏，这会激励我继续维护项目和持续创作新项目。


<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/network-asset-image-20250614123558-fuhir5v.png" />

