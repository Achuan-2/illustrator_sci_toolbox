# README

<div align="center">

English| [简体中文](README.md)

</div>

Plugin URL: [Achuan-2/illustrator_sci_plugin](https://github.com/Achuan-2/illustrator_sci_plugin)

## 1 Development Background

Previously, to quickly arrange images and import Markdown notes for group meetings, I wrote a PPT plugin, open-sourced on GitHub, which has now exceeded 500 stars: [Achuan-2/SlideSCI](https://github.com/Achuan-2/SlideSCI), Blog: [SlideSCI README](https://mp.weixin.qq.com/s/_NrGwjJnEta0oT5a6EKdiA)

Recently, while writing a paper, arranging images in Adobe Illustrator can be quite tedious.

- For example, if I need to add the same label to different images in the same position, it's very troublesome with native tools because I can only get absolute positions and have to calculate relative positions myself.
- For example, if I need to batch change the width and height of images, after selecting all images and entering specific values, it actually changes the overall size, and each image's size isn't the specific value I entered.
- For example, if I want to add labels to images one by one, changing numbers and aligning them is also tiring.

## 2 Feature Introduction

- Copy and Paste Relative Position:

  Usage Tips
  - Manually set the relative position of two objects: Modify ΔX and ΔY to manually set the relative position of two objects, for example, to make text 2mm from the top-left corner of the rectangle in the x-direction and 2mm in the y-direction.
  - When copying the relative position of one object, the default reference is the artboard, so you can move a shape out first, then modify the shapes below, and then paste back to the original position.
  - When copying the relative positions of more than two objects, the default reference is the first object, copying the relative positions of the subsequent objects to the first one. You can change the Order to adjust the object sequence. The plugin supports determining the order based on vertical position, horizontal position, and layer order. If you want to use the last object as the reference, check "Reverse Order", so the last object becomes the reference point.
  - When you need to unify positions across multiple objects on different artboards, check "Artboard Reference".

  Usage Scenarios
  - Manually set the relative position of two objects.
  - Quickly unify arrangement methods: If one group of images is already arranged, and you want to arrange another group in the same way, you can copy and paste the relative positions with one click to arrange them instantly.
  - Quickly unify label positions: If one image has a label, and other images need the same label position, you can quickly unify them.
  - You can copy the positions of multiple selected shapes based on the artboard for cross-artboard position unification.

  <img alt="PixPin_2025-09-10_16-18-33" src="https://fastly.jsdelivr.net/gh/Achuan-2/PicBed@pic/assets/PixPin_2025-09-10_16-18-33-20250910161836-eiui89p.png" style="width: 214px;" />

  <br>
  <img alt="PixPin_2025-08-06_17-59-37" src="https://github.com/user-attachments/assets/6a85f732-a325-4864-a7af-5cb9dc0796e4" width="70%"/>

​
- Batch Copy Shape Size:

  Copy the width and height of one shape or manually input width and height, then click Paste Size to batch paste to the selected shapes.

  There are checkboxes in front of width and height, default all checked. Check only one, for example, only width, then only paste width, height adjusts automatically based on original aspect ratio.

  <img alt="PixPin_2025-08-06_17-56-39" src="https://fastly.jsdelivr.net/gh/Achuan-2/PicBed@pic/assets/PixPin_2025-08-06_17-56-39-20250806175650-enk1w8e.png" style="width: 278px;" />​
- One-Click Arrange Images: Batch adjust image width and height, one-click arrange neatly.

  - Column: Set how many columns to arrange into.
  - Row Gap: Row spacing.
  - Column Gap: Column spacing.
  - Object Size:
    - Keep Original Size: Keep original dimensions of each object.
    - Auto Adjust: Proportional scaling so objects in the same row share the same height (or column width if 1 column).
    - Custom Size: Specify custom width and/or height.
  - Order: Determine the order of objects. The plugin supports determining order based on vertical position, horizontal position, and layer order.

  <img alt="PixPin_2025-08-06_17-59-37" src="https://fastly.jsdelivr.net/gh/Achuan-2/PicBed@pic/assets/PixPin_2025-08-06_17-59-37-20250806175940-zw3soci.png" style="width: 298px;" />
  <br>
  <img alt="PixPin_2025-08-06_17-59-37" src="https://github.com/user-attachments/assets/3baad6da-798d-449b-9023-69c8698db78e" width="70%"/>

​
- Swap Positions of Two Shapes

  Uses

  - A group of images is already laid out, copy a set, then use the swap position function to replace the new images with the original ones.
  - After grouping images, need to modify, swap the positions of two images.

  <img alt="PixPin_2025-08-09_22-50-15" src="https://fastly.jsdelivr.net/gh/Achuan-2/PicBed@pic/assets/PixPin_2025-08-09_22-50-15-20250809225017-bwuzfj6.png" style="width: 453px;" />
  <br>
  <img alt="PixPin_2025-08-06_17-59-37" src="https://github.com/user-attachments/assets/b1024d68-50e9-402a-9034-8ffc22f5947b" />

​
- One-Click Add Labels

  Usage Tips

  - After adding labels, the offset input box turns red, modifying the value will automatically and real-time change the label offset, also supports mouse scroll to modify. To exit this state, just click any other button or input box.

  <img alt="PixPin_2025-09-10_16-34-58" src="https://fastly.jsdelivr.net/gh/Achuan-2/PicBed@pic/assets/PixPin_2025-09-10_16-34-58-20250910163500-46cw2gv.png" />
  <br>
  <img alt="PixPin_2025-09-10_16-09-36" src="https://fastly.jsdelivr.net/gh/Achuan-2/PicBed@pic/assets/PixPin_2025-09-10_16-09-36-20250910163518-gs9tdog.gif" />

## 3 How to Use This Plugin

1. Download the plugin zip or zxp file (choose one): [https://github.com/Achuan-2/illustrator_sci_plugin/releases](https://github.com/Achuan-2/illustrator_sci_plugin/releases)

    <img width="1521" height="461" alt="PixPin_2025-09-13_09-24-45" src="https://github.com/user-attachments/assets/69ef348b-2ab4-4c69-9670-2b77573581bb" />


2. Installation Method

     
    【Method 1: ZXP File Installation】

    After downloading the zxp file, install [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/?srsltid=AfmBOoo-EVsObqPpzaZW0PvdAs_QcLleVQPtl2Yy00HAkA4rzndfdAcI), open the software and drag the zxp file into it for installation.

    <img alt="PixPin_2025-09-10_20-49-35" src="https://github.com/user-attachments/assets/d2b7c2a6-65f6-438a-9b52-5ce08b614717" style="width: 50%;" />

    <img alt="PixPin_2025-09-13_09-22-10" src="https://github.com/user-attachments/assets/3abec6d2-8bef-4e5e-ad24-3e0bc68a9f0c" style="width: 50%;" />

    <img alt="PixPin_2025-09-13_09-22-15" src="https://github.com/user-attachments/assets/bf0359aa-f05c-4a88-97f0-9196a83b93ea" style="width: 50%;" />

    Remember to restart Illustrator after installation!!!
    
    【Method 2: ZIP File Installation】

    Download the zip file, extract it to a folder, and copy to the Adobe CEP extensions folder:

    - Windows (Recommended per-user directory, no admin rights required):
      - Press `Win+R`, enter `%APPDATA%\Adobe\CEP\extensions` and press Enter (Full path: `C:\Users\<Username>\AppData\Roaming\Adobe\CEP\extensions`, create `CEP\extensions` if it does not exist).
      - Or system-wide directory: `C:\Program Files\Common Files\Adobe\CEP\extensions`
    - MacOS:
      - User directory: `~/Library/Application Support/Adobe/CEP/extensions`
      - System directory: `/Library/Application Support/Adobe/CEP/extensions`
    - How to confirm the path is correct: If the path is correct, other extension folders may already be present (or you can create one).

    Remember to restart Illustrator after installation!!!
   
    【Set PlayerDebugMode】
   
   - **Method 1 (ZXP Installer)**: The latest version has been repackaged with clean signing and timestamping, so setting `PlayerDebugMode` is usually **not required**.
   - **Method 2 (ZIP Manual Extraction)**: Due to Adobe's security policy for direct folder copying, if the panel appears blank, enable debug mode using either method below:
    
    - Windows Solution (Choose one):
      - **Recommended (One-Click)**: Double-click the `开启PlayerDebugMode.reg` file in the plugin root directory and click "Yes" to merge into registry.
      - **Manual Setup**: Press `Win+R`, enter `regedit`, navigate to `HKEY_CURRENT_USER\Software\Adobe\`, and in each corresponding `CSXS.x` folder (e.g. CSXS.9, CSXS.10, CSXS.11, etc.), create a new String Value named `PlayerDebugMode` and set its data to `1`.
    
        <img width="1902" height="1103" alt="image" src="https://github.com/user-attachments/assets/9d2e4b7d-201b-48e6-95ea-4dc02bdf0986" />

    - Mac System Solution:
    
      - Open Terminal and run:
    
        ```bash
        for v in 6 7 8 9 10 11 12 13 14 15 16; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done && killall -u `whoami` cfprefsd
        ```
    
        > Remember to restart Illustrator after applying the settings.



4. Open the Plugin

    - Window - Extensions, select this plugin.

      <img alt="PixPin_2025-08-06_13-25-43" src="https://fastly.jsdelivr.net/gh/Achuan-2/PicBed@pic/assets/PixPin_2025-08-06_13-25-43-20250806132550-sz59wup.png" />
    - The window can be dragged to the sidebar for convenient use.

      <img alt="PixPin_2025-08-06_13-26-22" src="https://fastly.jsdelivr.net/gh/Achuan-2/PicBed@pic/assets/PixPin_2025-08-06_13-26-22-20250806132631-ib04jm0.png" style="width: 384px;" />​

## ❤️Powered by Love

If you like my work, feel free to buy me a coffee, which will motivate me to continue maintaining the project and creating new ones.

Limited personal time and energy, priority given to feature suggestions and bug reports from sponsored users.

Friends who have accumulated 50 yuan in sponsorships, if you want to add me on WeChat, you can send an email to achuan-2@outlook.com for friend request (I won't reply to emails or add friends if sponsorship doesn't reach 50 yuan, as I don't want to be a free customer service).

<img alt="" src="https://camo.githubusercontent.com/8cf1ad8251e7cecf3dbd2f818706e8aad08aeab824c8bed49b6826f2df443000/68747470733a2f2f63646e2e6e6c61726b2e636f6d2f79757175652f302f323032342f6a7065672f313430383034362f313731343735343537333339332d39633766373062302d303565632d343839652d623561322d3161333766623638316636662e6a7065673f782d6f73732d70726f636573733d696d616765253246666f726d617425324377656270253246696e7465726c61636525324331" style="width: 450px;" />