// Illustrator ExtendScript Functions
// Helper function to convert mm to points
function mmToPoints(mm) {
    return mm * 2.83464567;
}
function pointsToMm(points) {
    return points / 2.83464567;
}

// Simple stringifier to avoid ExtendScript's lack of native JSON support
function simpleJsonStringify(arr) {
    var parts = [];
    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        parts.push('{"deltaX":' + item.deltaX + ',"deltaY":' + item.deltaY + '}');
    }
    return '[' + parts.join(',') + ']';
}

// 简化字体名称决策逻辑: 根据 fontFamily 与 bold 返回正确的字体 PostScript 名称
function getFontFullName(fontFamily, bold) {
    var f = fontFamily || '';
    switch (f) {
        case 'ArialMT':
            return bold ? 'Arial-BoldMT' : 'ArialMT';
        case 'TimesNewRomanPSMT':
            return bold ? 'TimesNewRomanPS-BoldMT' : 'TimesNewRomanPSMT';
        default:
            // 对于其他字体，尽量保持简单：若 bold 则尝试追加 -BoldMT，否则返回原名
            if (bold) {
                if (f.indexOf('-BoldMT') !== -1 || f.indexOf('Bold') !== -1) return f;
                return f + '-BoldMT';
            }
            return f;
    }
}

// 更稳健的获取“可视区域”边界，参考用户提供逻辑，优先基于剪切路径/复合路径计算
// 返回 [left, top, right, bottom]，未能获取时返回 undefined
function getVisibleBounds(o) {
    var bounds, clippedItem, sandboxItem, sandboxLayer;
    var curItem;

    // 跳过参考线
    if (o.guides) {
        return undefined;
    }

    if (o.typename == "GroupItem") {
        // 空组直接跳过
        if (!o.pageItems || o.pageItems.length == 0) {
            return undefined;
        }
        // 组被剪切
        if (o.clipped) {
            // 在子项中寻找 clipping path
            for (var i = 0; i < o.pageItems.length; i++) {
                curItem = o.pageItems[i];
                if (curItem.clipping) {
                    clippedItem = curItem;
                    break;
                } else if (curItem.typename == "CompoundPathItem") {
                    if (!curItem.pathItems.length) {
                        // 处理没有 pathItems 的复合路径（沙盒层拆复合）
                        sandboxLayer = app.activeDocument.layers.add();
                        sandboxItem = curItem.duplicate(sandboxLayer);
                        app.activeDocument.selection = null;
                        sandboxItem.selected = true;
                        app.executeMenuCommand("noCompoundPath");
                        sandboxLayer.hasSelectedArtwork = true;
                        app.executeMenuCommand("group");
                        clippedItem = app.activeDocument.selection[0];
                        break;
                    } else if (curItem.pathItems[0].clipping) {
                        clippedItem = curItem;
                        break;
                    }
                }
            }
            if (!clippedItem) {
                clippedItem = o.pageItems[0];
            }
            bounds = clippedItem.geometricBounds;
            if (sandboxLayer) {
                // 清理沙盒
                sandboxLayer.remove();
                sandboxLayer = undefined;
            }
        } else {
            // 非剪切组：聚合所有子项的可视边界
            var subObjectBounds;
            var allBoundPoints = [[], [], [], []];
            for (var j = 0; j < o.pageItems.length; j++) {
                curItem = o.pageItems[j];
                subObjectBounds = getVisibleBounds(curItem);
                if (!subObjectBounds) continue;
                for (var k = 0; k < subObjectBounds.length; k++) {
                    allBoundPoints[k].push(subObjectBounds[k]);
                }
            }
            if (allBoundPoints[0].length) {
                bounds = [
                    Math.min.apply(Math, allBoundPoints[0]),
                    Math.max.apply(Math, allBoundPoints[1]),
                    Math.max.apply(Math, allBoundPoints[2]),
                    Math.min.apply(Math, allBoundPoints[3])
                ];
            } else {
                // 回退
                bounds = o.geometricBounds;
            }
        }
    } else {
        // 基础对象：直接用几何边界
        bounds = o.geometricBounds;
    }
    return bounds;
}

// 统一封装：返回对象的可视信息
function getVisibleInfo(item) {
    var vb = getVisibleBounds(item) || item.visibleBounds;
    var left = vb[0];
    var top = vb[1];
    var right = vb[2];
    var bottom = vb[3];
    var width = right - left;
    var height = top - bottom;
    return {
        left: left,
        top: top,
        right: right,
        bottom: bottom,
        width: width,
        height: height,
        bounds: vb
    };
}

// 获取对象所在画板索引（通过对象可视边界中心点命中 artboardRect）
function getItemArtboardIndex(item) {
    var doc = app.activeDocument;
    var b = getVisibleBounds(item) || item.visibleBounds;
    var cx = (b[0] + b[2]) / 2;
    var cy = (b[1] + b[3]) / 2;
    for (var i = 0; i < doc.artboards.length; i++) {
        var r = doc.artboards[i].artboardRect; // [left, top, right, bottom]
        if (cx >= r[0] && cx <= r[2] && cy <= r[1] && cy >= r[3]) {
            return i;
        }
    }
    // 回退：当前活动画板或 0
    try {
        return doc.artboards.getActiveArtboardIndex();
    } catch (e) {
        return 0;
    }
}

// 按目标“可视宽度”进行等比缩放（基于 getVisibleBounds 计算比例）
function scaleItemToVisibleWidth(item, targetW) {
    if (!targetW || targetW <= 0) return;
    var info = getVisibleInfo(item);
    if (info.width <= 0) return;
    var scale = (targetW / info.width) * 100; // 百分比
    item.resize(scale, scale, true, true, true, true, scale, Transformation.CENTER);
}

// 按目标“可视高度”进行等比缩放（基于 getVisibleBounds 计算比例）
function scaleItemToVisibleHeight(item, targetH) {
    if (!targetH || targetH <= 0) return;
    var info = getVisibleInfo(item);
    if (info.height <= 0) return;
    var scale = (targetH / info.height) * 100;
    item.resize(scale, scale, true, true, true, true, scale, Transformation.CENTER);
}

// 将对象的可视左上角移动到指定 (xLeft, yTop)
function moveItemTopLeftTo(item, xLeft, yTop) {
    var info = getVisibleInfo(item);
    var dx = xLeft - info.left;
    var dy = yTop - info.top;
    item.translate(dx, dy);
}

/**
 * Grid 排序：自动按“行”聚类，行从上到下、行内从左到右
 * （阅读顺序，适合自动识别网格状摆放的所选对象）
 */
function getGridOrderedItems(arr) {
    var items = [];
    for (var i = 0; i < arr.length; i++) {
        var info = getVisibleInfo(arr[i]);
        items.push({
            item: arr[i],
            left: info.left,
            top: info.top,
            bottom: info.bottom,
            cy: (info.top + info.bottom) / 2
        });
    }
    // 先按 top 从高到低（上方在前）
    items.sort(function (a, b) { return b.top - a.top; });

    // 聚类成行：垂直中心落在已有行的垂直范围内则归入该行
    var rows = []; // 每行: { top, bottom, members: [] }
    for (var j = 0; j < items.length; j++) {
        var it = items[j];
        var placed = false;
        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            if (it.cy <= row.top && it.cy >= row.bottom) {
                row.members.push(it);
                if (it.top > row.top) row.top = it.top;
                if (it.bottom < row.bottom) row.bottom = it.bottom;
                placed = true;
                break;
            }
        }
        if (!placed) {
            rows.push({ top: it.top, bottom: it.bottom, members: [it] });
        }
    }

    // 行从上到下排序，行内从左到右排序
    rows.sort(function (a, b) { return b.top - a.top; });
    var result = [];
    for (var k = 0; k < rows.length; k++) {
        var members = rows[k].members;
        members.sort(function (a, b) { return a.left - b.left; });
        for (var m = 0; m < members.length; m++) result.push(members[m].item);
    }
    return result;
}

/**
 * 根据 order 与 reverse 对 selection 进行排序
 * order: "stacking" | "horizontal" | "vertical" | "grid"
 * reverse: boolean
 */
function getOrderedSelection(selection, order, reverse) {
    var arr = [];
    for (var i = 0; i < selection.length; i++) arr.push(selection[i]);

    var ord = order || "stacking";
    if (ord === "grid") {
        arr = getGridOrderedItems(arr);
    } else if (ord === "horizontal" || ord === "vertical") {
        arr.sort(function (a, b) {
            var ia = getVisibleInfo(a);
            var ib = getVisibleInfo(b);
            var cxA = ia.left;
            var cyA = ia.top;
            var cxB = ib.left;
            var cyB = ib.top;

            if (ord === "horizontal") {
                // 从左到右
                if (cxA < cxB) return -1;
                if (cxA > cxB) return 1;
                // 次级按 Y 从上到下（top 值大在前）
                if (cyA > cyB) return -1;
                if (cyA < cyB) return 1;
                return 0;
            } else {
                // vertical: 从上到下（上方的 top 值更大，应排在前）
                if (cyA > cyB) return -1;
                if (cyA < cyB) return 1;
                // 次级按 X 从左到右
                if (cxA < cxB) return -1;
                if (cxA > cxB) return 1;
                return 0;
            }
        });
    } // stacking: 保持原顺序

    if (reverse) {
        var i = 0, j = arr.length - 1, tmp;
        while (i < j) {
            tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            i++; j--;
        }
    }
    return arr;
}

/**
 * Auto Layout：根据选中对象当前的排布自动识别行与列，
 * 然后将它们对齐到整齐的网格（行顶对齐、列左对齐，使用统一间距）
 * rowGapPt / colGapPt 单位为 pt；useWidth/useHeight 控制是否先统一缩放
 * alignEdges: 每行首对象左对齐、末对象右对齐，行内间距自动均分（忽略 colGapPt）
 * layoutWidthPt: alignEdges 时布局的总宽度（pt），<=0 表示保持当前整体宽度
 */
function autoArrangeLayout(selection, rowGapPt, colGapPt, useWidth, wValPt, useHeight, hValPt, alignEdges, layoutWidthPt) {
    var items = [];
    for (var i = 0; i < selection.length; i++) {
        var it = selection[i];
        // 可选：先统一缩放（基于可视宽/高）
        if (useHeight && hValPt > 0) scaleItemToVisibleHeight(it, hValPt);
        if (useWidth && wValPt > 0) scaleItemToVisibleWidth(it, wValPt);
        var info = getVisibleInfo(it);
        items.push({
            item: it,
            left: info.left,
            top: info.top,
            right: info.right,
            bottom: info.bottom,
            width: info.width,
            height: info.height,
            cx: (info.left + info.right) / 2,
            cy: (info.top + info.bottom) / 2
        });
    }

    // 行聚类：垂直中心落在已有行的垂直范围内则归入该行
    items.sort(function (a, b) { return b.top - a.top; });
    var rows = []; // { top, bottom, members: [] }
    for (var j = 0; j < items.length; j++) {
        var itj = items[j];
        var rowPlaced = false;
        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            if (itj.cy <= row.top && itj.cy >= row.bottom) {
                row.members.push(itj);
                if (itj.top > row.top) row.top = itj.top;
                if (itj.bottom < row.bottom) row.bottom = itj.bottom;
                rowPlaced = true;
                break;
            }
        }
        if (!rowPlaced) rows.push({ top: itj.top, bottom: itj.bottom, members: [itj] });
    }
    rows.sort(function (a, b) { return b.top - a.top; });

    // 记录每个对象所属的行
    var r2, m;
    for (r2 = 0; r2 < rows.length; r2++) {
        for (m = 0; m < rows[r2].members.length; m++) rows[r2].members[m].row = r2;
    }

    // 行高 = 行内最大高度
    var rowHeights = [];
    for (r2 = 0; r2 < rows.length; r2++) {
        var h = 0;
        for (m = 0; m < rows[r2].members.length; m++) {
            if (rows[r2].members[m].height > h) h = rows[r2].members[m].height;
        }
        rowHeights.push(h);
    }

    // 起始点：整体可视左上；endX：整体最右边缘
    var startX = items[0].left, startY = items[0].top, endX = items[0].right;
    for (var s = 1; s < items.length; s++) {
        if (items[s].left < startX) startX = items[s].left;
        if (items[s].top > startY) startY = items[s].top;
        if (items[s].right > endX) endX = items[s].right;
    }

    // 计算每行的 top（行间距统一）
    var rowTops = [], y = startY;
    for (r2 = 0; r2 < rows.length; r2++) {
        rowTops.push(y);
        y -= (rowHeights[r2] + rowGapPt);
    }

    if (alignEdges) {
        // 左右边对齐：每行首对象左对齐 startX、末对象右对齐 endX，行内间距自动均分
        // 1. 计算所有行中最大的一行对象宽度之和 (maxRowObjectWidthPt)
        var maxRowObjectWidthPt = 0;
        for (r2 = 0; r2 < rows.length; r2++) {
            var rowWidthSum = 0;
            for (m = 0; m < rows[r2].members.length; m++) {
                rowWidthSum += rows[r2].members[m].width;
            }
            if (rowWidthSum > maxRowObjectWidthPt) {
                maxRowObjectWidthPt = rowWidthSum;
            }
        }

        // 2. Layout Width 最小值不小于一行对象宽度之和；若用户设置小于该值，重置为该值
        var targetLayoutWidthPt = layoutWidthPt;
        if (targetLayoutWidthPt < maxRowObjectWidthPt) {
            targetLayoutWidthPt = maxRowObjectWidthPt;
        }

        endX = startX + targetLayoutWidthPt;

        for (r2 = 0; r2 < rows.length; r2++) {
            var members = rows[r2].members.slice().sort(function (a, b) { return a.left - b.left; });
            if (members.length === 1) {
                moveItemTopLeftTo(members[0].item, startX, rowTops[r2]);
                continue;
            }
            var totalItemW = 0;
            for (m = 0; m < members.length; m++) totalItemW += members[m].width;
            var gap = ((endX - startX) - totalItemW) / (members.length - 1);
            var x = startX;
            for (m = 0; m < members.length; m++) {
                moveItemTopLeftTo(members[m].item, x, rowTops[r2]);
                x += members[m].width + gap;
            }
        }
        var resWidthMm = Math.round(pointsToMm(targetLayoutWidthPt) * 100) / 100;
        return '{"layoutWidth":' + resWidthMm + '}';
    }

    // 列聚类：水平中心落在已有列的水平范围内则归入该列
    var byLeft = items.slice().sort(function (a, b) { return a.left - b.left; });
    var cols = []; // { left, right, members: [] }
    for (var k = 0; k < byLeft.length; k++) {
        var itk = byLeft[k];
        var colPlaced = false;
        for (var c = 0; c < cols.length; c++) {
            var col = cols[c];
            if (itk.cx >= col.left && itk.cx <= col.right) {
                col.members.push(itk);
                if (itk.left < col.left) col.left = itk.left;
                if (itk.right > col.right) col.right = itk.right;
                colPlaced = true;
                break;
            }
        }
        if (!colPlaced) cols.push({ left: itk.left, right: itk.right, members: [itk] });
    }
    cols.sort(function (a, b) { return a.left - b.left; });

    // 记录每个对象所属的列
    var c2, n;
    for (c2 = 0; c2 < cols.length; c2++) {
        for (n = 0; n < cols[c2].members.length; n++) cols[c2].members[n].col = c2;
    }

    // 列宽 = 列内最大宽度
    var colWidths = [];
    for (c2 = 0; c2 < cols.length; c2++) {
        var w = 0;
        for (n = 0; n < cols[c2].members.length; n++) {
            if (cols[c2].members[n].width > w) w = cols[c2].members[n].width;
        }
        colWidths.push(w);
    }

    // 计算每列的 left（列间距统一）
    var colLefts = [], x = startX;
    for (c2 = 0; c2 < cols.length; c2++) {
        colLefts.push(x);
        x += (colWidths[c2] + colGapPt);
    }

    // 移动每个对象到网格位置
    for (var t = 0; t < items.length; t++) {
        moveItemTopLeftTo(items[t].item, colLefts[items[t].col], rowTops[items[t].row]);
    }
}

function arrangeImages(columns, rowGap, colGap, useWidth, wVal, useHeight, hVal, order, reverseOrder, autoLayout, alignEdges, layoutWidth) {
    if (app.documents.length === 0) return;

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length === 0) {
        alert("Please select items to arrange");
        return;
    }

    // Convert mm values to points
    var rowGapPt = mmToPoints(rowGap);
    var colGapPt = mmToPoints(colGap);
    var wValPt = useWidth ? mmToPoints(wVal) : 0;
    var hValPt = useHeight ? mmToPoints(hVal) : 0;
    var layoutWidthPt = mmToPoints(layoutWidth || 0);

    // Auto Layout：根据当前排布自动识别行列并对齐（忽略 columns 与 order）
    if (autoLayout) {
        return autoArrangeLayout(selection, rowGapPt, colGapPt, useWidth, wValPt, useHeight, hValPt, !!alignEdges, layoutWidthPt);
    }

    // 使用排序后的序列进行排列
    var ordered = getOrderedSelection(selection, order || "stacking", !!reverseOrder);

    // 先按需要统一缩放（基于可视宽/高）
    for (var i = 0; i < ordered.length; i++) {
        var it = ordered[i];
        if (useHeight && hVal > 0) {
            scaleItemToVisibleHeight(it, hValPt);
        }
        if (useWidth && wVal > 0) {
            scaleItemToVisibleWidth(it, wValPt);
        }
    }

    // 非 autoLayout 模式下使用 Align Edges
    if (alignEdges) {
        var colsNum = parseInt(columns) || 1;
        if (colsNum < 1) colsNum = 1;

        // 按 columns 将 ordered 分为多行
        var nonAutoRows = [];
        var currentRow = [];
        for (var k = 0; k < ordered.length; k++) {
            currentRow.push(ordered[k]);
            if (currentRow.length === colsNum || k === ordered.length - 1) {
                nonAutoRows.push(currentRow);
                currentRow = [];
            }
        }

        // 计算每行对象宽度之和，找到最大的一行对象宽度之和 (maxRowObjectWidthPt)
        var maxRowObjectWidthPt = 0;
        var rowHeights = [];
        for (var r = 0; r < nonAutoRows.length; r++) {
            var rMembers = nonAutoRows[r];
            var sumW = 0;
            var maxH = 0;
            for (var m = 0; m < rMembers.length; m++) {
                var info = getVisibleInfo(rMembers[m]);
                sumW += info.width;
                if (info.height > maxH) maxH = info.height;
            }
            if (sumW > maxRowObjectWidthPt) maxRowObjectWidthPt = sumW;
            rowHeights.push(maxH);
        }

        // Layout Width 最小值不小于一行对象宽度之和；若用户设置小于该值，重置为该值
        var targetLayoutWidthPt = layoutWidthPt;
        if (targetLayoutWidthPt < maxRowObjectWidthPt) {
            targetLayoutWidthPt = maxRowObjectWidthPt;
        }

        // 起点：第一个对象的可视左上
        var firstInfo = getVisibleInfo(ordered[0]);
        var startX = firstInfo.left;
        var currentY = firstInfo.top;

        for (var r = 0; r < nonAutoRows.length; r++) {
            var rMembers = nonAutoRows[r];
            var rowH = rowHeights[r];

            if (rMembers.length === 1) {
                moveItemTopLeftTo(rMembers[0], startX, currentY);
            } else {
                var totalItemW = 0;
                for (var m = 0; m < rMembers.length; m++) {
                    totalItemW += getVisibleInfo(rMembers[m]).width;
                }
                var gap = (targetLayoutWidthPt - totalItemW) / (rMembers.length - 1);
                var x = startX;
                for (var m = 0; m < rMembers.length; m++) {
                    var itemM = rMembers[m];
                    moveItemTopLeftTo(itemM, x, currentY);
                    x += getVisibleInfo(itemM).width + gap;
                }
            }
            currentY -= (rowH + rowGapPt);
        }

        var resWidthMm = Math.round(pointsToMm(targetLayoutWidthPt) * 100) / 100;
        return '{"layoutWidth":' + resWidthMm + '}';
    }

    // 起点：排序后第一个对象的可视左上
    var firstInfo = getVisibleInfo(ordered[0]);
    var startX = firstInfo.left;
    var currentY = firstInfo.top;

    // Arrange items using current position tracking (基于可视尺寸与位置)
    var currentX = startX;
    var maxRowHeight = 0;
    var count = 0;

    for (var j = 0; j < ordered.length; j++) {
        var item = ordered[j];
        // 将当前 item 的可视左上角对齐到 currentX/currentY
        moveItemTopLeftTo(item, currentX, currentY);

        // 获取对齐后的最新可视信息
        var infoAfter = getVisibleInfo(item);

        // 更新本行最大“可视高度”
        if (infoAfter.height > maxRowHeight) {
            maxRowHeight = infoAfter.height;
        }

        count++;
        if (count < columns) {
            // 横向推进：可视宽度 + 列间距
            currentX += infoAfter.width + colGapPt;
        } else {
            // 换行
            count = 0;
            currentX = startX;
            currentY -= maxRowHeight + rowGapPt;
            maxRowHeight = 0;
        }
    }
    return '{"success":true}';
}

function addLabelsToImages(fontFamily, fontSize, fontBold, labelOffsetX, labelOffsetY, labelTemplate, fontColor, order, reverseOrder, startCount, sessionId) {
    if (app.documents.length === 0) return "Error: No document open.";

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length === 0) {
        return "Error: Please select items to label";
    }

    startCount = parseInt(startCount) || 1;
    var startIndex = startCount - 1;

    var templates = {
        "A": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "a": "abcdefghijklmnopqrstuvwxyz",
        "(A)": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "(a)": "abcdefghijklmnopqrstuvwxyz",
        "A)": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "a)": "abcdefghijklmnopqrstuvwxyz"
    };

    var labels = templates[labelTemplate] || templates["A"];
    var ordered = getOrderedSelection(selection, order || "stacking", !!reverseOrder);

    for (var i = 0; i < ordered.length; i++) {
        try {
            var item = ordered[i];
            var labelIndex = (startIndex + i) % labels.length;
            var label = labels[labelIndex];
            if (labelTemplate === "A)" || labelTemplate === "a)") {
                label += ")";
            } else if (labelTemplate === "(A)" || labelTemplate === "(a)") {
                label = "(" + label + ")";
            }
            var v = getVisibleInfo(item);
            var textFrame = doc.textFrames.add();
            textFrame.contents = label;
            // 将标签放在可视左上位置并加偏移
            textFrame.top = v.top - labelOffsetY;
            textFrame.left = v.left + labelOffsetX;

            // Style
            textFrame.textRange.characterAttributes.size = fontSize;
            try {
                var resolved = getFontFullName(fontFamily, !!fontBold);
                try {
                    textFrame.textRange.characterAttributes.textFont = app.textFonts.getByName(resolved);
                } catch (e) {
                    // Fallback: try the raw fontFamily; if that fails, bubble up error
                    textFrame.textRange.characterAttributes.textFont = app.textFonts.getByName(fontFamily);
                }
            } catch (e) {
                return "Error: Font not found: " + fontFamily;
            }

            // Set font color
            try {
                var color = new RGBColor();
                color.red = parseInt(fontColor.substring(1, 3), 16);
                color.green = parseInt(fontColor.substring(3, 5), 16);
                color.blue = parseInt(fontColor.substring(5, 7), 16);
                textFrame.textRange.characterAttributes.fillColor = color;
            } catch (e) {
                // If color parsing fails, use default black
                var defaultColor = new RGBColor();
                defaultColor.red = 0;
                defaultColor.green = 0;
                defaultColor.blue = 0;
                textFrame.textRange.characterAttributes.fillColor = defaultColor;
            }

            // 记录基准信息与会话ID在 note，JSON 字符串
            var payload = '{"sid":' + (sessionId || 0) + ',"baseL":' + v.left + ',"baseT":' + v.top + '}';
            try { textFrame.note = payload; } catch (e) { }
        } catch (e) {
            return "Error: Error adding label to item " + (i + 1) + ": " + e.message;
        }
    }
    return (startCount + ordered.length).toString();
}

function updateLabelIndex(fontFamily, fontSize, fontBold, labelTemplate, fontColor, order, reverseOrder, startCount) {
    if (app.documents.length === 0) return "Error: No document open.";

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length === 0) {
        return "Error: 需要选中label所在的文本框";
    }

    // 筛选出textframe类型
    var textFrames = [];
    for (var i = 0; i < selection.length; i++) {
        if (selection[i].typename === "TextFrame") {
            textFrames.push(selection[i]);
        }
    }

    if (textFrames.length === 0) {
        return "Error: 需要选中label所在的文本框";
    }

    startCount = parseInt(startCount) || 1;
    var startIndex = startCount - 1;

    var templates = {
        "A": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "a": "abcdefghijklmnopqrstuvwxyz",
        "(A)": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "(a)": "abcdefghijklmnopqrstuvwxyz",
        "A)": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "a)": "abcdefghijklmnopqrstuvwxyz"
    };

    var labels = templates[labelTemplate] || templates["A"];

    // 对textframe进行排序
    var ordered = getOrderedSelection(textFrames, order || "stacking", !!reverseOrder);

    for (var j = 0; j < ordered.length; j++) {
        try {
            var textFrame = ordered[j];
            var labelIndex = (startIndex + j) % labels.length;
            var label = labels[labelIndex];

            if (labelTemplate === "A)" || labelTemplate === "a)") {
                label += ")";
            } else if (labelTemplate === "(A)" || labelTemplate === "(a)") {
                label = "(" + label + ")";
            }

            // 更新文本内容
            textFrame.contents = label;

            // 更新字体样式
            textFrame.textRange.characterAttributes.size = fontSize;
            try {
                var resolvedUp = getFontFullName(fontFamily, !!fontBold);
                try {
                    textFrame.textRange.characterAttributes.textFont = app.textFonts.getByName(resolvedUp);
                } catch (e) {
                    // fallback to raw font family name
                    textFrame.textRange.characterAttributes.textFont = app.textFonts.getByName(fontFamily);
                }
            } catch (e) {
                // 如果字体不存在，使用默认字体
                try {
                    textFrame.textRange.characterAttributes.textFont = app.textFonts.getByName("ArialMT");
                } catch (e2) {
                    // 如果ArialMT也不存在，使用第一个可用字体
                    if (app.textFonts.length > 0) {
                        textFrame.textRange.characterAttributes.textFont = app.textFonts[0];
                    }
                }
            }

            // Set font color
            try {
                var color = new RGBColor();
                color.red = parseInt(fontColor.substring(1, 3), 16);
                color.green = parseInt(fontColor.substring(3, 5), 16);
                color.blue = parseInt(fontColor.substring(5, 7), 16);
                textFrame.textRange.characterAttributes.fillColor = color;
            } catch (e) {
                // If color parsing fails, use default black
                var defaultColor = new RGBColor();
                defaultColor.red = 0;
                defaultColor.green = 0;
                defaultColor.blue = 0;
                textFrame.textRange.characterAttributes.fillColor = defaultColor;
            }
        } catch (e) {
            return "Error: Error updating text frame " + (j + 1) + ": " + e.message;
        }
    }

    return "Success|" + ordered.length;
}

function filterTextFrames() {
    if (app.documents.length === 0) return "Error: No document open.";

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length === 0) {
        return "Error: 请先选择一些对象";
    }

    // 筛选出所有的文本框
    var textFrames = [];
    for (var i = 0; i < selection.length; i++) {
        if (selection[i].typename === "TextFrame") {
            textFrames.push(selection[i]);
        }
    }

    if (textFrames.length === 0) {
        return "Error: 选中的对象中没有文本框";
    }

    // 清空当前选择
    doc.selection = null;

    // 重新选择只包含文本框的对象
    for (var j = 0; j < textFrames.length; j++) {
        textFrames[j].selected = true;
    }

    return "Success|" + textFrames.length;
}

function filterSelection(type) {
    if (app.documents.length === 0) return "Error: No document open.";

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (!selection || selection.length === 0) {
        return "Error: Please select objects first.";
    }

    var textItems = [];
    var nonTextItems = [];

    for (var i = 0; i < selection.length; i++) {
        var item = selection[i];
        if (item.typename === "TextFrame") {
            textItems.push(item);
        } else if (item.typename === "GroupItem") {
            var subTexts = [];
            var subNonTexts = [];
            for (var g = 0; g < item.pageItems.length; g++) {
                var sub = item.pageItems[g];
                if (sub.typename === "TextFrame") {
                    subTexts.push(sub);
                } else {
                    subNonTexts.push(sub);
                }
            }
            if (subTexts.length > 0) {
                for (var st = 0; st < subTexts.length; st++) {
                    textItems.push(subTexts[st]);
                }
            }
            if (subNonTexts.length > 0 || subTexts.length === 0) {
                nonTextItems.push(item);
            }
        } else {
            nonTextItems.push(item);
        }
    }

    if (type === "textOnly") {
        if (textItems.length === 0) {
            return "Error: No text frames found in current selection.";
        }
        doc.selection = null;
        for (var t = 0; t < textItems.length; t++) {
            textItems[t].selected = true;
        }
        return "Success|" + textItems.length;
    } else if (type === "excludeText") {
        if (nonTextItems.length === 0) {
            return "Error: No non-text objects found in current selection.";
        }
        doc.selection = null;
        for (var n = 0; n < nonTextItems.length; n++) {
            nonTextItems[n].selected = true;
        }
        return "Success|" + nonTextItems.length;
    }

    return "Error: Unknown filter mode";
}

function copyRelativePosition(corner, order, reverseOrder, useArtboardRef) {
    if (app.documents.length === 0) return "Error: No document open.";

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (!selection || selection.length === 0) {
        return "Error: Please select at least one item.";
    }

    // 当仅选中 1 个对象时：复制其“相对于画板”的位置（按所选角点）
    if (selection.length === 1) {
        var it = selection[0];
        var b = getVisibleBounds(it) || it.visibleBounds;
        var x, y;
        switch (corner) {
            case "TR": x = b[2]; y = b[1]; break;
            case "BL": x = b[0]; y = b[3]; break;
            case "BR": x = b[2]; y = b[3]; break;
            default: x = b[0]; y = b[1]; break; // TL
        }
        var abIndex = useArtboardRef ? app.activeDocument.artboards.getActiveArtboardIndex() : getItemArtboardIndex(it);
        var abRect = app.activeDocument.artboards[abIndex].artboardRect; // [L, T, R, B]
        // 以画板左上为原点，X 向右为正，Y 向下为正
        var relXmm = pointsToMm(x - abRect[0]);
        var relYmm = pointsToMm(abRect[1] - y);
        return '{"abs":true,"x":' + relXmm + ',"y":' + relYmm + ',"ab":' + abIndex + '}';
    }

    // useArtboardRef 多选：将所有选中的形状位置复制为“相对于当前活动画板”的坐标列表
    if (useArtboardRef && selection.length > 1) {
        var activeAbIdx = app.activeDocument.artboards.getActiveArtboardIndex();
        var activeAbRect = app.activeDocument.artboards[activeAbIdx].artboardRect; // [L, T, R, B]

        var ordCopy = order || "stacking";
        var revOrdCopy = !!reverseOrder;
        var orderedCopy = getOrderedSelection(selection, ordCopy, revOrdCopy);

        var partsAbs = [];
        for (var m = 0; m < orderedCopy.length; m++) {
            var it = orderedCopy[m];
            var bb = getVisibleBounds(it) || it.visibleBounds;
            var cx, cy;
            switch (corner) {
                case "TR": cx = bb[2]; cy = bb[1]; break;
                case "BL": cx = bb[0]; cy = bb[3]; break;
                case "BR": cx = bb[2]; cy = bb[3]; break;
                default: cx = bb[0]; cy = bb[1]; break; // TL
            }
            var relXmmM = pointsToMm(cx - activeAbRect[0]);
            var relYmmM = pointsToMm(activeAbRect[1] - cy);
            partsAbs.push('{"abs":true,"x":' + relXmmM + ',"y":' + relYmmM + ',"ab":' + activeAbIdx + '}');
        }
        return '[' + partsAbs.join(',') + ']';
    }

    // 其余情况：沿用相对位置复制逻辑
    var ord = order || "stacking";
    var revOrd = !!reverseOrder;
    var ordered = getOrderedSelection(selection, ord, revOrd);

    // 确定参考对象 (refItem)
    // 对于堆叠顺序 (stacking)，参考对象默认为最后一个，否则为第一个
    var refItem = (ord === "stacking") ? ordered[ordered.length - 1] : ordered[0];

    // 其他所有对象为目标对象 (objItems)
    var objItems = [];
    for (var i = 0; i < ordered.length; i++) {
        if (ordered[i] !== refItem) {
            objItems.push(ordered[i]);
        }
    }

    // 使用可视边界，适配剪切蒙版/复合路径
    var refB = getVisibleBounds(refItem) || refItem.visibleBounds;
    var deltas = [];

    // 遍历所有目标对象，计算相对位置
    for (var j = 0; j < objItems.length; j++) {
        var objItem = objItems[j];
        var objB = getVisibleBounds(objItem) || objItem.visibleBounds;

        var x1, y1, x2, y2;
        // 基于角点取坐标
        switch (corner) {
            case "TR": x1 = refB[2]; y1 = refB[1]; x2 = objB[2]; y2 = objB[1]; break;
            case "BL": x1 = refB[0]; y1 = refB[3]; x2 = objB[0]; y2 = objB[3]; break;
            case "BR": x1 = refB[2]; y1 = refB[3]; x2 = objB[2]; y2 = objB[3]; break;
            default: x1 = refB[0]; y1 = refB[1]; x2 = objB[0]; y2 = objB[1]; break; // TL
        }

        var deltaX = x2 - x1;
        var deltaY = y2 - y1;

        deltas.push({
            deltaX: pointsToMm(deltaX),
            deltaY: pointsToMm(deltaY)
        });
    }

    return simpleJsonStringify(deltas);
}

function pasteRelativePosition(deltasJSON, reverse, corner, order, reverseOrder, overrideDeltaX, overrideDeltaY, allowMismatch, useArtboardRef) {
    if (app.documents.length === 0) return "Error: No document open.";

    // 允许 0 值作为覆盖坐标（只要不是 null 且是数字）
    var useOverride = (overrideDeltaX !== null && overrideDeltaY !== null &&
        !isNaN(overrideDeltaX) && !isNaN(overrideDeltaY));

    var doc = app.activeDocument;
    var selection = doc.selection;

    // 解析传入数据，支持绝对位置对象或相对位移数组
    var data = null;
    if (deltasJSON && deltasJSON !== '[]') {
        try {
            data = eval('(' + deltasJSON + ')');
        } catch (e) {
            // 保持为 null，后续分支会处理
        }
    }
    var isAbs = (data && typeof data === "object" && data.abs === true);
    var isAbsArray = (data && typeof data.length !== "undefined" && data.length > 0 && typeof data[0].x !== "undefined");

    // 绝对位置粘贴：支持 单对象 abs、abs 数组、或在 useArtboardRef 勾选下使用覆盖坐标
    if (isAbs || isAbsArray || (useArtboardRef && useOverride)) {
        if (!selection || selection.length === 0) {
            return "Error: Please select items to move.";
        }

        // 使用排序后的选择，保证与复制/用户期望的一致顺序
        var ordAbs = order || "stacking";
        var revOrdAbs = !!reverseOrder;
        var orderedAbs = getOrderedSelection(selection, ordAbs, revOrdAbs);

        // 覆盖坐标：所有对象使用相同的画板相对坐标（各自画板）
        if (useArtboardRef && useOverride) {
            var ox = overrideDeltaX;
            var oy = overrideDeltaY;
            for (var i = 0; i < orderedAbs.length; i++) {
                var obj = orderedAbs[i];
                var objB = getVisibleBounds(obj) || obj.visibleBounds;

                var objAbIdx = getItemArtboardIndex(obj);
                var objAbRect = doc.artboards[objAbIdx].artboardRect; // [L, T, R, B]
                var targetXAbs = objAbRect[0] + mmToPoints(ox);
                var targetYAbs = objAbRect[1] - mmToPoints(oy);

                switch (corner) {
                    case "TR":
                        obj.translate(targetXAbs - objB[2], targetYAbs - objB[1]);
                        break;
                    case "BL":
                        obj.translate(targetXAbs - objB[0], targetYAbs - objB[3]);
                        break;
                    case "BR":
                        obj.translate(targetXAbs - objB[2], targetYAbs - objB[3]);
                        break;
                    default: // TL
                        obj.translate(targetXAbs - objB[0], targetYAbs - objB[1]);
                        break;
                }
            }
            return "Success";
        }

        // 单对象 abs：所有对象贴到统一画板相对坐标（各自画板）
        if (isAbs) {
            var targetXmm = data.x;
            var targetYmm = data.y;
            for (var j = 0; j < orderedAbs.length; j++) {
                var obj1 = orderedAbs[j];
                var objB1 = getVisibleBounds(obj1) || obj1.visibleBounds;

                var objAbIdx1 = getItemArtboardIndex(obj1);
                var objAbRect1 = doc.artboards[objAbIdx1].artboardRect;
                var targetXAbs1 = objAbRect1[0] + mmToPoints(targetXmm);
                var targetYAbs1 = objAbRect1[1] - mmToPoints(targetYmm);

                switch (corner) {
                    case "TR":
                        obj1.translate(targetXAbs1 - objB1[2], targetYAbs1 - objB1[1]);
                        break;
                    case "BL":
                        obj1.translate(targetXAbs1 - objB1[0], targetYAbs1 - objB1[3]);
                        break;
                    case "BR":
                        obj1.translate(targetXAbs1 - objB1[2], targetYAbs1 - objB1[3]);
                        break;
                    default: // TL
                        obj1.translate(targetXAbs1 - objB1[0], targetYAbs1 - objB1[1]);
                        break;
                }
            }
            return "Success";
        }

        // abs 数组：每个对象使用对应条目的画板相对坐标（可循环）
        var absArr = data;
        if ((orderedAbs.length !== absArr.length) && !allowMismatch) {
            return "Error: The number of items to move (" + orderedAbs.length + ") does not match the saved data count (" + absArr.length + ").";
        }
        for (var k = 0; k < orderedAbs.length; k++) {
            var entry = absArr[k % absArr.length];
            var obj2 = orderedAbs[k];
            var objB2 = getVisibleBounds(obj2) || obj2.visibleBounds;

            var objAbIdx2 = getItemArtboardIndex(obj2);
            var objAbRect2 = doc.artboards[objAbIdx2].artboardRect;
            var targetXAbs2 = objAbRect2[0] + mmToPoints(entry.x);
            var targetYAbs2 = objAbRect2[1] - mmToPoints(entry.y);

            switch (corner) {
                case "TR":
                    obj2.translate(targetXAbs2 - objB2[2], targetYAbs2 - objB2[1]);
                    break;
                case "BL":
                    obj2.translate(targetXAbs2 - objB2[0], targetYAbs2 - objB2[3]);
                    break;
                case "BR":
                    obj2.translate(targetXAbs2 - objB2[2], targetYAbs2 - objB2[3]);
                    break;
                default: // TL
                    obj2.translate(targetXAbs2 - objB2[0], targetYAbs2 - objB2[1]);
                    break;
            }
        }
        return "Success";
    }

    // 相对位置粘贴
    // 当未复制相对数据但提供了覆盖数值时，也允许继续（覆盖作为相对位移）
    var deltas;
    if (useOverride) {
        deltas = [{ deltaX: overrideDeltaX, deltaY: overrideDeltaY }];
    } else {
        if (!deltasJSON) return "Error: No relative position data provided.";
        try {
            deltas = data || eval('(' + deltasJSON + ')');
            if (!deltas || typeof deltas.length === "undefined") throw new Error("Invalid data format.");
        } catch (e) {
            return "Error: Invalid relative position data. " + e.message;
        }
        if (deltas.length === 0) {
            return "Error: No relative position data provided.";
        }
    }

    if (!selection || selection.length < 2) {
        return "Error: Please select at least two items.";
    }

    if (!useOverride && (selection.length - 1 !== deltas.length) && !allowMismatch) {
        return "Error: The number of items to move (" + (selection.length - 1) + ") does not match the saved data count (" + deltas.length + ").";
    }

    var ord = order || "stacking";
    var revOrd = !!reverseOrder;

    var ordered = getOrderedSelection(selection, ord, revOrd);

    var newReference = (ord === "stacking") ? ordered[ordered.length - 1] : ordered[0];

    var objectsToMove = [];
    for (var i = 0; i < ordered.length; i++) {
        if (ordered[i] !== newReference) {
            objectsToMove.push(ordered[i]);
        }
    }

    var refBounds = getVisibleBounds(newReference) || newReference.visibleBounds;

    for (var k = 0; k < objectsToMove.length; k++) {
        var objectToMove = objectsToMove[k];
        var objBounds = getVisibleBounds(objectToMove) || objectToMove.visibleBounds;

        var idx = k % deltas.length;
        var delta = deltas[idx];
        var deltaXPt = mmToPoints(delta.deltaX);
        var deltaYPt = mmToPoints(delta.deltaY);

        var newX, newY;

        switch (corner) {
            case "TR":
                newX = refBounds[2] + deltaXPt; newY = refBounds[1] + deltaYPt;
                objectToMove.translate(newX - objBounds[2], newY - objBounds[1]);
                break;
            case "BL":
                newX = refBounds[0] + deltaXPt; newY = refBounds[3] + deltaYPt;
                objectToMove.translate(newX - objBounds[0], newY - objBounds[3]);
                break;
            case "BR":
                newX = refBounds[2] + deltaXPt; newY = refBounds[3] + deltaYPt;
                objectToMove.translate(newX - objBounds[2], newY - objBounds[3]);
                break;
            default: // TL
                newX = refBounds[0] + deltaXPt; newY = refBounds[1] + deltaYPt;
                objectToMove.translate(newX - objBounds[0], newY - objBounds[1]);
                break;
        }
    }

    return "Success";
}

function copySize() {
    if (app.documents.length === 0) return "Error: No document open.";
    var selection = app.activeDocument.selection;
    if (selection.length === 0) return "Error: Please select an item.";

    var item = selection[0];
    var info = getVisibleInfo(item);

    var size = {
        width: pointsToMm(info.width),
        height: pointsToMm(info.height)
    };
    return '{"width":' + size.width + ',"height":' + size.height + '}';
}

function pasteSize(width, height, useW, useH) {
    if (app.documents.length === 0) return "Error: No document open.";

    var selection = app.activeDocument.selection;
    if (selection.length === 0) return "Error: Please select items to resize.";

    if (!useW && !useH) return "Success: No action taken.";

    var targetWidthPt = useW ? mmToPoints(width) : 0;
    var targetHeightPt = useH ? mmToPoints(height) : 0;

    for (var i = 0; i < selection.length; i++) {
        var item = selection[i];
        var info = getVisibleInfo(item);

        if (info.width <= 0 || info.height <= 0) continue;

        var scaleX = 100, scaleY = 100;

        if (useW && useH) {
            // Both are checked, non-uniform scale
            scaleX = (targetWidthPt / info.width) * 100;
            scaleY = (targetHeightPt / info.height) * 100;
        } else if (useW) {
            // Only width is checked, uniform scale
            scaleX = scaleY = (targetWidthPt / info.width) * 100;
        } else if (useH) {
            // Only height is checked, uniform scale
            scaleX = scaleY = (targetHeightPt / info.height) * 100;
        }

        item.resize(scaleX, scaleY, true, true, true, true, 100, Transformation.CENTER);
    }
    return "Success";
}

/**
 * Swap positions of exactly two selected items based on their visible top-left corners.
 * Returns "Success" or "Error: ..." string for host to handle.
 */
/**
 * Swap positions of exactly two selected items based on a chosen corner.
 * corner: "TL" | "TR" | "BL" | "BR" (defaults to "TL")
 * Returns "Success" or "Error: ..."
 */
function swapSelectedPositions(corner) {
    if (app.documents.length === 0) return "Error: No document open.";
    var selection = app.activeDocument.selection;
    if (!selection || selection.length !== 2) {
        return "Error: Please select exactly two items.";
    }

    corner = corner || "TL";

    var a = selection[0];
    var b = selection[1];

    var ia = getVisibleInfo(a);
    var ib = getVisibleInfo(b);

    // Helper to get corner coords
    function cornerCoords(info, c) {
        switch (c) {
            case "TR": return { x: info.right, y: info.top };
            case "BL": return { x: info.left, y: info.bottom };
            case "BR": return { x: info.right, y: info.bottom };
            default: // "TL"
                return { x: info.left, y: info.top };
        }
    }

    var aCorner = cornerCoords(ia, corner);
    var bCorner = cornerCoords(ib, corner);

    // Move each item so its chosen corner becomes the other's original corner
    try {
        // For item a: move its corner to bCorner
        var aBounds = getVisibleBounds(a) || a.visibleBounds;
        var aX, aY;
        switch (corner) {
            case "TR": aX = aBounds[2]; aY = aBounds[1]; break;
            case "BL": aX = aBounds[0]; aY = aBounds[3]; break;
            case "BR": aX = aBounds[2]; aY = aBounds[3]; break;
            default: aX = aBounds[0]; aY = aBounds[1]; break; // TL
        }
        a.translate(bCorner.x - aX, bCorner.y - aY);

        // For item b: move its corner to aCorner
        var bBounds = getVisibleBounds(b) || b.visibleBounds;
        var bX, bY;
        switch (corner) {
            case "TR": bX = bBounds[2]; bY = bBounds[1]; break;
            case "BL": bX = bBounds[0]; bY = bBounds[3]; break;
            case "BR": bX = bBounds[2]; bY = bBounds[3]; break;
            default: bX = bBounds[0]; bY = bBounds[1]; break; // TL
        }
        b.translate(aCorner.x - bX, aCorner.y - bY);
    } catch (e) {
        return "Error: " + e.message;
    }

    return "Success";
}

/**
 * Distribute spacing evenly between multiple selected objects.
 * direction: "horizontal" | "vertical"
 * Keeps the first and last item positions fixed, adjusts middle items so
 * gaps between adjacent visible edges are equal.
 */
function distributeSpacing(direction) {
    if (app.documents.length === 0) return "Error: No document open.";
    var selection = app.activeDocument.selection;
    if (!selection || selection.length < 3) {
        return "Error: Please select at least three items.";
    }

    var dir = direction || "horizontal";
    var ord = (dir === "horizontal") ? "horizontal" : "vertical";
    var ordered = getOrderedSelection(selection, ord, false);
    var n = ordered.length;

    // Collect visible infos and widths/heights
    var infos = [];
    for (var i = 0; i < n; i++) {
        infos.push(getVisibleInfo(ordered[i]));
    }

    if (dir === "horizontal") {
        var x0 = infos[0].left;
        var xLast = infos[n - 1].left;
        // sum widths of items 0 .. n-2
        var sumWidths = 0;
        for (var j = 0; j < n - 1; j++) {
            sumWidths += infos[j].width;
        }
        var gapsCount = n - 1;
        var gap = (xLast - x0 - sumWidths) / gapsCount;

        // place middle items
        var acc = x0;
        for (var k = 0; k < n; k++) {
            if (k === 0) {
                acc += infos[k].width + gap; // move acc to next start
                continue;
            }
            if (k === n - 1) break; // last item fixed

            var targetLeft = acc;
            var curLeft = infos[k].left;
            var dx = targetLeft - curLeft;
            ordered[k].translate(dx, 0);

            // update acc by this item's width + gap
            acc = targetLeft + infos[k].width + gap;
        }

        return "Success";
    } else {
        // vertical: compute gap and place items top->down
        var yTopFirst = infos[0].top;
        var yBottomLast = infos[n - 1].bottom;
        var sumHeights = 0;
        // sum heights of all items
        for (var m = 0; m < n; m++) {
            sumHeights += infos[m].height;
        }
        var gapsCountV = n - 1;
        // total available space between first top and last bottom
        var totalSpan = yTopFirst - yBottomLast;
        var gapV = (totalSpan - sumHeights) / gapsCountV;

        // place middle items (keep first and last fixed)
        var acc = yTopFirst;
        for (var k2 = 1; k2 < n - 1; k2++) {
            // compute target top for item k2: previous bottom - gap (top decreases downwards)
            acc = acc - (infos[k2 - 1].height + gapV);
            var targetTop = acc;
            var curTop = infos[k2].top;
            var dy = targetTop - curTop;
            ordered[k2].translate(0, dy);
        }

        return "Success";
    }
}

/**
 * measureSpacing
 * Computes horizontal and vertical spacing between two selected items (based on visible bounds)
 * Returns JSON string: { horizontal: <mm>, vertical: <mm>, euclidean: <mm> }
 */
function measureSpacing() {
    if (app.documents.length === 0) return "Error: No document open.";
    var sel = app.activeDocument.selection;
    if (!sel || sel.length !== 2) {
        return "Error: Please select exactly two items.";
    }

    var a = sel[0];
    var b = sel[1];
    var ia = getVisibleInfo(a);
    var ib = getVisibleInfo(b);

    // horizontal gap: compute overlap on X; if overlap => 0 else gap = max(lefts) - min(rights)
    var minRight = Math.min(ia.right, ib.right);
    var maxLeft = Math.max(ia.left, ib.left);
    var gapXpt = 0;
    if (minRight < maxLeft) {
        gapXpt = maxLeft - minRight;
    } else {
        gapXpt = 0;
    }

    // vertical gap: intervals [bottom, top]
    var minTop = Math.min(ia.top, ib.top);
    var maxBottom = Math.max(ia.bottom, ib.bottom);
    var gapYpt = 0;
    if (maxBottom > minTop) {
        // no overlap: gap = maxBottom - minTop
        gapYpt = maxBottom - minTop;
    } else {
        gapYpt = 0;
    }

    var gapXmm = pointsToMm(gapXpt);
    var gapYmm = pointsToMm(gapYpt);

    // euclidean distance between closest edges
    var euclidPt = 0;
    if (gapXpt === 0 && gapYpt === 0) {
        euclidPt = 0;
    } else if (gapXpt === 0) {
        euclidPt = Math.abs(gapYpt);
    } else if (gapYpt === 0) {
        euclidPt = Math.abs(gapXpt);
    } else {
        euclidPt = Math.sqrt(gapXpt * gapXpt + gapYpt * gapYpt);
    }

    var euclidMm = pointsToMm(euclidPt);

    var out = {
        horizontal: parseFloat(gapXmm.toFixed(3)),
        vertical: parseFloat(gapYmm.toFixed(3)),
        euclidean: parseFloat(euclidMm.toFixed(3))
    };

    return JSON.stringify(out);
}


/**
 * copySpacing
 * Copies the spacing between two selected items in the specified direction.
 * direction: "horizontal" | "vertical"
 * Returns spacing in mm as string.
 */
function copySpacing(direction) {
    if (app.documents.length === 0) return "Error: No document open.";
    var sel = app.activeDocument.selection;
    if (!sel || sel.length !== 2) {
        return "Error: Please select exactly two items.";
    }

    // Sort the two items from top to bottom or left to right
    var ordered = getOrderedSelection(sel, direction, false);
    var upperOrLeft = ordered[0];
    var lowerOrRight = ordered[1];
    var upperInfo = getVisibleInfo(upperOrLeft);
    var lowerInfo = getVisibleInfo(lowerOrRight);

    var spacingPt = 0;
    if (direction === "horizontal") {
        // horizontal gap: rightmost.left - leftmost.right
        spacingPt = lowerInfo.left - upperInfo.right;
    } else {
        // vertical gap: upper.bottom - lower.top (positive when there's a gap)
        spacingPt = upperInfo.bottom - lowerInfo.top;
    }

    var spacingMm = pointsToMm(spacingPt);
    return spacingMm.toString();
}

/**
 * pasteSpacing
 * Applies the specified spacing between multiple selected items in the specified direction.
 * direction: "horizontal" | "vertical"
 * spacingMm: spacing in millimeters
 * moveLeftOrTop: boolean, if true, move left/top items instead of right/bottom
 */
function pasteSpacing(direction, spacingMm, moveLeftOrTop) {
    if (app.documents.length === 0) return "Error: No document open.";
    var sel = app.activeDocument.selection;
    if (!sel || sel.length < 2) {
        return "Error: Please select at least two items.";
    }

    var spacingPt = mmToPoints(spacingMm);
    var ord = (direction === "horizontal") ? "horizontal" : "vertical";
    var ordered = getOrderedSelection(sel, ord, false);

    if (direction === "horizontal") {
        if (moveLeftOrTop) {
            // Move left items: from right to left
            for (var i = ordered.length - 2; i >= 0; i--) {
                var curr = ordered[i];
                var next = ordered[i + 1];
                var currInfo = getVisibleInfo(curr);
                var nextInfo = getVisibleInfo(next);
                // Move current item to next.left - spacing - curr.width
                var targetLeft = nextInfo.left - spacingPt - currInfo.width;
                var dx = targetLeft - currInfo.left;
                curr.translate(dx, 0);
            }
        } else {
            // Default: move right items from left to right
            for (var i = 1; i < ordered.length; i++) {
                var prev = ordered[i - 1];
                var curr = ordered[i];
                var prevInfo = getVisibleInfo(prev);
                var currInfo = getVisibleInfo(curr);
                var targetLeft = prevInfo.right + spacingPt;
                var dx = targetLeft - currInfo.left;
                curr.translate(dx, 0);
            }
        }
    } else {
        if (moveLeftOrTop) {
            // Move top items: from bottom to top
            for (var j = ordered.length - 2; j >= 0; j--) {
                var curr = ordered[j];
                var next = ordered[j + 1];
                var currInfo = getVisibleInfo(curr);
                var nextInfo = getVisibleInfo(next);
                // Move current item to next.top + spacing + curr.height
                var targetTop = nextInfo.top + spacingPt + currInfo.height;
                var dy = targetTop - currInfo.top;
                curr.translate(0, dy);
            }
        } else {
            // Default: move bottom items from top to bottom
            for (var j = 1; j < ordered.length; j++) {
                var prev = ordered[j - 1];
                var curr = ordered[j];
                var prevInfo = getVisibleInfo(prev);
                var currInfo = getVisibleInfo(curr);
                // 因为 top 在坐标系中随着向下减小，目标 top = prev.bottom - spacing
                var targetTop = prevInfo.bottom - spacingPt;
                var dy = targetTop - currInfo.top;
                curr.translate(0, dy);
            }
        }
    }

    return "Success";
}

/**
 * addBorder
 * Adds a border rectangle around each selected item.
 * color: hex color string like "#000000"
 * thickness: stroke width in points
 */
function addBorder(color, thickness, dash, autoGroup) {
    if (app.documents.length === 0) return "Error: No document open.";

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length === 0) {
        return "Error: Please select items to add border.";
    }

    for (var i = 0; i < selection.length; i++) {
        var item = selection[i];
        var bounds = getVisibleBounds(item) || item.visibleBounds;

        // Create rectangle: pathItems.rectangle(top, left, width, height)
        // Note: height must be positive (top - bottom), not bottom - top
        var top = bounds[1];
        var left = bounds[0];
        var width = bounds[2] - bounds[0];
        var height = bounds[1] - bounds[3];
        var rect = doc.pathItems.rectangle(top, left, width, height);

        // Set properties
        rect.filled = false;
        rect.stroked = true;

        // Parse hex color robustly (fallback to black)
        var r = 0, g = 0, b = 0;
        try {
            if (typeof color === 'string' && color.charAt(0) === '#' && color.length >= 7) {
                r = parseInt(color.substr(1, 2), 16) || 0;
                g = parseInt(color.substr(3, 2), 16) || 0;
                b = parseInt(color.substr(5, 2), 16) || 0;
            }
        } catch (e) {
            r = g = b = 0;
        }

        // Try to respect document color space. If document reports CMYK, convert RGB -> CMYK.
        try {
            var docCS = doc.documentColorSpace; // may be DocumentColorSpace.RGB or DocumentColorSpace.CMYK
        } catch (e) {
            var docCS = undefined;
        }

        // Create RGBColor first and prefer letting Illustrator convert to document color space.
        var rgbColor = new RGBColor();
        rgbColor.red = r;
        rgbColor.green = g;
        rgbColor.blue = b;

        try {
            rect.strokeColor = rgbColor;
        } catch (e) {
            // If assigning RGB fails (some older hosts), fallback to manual CMYK conversion
            try {
                var r1 = Math.max(0, Math.min(255, r)) / 255;
                var g1 = Math.max(0, Math.min(255, g)) / 255;
                var b1 = Math.max(0, Math.min(255, b)) / 255;
                var c = 1 - r1;
                var m = 1 - g1;
                var y = 1 - b1;
                var k = Math.min(c, Math.min(m, y));
                var C = 0, M = 0, Y = 0, K = 0;
                if (k >= 1.0) {
                    C = 0; M = 0; Y = 0; K = 100;
                } else {
                    var denom = (1 - k) || 1;
                    C = Math.round(((c - k) / denom) * 100);
                    M = Math.round(((m - k) / denom) * 100);
                    Y = Math.round(((y - k) / denom) * 100);
                    K = Math.round(k * 100);
                }
                var cmyk = new CMYKColor();
                cmyk.cyan = C;
                cmyk.magenta = M;
                cmyk.yellow = Y;
                cmyk.black = K;
                rect.strokeColor = cmyk;
            } catch (e2) {
                // final fallback: set RGB again and ignore error
                try { rect.strokeColor = rgbColor; } catch (ee) { }
            }
        }

        rect.strokeWidth = thickness;

        // If dash > 0, set stroke dashes: use dash gap as provided and a dash length relative to thickness
        try {
            var dashVal = (typeof dash === 'undefined' || dash === null) ? 0 : Number(dash);
            if (!isNaN(dashVal) && dashVal > 0) {
                // dash pattern: [dashLength, gapLength]
                var dashLength = Math.max(1, thickness * 2);
                rect.strokeDashes = [dashLength, dashVal];
            } else {
                // solid
                rect.strokeDashes = [];
            }
        } catch (e) {
            // In case host doesn't support strokeDashes, ignore
        }

        // 若需要自动编组，先创建组并把边框和对象按原顺序收进组；否则仅把边框移到对象上方
        if (autoGroup) {
            try {
                // 新建组（默认在当前图层最上方）
                var group = doc.groupItems.add();
                // 把对象先移进组（会保留原可视位置）
                item.move(group, ElementPlacement.PLACEATEND);
                // 再把边框移进组，置于对象上方
                rect.move(group, ElementPlacement.PLACEATBEGINNING);
                // 不再移动 group 本身，保持与原图层同级
            } catch (e) {
                // 若建组失败，回退到仅把边框放对象上方
                rect.move(item, ElementPlacement.PLACEATBEGINNING);
            }
        } else {
            // 不编组时，仅把边框移到对象上方
            rect.move(item, ElementPlacement.PLACEATBEGINNING);
        }
    }

    return "Success";
}


function updateLabelOffsets(offsetX, offsetY, sessionId) {
    if (app.documents.length === 0) return "Error: No document open.";

    var doc = app.activeDocument;
    var validCount = 0;

    for (var i = 0; i < doc.textFrames.length; i++) {
        var tf = doc.textFrames[i];
        var note = tf.note;
        if (!note || note.indexOf("sid") === -1) continue;

        try {
            var data = eval('(' + note + ')');
            if (data && data.sid == sessionId) {
                tf.left = data.baseL + offsetX;
                tf.top = data.baseT - offsetY;
                validCount++;
            }
        } catch (e) { }
    }
    return "Success";
}