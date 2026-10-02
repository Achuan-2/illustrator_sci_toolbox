// Illustrator ExtendScript Functions
// Return translation keys to the panel; ExtendScript does not load UI locales.
// URI encoding preserves separators and Unicode in dynamic error arguments.
function sciError(key, args) {
    var result = "Error: " + key;
    for (var i = 0; args && i < args.length; i++) {
        result += "|" + encodeURIComponent(String(args[i]));
    }
    return result;
}

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
 * sizeMode: "original" | "auto" | "custom"
 */
function autoArrangeLayout(selection, rowGapPt, colGapPt, useWidth, wValPt, useHeight, hValPt, alignEdges, layoutWidthPt, sizeMode) {
    if (!sizeMode) {
        sizeMode = (useWidth || useHeight) ? "custom" : "original";
    }

    var items = [];
    for (var i = 0; i < selection.length; i++) {
        var it = selection[i];
        // 自定义缩放
        if (sizeMode === "custom") {
            if (useWidth && useHeight && wValPt > 0 && hValPt > 0) {
                var initInfo = getVisibleInfo(it);
                if (initInfo.width > 0 && initInfo.height > 0) {
                    var sX = (wValPt / initInfo.width) * 100;
                    var sY = (hValPt / initInfo.height) * 100;
                    it.resize(sX, sY, true, true, true, true, 100, Transformation.CENTER);
                }
            } else if (useHeight && hValPt > 0) {
                scaleItemToVisibleHeight(it, hValPt);
            } else if (useWidth && wValPt > 0) {
                scaleItemToVisibleWidth(it, wValPt);
            }
        }
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

    // 自动调整大小模式：按行等比缩放使同一行对象高度一致（单列则按首对象宽度统一）
    if (sizeMode === "auto") {
        var isSingleCol = true;
        for (var sc = 0; sc < rows.length; sc++) {
            if (rows[sc].members.length > 1) {
                isSingleCol = false;
                break;
            }
        }

        if (isSingleCol && rows.length > 1) {
            // 单列纵向堆叠：按首个对象的宽度等比缩放
            var refW = rows[0].members[0].width;
            if (refW > 0) {
                for (var r1 = 0; r1 < rows.length; r1++) {
                    var singleMember = rows[r1].members[0];
                    scaleItemToVisibleWidth(singleMember.item, refW);
                    var updatedInfo = getVisibleInfo(singleMember.item);
                    singleMember.width = updatedInfo.width;
                    singleMember.height = updatedInfo.height;
                    singleMember.left = updatedInfo.left;
                    singleMember.right = updatedInfo.right;
                    singleMember.top = updatedInfo.top;
                    singleMember.bottom = updatedInfo.bottom;
                    singleMember.cx = (updatedInfo.left + updatedInfo.right) / 2;
                    singleMember.cy = (updatedInfo.top + updatedInfo.bottom) / 2;
                }
            }
        } else {
            // 多列/网格布局：每行内的对象统一按该行首个对象的高度等比缩放
            for (var rAuto = 0; rAuto < rows.length; rAuto++) {
                var rowMembers = rows[rAuto].members;
                if (rowMembers.length > 0) {
                    var refH = rowMembers[0].height;
                    if (refH > 0) {
                        for (var mAuto = 0; mAuto < rowMembers.length; mAuto++) {
                            var curMem = rowMembers[mAuto];
                            scaleItemToVisibleHeight(curMem.item, refH);
                            var newInfo = getVisibleInfo(curMem.item);
                            curMem.width = newInfo.width;
                            curMem.height = newInfo.height;
                            curMem.left = newInfo.left;
                            curMem.right = newInfo.right;
                            curMem.top = newInfo.top;
                            curMem.bottom = newInfo.bottom;
                            curMem.cx = (newInfo.left + newInfo.right) / 2;
                            curMem.cy = (newInfo.top + newInfo.bottom) / 2;
                        }
                    }
                }
            }
        }
    }

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
        if (sizeMode === "auto") {
            // 自动调整大小模式 + Align Edges：
            // 支持自定义 Column Gap (colGapPt)，通过等比缩放每行对象的高度，使每行对象总宽度 + 固定列间距精确填满 targetLayoutWidthPt

            // 1. 计算基准 targetLayoutWidthPt（若用户未指定 layoutWidthPt，则根据各行自然宽度 + colGapPt 取最大值）
            var targetLayoutWidthPt = layoutWidthPt;
            if (targetLayoutWidthPt <= 0) {
                var maxNaturalW = 0;
                for (var rNat = 0; rNat < rows.length; rNat++) {
                    var mNat = rows[rNat].members;
                    var rSumW = 0;
                    for (var iNat = 0; iNat < mNat.length; iNat++) {
                        rSumW += mNat[iNat].width;
                    }
                    var rTotal = rSumW + (mNat.length - 1) * colGapPt;
                    if (rTotal > maxNaturalW) maxNaturalW = rTotal;
                }
                var bbWidth = endX - startX;
                targetLayoutWidthPt = maxNaturalW > bbWidth ? maxNaturalW : bbWidth;
                if (targetLayoutWidthPt <= 0) targetLayoutWidthPt = maxNaturalW;
            }

            // 2. 对每行进行等比缩放计算
            var rowHeightsAuto = [];
            for (var rA = 0; rA < rows.length; rA++) {
                var rowMems = rows[rA].members;
                var nItems = rowMems.length;
                var aspectSum = 0;
                for (var mA = 0; mA < nItems; mA++) {
                    var infA = getVisibleInfo(rowMems[mA].item);
                    if (infA.height > 0) {
                        aspectSum += infA.width / infA.height;
                    }
                }
                var availW = targetLayoutWidthPt - (nItems - 1) * colGapPt;
                var rowH = 0;
                if (aspectSum > 0 && availW > 0) {
                    rowH = availW / aspectSum;
                    for (var mS = 0; mS < nItems; mS++) {
                        scaleItemToVisibleHeight(rowMems[mS].item, rowH);
                        var updated = getVisibleInfo(rowMems[mS].item);
                        rowMems[mS].width = updated.width;
                        rowMems[mS].height = updated.height;
                    }
                } else if (nItems > 0) {
                    rowH = getVisibleInfo(rowMems[0].item).height;
                }
                rowHeightsAuto.push(rowH);
            }

            // 3. 重新计算 rowTops
            var rowTopsAuto = [], yAuto = startY;
            for (r2 = 0; r2 < rows.length; r2++) {
                rowTopsAuto.push(yAuto);
                yAuto -= (rowHeightsAuto[r2] + rowGapPt);
            }

            // 4. 摆放对象（使用精确的 colGapPt 间距）
            for (r2 = 0; r2 < rows.length; r2++) {
                var members = rows[r2].members.slice().sort(function (a, b) { return a.left - b.left; });
                if (members.length === 1) {
                    moveItemTopLeftTo(members[0].item, startX, rowTopsAuto[r2]);
                } else {
                    var x = startX;
                    for (var m = 0; m < members.length; m++) {
                        var memItem = members[m].item;
                        moveItemTopLeftTo(memItem, x, rowTopsAuto[r2]);
                        x += getVisibleInfo(memItem).width + colGapPt;
                    }
                }
            }

            var resWidthMm = Math.round(pointsToMm(targetLayoutWidthPt) * 100) / 100;
            return '{"layoutWidth":' + resWidthMm + '}';
        }

        // 非 auto 模式（original 或 custom）：对象尺寸固定，间距自动均分
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
    return '{"success":true}';
}

function arrangeImages(columns, rowGap, colGap, useWidth, wVal, useHeight, hVal, order, reverseOrder, autoLayout, alignEdges, layoutWidth, sizeMode) {
    if (app.documents.length === 0) return sciError("errors.noDocument");

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length === 0) {
        return sciError("errors.selectArrange");
    }

    if (!sizeMode) {
        sizeMode = (useWidth || useHeight) ? "custom" : "original";
    }

    // Convert mm values to points
    var rowGapPt = mmToPoints(rowGap);
    var colGapPt = mmToPoints(colGap);
    var wValPt = (sizeMode === "custom" && useWidth) ? mmToPoints(wVal) : 0;
    var hValPt = (sizeMode === "custom" && useHeight) ? mmToPoints(hVal) : 0;
    var layoutWidthPt = mmToPoints(layoutWidth || 0);

    // Auto Layout：根据当前排布自动识别行列并对齐（忽略 columns 与 order）
    if (autoLayout) {
        return autoArrangeLayout(selection, rowGapPt, colGapPt, useWidth, wValPt, useHeight, hValPt, !!alignEdges, layoutWidthPt, sizeMode);
    }

    // 使用排序后的序列进行排列
    var ordered = getOrderedSelection(selection, order || "stacking", !!reverseOrder);
    var colsNum = parseInt(columns) || 1;
    if (colsNum < 1) colsNum = 1;

    // 先按需要缩放（基于可视宽/高）
    if (sizeMode === "custom") {
        for (var i = 0; i < ordered.length; i++) {
            var it = ordered[i];
            if (useWidth && useHeight && wValPt > 0 && hValPt > 0) {
                var inf = getVisibleInfo(it);
                if (inf.width > 0 && inf.height > 0) {
                    var sX = (wValPt / inf.width) * 100;
                    var sY = (hValPt / inf.height) * 100;
                    it.resize(sX, sY, true, true, true, true, 100, Transformation.CENTER);
                }
            } else if (useHeight && hValPt > 0) {
                scaleItemToVisibleHeight(it, hValPt);
            } else if (useWidth && wValPt > 0) {
                scaleItemToVisibleWidth(it, wValPt);
            }
        }
    } else if (!alignEdges && sizeMode === "auto") {
        if (colsNum === 1) {
            // 单列纵向排列：按第一个对象的宽度等比缩放所有对象
            var firstW = getVisibleInfo(ordered[0]).width;
            if (firstW > 0) {
                for (var idx = 0; idx < ordered.length; idx++) {
                    scaleItemToVisibleWidth(ordered[idx], firstW);
                }
            }
        } else {
            // 多列网格排列：按行分组，每行内的对象等比缩放到该行首个对象的高度
            for (var rowStart = 0; rowStart < ordered.length; rowStart += colsNum) {
                var rowEnd = Math.min(rowStart + colsNum, ordered.length);
                var rowFirstH = getVisibleInfo(ordered[rowStart]).height;
                if (rowFirstH > 0) {
                    for (var colIdx = rowStart; colIdx < rowEnd; colIdx++) {
                        scaleItemToVisibleHeight(ordered[colIdx], rowFirstH);
                    }
                }
            }
        }
    }

    // 非 autoLayout 模式下使用 Align Edges
    if (alignEdges) {
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

        if (sizeMode === "auto") {
            // 自动调整大小模式 + Align Edges：
            // 支持自定义 Column Gap (colGapPt)，通过等比缩放每行对象的高度，使每行对象总宽度 + 固定列间距精确填满 targetLayoutWidthPt
            var targetLayoutWidthPt = layoutWidthPt;
            if (targetLayoutWidthPt <= 0) {
                var maxNaturalW = 0;
                for (var rW = 0; rW < nonAutoRows.length; rW++) {
                    var rMems = nonAutoRows[rW];
                    var rSumW = 0;
                    for (var mW = 0; mW < rMems.length; mW++) {
                        rSumW += getVisibleInfo(rMems[mW]).width;
                    }
                    var rTotal = rSumW + (rMems.length - 1) * colGapPt;
                    if (rTotal > maxNaturalW) maxNaturalW = rTotal;
                }
                targetLayoutWidthPt = maxNaturalW;
            }

            var rowHeightsAuto = [];
            for (var r = 0; r < nonAutoRows.length; r++) {
                var rMembers = nonAutoRows[r];
                var nItems = rMembers.length;
                var aspectSum = 0;
                for (var mA = 0; mA < nItems; mA++) {
                    var infoA = getVisibleInfo(rMembers[mA]);
                    if (infoA.height > 0) {
                        aspectSum += infoA.width / infoA.height;
                    }
                }
                var availW = targetLayoutWidthPt - (nItems - 1) * colGapPt;
                var rowH = 0;
                if (aspectSum > 0 && availW > 0) {
                    rowH = availW / aspectSum;
                    for (var mS = 0; mS < nItems; mS++) {
                        scaleItemToVisibleHeight(rMembers[mS], rowH);
                    }
                } else if (nItems > 0) {
                    rowH = getVisibleInfo(rMembers[0]).height;
                }
                rowHeightsAuto.push(rowH);
            }

            var firstInfo = getVisibleInfo(ordered[0]);
            var startX = firstInfo.left;
            var currentY = firstInfo.top;

            for (var r = 0; r < nonAutoRows.length; r++) {
                var rMembers = nonAutoRows[r];
                var rowH = rowHeightsAuto[r];

                if (rMembers.length === 1) {
                    moveItemTopLeftTo(rMembers[0], startX, currentY);
                } else {
                    var x = startX;
                    for (var m = 0; m < rMembers.length; m++) {
                        var itemM = rMembers[m];
                        moveItemTopLeftTo(itemM, x, currentY);
                        x += getVisibleInfo(itemM).width + colGapPt;
                    }
                }
                currentY -= (rowH + rowGapPt);
            }

            var resWidthMm = Math.round(pointsToMm(targetLayoutWidthPt) * 100) / 100;
            return '{"layoutWidth":' + resWidthMm + '}';
        }

        // 非 auto 模式（original 或 custom）：对象尺寸固定，间距自动均分
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
        if (count < colsNum) {
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
    if (app.documents.length === 0) return sciError("errors.noDocument");

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length === 0) {
        return sciError("errors.selectLabel");
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
                return sciError("errors.fontNotFound", [fontFamily]);
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
            return sciError("errors.addLabel", [i + 1, e.message]);
        }
    }
    return (startCount + ordered.length).toString();
}

function updateLabelIndex(fontFamily, fontSize, fontBold, labelTemplate, fontColor, order, reverseOrder, startCount) {
    if (app.documents.length === 0) return sciError("errors.noDocument");

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length === 0) {
        return sciError("errors.selectLabelFrames");
    }

    // 筛选出textframe类型
    var textFrames = [];
    for (var i = 0; i < selection.length; i++) {
        if (selection[i].typename === "TextFrame") {
            textFrames.push(selection[i]);
        }
    }

    if (textFrames.length === 0) {
        return sciError("errors.selectLabelFrames");
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
            return sciError("errors.updateTextFrame", [j + 1, e.message]);
        }
    }

    return "Success|" + ordered.length;
}

function filterTextFrames() {
    if (app.documents.length === 0) return sciError("errors.noDocument");

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length === 0) {
        return sciError("errors.selectObjects");
    }

    // 筛选出所有的文本框
    var textFrames = [];
    for (var i = 0; i < selection.length; i++) {
        if (selection[i].typename === "TextFrame") {
            textFrames.push(selection[i]);
        }
    }

    if (textFrames.length === 0) {
        return sciError("errors.noTextFrames");
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
    if (app.documents.length === 0) return sciError("errors.noDocument");

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (!selection || selection.length === 0) {
        return sciError("errors.selectObjects");
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
            return sciError("errors.noTextFrames");
        }
        doc.selection = null;
        for (var t = 0; t < textItems.length; t++) {
            textItems[t].selected = true;
        }
        return "Success|" + textItems.length;
    } else if (type === "excludeText") {
        if (nonTextItems.length === 0) {
            return sciError("errors.noNonTextObjects");
        }
        doc.selection = null;
        for (var n = 0; n < nonTextItems.length; n++) {
            nonTextItems[n].selected = true;
        }
        return "Success|" + nonTextItems.length;
    }

    return sciError("errors.unknownFilter");
}

function copyRelativePosition(corner, order, reverseOrder, useArtboardRef) {
    if (app.documents.length === 0) return sciError("errors.noDocument");

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (!selection || selection.length === 0) {
        return sciError("errors.selectOne");
    }

    // 当仅选中 1 个对象时：复制其“相对于画板”的位置（按所选角点）
    if (selection.length === 1) {
        var it = selection[0];
        var b = getVisibleBounds(it) || it.visibleBounds;
        var x, y;
        switch (corner) {
            case "C": x = (b[0] + b[2]) / 2; y = (b[1] + b[3]) / 2; break;
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
                case "C": cx = (bb[0] + bb[2]) / 2; cy = (bb[1] + bb[3]) / 2; break;
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
        // 基于参考角或中心取坐标
        switch (corner) {
            case "C":
                x1 = (refB[0] + refB[2]) / 2; y1 = (refB[1] + refB[3]) / 2;
                x2 = (objB[0] + objB[2]) / 2; y2 = (objB[1] + objB[3]) / 2;
                break;
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
    if (app.documents.length === 0) return sciError("errors.noDocument");

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
            return sciError("errors.selectMove");
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
                    case "C":
                        obj.translate(targetXAbs - (objB[0] + objB[2]) / 2, targetYAbs - (objB[1] + objB[3]) / 2);
                        break;
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
                    case "C":
                        obj1.translate(targetXAbs1 - (objB1[0] + objB1[2]) / 2, targetYAbs1 - (objB1[1] + objB1[3]) / 2);
                        break;
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
            return sciError("errors.countMismatch", [orderedAbs.length, absArr.length]);
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
                case "C":
                    obj2.translate(targetXAbs2 - (objB2[0] + objB2[2]) / 2, targetYAbs2 - (objB2[1] + objB2[3]) / 2);
                    break;
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
        if (!deltasJSON) return sciError("errors.noRelativeData");
        try {
            deltas = data || eval('(' + deltasJSON + ')');
            if (!deltas || typeof deltas.length === "undefined") return sciError("errors.invalidDataFormat");
        } catch (e) {
            return sciError("errors.invalidRelativeData", [e.message]);
        }
        if (deltas.length === 0) {
            return sciError("errors.noRelativeData");
        }
    }

    if (!selection || selection.length < 2) {
        return sciError("errors.selectTwoOrMore");
    }

    if (!useOverride && (selection.length - 1 !== deltas.length) && !allowMismatch) {
        return sciError("errors.countMismatch", [selection.length - 1, deltas.length]);
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
            case "C":
                newX = (refBounds[0] + refBounds[2]) / 2 + deltaXPt;
                newY = (refBounds[1] + refBounds[3]) / 2 + deltaYPt;
                objectToMove.translate(newX - (objBounds[0] + objBounds[2]) / 2, newY - (objBounds[1] + objBounds[3]) / 2);
                break;
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
    if (app.documents.length === 0) return sciError("errors.noDocument");
    var selection = app.activeDocument.selection;
    if (selection.length === 0) return sciError("errors.selectItem");

    var item = selection[0];
    var info = getVisibleInfo(item);

    var size = {
        width: pointsToMm(info.width),
        height: pointsToMm(info.height)
    };
    return '{"width":' + size.width + ',"height":' + size.height + '}';
}

function pasteSize(width, height, useW, useH) {
    if (app.documents.length === 0) return sciError("errors.noDocument");

    var selection = app.activeDocument.selection;
    if (selection.length === 0) return sciError("errors.selectResize");

    if (!useW && !useH) return "Success";

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
 * Swap positions of exactly two selected items using one of nine visible anchors.
 * corner: "TL" | "TC" | "TR" | "LC" | "C" | "RC" | "BL" | "BC" | "BR"
 * Defaults to "TL"; neither item's size changes.
 * Returns "Success" or "Error: ..."
 */
function swapSelectedPositions(corner) {
    if (app.documents.length === 0) return sciError("errors.noDocument");
    var selection = app.activeDocument.selection;
    if (!selection || selection.length !== 2) {
        return sciError("errors.selectExactlyTwo");
    }

    corner = corner || "TL";

    var a = selection[0];
    var b = selection[1];

    var ia = getVisibleInfo(a);
    var ib = getVisibleInfo(b);

    function anchorCoords(info, c) {
        var centerX = (info.left + info.right) / 2;
        var centerY = (info.top + info.bottom) / 2;
        switch (c) {
            case "TC": return { x: centerX, y: info.top };
            case "TR": return { x: info.right, y: info.top };
            case "LC": return { x: info.left, y: centerY };
            case "C": return { x: centerX, y: centerY };
            case "RC": return { x: info.right, y: centerY };
            case "BL": return { x: info.left, y: info.bottom };
            case "BC": return { x: centerX, y: info.bottom };
            case "BR": return { x: info.right, y: info.bottom };
            default: // "TL"
                return { x: info.left, y: info.top };
        }
    }

    var aAnchor = anchorCoords(ia, corner);
    var bAnchor = anchorCoords(ib, corner);

    // Snapshot both anchors before moving either item, including clipped groups.
    try {
        a.translate(bAnchor.x - aAnchor.x, bAnchor.y - aAnchor.y);
        b.translate(aAnchor.x - bAnchor.x, aAnchor.y - bAnchor.y);
    } catch (e) {
        return sciError("errors.details", [e.message]);
    }

    return "Success";
}

// A shared anchor definition keeps alignment and distribution consistent.
function getArrangementAnchor(info, mode) {
    if (mode === "horizontalCenter") return (info.left + info.right) / 2;
    if (mode === "verticalCenter") return (info.top + info.bottom) / 2;
    return info[mode];
}

function isArrangementMode(mode) {
    return mode === "left" || mode === "horizontalCenter" || mode === "right" ||
        mode === "top" || mode === "verticalCenter" || mode === "bottom";
}

/** Align against a snapshot of the selection bounds, without resizing items. */
function alignObjects(mode) {
    if (app.documents.length === 0) return sciError("errors.noDocument");
    var selection = app.activeDocument.selection;
    if (!selection || selection.length < 2) return sciError("errors.selectTwoOrMore");
    if (mode !== "center" && !isArrangementMode(mode)) {
        return sciError("errors.invalidArrangementMode");
    }

    var entries = [];
    var bounds = { left: Infinity, top: -Infinity, right: -Infinity, bottom: Infinity };
    for (var i = 0; i < selection.length; i++) {
        var info = getVisibleInfo(selection[i]);
        entries.push({ item: selection[i], info: info });
        bounds.left = Math.min(bounds.left, info.left);
        bounds.top = Math.max(bounds.top, info.top);
        bounds.right = Math.max(bounds.right, info.right);
        bounds.bottom = Math.min(bounds.bottom, info.bottom);
    }

    var horizontal = mode === "left" || mode === "horizontalCenter" || mode === "right";
    for (var j = 0; j < entries.length; j++) {
        var entry = entries[j];
        var dx = 0, dy = 0;
        if (mode === "center") {
            dx = getArrangementAnchor(bounds, "horizontalCenter") - getArrangementAnchor(entry.info, "horizontalCenter");
            dy = getArrangementAnchor(bounds, "verticalCenter") - getArrangementAnchor(entry.info, "verticalCenter");
        } else {
            var delta = getArrangementAnchor(bounds, mode) - getArrangementAnchor(entry.info, mode);
            if (horizontal) dx = delta;
            else dy = delta;
        }
        entry.item.translate(dx, dy);
    }
    return "Success";
}

/** Distribute the requested edges/centers rather than the gaps between items. */
function distributeObjects(mode) {
    if (app.documents.length === 0) return sciError("errors.noDocument");
    var selection = app.activeDocument.selection;
    if (!selection || selection.length < 2) return sciError("errors.selectThreeOrMore");
    if (!isArrangementMode(mode)) return sciError("errors.invalidArrangementMode");
    // Both end objects stay fixed; with two objects there is nothing to move.
    if (selection.length === 2) return "Success";

    var horizontal = mode === "left" || mode === "horizontalCenter" || mode === "right";
    var entries = [];
    for (var i = 0; i < selection.length; i++) {
        entries.push({
            item: selection[i],
            anchor: getArrangementAnchor(getVisibleInfo(selection[i]), mode),
            index: i
        });
    }
    // Top-to-bottom decreases Y in Illustrator. Tie-break explicitly for ES3 sorts.
    entries.sort(function (a, b) {
        var difference = horizontal ? a.anchor - b.anchor : b.anchor - a.anchor;
        return difference || a.index - b.index;
    });
    var start = entries[0].anchor;
    var step = (entries[entries.length - 1].anchor - start) / (entries.length - 1);
    for (var j = 1; j < entries.length - 1; j++) {
        var delta = start + j * step - entries[j].anchor;
        entries[j].item.translate(horizontal ? delta : 0, horizontal ? 0 : delta);
    }
    return "Success";
}

/**
 * Distribute gaps between visible edges, keeping both end items fixed.
 * direction: "horizontal" | "vertical"
 */
function distributeSpacing(direction) {
    if (app.documents.length === 0) return sciError("errors.noDocument");
    var selection = app.activeDocument.selection;
    if (!selection || selection.length < 3) {
        return sciError("errors.selectThreeOrMore");
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
    if (app.documents.length === 0) return sciError("errors.noDocument");
    var sel = app.activeDocument.selection;
    if (!sel || sel.length !== 2) {
        return sciError("errors.selectExactlyTwo");
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
    if (app.documents.length === 0) return sciError("errors.noDocument");
    var sel = app.activeDocument.selection;
    if (!sel || sel.length !== 2) {
        return sciError("errors.selectExactlyTwo");
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
    if (app.documents.length === 0) return sciError("errors.noDocument");
    var sel = app.activeDocument.selection;
    if (!sel || sel.length < 2) {
        return sciError("errors.selectTwoOrMore");
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
    if (app.documents.length === 0) return sciError("errors.noDocument");

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length === 0) {
        return sciError("errors.selectBorder");
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
    if (app.documents.length === 0) return sciError("errors.noDocument");

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

// -------------------------------------------------------------
// ZOOM IMAGE FUNCTIONS (ES3 COMPATIBLE)
// -------------------------------------------------------------

function hexToRgb(hex) {
    if (!hex) hex = "#ff0000";
    if (hex.charAt(0) === '#') hex = hex.substring(1);
    if (hex.length === 3) {
        hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    }
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    return {
        r: isNaN(r) ? 255 : r,
        g: isNaN(g) ? 0 : g,
        b: isNaN(b) ? 0 : b
    };
}

function applyStrokeColor(item, hex) {
    var rgb = hexToRgb(hex);
    var color = new RGBColor();
    color.red = rgb.r;
    color.green = rgb.g;
    color.blue = rgb.b;
    try {
        item.strokeColor = color;
    } catch (e) {
        try {
            var r1 = rgb.r / 255, g1 = rgb.g / 255, b1 = rgb.b / 255;
            var c = 1 - r1, m = 1 - g1, y = 1 - b1;
            var k = Math.min(c, Math.min(m, y));
            var cmyk = new CMYKColor();
            if (k >= 1.0) {
                cmyk.cyan = 0; cmyk.magenta = 0; cmyk.yellow = 0; cmyk.black = 100;
            } else {
                var denom = (1 - k) || 1;
                cmyk.cyan = Math.round(((c - k) / denom) * 100);
                cmyk.magenta = Math.round(((m - k) / denom) * 100);
                cmyk.yellow = Math.round(((y - k) / denom) * 100);
                cmyk.black = Math.round(k * 100);
            }
            item.strokeColor = cmyk;
        } catch (e2) {}
    }
}

function applyStrokeDash(item, style, width) {
    var w = (typeof width === 'number' && width > 0) ? width : 1.5;
    try {
        if (style === 'solid') {
            item.strokeDashes = [];
        } else if (style === 'dot') {
            item.strokeDashes = [Math.max(0.5, w * 0.5), Math.max(1, w * 2)];
        } else if (style === 'dashdot') {
            item.strokeDashes = [Math.max(1, w * 4), Math.max(1, w * 1.5), Math.max(0.5, w * 1), Math.max(1, w * 1.5)];
        } else if (style === 'dashdotdot') {
            item.strokeDashes = [Math.max(1, w * 4), Math.max(1, w * 1.5), Math.max(0.5, w * 1), Math.max(1, w * 1.5), Math.max(0.5, w * 1), Math.max(1, w * 1.5)];
        } else {
            item.strokeDashes = [Math.max(1, w * 3), Math.max(1, w * 2)];
        }
    } catch (e) {}
}

function getColorHex(color) {
    if (!color) return "#ff0000";
    try {
        var tName = color.typename;
        if (tName === "RGBColor") {
            var r = Math.round(color.red).toString(16);
            var g = Math.round(color.green).toString(16);
            var b = Math.round(color.blue).toString(16);
            if (r.length < 2) r = "0" + r;
            if (g.length < 2) g = "0" + g;
            if (b.length < 2) b = "0" + b;
            return "#" + r + g + b;
        } else if (tName === "CMYKColor") {
            var c = color.cyan / 100;
            var m = color.magenta / 100;
            var y = color.yellow / 100;
            var k = color.black / 100;
            var cr = Math.round(255 * (1 - c) * (1 - k));
            var cg = Math.round(255 * (1 - m) * (1 - k));
            var cb = Math.round(255 * (1 - y) * (1 - k));
            var rs = cr.toString(16), gs = cg.toString(16), bs = cb.toString(16);
            if (rs.length < 2) rs = "0" + rs;
            if (gs.length < 2) gs = "0" + gs;
            if (bs.length < 2) bs = "0" + bs;
            return "#" + rs + gs + bs;
        } else if (tName === "GrayColor") {
            var v = Math.round(255 * (1 - color.gray / 100)).toString(16);
            if (v.length < 2) v = "0" + v;
            return "#" + v + v + v;
        }
    } catch (e) {}
    return "#ff0000";
}

function getDashStyle(item) {
    try {
        var dashes = item.strokeDashes;
        if (!dashes || dashes.length === 0) return "solid";
        if (dashes.length === 2) {
            if (dashes[0] <= dashes[1] * 0.6) return "dot";
            return "dash";
        }
        if (dashes.length === 4) return "dashdot";
        if (dashes.length === 6) return "dashdotdot";
        return "dash";
    } catch (e) {
        return "dash";
    }
}

function isPathRectangle(item) {
    if (!item || item.typename !== "PathItem") return false;
    try {
        if (!item.closed) return false;
        var pts = item.pathPoints;
        if (!pts || pts.length !== 4) return false;
        return true;
    } catch (e) {
        return false;
    }
}

function addTag(item, name, value) {
    try {
        var tag = null;
        try { tag = item.tags.getByName(name); } catch (e) {}
        if (!tag) tag = item.tags.add();
        tag.name = name;
        tag.value = String(value);
    } catch (e) {}
}

function getTag(item, name) {
    try {
        var tag = item.tags.getByName(name);
        return tag ? tag.value : null;
    } catch (e) {
        return null;
    }
}

function deleteTag(item, name) {
    try {
        var tag = item.tags.getByName(name);
        if (tag) tag.remove();
    } catch (e) {}
}

function findItemByTag(doc, name) {
    try {
        for (var i = 0; i < doc.pageItems.length; i++) {
            var it = doc.pageItems[i];
            try {
                var tag = it.tags.getByName(name);
                if (tag) return it;
            } catch (e) {}
        }
    } catch (docErr) {}
    return null;
}

function clearZoomSessionTags(doc) {
    for (var i = 0; i < doc.pageItems.length; i++) {
        deleteTag(doc.pageItems[i], "ILST_ZOOM_ACTIVE_TARGET");
        deleteTag(doc.pageItems[i], "ILST_ZOOM_ACTIVE_MANUAL");
    }
}

function getZoomSelection(selection) {
    var targets = [];
    var manualRect = null;
    for (var i = 0; selection && i < selection.length; i++) {
        var item = selection[i];
        if (selection.length === 2 && isPathRectangle(item)) {
            manualRect = item;
        } else if (item.typename === "RasterItem" || item.typename === "PlacedItem" || item.typename === "GroupItem") {
            targets.push(item);
        } else {
            return { targets: [], manualRect: null };
        }
    }
    // An ordinary rectangle is supported only alongside one image.
    if (manualRect && targets.length !== 1) targets = [];
    return { targets: targets, manualRect: manualRect };
}

function getActiveZoomTargets(doc) {
    var targets = [];
    for (var i = 0; i < doc.pageItems.length; i++) {
        var item = doc.pageItems[i];
        var order = getTag(item, "ILST_ZOOM_ACTIVE_TARGET");
        if (order !== null) targets.push({ item: item, order: Number(order) });
    }
    targets.sort(function (a, b) { return a.order - b.order; });
    var result = [];
    for (var j = 0; j < targets.length; j++) result.push(targets[j].item);
    return result;
}

function createZoomRecordKey(doc) {
    // Illustrator rejects tag names longer than 30 characters. The longest
    // prefix is ILST_ZOOM_MARKER_ (17), so keep the shared record key short.
    var key;
    do {
        key = new Date().getTime().toString(36).slice(-8) + "_" + Math.floor(Math.random() * 1679616).toString(36);
    } while (findItemByTag(doc, "ILST_ZOOM_ITEM_" + key));
    return key;
}

// Duplicates must not impersonate the original source, its zooms, or the active
// editor selection. Keep unrelated Illustrator/plugin tags intact.
function clearCopiedZoomTags(item) {
    for (var t = item.tags.length - 1; t >= 0; t--) {
        if (item.tags[t].name.indexOf("ILST_ZOOM_") === 0) item.tags[t].remove();
    }
    if (item.typename === "GroupItem") {
        for (var i = 0; i < item.pageItems.length; i++) {
            var child = item.pageItems[i];
            if (child.parent === item) clearCopiedZoomTags(child);
        }
    }
}

function readZoomEntries(doc, sourceItem) {
    var entries = [];
    var s = getVisibleBounds(sourceItem) || sourceItem.geometricBounds;
    var width = s[2] - s[0], height = s[1] - s[3];
    if (width <= 0 || height <= 0) return entries;
    for (var t = 0; t < sourceItem.tags.length; t++) {
        var tag = sourceItem.tags[t];
        if (tag.name.indexOf("ILST_ZOOM_SRC_") !== 0) continue;
        // A stale record must not prevent the remaining valid records loading.
        try {
            var key = tag.name.substring(14);
            var marker = findItemByTag(doc, "ILST_ZOOM_MARKER_" + key);
            var zoom = findItemByTag(doc, "ILST_ZOOM_ITEM_" + key);
            if (!marker || !zoom) continue;
            var m = getVisibleBounds(marker) || marker.geometricBounds;
            var z = getVisibleBounds(zoom) || zoom.geometricBounds;
            var opts = {};
            try { opts = JSON.parse(getTag(zoom, "ILST_ZOOM_ITEM_" + key)); } catch (e) {}
            entries.push({
                recordKey: key,
                name: tag.value || ("放大图 " + (entries.length + 1)),
                region: { x: (m[0] - s[0]) / width, y: (s[1] - m[1]) / height,
                    width: (m[2] - m[0]) / width, height: (m[1] - m[3]) / height },
                regionRotation: 0,
                strokeColor: getColorHex(marker.strokeColor),
                strokeWidth: marker.strokeWidth || 1.5,
                strokeDash: getDashStyle(marker),
                useRectangleColor: opts.useRectangleColor !== false,
                addGuideLines: opts.addGuideLines === true,
                placement: opts.placement || "right",
                guideLineExtent: opts.guideLineExtent || "acrossImages",
                originalZoomRegion: { x: (z[0] - s[0]) / width, y: (s[1] - z[1]) / height,
                    width: (z[2] - z[0]) / width, height: (z[1] - z[3]) / height },
                originalZoomRotation: 0,
                preservesLayout: true
            });
        } catch (recordError) {}
    }
    return entries;
}

// Transform using the visible source extent. GroupItem.left/top describe the
// uncropped artwork, which may be far outside its clipping mask.
function positionZoomDuplicate(duplicate, sourceBounds, markerBounds, zoomBounds) {
    var scaleX = (zoomBounds[2] - zoomBounds[0]) / (markerBounds[2] - markerBounds[0]);
    var scaleY = (zoomBounds[1] - zoomBounds[3]) / (markerBounds[1] - markerBounds[3]);
    var visible = getVisibleBounds(duplicate) || duplicate.geometricBounds;
    var resizeX = (sourceBounds[2] - sourceBounds[0]) * scaleX / (visible[2] - visible[0]);
    var resizeY = (sourceBounds[1] - sourceBounds[3]) * scaleY / (visible[1] - visible[3]);
    if (Math.abs(resizeX - 1) > 0.000001 || Math.abs(resizeY - 1) > 0.000001) {
        duplicate.resize(resizeX * 100, resizeY * 100, true, true, true, true,
            Math.sqrt(resizeX * resizeY) * 100, Transformation.TOPLEFT);
    }
    visible = getVisibleBounds(duplicate) || duplicate.geometricBounds;
    var left = zoomBounds[0] - (markerBounds[0] - sourceBounds[0]) * scaleX;
    var top = zoomBounds[1] + (sourceBounds[1] - markerBounds[1]) * scaleY;
    if (Math.abs(left - visible[0]) > 0.000001 || Math.abs(top - visible[1]) > 0.000001) {
        duplicate.translate(left - visible[0], top - visible[1]);
    }
}

function getZoomEndpoints(regionCorners, zoomCorners, placement) {
    switch (placement) {
        case "left":
            return [regionCorners[0], zoomCorners[1], regionCorners[3], zoomCorners[2]];
        case "top":
            return [regionCorners[0], zoomCorners[3], regionCorners[1], zoomCorners[2]];
        case "bottom":
            return [regionCorners[3], zoomCorners[0], regionCorners[2], zoomCorners[1]];
        case "right":
        default:
            return [regionCorners[1], zoomCorners[0], regionCorners[2], zoomCorners[3]];
    }
}

function getZoomGuidePlacement(sourceBounds, zoomBounds, fallback) {
    var dx = (zoomBounds[0] + zoomBounds[2] - sourceBounds[0] - sourceBounds[2]) / 2;
    // Convert Illustrator's upward Y axis to the preview's downward Y axis.
    var dy = (sourceBounds[1] + sourceBounds[3] - zoomBounds[1] - zoomBounds[3]) / 2;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return fallback || "right";
    var horizontal = Math.abs(dx) / Math.max(0.01, sourceBounds[2] - sourceBounds[0]);
    var vertical = Math.abs(dy) / Math.max(0.01, sourceBounds[1] - sourceBounds[3]);
    if (horizontal >= vertical) {
        if (dx >= 0) return "right";
        return "left";
    }
    if (dy >= 0) return "bottom";
    return "top";
}

function clipEdgeSegment(direction, distance, limits) {
    if (Math.abs(direction) < 0.000001) {
        return distance >= 0;
    }
    var ratio = distance / direction;
    if (direction < 0) {
        if (ratio > limits.last) return false;
        limits.first = Math.max(limits.first, ratio);
    } else {
        if (ratio < limits.first) return false;
        limits.last = Math.min(limits.last, ratio);
    }
    return true;
}

function tryClipLine(start, end, bounds) {
    var bLeft = bounds[0];
    var bTop = bounds[1];
    var bRight = bounds[2];
    var bBottom = bounds[3];
    var dx = end[0] - start[0];
    var dy = end[1] - start[1];
    var limits = { first: 0, last: 1 };

    if (bRight <= bLeft || bTop <= bBottom ||
        !clipEdgeSegment(-dx, start[0] - bLeft, limits) ||
        !clipEdgeSegment(dx, bRight - start[0], limits) ||
        !clipEdgeSegment(-dy, start[1] - bBottom, limits) ||
        !clipEdgeSegment(dy, bTop - start[1], limits) ||
        (limits.last - limits.first) * Math.max(Math.abs(dx), Math.abs(dy)) < 0.0001) {
        return null;
    }

    return {
        start: [start[0] + limits.first * dx, start[1] + limits.first * dy],
        end: [start[0] + limits.last * dx, start[1] + limits.last * dy]
    };
}

// Always derive guide endpoints from the live clipping bounds, including when
// an editor/tracker reload has lost the previous position of a moved zoom.
function refreshZoomGuideLines(doc, key, source, marker, zoom, options, createMissing) {
    if (!options.addGuideLines) return;
    var s = getVisibleBounds(source) || source.geometricBounds;
    var m = getVisibleBounds(marker) || marker.geometricBounds;
    var z = getVisibleBounds(zoom) || zoom.geometricBounds;
    var endpoints = getZoomEndpoints(
        [[m[0], m[1]], [m[2], m[1]], [m[2], m[3]], [m[0], m[3]]],
        [[z[0], z[1]], [z[2], z[1]], [z[2], z[3]], [z[0], z[3]]],
        getZoomGuidePlacement(s, z, options.placement)
    );
    for (var g = 0; g < 2; g++) {
        var points = [endpoints[g * 2], endpoints[g * 2 + 1]];
        if (options.guideLineExtent === "insideSourceImage") {
            var clipped = tryClipLine(points[0], points[1], s);
            if (clipped) points = [clipped.start, clipped.end];
        }
        var tagName = "ILST_ZOOM_GUIDE" + (g + 1) + "_" + key;
        var line = findItemByTag(doc, tagName);
        if (!line) {
            if (!createMissing) continue;
            var layer = source.layer || doc.activeLayer;
            line = layer.pathItems.add();
            line.filled = false;
            line.stroked = true;
            line.strokeWidth = options.strokeWidth;
            applyStrokeColor(line, options.strokeColor);
            applyStrokeDash(line, options.strokeDash, options.strokeWidth);
            addTag(line, tagName, String(g));
        }
        var unchanged = false;
        try {
            unchanged = line.pathPoints.length === 2;
            for (var p = 0; unchanged && p < 2; p++) {
                var anchor = line.pathPoints[p].anchor;
                unchanged = Math.abs(anchor[0] - points[p][0]) < 0.0001 &&
                    Math.abs(anchor[1] - points[p][1]) < 0.0001;
            }
        } catch (e) {}
        if (!unchanged) line.setEntirePath(points);
    }
}

// Plain linked images can be loaded by the CEP canvas directly. Transformed,
// embedded and grouped artwork needs a rendered preview of its visible extent.
function getZoomLinkedPreview(sourceItem) {
    if (sourceItem.typename !== "PlacedItem" && sourceItem.typename !== "RasterItem") return null;
    try {
        if (sourceItem.typename === "RasterItem" && sourceItem.embedded) return null;
        if (sourceItem.opacity !== 100) return null;
        if (typeof BlendModes !== "undefined" && sourceItem.blendingMode !== BlendModes.NORMAL) return null;
        var matrix = sourceItem.matrix;
        if (!matrix || matrix.mValueA <= 0 || matrix.mValueD <= 0 ||
            Math.abs(matrix.mValueB) > 0.000001 || Math.abs(matrix.mValueC) > 0.000001 ||
            Math.abs(matrix.mValueA - matrix.mValueD) > 0.000001) return null;
        var file = sourceItem.file;
        if (!file || !file.exists) return null;
        var match = file.name.match(/\.(png|jpe?g|bmp)$/i);
        if (!match) return null;
        var extension = match[1].toLowerCase();
        if (extension === "jpg") extension = "jpeg";
        return { path: file.fsName.replace(/\\/g, '/'), mimeType: "image/" + extension };
    } catch (e) {
        return null;
    }
}

function hideZoomPreviewSiblings(current, parent, collection, changes) {
    for (var i = 0; collection && i < collection.length; i++) {
        var sibling = collection[i];
        // pageItems can include nested descendants; hide only direct siblings.
        if (sibling === current || sibling.parent !== parent) continue;
        var isLayer = sibling.typename === "Layer";
        var visibility = isLayer ? sibling.visible : !sibling.hidden;
        if (!visibility) continue;
        changes.push({ item: sibling, isLayer: isLayer, locked: sibling.locked });
        if (sibling.locked) sibling.locked = false;
        if (isLayer) sibling.visible = false;
        else sibling.hidden = true;
    }
}

// Capture synchronously in the original document. Do not redraw while hiding
// unrelated artwork, and restore visibility, locks and selection before return.
function captureZoomSourcePreview(doc, sourceItem, tempFile, capOpts) {
    var changes = [];
    var originalSelection = [];
    var selection = doc.selection;
    for (var i = 0; selection && i < selection.length; i++) {
        originalSelection.push(selection[i]);
    }
    try {
        var current = sourceItem;
        while (current && current !== doc) {
            var parent = current.parent;
            if (!parent) throw new Error("Preview source has no document parent");
            hideZoomPreviewSiblings(current, parent, parent.pageItems, changes);
            hideZoomPreviewSiblings(current, parent, parent.layers, changes);
            current = parent;
        }
        var previewBounds = getVisibleBounds(sourceItem) || sourceItem.geometricBounds;
        doc.imageCapture(tempFile, previewBounds, capOpts);
    } finally {
        var restoreError = null;
        for (var r = changes.length - 1; r >= 0; r--) {
            var change = changes[r];
            try {
                if (change.isLayer) change.item.visible = true;
                else change.item.hidden = false;
                change.item.locked = change.locked;
            } catch (error) {
                restoreError = error;
            }
        }
        doc.selection = originalSelection;
        if (restoreError) throw restoreError;
    }
}

function inspectZoomTarget() {
    if (app.documents.length === 0) return sciError("errors.noDocument");
    var doc = app.activeDocument;
    var sel = doc.selection;
    if (!sel || sel.length === 0) return sciError("errors.zoomNoSelection");

    var selection = getZoomSelection(sel);
    if (selection.targets.length === 0) return sciError("errors.zoomInvalidSelection");
    var sourceItem = selection.targets[0];
    var manualRect = selection.manualRect;

    clearZoomSessionTags(doc);
    // Tags survive the separate CEP editor reloading the host script. Preserve
    // selection order so that only the first image supplies the editor preview.
    for (var targetIndex = 0; targetIndex < selection.targets.length; targetIndex++) {
        addTag(selection.targets[targetIndex], "ILST_ZOOM_ACTIVE_TARGET", String(targetIndex + 1));
    }
    if (manualRect) {
        addTag(manualRect, "ILST_ZOOM_ACTIVE_MANUAL", "1");
    }

    var sBounds = getVisibleBounds(sourceItem) || sourceItem.geometricBounds;
    var sLeft = sBounds[0];
    var sTop = sBounds[1];
    var sRight = sBounds[2];
    var sBottom = sBounds[3];
    var sWidth = sRight - sLeft;
    var sHeight = sTop - sBottom;
    if (sWidth <= 0 || sHeight <= 0) return sciError("errors.zoomInvalidSelection");

    var tempFile = new File(Folder.temp.fsName + "/sci_zoom_preview_" + (new Date().getTime()) + ".png");
    var capOpts = new ImageCaptureOptions();
    capOpts.antiAliasing = true;
    // Screen preview only: bound the long edge instead of rasterizing large
    // scientific images at a fixed DPI. Final zooms still duplicate the source.
    capOpts.resolution = Math.max(1, Math.min(150, 1600 * 72 / Math.max(sWidth, sHeight)));
    capOpts.transparency = true;
    var linkedPreview = getZoomLinkedPreview(sourceItem);
    if (!linkedPreview) {
        try {
            captureZoomSourcePreview(doc, sourceItem, tempFile, capOpts);
        } catch (captureError) {
            return sciError("errors.zoomCaptureFailed");
        }
    }

    var previewPath = linkedPreview ? linkedPreview.path : tempFile.fsName.replace(/\\/g, '/');

    var existingEntries = readZoomEntries(doc, sourceItem);

    var manualRectInfo = null;
    if (manualRect) {
        var mrBounds = getVisibleBounds(manualRect) || manualRect.geometricBounds;
        manualRectInfo = {
            region: {
                x: (mrBounds[0] - sLeft) / sWidth,
                y: (sTop - mrBounds[1]) / sHeight,
                width: (mrBounds[2] - mrBounds[0]) / sWidth,
                height: (mrBounds[1] - mrBounds[3]) / sHeight
            },
            strokeColor: getColorHex(manualRect.strokeColor),
            strokeWidth: manualRect.strokeWidth || 1.5,
            strokeDash: getDashStyle(manualRect)
        };
    }

    var result = {
        sourceWidth: pointsToMm(sWidth),
        sourceHeight: pointsToMm(sHeight),
        previewPath: previewPath,
        previewMimeType: linkedPreview ? linkedPreview.mimeType : "image/png",
        previewIsTemporary: !linkedPreview,
        existingEntries: existingEntries,
        manualRect: manualRectInfo
    };

    return JSON.stringify(result);
}

function applyZoomImages(payloadJson) {
    if (app.documents.length === 0) return sciError("errors.noDocument");
    var doc = app.activeDocument;
    var targets = getActiveZoomTargets(doc);
    var manualRect = findItemByTag(doc, "ILST_ZOOM_ACTIVE_MANUAL");
    if (targets.length === 0) {
        var selection = getZoomSelection(doc.selection);
        targets = selection.targets;
        manualRect = selection.manualRect;
    }
    if (targets.length === 0) return sciError("errors.zoomNoSelection");
    var payload = {};
    try { payload = JSON.parse(payloadJson); } catch (e) {
        return sciError("errors.invalidDataFormat");
    }
    var entries = payload.entries || [];
    var additions = [];
    for (var i = 0; i < entries.length; i++) {
        if (!entries[i].recordKey) additions.push(entries[i]);
    }
    for (var t = 0; t < targets.length; t++) {
        var bounds = getVisibleBounds(targets[t]) || targets[t].geometricBounds;
        if (bounds[2] <= bounds[0] || bounds[1] <= bounds[3]) return sciError("errors.zoomInvalidSelection");
    }

    // Duplication can retain direct selection on children of a clipping group.
    doc.selection = null;
    var createdZoomGroups = [];
    try {
        for (var targetIndex = 0; targetIndex < targets.length; targetIndex++) {
            // Existing records belong to the first image. Other images retain
            // their own records and receive only newly drawn regions.
            var targetEntries = targetIndex === 0 ? entries : additions;
            if (targetEntries.length === 0 && targetIndex !== 0) continue;
            applyZoomToTarget(doc, targets[targetIndex], targetIndex === 0 ? manualRect : null,
                targetEntries, targetIndex === 0 ? (payload.deletedKeys || []) : [], createdZoomGroups);
        }
        clearZoomSessionTags(doc);
        doc.selection = null;
        for (var s = 0; s < createdZoomGroups.length; s++) createdZoomGroups[s].selected = true;
    } finally {
        // Replaced groups invalidate cached host references. Rebuild tracking
        // before it can mistake an edited zoom for a deletion and remove tags.
        _zoomTrackedGroups = [];
        _zoomTrackedDocName = null;
        _zoomTrackedDocument = null;
        resetZoomTrackingHistory();
    }
    return "Success";
}

function applyZoomToTarget(doc, sourceItem, manualRect, entries, deletedKeys, createdZoomGroups) {
    var targetLayer = sourceItem.layer || doc.activeLayer;
    if (targetLayer) {
        try { targetLayer.locked = false; } catch (e) {}
        try { targetLayer.visible = true; } catch (e) {}
    }

    var sBounds = getVisibleBounds(sourceItem) || sourceItem.geometricBounds;
    var sLeft = sBounds[0];
    var sTop = sBounds[1];
    var sRight = sBounds[2];
    var sBottom = sBounds[3];
    var sWidth = sRight - sLeft;
    var sHeight = sTop - sBottom;
    // Delete only records owned by this source.
    for (var d = 0; d < deletedKeys.length; d++) {
        var dKey = deletedKeys[d];
        var oldZoom = findItemByTag(doc, "ILST_ZOOM_ITEM_" + dKey);
        if (oldZoom) {
            try { oldZoom.remove(); } catch (e) {}
        }
        var g1 = findItemByTag(doc, "ILST_ZOOM_GUIDE1_" + dKey);
        if (g1) { try { g1.remove(); } catch (e) {} }
        var g2 = findItemByTag(doc, "ILST_ZOOM_GUIDE2_" + dKey);
        if (g2) { try { g2.remove(); } catch (e) {} }

        var oldMarker = findItemByTag(doc, "ILST_ZOOM_MARKER_" + dKey);
        if (oldMarker) {
            try { oldMarker.remove(); } catch (e) {}
        }
        deleteTag(sourceItem, "ILST_ZOOM_SRC_" + dKey);
    }

    var gap = 14.1732; // 5 mm in points
    var occupiedBounds = [];

    var preservedBounds = {};
    var existingEntries = readZoomEntries(doc, sourceItem);
    var usedNames = {};
    for (var e = 0; e < existingEntries.length; e++) {
        var saved = existingEntries[e];
        usedNames[saved.name] = true;
        var edited = null;
        for (var n = 0; n < entries.length; n++) {
            if (entries[n].recordKey === saved.recordKey) { edited = entries[n]; break; }
        }
        if (edited && edited.preservesLayout === false) continue;
        var old = saved.originalZoomRegion;
        var eb = [sLeft + old.x * sWidth, sTop - old.y * sHeight,
            sLeft + (old.x + old.width) * sWidth, sTop - (old.y + old.height) * sHeight];
        if (edited && edited.region.width > 0 && edited.region.height > 0) {
            // Reopening the editor must preserve the live output rectangle,
            // including a size that the user changed directly in Illustrator.
            preservedBounds[saved.recordKey] = eb;
        }
        occupiedBounds.push(eb);
    }

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var reg = entry.region;
        if (!reg || reg.width <= 0 || reg.height <= 0) continue;

        var mLeft = sLeft + reg.x * sWidth;
        var mTop = sTop - reg.y * sHeight;
        var mWidth = reg.width * sWidth;
        var mHeight = reg.height * sHeight;
        var mRight = mLeft + mWidth;
        var mBottom = mTop - mHeight;

        var isNew = !entry.recordKey;
        var key = entry.recordKey || createZoomRecordKey(doc);
        var name = entry.name || ("放大图 " + (i + 1));
        if (isNew) {
            var nameIndex = 1;
            while (usedNames[name]) name = "放大图 " + (nameIndex++);
        }
        usedNames[name] = true;

        var marker = null;
        if (!isNew) {
            marker = findItemByTag(doc, "ILST_ZOOM_MARKER_" + key);
        }
        if (!marker) {
            if (manualRect && i === 0) {
                marker = manualRect;
                manualRect.filled = false;
                manualRect.stroked = true;
            } else {
                marker = targetLayer.pathItems.rectangle(mTop, mLeft, mWidth, mHeight);
                marker.filled = false;
                marker.stroked = true;
            }
        } else {
            setZoomRectangleBounds(marker, [mLeft, mTop, mRight, mBottom]);
        }

        marker.strokeWidth = entry.strokeWidth;
        applyStrokeColor(marker, entry.strokeColor);
        applyStrokeDash(marker, entry.strokeDash, entry.strokeWidth);

        var placement = entry.placement || "right";
        var zWidth = 0, zHeight = 0, zLeft = 0, zTop = 0;

        var preserved = preservedBounds[key];
        if (preserved) {
            zLeft = preserved[0]; zTop = preserved[1];
            zWidth = preserved[2] - preserved[0]; zHeight = preserved[1] - preserved[3];
        } else if (placement === "left" || placement === "right") {
            var scale = sHeight / mHeight;
            zWidth = mWidth * scale;
            zHeight = sHeight;
            zTop = sTop;
            if (placement === "right") {
                zLeft = sRight + gap;
                for (var occ = 0; occ < occupiedBounds.length; occ++) {
                    if (zTop > occupiedBounds[occ][3] && zTop - zHeight < occupiedBounds[occ][1] &&
                        zLeft < occupiedBounds[occ][2] + gap && zLeft + zWidth > occupiedBounds[occ][0]) {
                        zLeft = occupiedBounds[occ][2] + gap;
                    }
                }
            } else {
                zLeft = sLeft - gap - zWidth;
                for (var occ = 0; occ < occupiedBounds.length; occ++) {
                    if (zTop > occupiedBounds[occ][3] && zTop - zHeight < occupiedBounds[occ][1] &&
                        zLeft < occupiedBounds[occ][2] && zLeft + zWidth > occupiedBounds[occ][0] - gap) {
                        zLeft = occupiedBounds[occ][0] - gap - zWidth;
                    }
                }
            }
        } else {
            var scale = sWidth / mWidth;
            zWidth = sWidth;
            zHeight = mHeight * scale;
            zLeft = sLeft;
            if (placement === "bottom") {
                zTop = sBottom - gap;
                for (var occ = 0; occ < occupiedBounds.length; occ++) {
                    if (zLeft < occupiedBounds[occ][2] && zLeft + zWidth > occupiedBounds[occ][0] &&
                        zTop > occupiedBounds[occ][3] - gap && zTop - zHeight < occupiedBounds[occ][1]) {
                        zTop = occupiedBounds[occ][3] - gap;
                    }
                }
            } else {
                zTop = sTop + gap + zHeight;
                for (var occ = 0; occ < occupiedBounds.length; occ++) {
                    if (zLeft < occupiedBounds[occ][2] && zLeft + zWidth > occupiedBounds[occ][0] &&
                        zTop > occupiedBounds[occ][3] && zTop - zHeight < occupiedBounds[occ][1] + gap) {
                        zTop = occupiedBounds[occ][1] + gap + zHeight;
                    }
                }
            }
        }

        var zBounds = [zLeft, zTop, zLeft + zWidth, zTop - zHeight];
        if (!preserved) occupiedBounds.push(zBounds);

        var existingZoomGroup = findItemByTag(doc, "ILST_ZOOM_ITEM_" + key);
        if (existingZoomGroup) {
            try { existingZoomGroup.remove(); } catch (e) {}
        }

        var dup = sourceItem.duplicate();
        clearCopiedZoomTags(dup);
        positionZoomDuplicate(dup, sBounds, [mLeft, mTop, mRight, mBottom], zBounds);

        var clipRect = targetLayer.pathItems.rectangle(zTop, zLeft, zWidth, zHeight);
        clipRect.filled = false;
        clipRect.stroked = false;
        clipRect.clipping = true;

        var zoomGroup = targetLayer.groupItems.add();
        dup.moveToBeginning(zoomGroup);
        clipRect.moveToBeginning(zoomGroup);

        var borderRect = zoomGroup.pathItems.rectangle(zTop, zLeft, zWidth, zHeight);
        borderRect.filled = false;
        borderRect.stroked = true;
        borderRect.strokeWidth = entry.strokeWidth;
        var bColor = entry.useRectangleColor ? entry.strokeColor : (entry.strokeColor);
        applyStrokeColor(borderRect, bColor);
        applyStrokeDash(borderRect, entry.strokeDash, entry.strokeWidth);
        borderRect.moveToBeginning(zoomGroup);
        // Illustrator expects the clipping path above the group's artwork,
        // including the separate visible border.
        clipRect.moveToBeginning(zoomGroup);
        zoomGroup.clipped = true;

        var oldG1 = findItemByTag(doc, "ILST_ZOOM_GUIDE1_" + key);
        if (oldG1) { try { oldG1.remove(); } catch (e) {} }
        var oldG2 = findItemByTag(doc, "ILST_ZOOM_GUIDE2_" + key);
        if (oldG2) { try { oldG2.remove(); } catch (e) {} }

        refreshZoomGuideLines(doc, key, sourceItem, marker, zoomGroup, entry, true);

        addTag(sourceItem, "ILST_ZOOM_SRC_" + key, name);
        addTag(marker, "ILST_ZOOM_MARKER_" + key, "MARKER");
        addTag(zoomGroup, "ILST_ZOOM_ITEM_" + key, JSON.stringify({
            // Each CEP window can own a separate tracker cache. A new revision
            // tells every window to discard references to replaced artwork.
            revision: createZoomRecordKey(doc),
            name: name,
            placement: placement,
            addGuideLines: entry.addGuideLines,
            guideLineExtent: entry.guideLineExtent,
            useRectangleColor: entry.useRectangleColor,
            strokeColor: entry.strokeColor,
            strokeWidth: entry.strokeWidth,
            strokeDash: entry.strokeDash
        }));
        createdZoomGroups.push(zoomGroup);
    }

}

function cancelZoomTarget() {
    if (app.documents.length === 0) return "OK";
    var doc = app.activeDocument;
    clearZoomSessionTags(doc);
    return "OK";
}

var _zoomTrackedGroups = [];
var _zoomTrackedDocName = null;
var _zoomTrackedDocument = null;
var _zoomUndoHistory = [];
var _zoomRedoHistory = [];
var _zoomLastTrackingState = null;
var _zoomHistoryPictures = {};
var _zoomHistoryTag = "ILST_ZOOM_UNDO";

function resetZoomTrackingHistory() {
    _zoomUndoHistory = [];
    _zoomRedoHistory = [];
    _zoomLastTrackingState = null;
    _zoomHistoryPictures = {};
}

function zoomItemInIndex(index, item) {
    for (var i = 0; item && i < index.items.length; i++) {
        if (index.items[i] === item) return true;
    }
    return false;
}

function zoomHistoryBounds(item) {
    if (!item) return null;
    var bounds = getVisibleBounds(item) || item.geometricBounds;
    return [bounds[0], bounds[1], bounds[2], bounds[3]];
}

function zoomHistoryGuide(line) {
    if (!line) return null;
    var points = [];
    for (var i = 0; i < line.pathPoints.length; i++) {
        var anchor = line.pathPoints[i].anchor;
        points.push([anchor[0], anchor[1]]);
    }
    return points;
}

function captureZoomTrackingState(index) {
    var keys = {}, rows = {};
    var maps = [index.pictures, index.records, index.markers, index.guides1, index.guides2];
    for (var i = 0; i < maps.length; i++) {
        for (var key in maps[i]) keys[key] = true;
    }
    for (var key in index.pictures) _zoomHistoryPictures[key] = index.pictures[key];
    for (var key in _zoomHistoryPictures) keys[key] = true;
    for (var key in keys) {
        var picture = _zoomHistoryPictures[key];
        if (!zoomItemInIndex(index, picture)) picture = null;
        var record = index.records[key], duplicate = null;
        if (record) {
            for (var c = 0; c < record.zoom.pageItems.length; c++) {
                var child = record.zoom.pageItems[c];
                if (child.typename !== "PathItem") duplicate = child;
            }
        }
        var row = {
            picture: zoomHistoryBounds(picture),
            marker: zoomHistoryBounds(index.markers[key]),
            zoom: zoomHistoryBounds(record && record.zoom),
            duplicate: zoomHistoryBounds(duplicate),
            guide1: zoomHistoryGuide(index.guides1[key]),
            guide2: zoomHistoryGuide(index.guides2[key]),
            recordValue: record ? record.value : null,
            sourceTag: picture ? getTag(picture, "ILST_ZOOM_SRC_" + key) : null
        };
        if (row.marker || row.zoom || row.guide1 || row.guide2 || row.sourceTag) rows[key] = row;
    }
    return rows;
}

function sameZoomTrackingState(first, second) {
    if (first === second) return true;
    if (typeof first !== typeof second || first === null || second === null) return false;
    if (typeof first === "number") return Math.abs(first - second) < 0.01;
    if (typeof first !== "object") return false;
    if (first instanceof Array && first.length !== second.length) return false;
    for (var key in first) {
        if (!sameZoomTrackingState(first[key], second[key])) return false;
    }
    for (var key in second) {
        if (typeof first[key] === "undefined") return false;
    }
    return true;
}

function rebindZoomTrackingHistory(doc, index) {
    // Undo can revive artwork with new native references. Read the document,
    // without writing tags or geometry, so Illustrator keeps its redo stack.
    _zoomTrackedGroups = [];
    for (var key in index.records) {
        if (!index.pictures[key] || !index.markers[key]) continue;
        var record = index.records[key];
        _zoomTrackedGroups.push(readZoomTrackingRecord(key, index.pictures[key], index.markers[key], record.zoom, record.value));
    }
    _zoomLastTrackingState = captureZoomTrackingState(index);
}

function restoreZoomTrackingHistory(doc, index) {
    var undo = null;
    var redo = _zoomRedoHistory.length ? _zoomRedoHistory[_zoomRedoHistory.length - 1] : null;
    var state = null;
    // Several native undos can arrive between two background polls. Locate
    // the matching transaction rather than assuming only the last one moved.
    for (var h = _zoomUndoHistory.length - 1; h >= 0; h--) {
        var candidate = _zoomUndoHistory[h];
        if (!zoomItemInIndex(index, candidate.anchor) || getTag(candidate.anchor, _zoomHistoryTag) !== candidate.beforeToken) continue;
        if (!state) state = captureZoomTrackingState(index);
        if (sameZoomTrackingState(state, candidate.beforeAuto) ||
            (candidate.beforeUser && sameZoomTrackingState(state, candidate.beforeUser))) {
            while (_zoomUndoHistory.length > h + 1) _zoomRedoHistory.push(_zoomUndoHistory.pop());
            undo = candidate;
            break;
        }
    }
    if (undo) {
        if (undo.beforeUser && sameZoomTrackingState(state, undo.beforeUser)) {
            // The user already undid both records before the next poll.
            _zoomRedoHistory.push(_zoomUndoHistory.pop());
            rebindZoomTrackingHistory(doc, index);
            return true;
        }
        if (sameZoomTrackingState(state, undo.beforeAuto)) {
            if (!undo.blocked && undo.beforeUser && typeof app.undo === "function") {
                app.undo();
                var restored = readCurrentZoomRecords(doc);
                if (sameZoomTrackingState(captureZoomTrackingState(restored), undo.beforeUser)) {
                    _zoomRedoHistory.push(_zoomUndoHistory.pop());
                    rebindZoomTrackingHistory(doc, restored);
                    return true;
                }
                // Another user command can sit between the edit and our poll.
                // Put it back immediately; never keep an unrelated undo.
                app.redo();
            }
            undo.blocked = true;
            // Do not mistake restored markers for new user edits, or write a
            // replacement transaction that would erase the native redo stack.
            return true;
        }
    }
    if (redo && zoomItemInIndex(index, redo.anchor)) {
        var token = getTag(redo.anchor, _zoomHistoryTag);
        if (token === redo.afterToken || token === redo.beforeToken) {
            if (!state) state = captureZoomTrackingState(index);
            if (token === redo.afterToken && sameZoomTrackingState(state, redo.afterAuto)) {
                _zoomUndoHistory.push(_zoomRedoHistory.pop());
                rebindZoomTrackingHistory(doc, index);
                return true;
            }
            if (token === redo.beforeToken && sameZoomTrackingState(state, redo.beforeAuto)) {
                if (!redo.redoBlocked && typeof app.redo === "function") {
                    app.redo();
                    var restored = readCurrentZoomRecords(doc);
                    if (sameZoomTrackingState(captureZoomTrackingState(restored), redo.afterAuto)) {
                        _zoomUndoHistory.push(_zoomRedoHistory.pop());
                        rebindZoomTrackingHistory(doc, restored);
                        return true;
                    }
                    app.undo();
                }
                redo.redoBlocked = true;
                return true;
            }
        }
    }
    return false;
}

function recordZoomTrackingHistory(doc, beforeAuto, beforeUser, index) {
    var afterAuto = captureZoomTrackingState(index);
    if (!sameZoomTrackingState(beforeAuto, afterAuto)) {
        var anchor = null;
        for (var key in _zoomHistoryPictures) {
            if (zoomItemInIndex(index, _zoomHistoryPictures[key])) {
                anchor = _zoomHistoryPictures[key];
                break;
            }
        }
        if (anchor) {
            var token = createZoomRecordKey(doc), oldToken = getTag(anchor, _zoomHistoryTag);
            // This tag is written in the same host transaction as the derived
            // artwork. Its rollback proves that the user undid our update.
            addTag(anchor, _zoomHistoryTag, token);
            if (getTag(anchor, _zoomHistoryTag) === token) {
                _zoomUndoHistory.push({ anchor: anchor, beforeToken: oldToken, afterToken: token,
                    beforeUser: beforeUser, beforeAuto: beforeAuto, afterAuto: afterAuto });
                if (_zoomUndoHistory.length > 50) _zoomUndoHistory.shift();
            }
        }
        _zoomRedoHistory = [];
    }
    _zoomLastTrackingState = afterAuto;
}

function zoomBoundsChanged(bounds, previous) {
    for (var i = 0; i < 4; i++) {
        if (Math.abs(bounds[i] - previous[i]) > 0.01) return true;
    }
    return false;
}

function relativeZoomBounds(bounds, sourceBounds) {
    var width = sourceBounds[2] - sourceBounds[0];
    var height = sourceBounds[1] - sourceBounds[3];
    return {
        x: (bounds[0] - sourceBounds[0]) / width,
        y: (sourceBounds[1] - bounds[1]) / height,
        width: (bounds[2] - bounds[0]) / width,
        height: (bounds[1] - bounds[3]) / height
    };
}

function absoluteZoomBounds(relative, sourceBounds) {
    var width = sourceBounds[2] - sourceBounds[0];
    var height = sourceBounds[1] - sourceBounds[3];
    var left = sourceBounds[0] + relative.x * width;
    var top = sourceBounds[1] - relative.y * height;
    return [left, top, left + relative.width * width, top - relative.height * height];
}

function setZoomRectangleBounds(rectangle, bounds) {
    var current = rectangle.geometricBounds;
    var width = bounds[2] - bounds[0];
    var height = bounds[1] - bounds[3];
    // Avoid unnecessary native transforms, which can create undo entries.
    if (Math.abs(current[2] - current[0] - width) > 0.01 || Math.abs(current[1] - current[3] - height) > 0.01) {
        rectangle.resize(width / (current[2] - current[0]) * 100,
            height / (current[1] - current[3]) * 100, true, true, true, true, 100, Transformation.TOPLEFT);
    }
    // PathItem.left/top include the stroke extent in Illustrator. Translate
    // from geometric bounds so styled markers and borders stay on the crop.
    current = rectangle.geometricBounds;
    if (Math.abs(current[0] - bounds[0]) > 0.01 || Math.abs(current[1] - bounds[1]) > 0.01) {
        rectangle.translate(bounds[0] - current[0], bounds[1] - current[1]);
    }
}

function refreshTrackedZoomImage(group, sourceBounds, markerBounds, zoomBounds) {
    var duplicate = null, mask = null, border = null;
    for (var i = 0; i < group.zoom.pageItems.length; i++) {
        var child = group.zoom.pageItems[i];
        if (child.clipping) mask = child;
        else if (child.typename === "PathItem") border = child;
        else duplicate = child;
    }
    if (!duplicate || !mask) return;
    positionZoomDuplicate(duplicate, sourceBounds, markerBounds, zoomBounds);
    setZoomRectangleBounds(mask, zoomBounds);
    if (border) setZoomRectangleBounds(border, zoomBounds);
}

function readZoomTrackingRecord(key, picture, marker, zoom, recordValue) {
    var p = getVisibleBounds(picture) || picture.geometricBounds;
    var m = getVisibleBounds(marker) || marker.geometricBounds;
    var z = getVisibleBounds(zoom) || zoom.geometricBounds;
    var opts = {};
    try { opts = JSON.parse(recordValue) || {}; } catch (e) {}
    return {
        key: key,
        picture: picture,
        marker: marker,
        zoom: zoom,
        recordValue: recordValue,
        placement: opts.placement || "right",
        addGuideLines: opts.addGuideLines === true,
        guideLineExtent: opts.guideLineExtent || "acrossImages",
        strokeColor: opts.strokeColor || "#ff0000",
        strokeWidth: opts.strokeWidth || 1.5,
        strokeDash: opts.strokeDash || "dash",
        lastPBounds: [p[0], p[1], p[2], p[3]],
        lastMBounds: [m[0], m[1], m[2], m[3]],
        lastZBounds: [z[0], z[1], z[2], z[3]],
        relRegion: relativeZoomBounds(m, p)
    };
}

function readCurrentZoomRecords(doc) {
    var index = { records: {}, pictures: {}, markers: {}, guides1: {}, guides2: {}, keys: {}, items: [] };
    // Build one index per poll instead of looking up each cached zoom through
    // its old native reference. Some host references remain readable after a
    // replacement even though they no longer belong to the document.
    for (var i = 0; i < doc.pageItems.length; i++) {
        var item = doc.pageItems[i];
        index.items.push(item);
        for (var t = 0; t < item.tags.length; t++) {
            var tag = item.tags[t];
            if (tag.name.indexOf("ILST_ZOOM_ITEM_") === 0) {
                index.records[tag.name.substring(15)] = { zoom: item, value: tag.value };
            } else if (tag.name.indexOf("ILST_ZOOM_SRC_") === 0) {
                index.pictures[tag.name.substring(14)] = item;
                index.keys[tag.name.substring(14)] = true;
            } else if (tag.name.indexOf("ILST_ZOOM_MARKER_") === 0) {
                index.markers[tag.name.substring(17)] = item;
                index.keys[tag.name.substring(17)] = true;
            } else if (tag.name.indexOf("ILST_ZOOM_GUIDE1_") === 0) {
                index.guides1[tag.name.substring(17)] = item;
                index.keys[tag.name.substring(17)] = true;
            } else if (tag.name.indexOf("ILST_ZOOM_GUIDE2_") === 0) {
                index.guides2[tag.name.substring(17)] = item;
                index.keys[tag.name.substring(17)] = true;
            }
        }
    }
    return index;
}

function removeDeletedZoomAssociations(index) {
    // Document tags also allow cleanup after a panel/script restart, when no
    // cached native reference to the deleted zoom remains.
    for (var key in index.keys) {
        if (index.records[key]) continue;
        try { if (index.guides1[key]) index.guides1[key].remove(); } catch (e) {}
        try { if (index.guides2[key]) index.guides2[key].remove(); } catch (e) {}
        var marker = index.markers[key];
        if (marker) {
            var shared = false;
            for (var t = 0; t < marker.tags.length; t++) {
                var name = marker.tags[t].name;
                if (name.indexOf("ILST_ZOOM_MARKER_") === 0 && index.records[name.substring(17)]) {
                    shared = true;
                    break;
                }
            }
            try {
                if (shared) deleteTag(marker, "ILST_ZOOM_MARKER_" + key);
                else marker.remove();
            } catch (e) {}
        }
        try { if (index.pictures[key]) deleteTag(index.pictures[key], "ILST_ZOOM_SRC_" + key); } catch (e) {}
    }
}

function syncZoomTracker() {
    if (app.documents.length === 0) return sciError("errors.noDocument");
    var doc = app.activeDocument;
    // The modeless editor owns updates until confirm/cancel clears its tags.
    // Background polling must not rewrite the artwork behind its preview.
    if (findItemByTag(doc, "ILST_ZOOM_ACTIVE_TARGET")) return "OK";
    var docName = "";
    try { docName = doc.name; } catch (e) { return "OK"; }
    var index = readCurrentZoomRecords(doc);
    if (_zoomTrackedDocument !== doc || _zoomTrackedDocName !== docName) {
        _zoomTrackedDocument = doc;
        _zoomTrackedDocName = docName;
        _zoomTrackedGroups = [];
        resetZoomTrackingHistory();
    }
    if (restoreZoomTrackingHistory(doc, index)) return "OK";
    var cached = {};
    for (var c = 0; c < _zoomTrackedGroups.length; c++) cached[_zoomTrackedGroups[c].key] = _zoomTrackedGroups[c];
    for (var key in index.records) {
        if (cached[key] && cached[key].recordValue !== index.records[key].value) {
            resetZoomTrackingHistory();
            break;
        }
    }
    var beforeAuto = captureZoomTrackingState(index);
    var beforeUser = _zoomLastTrackingState;
    removeDeletedZoomAssociations(index);
    var remaining = [];
    for (var key in index.records) {
        var currentRecord = index.records[key];
        var picture = index.pictures[key];
        var marker = index.markers[key];
        if (!picture || !marker) continue;
        var group = cached[key];
        if (!group || currentRecord.value !== group.recordValue) {
            // Another CEP window may have replaced the zoom with the same key.
            // Check the document before treating an old reference as deletion.
            group = readZoomTrackingRecord(key, picture, marker, currentRecord.zoom, currentRecord.value);
            remaining.push(group);
            try { refreshZoomGuideLines(doc, group.key, group.picture, group.marker, group.zoom, group, false); } catch (e) {}
            continue;
        }
        // Keep cached positions for movement detection, but use the live object.
        group.zoom = currentRecord.zoom;
        group.picture = picture;
        group.marker = marker;
        remaining.push(group);

        var pBounds = getVisibleBounds(group.picture) || group.picture.geometricBounds;
        var mBounds = getVisibleBounds(group.marker) || group.marker.geometricBounds;
        var zBounds = getVisibleBounds(group.zoom) || group.zoom.geometricBounds;

        var pChanged = zoomBoundsChanged(pBounds, group.lastPBounds);
        var mChanged = zoomBoundsChanged(mBounds, group.lastMBounds);
        var zChanged = zoomBoundsChanged(zBounds, group.lastZBounds);
        if (!pChanged && !mChanged && !zChanged) continue;
        if (pBounds[2] <= pBounds[0] || pBounds[1] <= pBounds[3]) continue;

        if (pChanged) {
            mBounds = absoluteZoomBounds(group.relRegion, pBounds);
            setZoomRectangleBounds(group.marker, mBounds);
            // Source transforms drive only the marker and guide endpoints.
            // The output rectangle keeps its live size and position, including
            // a simultaneous manual transform of the zoom itself.
            mChanged = true;
        }

        var mW = mBounds[2] - mBounds[0];
        var mH = mBounds[1] - mBounds[3];
        if (mW > 0 && mH > 0) {
            // Marker edits change the crop inside the current output bounds.
            // Proportional source/marker transforms leave that crop unchanged.
            if (!pChanged || zChanged) {
                refreshTrackedZoomImage(group, pBounds, mBounds, zBounds);
            }
            group.relRegion = relativeZoomBounds(mBounds, pBounds);
        }
        zBounds = getVisibleBounds(group.zoom) || group.zoom.geometricBounds;
        group.lastPBounds = [pBounds[0], pBounds[1], pBounds[2], pBounds[3]];
        group.lastMBounds = [mBounds[0], mBounds[1], mBounds[2], mBounds[3]];
        group.lastZBounds = [zBounds[0], zBounds[1], zBounds[2], zBounds[3]];
        refreshZoomGuideLines(doc, group.key, group.picture, group.marker, group.zoom, group, false);
    }
    _zoomTrackedGroups = remaining;
    recordZoomTrackingHistory(doc, beforeAuto, beforeUser, readCurrentZoomRecords(doc));
    return "OK";
}
