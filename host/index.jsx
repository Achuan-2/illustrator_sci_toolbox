var csInterface = new CSInterface();

// UI Elements
var arrangeButton = document.querySelector("#arrange-button");
var addLabelButton = document.querySelector("#add-label-button");
var updateLabelButton = document.querySelector("#update-label-button");
var filterTextButton = document.querySelector("#filter-text-button");
var selectTextOnlyButton = document.querySelector("#select-text-only-button");
var excludeTextButton = document.querySelector("#exclude-text-button");
var copyPosButton = document.querySelector("#copy-pos-button");
var pastePosButton = document.querySelector("#paste-pos-button");
// Swap buttons (top-left / top-right / bottom-left / bottom-right)
var swapTLButton = document.querySelector("#swap-tl-button");
var swapTRButton = document.querySelector("#swap-tr-button");
var swapBLButton = document.querySelector("#swap-bl-button");
var swapBRButton = document.querySelector("#swap-br-button");

var reverseMoveCheckbox = document.querySelector("#reverse-move-checkbox");
var relativeCornerSelect = document.querySelector("#relative-corner");
var deltaXInput = document.querySelector("#delta-x");
var deltaYInput = document.querySelector("#delta-y");
var copiedDeltasJSON = '[]';
var allowMismatchPasteCheckbox = document.querySelector("#allow-mismatch-paste");
var useArtboardRefCheckbox = document.querySelector("#use-artboard-ref");

// New: Relative order controls
var relativeOrderSelect = document.querySelector("#relative-order");
// merged into reverseMoveCheckbox

var columnsInput = document.querySelector("#columns");
var rowGapInput = document.querySelector("#row-gap");
var colGapInput = document.querySelector("#col-gap");
var uniformWidthInput = document.querySelector("#uniform-width");
var uniformHeightInput = document.querySelector("#uniform-height");
var useUniformWidthCheckbox = document.querySelector("#use-uniform-width");
var useUniformHeightCheckbox = document.querySelector("#use-uniform-height");

// New: Arrange order controls
var arrangeOrderSelect = document.querySelector("#arrange-order");
var arrangeReverseOrderCheckbox = document.querySelector("#arrange-reverse-order");
var autoLayoutCheckbox = document.querySelector("#auto-layout");
var alignEdgesCheckbox = document.querySelector("#align-edges");
var layoutWidthInput = document.querySelector("#layout-width");

// Distribute spacing UI
var distributeVerticalButton = document.querySelector("#distribute-vertical-button");
var distributeHorizontalButton = document.querySelector("#distribute-horizontal-button");

// Spacing paste UI
var spacingValueHorizontalInput = document.querySelector("#spacing-value-horizontal");
var copySpacingHorizontalButton = document.querySelector("#copy-spacing-horizontal-button");
var spacingValueVerticalInput = document.querySelector("#spacing-value-vertical");
var copySpacingVerticalButton = document.querySelector("#copy-spacing-vertical-button");

var moveLeftHorizontalButton = document.querySelector("#move-left-horizontal-button");
var moveRightHorizontalButton = document.querySelector("#move-right-horizontal-button");
var moveTopVerticalButton = document.querySelector("#move-top-vertical-button");
var moveBottomVerticalButton = document.querySelector("#move-bottom-vertical-button");

var fontFamilyInput = document.querySelector("#font-family");
var fontSizeInput = document.querySelector("#font-size");
var fontBoldCheckbox = document.querySelector("#font-bold");
var labelOffsetXInput = document.querySelector("#label-offset-x");
var labelOffsetYInput = document.querySelector("#label-offset-y");
var labelTemplateSelect = document.querySelector("#label-template");
var fontColorInput = document.querySelector("#font-color");
var labelStartCountInput = document.querySelector("#label-start-count");
var undoLabelIndexButton = document.querySelector("#undo-label-index");
var labelPreview = document.querySelector("#label-preview");
var autoUpdateIndexCheckbox = document.querySelector("#auto-update-index");

// Store label index history for multiple undo functionality
var labelIndexHistory = [1];
var lastAddedLabels = []; // Store references to labels for editing
var currentLabelSessionId = null; // Session id for the latest added labels

// New: Labels order controls
var labelsOrderSelect = document.querySelector("#labels-order");
var labelsReverseOrderCheckbox = document.querySelector("#labels-reverse-order");

// Size Formater UI Elements
var sizeWInput = document.querySelector("#size-w");
var sizeHInput = document.querySelector("#size-h");
var copySizeButton = document.querySelector("#copy-size-button");
var pasteSizeButton = document.querySelector("#paste-size-button");
var useSizeWCheckbox = document.querySelector("#use-size-w");
var useSizeHCheckbox = document.querySelector("#use-size-h");

// Border UI Elements
var borderColorInput = document.querySelector("#border-color");
var borderThicknessInput = document.querySelector("#border-thickness");
var addBorderButton = document.querySelector("#add-border-button");
var borderDashInput = document.querySelector("#border-dash");
var autoGroupBorderCheckbox = document.querySelector("#auto-group-border");

// Event Listeners
arrangeButton.addEventListener("click", handleArrange);
addLabelButton.addEventListener("click", handleAddLabel);
updateLabelButton.addEventListener("click", handleUpdateLabel);
filterTextButton.addEventListener("click", handleFilterText);
if (selectTextOnlyButton) selectTextOnlyButton.addEventListener("click", function () { handleFilterSelection("textOnly"); });
if (excludeTextButton) excludeTextButton.addEventListener("click", function () { handleFilterSelection("excludeText"); });
copyPosButton.addEventListener("click", handleCopyPosition);
pastePosButton.addEventListener("click", handlePastePosition);
if (swapTLButton) swapTLButton.addEventListener("click", function () { handleSwapCorner('TL'); });
if (swapTRButton) swapTRButton.addEventListener("click", function () { handleSwapCorner('TR'); });
if (swapBLButton) swapBLButton.addEventListener("click", function () { handleSwapCorner('BL'); });
if (swapBRButton) swapBRButton.addEventListener("click", function () { handleSwapCorner('BR'); });

copySizeButton.addEventListener("click", handleCopySize);
pasteSizeButton.addEventListener("click", handlePasteSize);

addBorderButton.addEventListener("click", handleAddBorder);

distributeVerticalButton.addEventListener("click", () => handleDistributeSpacing("vertical"));
distributeHorizontalButton.addEventListener("click", () => handleDistributeSpacing("horizontal"));

copySpacingHorizontalButton.addEventListener("click", () => handleCopySpacing("horizontal"));
moveLeftHorizontalButton.addEventListener("click", () => handlePasteSpacing("horizontal", spacingValueHorizontalInput.value, true));
moveRightHorizontalButton.addEventListener("click", () => handlePasteSpacing("horizontal", spacingValueHorizontalInput.value, false));
copySpacingVerticalButton.addEventListener("click", () => handleCopySpacing("vertical"));
moveTopVerticalButton.addEventListener("click", () => handlePasteSpacing("vertical", spacingValueVerticalInput.value, true));
moveBottomVerticalButton.addEventListener("click", () => handlePasteSpacing("vertical", spacingValueVerticalInput.value, false));

// Add event listener for undo label index button
undoLabelIndexButton.addEventListener("click", handleUndoLabelIndex);

// Add event listeners for label preview updates
labelStartCountInput.addEventListener("input", updateLabelPreview);
labelTemplateSelect.addEventListener("change", function () {
    updateLabelPreview();
    // 触发设置保存
    if (typeof PluginSettings !== 'undefined') {
        clearTimeout(PluginSettings.saveTimeout);
        PluginSettings.saveTimeout = setTimeout(function () {
            PluginSettings.save();
        }, 500);
    }
});

// Initialize label preview on page load
updateLabelPreview();

// 确保在设置加载后更新预览
window.addEventListener('load', function () {
    // 延迟执行确保设置已加载
    setTimeout(function () {
        if (typeof updateLabelPreview === 'function') {
            updateLabelPreview();
        }
    }, 100);
});

// Add event listeners for label offset editing mode
labelOffsetXInput.addEventListener("input", handleLabelOffsetChange);
labelOffsetYInput.addEventListener("input", handleLabelOffsetChange);

// Add mouse wheel support for label offset inputs
labelOffsetXInput.addEventListener("wheel", handleLabelOffsetWheel);
labelOffsetYInput.addEventListener("wheel", handleLabelOffsetWheel);

// Add event listeners to exit editing mode when other inputs are clicked
var allInputs = document.querySelectorAll("input, select, button");
allInputs.forEach(function (input) {
    if (input !== labelOffsetXInput && input !== labelOffsetYInput) {
        input.addEventListener("focus", exitLabelEditingMode);
        input.addEventListener("click", exitLabelEditingMode);
    }
});

// Handler Functions
function handleCopyPosition() {
    console.log("Copy Position button clicked");
    var corner = relativeCornerSelect.value;
    var order = (relativeOrderSelect && relativeOrderSelect.value) || "stacking";
    var revOrder = !!reverseMoveCheckbox.checked;

    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript(`copyRelativePosition("${corner}", "${order}", ${revOrder}, ${useArtboardRefCheckbox && useArtboardRefCheckbox.checked})`, function (result) {
        deltaXInput.placeholder = 'ΔX'; // Reset placeholder
        deltaYInput.placeholder = 'ΔY';

        if (result && result.indexOf("Error:") === 0) {
            alert(result);
            return;
        }

        if (result && result !== 'EvalScript error.') {
            copiedDeltasJSON = result; // Store the raw JSON string
            try {
                var data = eval('(' + result + ')');
                if (data && data.abs) {
                    // Absolute canvas position copy
                    deltaXInput.value = parseFloat(data.x).toFixed(2);
                    deltaYInput.value = parseFloat(data.y).toFixed(2);
                } else if (data && typeof data.length !== 'undefined') {
                    // Array of relative deltas
                    if (data.length === 1) {
                        deltaXInput.value = parseFloat(data[0].deltaX).toFixed(2);
                        deltaYInput.value = parseFloat(-data[0].deltaY).toFixed(2); // 取反以匹配用户期望的坐标系（向下为正）
                    } else if (data.length > 1) {
                        deltaXInput.value = '';
                        deltaYInput.value = '';
                        deltaXInput.placeholder = 'Multiple Values (' + data.length + ')';
                        deltaYInput.placeholder = 'Multiple Values (' + data.length + ')';
                    } else {
                        deltaXInput.value = '0.00';
                        deltaYInput.value = '0.00';
                    }
                } else {
                    deltaXInput.value = '0.00';
                    deltaYInput.value = '0.00';
                }
            } catch (e) {
                alert("Failed to parse position data: " + e.message);
                copiedDeltasJSON = '[]';
                deltaXInput.value = '0.00';
                deltaYInput.value = '0.00';
            }
        }
    });
}

function handlePastePosition() {
    console.log("Paste Position button clicked");

    var deltaXStr = deltaXInput.value.trim();
    var deltaYStr = deltaYInput.value.trim();
    var overrideDeltaX = null;
    var overrideDeltaY = null;

    // Use override if inputs are not empty strings. This allows '0' to be a valid override.
    var useOverride = deltaXStr !== '' && deltaYStr !== '';

    if (useOverride) {
        overrideDeltaX = parseFloat(deltaXStr);
        overrideDeltaY = -parseFloat(deltaYStr); // 取反以补偿显示时的取反操作
        if (isNaN(overrideDeltaX) || isNaN(overrideDeltaY)) {
            alert("Invalid number format for ΔX or ΔY.");
            return;
        }
    } else if (!copiedDeltasJSON || copiedDeltasJSON === '[]') {
        alert("No position data has been copied, and no override values are set.");
        return;
    }

    var reverse = !!reverseMoveCheckbox.checked;
    var corner = relativeCornerSelect.value;
    var order = (relativeOrderSelect && relativeOrderSelect.value) || "stacking";
    var revOrder = !!reverseMoveCheckbox.checked;

    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);

    var script = `pasteRelativePosition('${copiedDeltasJSON}', ${reverse}, "${corner}", "${order}", ${revOrder}, ${useOverride ? overrideDeltaX : 'null'}, ${useOverride ? overrideDeltaY : 'null'}, ${allowMismatchPasteCheckbox && allowMismatchPasteCheckbox.checked}, ${useArtboardRefCheckbox && useArtboardRefCheckbox.checked})`;
    csInterface.evalScript(script, function (result) {
        if (result && result.indexOf("Error:") === 0) {
            alert(result);
        }
    });
}


function handleArrange() {
    console.log("Arrange button clicked");
    var columns = parseInt(columnsInput.value) || 3;
    var rowGap = parseFloat(rowGapInput.value);
    if (isNaN(rowGap)) rowGap = 10;
    var colGap = parseFloat(colGapInput.value);
    if (isNaN(colGap)) colGap = 10;
    if (
        useUniformWidthCheckbox.checked &&
        parseFloat(uniformWidthInput.value) < 0
    ) {
        alert("Please specify a valid uniform width");
        return;
    }
    if (
        useUniformHeightCheckbox.checked &&
        parseFloat(uniformHeightInput.value) < 0
    ) {
        alert("Please specify a valid uniform height");
        return;
    }

    var order = (arrangeOrderSelect && arrangeOrderSelect.value) || "stacking";
    var revOrder = !!(arrangeReverseOrderCheckbox && arrangeReverseOrderCheckbox.checked);

    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript(`
        arrangeImages(
            ${columns},
            ${rowGap},
            ${colGap},
            ${useUniformWidthCheckbox.checked},
            ${uniformWidthInput.value},
            ${useUniformHeightCheckbox.checked},
            ${uniformHeightInput.value},
            "${order}",
            ${revOrder},
            ${!!(autoLayoutCheckbox && autoLayoutCheckbox.checked)},
            ${!!(alignEdgesCheckbox && alignEdgesCheckbox.checked)},
            ${parseFloat(layoutWidthInput && layoutWidthInput.value) || 0}
        )
    `, function (result) {
        if (result === 'EvalScript error.') {
            alert('Error executing the script');
        } else if (result) {
            try {
                var res = typeof result === 'string' ? JSON.parse(result) : result;
                if (res && res.layoutWidth !== undefined && layoutWidthInput) {
                    layoutWidthInput.value = res.layoutWidth;
                }
            } catch (e) {
                // Ignore parse error for non-JSON returns
            }
        }
    });
}

function handleCopySize() {
    console.log("Copy Size button clicked");
    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript('copySize()', function (result) {
        if (result && result.indexOf("Error:") === 0) {
            alert(result);
            return;
        }
        if (result && result !== 'EvalScript error.') {
            try {
                var size = eval('(' + result + ')');
                sizeWInput.value = parseFloat(size.width).toFixed(3);
                sizeHInput.value = parseFloat(size.height).toFixed(3);
            } catch (e) {
                alert("Failed to parse size data: " + e.message);
            }
        }
    });
}

function handlePasteSize() {
    console.log("Paste Size button clicked");
    var width = parseFloat(sizeWInput.value);
    var height = parseFloat(sizeHInput.value);
    var useW = useSizeWCheckbox.checked;
    var useH = useSizeHCheckbox.checked;

    if ((useW && isNaN(width)) || (useH && isNaN(height))) {
        alert("Please enter a valid width and height for the selected options.");
        return;
    }

    if (!useW && !useH) {
        alert("Please select at least one dimension (Width or Height) to paste.");
        return;
    }

    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    var script = `pasteSize(${width || 0}, ${height || 0}, ${useW}, ${useH})`;
    csInterface.evalScript(script, function (result) {
        if (result && result.indexOf("Error:") === 0) {
            alert(result);
        } else if (result === 'EvalScript error.') {
            alert('Error executing the pasteSize script.');
        }
    });
}

function handleAddLabel() {
    var fontFamily = fontFamilyInput.value || "Arial";
    var fontSize = parseFloat(fontSizeInput.value) || 6;
    var fontBold = !!(fontBoldCheckbox && fontBoldCheckbox.checked);
    var labelOffsetX = parseFloat(labelOffsetXInput.value) || 0;
    var labelOffsetY = parseFloat(labelOffsetYInput.value) || 0;
    var labelTemplate = labelTemplateSelect.value || "a";
    var fontColor = fontColorInput.value || "#000000";
    var startCount = parseInt(labelStartCountInput.value) || 1;

    // Store current index in history before making changes
    labelIndexHistory.push(startCount);

    var order = (labelsOrderSelect && labelsOrderSelect.value) || "stacking";
    var revOrder = !!(labelsReverseOrderCheckbox && labelsReverseOrderCheckbox.checked);

    // Generate a session id for this labeling action
    currentLabelSessionId = Date.now();

    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript(`
        addLabelsToImages(
            "${fontFamily}",
            ${fontSize},
            ${fontBold},
            ${labelOffsetX},
            ${labelOffsetY},
            "${labelTemplate}",
            "${fontColor}",
            "${order}",
            ${revOrder},
            ${startCount},
            ${currentLabelSessionId}
        )
    `, function (result) {
        if (result === 'EvalScript error.') {
            alert('Error executing the script');
        } else if (result.indexOf("Error:") === 0) {
            alert(result);
        } else {
            // Update the start count with the new count only if auto-update is enabled
            if (autoUpdateIndexCheckbox && autoUpdateIndexCheckbox.checked) {
                var nextCount = parseInt(result);
                if (!isNaN(nextCount)) {
                    labelStartCountInput.value = nextCount;
                    // Update the label preview
                    updateLabelPreview();
                }
            }

            // Enable editing mode for label offsets after adding labels
            enterLabelEditingMode();

            // 保存设置到记忆
            if (typeof PluginSettings !== 'undefined') {
                PluginSettings.save();
            }
        }
    });
}

function handleUpdateLabel() {
    var fontFamily = fontFamilyInput.value || "Arial";
    var fontSize = parseFloat(fontSizeInput.value) || 6;
    var fontBold = !!(fontBoldCheckbox && fontBoldCheckbox.checked);
    var labelTemplate = labelTemplateSelect.value || "a";
    var fontColor = fontColorInput.value || "#000000";
    var startCount = parseInt(labelStartCountInput.value) || 1;

    var order = (labelsOrderSelect && labelsOrderSelect.value) || "stacking";
    var revOrder = !!(labelsReverseOrderCheckbox && labelsReverseOrderCheckbox.checked);

    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript(`
        updateLabelIndex(
            "${fontFamily}",
            ${fontSize},
            ${fontBold},
            "${labelTemplate}",
            "${fontColor}",
            "${order}",
            ${revOrder},
            ${startCount}
        )
    `, function (result) {
        if (result === 'EvalScript error.') {
            alert('Error executing the script');
        } else if (result.indexOf("Error:") === 0) {
            alert(result);
        } else {
            // 解析返回结果，如果包含更新的文本框数量，则更新Label Index
            try {
                var updateInfo = result.split('|'); // 假设返回格式为 "Success|count"
                if (updateInfo.length === 2 && updateInfo[0] === "Success") {
                    var updatedCount = parseInt(updateInfo[1]);
                    // Only update if auto-update is enabled
                    if (!isNaN(updatedCount) && autoUpdateIndexCheckbox && autoUpdateIndexCheckbox.checked) {
                        var nextCount = startCount + updatedCount;
                        labelStartCountInput.value = nextCount;

                        // Update the label preview
                        updateLabelPreview();

                        // 也可以存储到历史记录中
                        labelIndexHistory.push(nextCount);
                    }
                }
            } catch (e) {
                // 如果解析失败，仍然显示成功消息
                console.log("Labels updated successfully");
            }

            // 保存设置到记忆
            if (typeof PluginSettings !== 'undefined') {
                PluginSettings.save();
            }
        }
    });
}

function handleFilterText() {
    console.log("Filter Text button clicked");

    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript('filterTextFrames()', function (result) {
        if (result === 'EvalScript error.') {
            alert('Error executing the script');
        } else if (result.indexOf("Error:") === 0) {
            alert(result);
        } else {
            // 解析结果显示筛选信息
            try {
                var filterInfo = result.split('|');
                if (filterInfo.length === 2 && filterInfo[0] === "Success") {
                    var textCount = parseInt(filterInfo[1]);
                    if (textCount === 0) {
                        alert('没有找到文本框对象');
                    } else {
                        console.log('已筛选出 ' + textCount + ' 个文本框');
                    }
                }
            } catch (e) {
                console.log("Text filtering completed");
            }
        }
    });
}

function handleUndoLabelIndex() {
    console.log("Undo Label Index button clicked");

    // Remove the last entry from history if it's not the only one
    if (labelIndexHistory.length > 1) {
        labelIndexHistory.pop();
    }

    // Get the previous value from history
    var previousIndex = labelIndexHistory[labelIndexHistory.length - 1];
    labelStartCountInput.value = previousIndex;

    // If we've reached 1, don't allow further undos by keeping only [1] in history
    if (previousIndex === 1) {
        labelIndexHistory = [1];
    }

    // Update the label preview
    updateLabelPreview();
}

function updateLabelPreview() {
    var startCount = parseInt(labelStartCountInput.value) || 1;
    var labelTemplate = labelTemplateSelect.value || "a";

    var templates = {
        "A": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "a": "abcdefghijklmnopqrstuvwxyz",
        "(A)": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "(a)": "abcdefghijklmnopqrstuvwxyz",
        "A)": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "a)": "abcdefghijklmnopqrstuvwxyz"
    };

    var labels = templates[labelTemplate] || templates["a"];
    var startIndex = startCount - 1;
    var labelIndex = startIndex % labels.length;
    var label = labels[labelIndex];

    if (labelTemplate === "A)" || labelTemplate === "a)") {
        label += ")";
    } else if (labelTemplate === "(A)" || labelTemplate === "(a)") {
        label = "(" + label + ")";
    }

    if (labelPreview) {
        labelPreview.textContent = label;
    }
}

function handleSwapCorner(corner) {
    console.log("Swap button clicked (corner):", corner);
    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript(`swapSelectedPositions("${corner}")`, function (result) {
        if (result && result.indexOf && result.indexOf("Error:") === 0) {
            alert(result);
        } else if (result === 'EvalScript error.') {
            alert('Error executing the swapSelectedPositions script.');
        }
    });
}

function handleDistributeSpacing(orientation) {
    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript(`distributeSpacing("${orientation}")`, function (result) {
        if (result && result.indexOf && result.indexOf("Error:") === 0) {
            alert(result);
        } else if (result === 'EvalScript error.') {
            alert('Error executing the distributeSpacing script.');
        }
    });
}

function handleCopySpacing(direction) {
    console.log("Copy Spacing button clicked");
    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript(`copySpacing("${direction}")`, function (result) {
        if (result && result.indexOf("Error:") === 0) {
            alert(result);
            return;
        }
        if (result && result !== 'EvalScript error.') {
            if (direction === "horizontal") {
                spacingValueHorizontalInput.value = parseFloat(result).toFixed(3);
            } else {
                spacingValueVerticalInput.value = parseFloat(result).toFixed(3);
            }
        }
    });
}

function handlePasteSpacing(direction, spacingValue, moveLeftOrTop) {
    console.log("Paste Spacing button clicked");
    var spacing = parseFloat(spacingValue);

    if (isNaN(spacing)) {
        alert("Please enter a valid spacing value.");
        return;
    }

    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript(`pasteSpacing("${direction}", ${spacing}, ${moveLeftOrTop})`, function (result) {
        if (result && result.indexOf("Error:") === 0) {
            alert(result);
        } else if (result === 'EvalScript error.') {
            alert('Error executing the pasteSpacing script.');
        }
    });
}


// Functions for label offset editing mode
function enterLabelEditingMode() {
    labelOffsetXInput.classList.add("editing-mode");
    labelOffsetYInput.classList.add("editing-mode");

    // Set tooltips for editing mode
    labelOffsetXInput.title = "更改数值，将实时移动标签位置";
    labelOffsetYInput.title = "更改数值，将实时移动标签位置";
}

function exitLabelEditingMode() {
    labelOffsetXInput.classList.remove("editing-mode");
    labelOffsetYInput.classList.remove("editing-mode");

    // Clear tooltips when exiting editing mode
    labelOffsetXInput.title = "";
    labelOffsetYInput.title = "";
}

function handleLabelOffsetChange() {
    // Only handle real-time updates if in editing mode
    if (!labelOffsetXInput.classList.contains("editing-mode") ||
        !labelOffsetYInput.classList.contains("editing-mode")) {
        return;
    }

    var newOffsetX = parseFloat(labelOffsetXInput.value) || 0;
    var newOffsetY = parseFloat(labelOffsetYInput.value) || 0;
    var sid = (typeof currentLabelSessionId === 'number') ? currentLabelSessionId : -1;

    // Update label positions in real-time
    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript(`updateLabelOffsets(${newOffsetX}, ${newOffsetY}, ${sid})`, function (result) {
        if (result && result.indexOf("Error:") === 0) {
            console.log("Error updating label offsets: " + result);
        }
    });
}

function handleLabelOffsetWheel(event) {
    // Only handle wheel events in editing mode
    if (!labelOffsetXInput.classList.contains("editing-mode") ||
        !labelOffsetYInput.classList.contains("editing-mode")) {
        return;
    }

    event.preventDefault();

    var input = event.target;
    var currentValue = parseFloat(input.value) || 0;
    var step = event.shiftKey ? 10 : 1; // Hold Shift for larger steps
    var delta = event.deltaY > 0 ? -step : step; // Scroll up = increase, down = decrease

    input.value = currentValue + delta;

    // Trigger the input change handler to update labels in real-time
    handleLabelOffsetChange();
}

function handleAddBorder() {
    console.log("Add Border button clicked");
    var color = borderColorInput.value;
    var thickness = parseFloat(borderThicknessInput.value);
    var dash = parseFloat(borderDashInput && borderDashInput.value) || 0;
    var autoGroup = autoGroupBorderCheckbox && autoGroupBorderCheckbox.checked;
    if (isNaN(thickness) || thickness <= 0) {
        alert("Invalid thickness value.");
        return;
    }

    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript(`addBorder("${color}", ${thickness}, ${dash}, ${autoGroup})`, function (result) {
        if (result && result.indexOf("Error:") === 0) {
            alert(result);
        }
    });
}

function handleFilterSelection(mode) {
    console.log("Filter Selection clicked: " + mode);
    csInterface.evalScript(`$.evalFile("${csInterface.getSystemPath(SystemPath.EXTENSION)}/jsx/arrange.jsx")`);
    csInterface.evalScript(`filterSelection("${mode}")`, function (result) {
        if (result === 'EvalScript error.') {
            alert('Error executing the script');
        } else if (result && result.indexOf("Error:") === 0) {
            alert(result);
        } else if (result && result.indexOf("Success|") === 0) {
            var msg = result.split('|')[1];
            console.log("Selection filter:", msg);
        }
    });
}
