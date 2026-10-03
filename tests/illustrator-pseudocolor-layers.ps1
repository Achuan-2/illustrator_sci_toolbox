param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PseudocolorLayersIllustrator {
    [DllImport("oleaut32.dll", PreserveSig = false)]
    private static extern void GetActiveObject(ref Guid clsid, IntPtr reserved,
        [MarshalAs(UnmanagedType.IUnknown)] out object application);
    public static object Attach() {
        var clsid = Type.GetTypeFromProgID("Illustrator.Application", true).GUID;
        object application;
        GetActiveObject(ref clsid, IntPtr.Zero, out application);
        return application;
    }
}
'@

$taskRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path.Replace('\', '/')
$taskRootJson = ConvertTo-Json -InputObject $taskRoot -Compress
$taskScript = '(function () { var repositoryRoot = ' + $taskRootJson + ';' + @'
    function read(path) {
        var file = new File(repositoryRoot + path);
        file.encoding = "UTF-8";
        if (!file.open("r")) throw new Error("Cannot read " + path);
        var code = file.read(); file.close(); return code;
    }
    eval(read("/src/jsx/lib/json2.js"));
    // Compile in a private scope without replacing the installed dispatcher.
    var api = new Function("JSON", read("/src/jsx/ilst/arrange.jsx") +
        read("/src/jsx/ilst/pseudocolorLayers.jsx") +
        ';return {applyLayers:applyPseudocolorLayers,' +
        'inspectLayers:inspectPseudocolorLayerTargets,' +
        'failSecondCopy:function(){var original=makePseudocolorLayerGroup,count=0;' +
        'makePseudocolorLayerGroup=function(parent,entry,lut,left,top){if(++count===2)throw new Error("Fixture duplication failure");' +
        'return original(parent,entry,lut,left,top);};return function(){makePseudocolorLayerGroup=original;};},' +
        'failSecondUpdate:function(){var original=recolorPseudocolorLayer,count=0;' +
        'recolorPseudocolorLayer=function(entry,lut){original(entry,lut);if(++count===2)throw new Error("Fixture color setter failure");};' +
        'return function(){recolorPseudocolorLayer=original;};}};')(JSON);
    var originalDoc = app.documents.length ? app.activeDocument : null;
    var originalCount = app.documents.length;
    var originalCoordinates = app.coordinateSystem;
    var doc = null, seed = null, edgeSeed = null, result, checks = [], timings = {}, pixelPaths = [];
    function capturePixels(item, label) {
        var file = new File(seed.fsName + "_" + label + ".png");
        pixelPaths.push(file.fsName);
        var options = new ImageCaptureOptions(); options.resolution = 72;
        options.transparency = true; options.antiAliasing = true;
        // Use a private helper to isolate fixture artwork during verification.
        var capture = new Function(read("/src/jsx/ilst/arrange.jsx") + ';return captureZoomSourcePreview;')();
        capture(doc, item, file, options);
    }
    function assert(value, message) { if (!value) throw new Error(message); }
    try {
        doc = app.documents.add(DocumentColorSpace.RGB, 1600, 1000);
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        var rect = doc.pathItems.rectangle(800, 0, 720, 540);
        var gray = new RGBColor(); gray.red = 100; gray.green = 100; gray.blue = 100;
        rect.fillColor = gray; rect.stroked = false;
        seed = new File(Folder.temp.fsName + "/sci_preview_fixture_" + new Date().getTime() + ".png");
        var options = new ImageCaptureOptions(); options.resolution = 144;
        options.transparency = true; options.antiAliasing = true;
        doc.imageCapture(seed, rect.geometricBounds, options);
        rect.remove();
        var placed = doc.placedItems.add(); placed.file = seed;
        placed.width = 720; placed.height = 540; placed.position = [0, 800]; placed.embed();
        var first = doc.rasterItems[0], second = first.duplicate();
        second.position = [760, 800];
        doc.selection = [first, second];

        doc.selection = [first];
        var layerStart = new Date().getTime();
        var layerResult = api.applyLayers(JSON.stringify({mode:"batch",lut:"red",keepOriginal:true}));
        assert(layerResult === "1", "Native tint failed: " + layerResult);
        timings.layerTint = new Date().getTime() - layerStart;
        var tintRoot = doc.selection[0], tinted = tintRoot.groupItems[0];
        assert(tinted.pathItems[0].fillColor.red === 255 && tinted.pathItems[0].fillColor.green === 0,
            "Tint object is not red");
        assert(tinted.rasterItems[0].blendingMode === BlendModes.NORMAL, "Source image must retain Normal blending");
        assert(tinted.pathItems[0].blendingMode === BlendModes.DARKEN, "Tint must darken over a neutral backdrop");
        assert(tinted.isIsolated, "Channel blending must be isolated");
        capturePixels(first, "gray");
        capturePixels(tintRoot, "red");
        doc.selection = [first,second];
        layerStart = new Date().getTime();
        layerResult = api.applyLayers(JSON.stringify({mode:"merge"}));
        assert(layerResult === "2", "Native merge failed: " + layerResult);
        timings.layerMerge = new Date().getTime() - layerStart;
        var mergedRoot = doc.selection[0];
        assert(mergedRoot.groupItems.length === 2, "Merge must retain separate channel groups");
        var screenCount = 0;
        for (var channelIndex = 0; channelIndex < mergedRoot.groupItems.length; channelIndex++) {
            var channel = mergedRoot.groupItems[channelIndex];
            if (channel.blendingMode === BlendModes.SCREEN) screenCount++;
            assert(Math.abs(channel.left - mergedRoot.left) < 0.01, "Channel left edges differ");
            assert(Math.abs(channel.top - mergedRoot.top) < 0.01, "Channel top edges differ");
        }
        assert(screenCount === 1, "Native merge must use Screen for the upper channel");
        assert(first.parent && second.parent, "Layer operation removed originals");
        capturePixels(mergedRoot, "merge");
        checks.push("native editable tint and Screen merge retain sources and aligned channel groups");
        // Test actual rendered colors, not just blend-mode properties. Fractional
        // positions expose the antialiasing fringe from the former tint backdrop.
        var luts = ["red","green","blue","cyan","magenta","yellow","grays"];
        for (var colorIndex = 0; colorIndex < luts.length; colorIndex++) {
            doc.selection = [first];
            assert(api.applyLayers(JSON.stringify({mode:"batch",lut:luts[colorIndex]})) === "1", "Color tint failed");
            var colorRoot = doc.selection[0];
            capturePixels(colorRoot, "color_" + luts[colorIndex]);
            colorRoot.remove();
        }
        var edgeRect = doc.pathItems.rectangle(200, 20, 64, 64);
        var black = new RGBColor(); black.red = 0; black.green = 0; black.blue = 0;
        edgeRect.stroked = false; edgeRect.fillColor = black;
        edgeSeed = new File(seed.fsName + "_edge_seed.png");
        doc.imageCapture(edgeSeed, edgeRect.geometricBounds, options);
        edgeRect.remove();
        var edgeSource = doc.placedItems.add(); edgeSource.file = edgeSeed;
        edgeSource.width = 64; edgeSource.height = 64; edgeSource.position = [20.476,200.38];
        for (var edgeIndex = 0; edgeIndex < luts.length; edgeIndex++) {
            doc.selection = [edgeSource];
            assert(api.applyLayers(JSON.stringify({mode:"batch",lut:luts[edgeIndex]})) === "1", "Edge tint failed");
            var edgeRoot = doc.selection[0], edgeBounds = edgeRoot.geometricBounds;
            var edgeFile = new File(seed.fsName + "_edge_" + luts[edgeIndex] + ".png");
            pixelPaths.push(edgeFile.fsName);
            var edgeOptions = new ImageCaptureOptions();
            edgeOptions.resolution = 144; edgeOptions.transparency = true; edgeOptions.antiAliasing = true;
            doc.imageCapture(edgeFile, [edgeBounds[0]-2,edgeBounds[1]+2,edgeBounds[2]+2,edgeBounds[3]-2], edgeOptions);
            assert(edgeRoot.width === 64 && edgeRoot.height === 64, "Tint must preserve full image dimensions");
            edgeRoot.remove();
        }
        edgeSource.remove();
        checks.push("seven native colors retain intensity and fractional-position black edges retain full image dimensions");
        var recolorBounds = tintRoot.geometricBounds, recolorCount = doc.pageItems.length;
        tintRoot.name = "Fixture pseudocolor";
        tinted.name = "Fixture channel"; tinted.pathItems[0].name = "Fixture tint";
        for (var repeat = 0; repeat < 2; repeat++) {
            doc.selection = [tintRoot];
            assert(api.applyLayers(JSON.stringify({mode:"batch",lut:repeat ? "green" : "blue",keepOriginal:!repeat})) === "1", "Recolor failed");
            assert(doc.selection[0] === tintRoot && doc.pageItems.length === recolorCount, "Recolor must update the same group without duplication");
            assert(tintRoot.name === "Fixture pseudocolor" && tinted.name === "Fixture channel", "Recolor overwrote custom group names");
            assert(Math.abs(tintRoot.left-recolorBounds[0]) < 0.001 && Math.abs(tintRoot.top-recolorBounds[1]) < 0.001 &&
                tintRoot.width === 720 && tintRoot.height === 540, "Recolor moved or resized the image");
        }
        // Direct selection of the image inside a result also resolves that result.
        doc.selection = [tinted.rasterItems[0]];
        assert(api.applyLayers(JSON.stringify({mode:"batch",lut:"blue"})) === "1", "Direct-selected source recolor failed");
        assert(doc.selection[0] === tintRoot && doc.pageItems.length === recolorCount, "Direct-selected source created a nested result");
        capturePixels(tintRoot, "updated_blue");
        doc.selection = [second];
        assert(api.applyLayers(JSON.stringify({mode:"batch",lut:"green"})) === "1", "Second tinted source failed");
        var greenRoot = doc.selection[0];
        var manuallyEditedTint = greenRoot.groupItems[0].pathItems[0], manualBlue = new RGBColor();
        manualBlue.red = 0; manualBlue.green = 0; manualBlue.blue = 255;
        manuallyEditedTint.fillColor = manualBlue;
        assert(JSON.parse(api.inspectLayers()).targets[0].lut === "blue", "Inspect ignored a supported tint edited in the Layers panel");
        var manualGreen = new RGBColor(); manualGreen.red = 0; manualGreen.green = 255; manualGreen.blue = 0;
        manuallyEditedTint.fillColor = manualGreen;
        doc.selection = [tintRoot,greenRoot];
        var coloredSession = JSON.parse(api.inspectLayers());
        assert(coloredSession.targets.length === 2 &&
            ((coloredSession.targets[0].lut === "blue" && coloredSession.targets[1].lut === "green") ||
             (coloredSession.targets[0].lut === "green" && coloredSession.targets[1].lut === "blue")), "Inspect lost existing colors");
        assert(api.applyLayers(JSON.stringify({mode:"merge"})) === "2", "Already-tinted channel merge failed");
        capturePixels(doc.selection[0], "updated_merge_cyan");
        assert(tintRoot.parent && greenRoot.parent, "Merge removed tinted originals");
        checks.push("renamed groups and direct-selected sources recolor in place; existing blue/green colors merge without retinting colored pixels");
        // Backward compatibility with the original two-item Multiply result.
        var legacyRoot = tintRoot.duplicate(), legacyChannel = legacyRoot.groupItems[0];
        legacyRoot.name = "SCI Pseudocolor blue"; legacyRoot.note = "";
        legacyChannel.name = "LUT blue — Legacy"; legacyChannel.note = "";
        var legacyTint = legacyChannel.pathItems[0], legacySource = legacyChannel.rasterItems[0];
        legacyChannel.pathItems[1].remove();
        legacyTint.note = ""; legacyTint.blendingMode = BlendModes.NORMAL;
        legacyTint.move(legacySource, ElementPlacement.PLACEAFTER);
        legacySource.blendingMode = BlendModes.MULTIPLY;
        var legacyCount = doc.pageItems.length;
        doc.selection = [legacyRoot];
        assert(api.applyLayers(JSON.stringify({mode:"batch",lut:"yellow",keepOriginal:true})) === "1", "Legacy result was not recognized");
        assert(doc.selection[0] === legacyRoot && doc.pageItems.length === legacyCount, "Legacy recolor duplicated the result");
        capturePixels(legacyRoot, "legacy_yellow");
        doc.selection = [legacyRoot,greenRoot];
        var configuredSession = JSON.parse(api.inspectLayers()), configuredChannels = [];
        for (var configuredIndex = 0; configuredIndex < configuredSession.targets.length; configuredIndex++)
            configuredChannels.push({enabled:true,lut:configuredSession.targets[configuredIndex].lut === "yellow" ? "red" : "blue"});
        assert(api.applyLayers(JSON.stringify({mode:"merge",sessionId:configuredSession.sessionId,channels:configuredChannels})) === "2", "Configured tinted merge failed");
        capturePixels(doc.selection[0], "configured_merge_magenta");
        assert(legacyTint.fillColor.red === 255 && legacyTint.fillColor.green === 255 && legacyTint.fillColor.blue === 0,
            "Configured merge changed an original tint");
        // A partial color-setter failure must also remove staged new groups.
        doc.selection = [tintRoot,greenRoot,first];
        var updatePageCount = doc.pageItems.length, restoreUpdate = api.failSecondUpdate();
        try {
            var updateFailure = api.applyLayers(JSON.stringify({mode:"batch",lut:"red",keepOriginal:false}));
            assert(updateFailure.indexOf("Error: errors.layerApply") === 0, "Expected a color setter failure");
        } finally { restoreUpdate(); }
        assert(doc.pageItems.length === updatePageCount && doc.selection.length === 3 && first.parent,
            "Failed mixed update left objects or removed originals");
        assert(tinted.pathItems[0].fillColor.blue === 255 && tinted.pathItems[0].fillColor.red === 0 &&
            greenRoot.groupItems[0].pathItems[0].fillColor.green === 255 && greenRoot.groupItems[0].pathItems[0].fillColor.red === 0,
            "Failed update did not restore original colors");
        doc.selection = [tintRoot,greenRoot];
        var movedSession = JSON.parse(api.inspectLayers());
        tinted.rasterItems[0].translate(5,0);
        assert(api.applyLayers(JSON.stringify({mode:"merge",sessionId:movedSession.sessionId})).indexOf("Error: errors.pseudocolorStale") === 0,
            "Moving a source inside a tinted group must invalidate its session");
        tinted.rasterItems[0].translate(-5,0);
        doc.selection = [first,tintRoot];
        assert(api.applyLayers(JSON.stringify({mode:"merge"})) === "2", "Mixed grayscale and tinted merge failed");
        checks.push("legacy Multiply results and configured recoloring merges; mixed-update rollback, stale internal sources and mixed channel selections");
        doc.selection = [first,second];
        var pageCount = doc.pageItems.length;
        var restoreCopy = api.failSecondCopy();
        try {
            var failure = api.applyLayers(JSON.stringify({mode:"batch",lut:"red",keepOriginal:false}));
            assert(failure.indexOf("Error: errors.layerApply") === 0, "Expected a localized copy failure");
        } finally { restoreCopy(); }
        assert(doc.pageItems.length === pageCount, "Failed batch left partial layer objects");
        assert(doc.selection.length === 2 &&
            ((doc.selection[0] === first && doc.selection[1] === second) ||
             (doc.selection[0] === second && doc.selection[1] === first)),
            "Failed batch changed originals or selection");
        var layerSession = JSON.parse(api.inspectLayers());
        first.translate(5,0);
        var stale = api.applyLayers(JSON.stringify({mode:"merge",sessionId:layerSession.sessionId}));
        assert(stale.indexOf("Error: errors.pseudocolorStale") === 0, "Moved channel must invalidate its session");
        first.translate(-5,0);
        assert(doc.pageItems.length === pageCount, "Stale session mutated the document");
        doc.selection = [first];
        var replaced = api.applyLayers(JSON.stringify({mode:"batch",lut:"blue",keepOriginal:false}));
        assert(replaced === "1", "In-place layer replacement failed");
        assert(doc.selection[0].groupItems[0].rasterItems.length === 1, "Replacement lost the editable source copy");
        var removed = false;
        try { removed = !first.parent; } catch (removedError) { removed = true; }
        assert(removed, "In-place replacement must remove the original object after staging succeeds");
        checks.push("native batch rollback, stale-channel validation and in-place replacement");
        result = {ok:true,checks:checks,timingsMs:timings};
    } catch (error) {
        result = {ok:false,error:String(error),checks:checks,timingsMs:timings};
    } finally {
        if (doc) doc.close(SaveOptions.DONOTSAVECHANGES);
        if (seed && seed.exists) seed.remove();
        if (edgeSeed && edgeSeed.exists) edgeSeed.remove();
        if (originalDoc) originalDoc.activate();
        app.coordinateSystem = originalCoordinates;
    }
    result.cleanup = app.documents.length === originalCount && (!originalDoc || app.activeDocument === originalDoc);
    result.pixelPaths = pixelPaths;
    if (!result.cleanup) result.ok = false;
    return JSON.stringify(result);
})()
'@
$taskIllustrator = [PseudocolorLayersIllustrator]::Attach()
$taskResult = $taskIllustrator.DoJavaScript($taskScript)
$taskResult
$taskParsed = ConvertFrom-Json -InputObject $taskResult
try {
    if (!$taskParsed.ok) { throw "Illustrator pseudocolor layer verification failed: $($taskParsed.error)" }
    Add-Type -AssemblyName System.Drawing
    $taskSamples = @()
    foreach ($taskImagePath in $taskParsed.pixelPaths) {
        $taskBitmap = [System.Drawing.Bitmap]::FromFile($taskImagePath)
        try { $taskSamples += $taskBitmap.GetPixel([int]($taskBitmap.Width / 2), [int]($taskBitmap.Height / 2)) }
        finally { $taskBitmap.Dispose() }
    }
    $taskGray = $taskSamples[0]; $taskRed = $taskSamples[1]; $taskMerge = $taskSamples[2]
    if ([Math]::Abs($taskRed.R - $taskGray.R) -gt 3 -or $taskRed.G -gt 3 -or $taskRed.B -gt 3) {
        throw "Rendered layer tint does not preserve grayscale intensity: $taskRed"
    }
    if ([Math]::Abs($taskMerge.R - $taskGray.R) -gt 3 -or [Math]::Abs($taskMerge.G - $taskGray.G) -gt 3 -or $taskMerge.B -gt 3) {
        throw "Rendered RGB channel merge is incorrect: $taskMerge"
    }
    $taskComponents = @(@(1,0,0),@(0,1,0),@(0,0,1),@(0,1,1),@(1,0,1),@(1,1,0),@(1,1,1))
    for ($colorIndex = 0; $colorIndex -lt 7; $colorIndex++) {
        $actual = $taskSamples[3 + $colorIndex]
        $components = $taskComponents[$colorIndex]
        if ([Math]::Abs($actual.R - $taskGray.R * $components[0]) -gt 3 -or
            [Math]::Abs($actual.G - $taskGray.G * $components[1]) -gt 3 -or
            [Math]::Abs($actual.B - $taskGray.B * $components[2]) -gt 3) {
            throw "Native solid color $colorIndex does not preserve grayscale intensity: $actual"
        }
        $edgeBitmap = [System.Drawing.Bitmap]::FromFile($taskParsed.pixelPaths[10 + $colorIndex])
        try {
            for ($y = 0; $y -lt $edgeBitmap.Height; $y++) {
                for ($x = 0; $x -lt $edgeBitmap.Width; $x++) {
                    $edgePixel = $edgeBitmap.GetPixel($x, $y)
                    if ($edgePixel.A -gt 0 -and ($edgePixel.R -gt 3 -or $edgePixel.G -gt 3 -or $edgePixel.B -gt 3)) {
                        throw "Tint leaks onto black image edge: color=$colorIndex, x=$x, y=$y, pixel=$edgePixel"
                    }
                }
            }
        } finally { $edgeBitmap.Dispose() }
    }
    $taskUpdatedComponents = @(@(0,0,1),@(0,1,1),@(1,1,0),@(1,0,1))
    for ($updatedIndex = 0; $updatedIndex -lt $taskUpdatedComponents.Count; $updatedIndex++) {
        $actual = $taskSamples[17 + $updatedIndex]; $components = $taskUpdatedComponents[$updatedIndex]
        if ([Math]::Abs($actual.R - $taskGray.R * $components[0]) -gt 3 -or
            [Math]::Abs($actual.G - $taskGray.G * $components[1]) -gt 3 -or
            [Math]::Abs($actual.B - $taskGray.B * $components[2]) -gt 3) {
            throw "Updated or merged existing tint has incorrect rendered pixels: index=$updatedIndex, pixel=$actual"
        }
    }
    "Native rendered pixel verification passed: gray=$taskGray; red=$taskRed; merge=$taskMerge"
} finally {
    foreach ($taskImagePath in $taskParsed.pixelPaths) {
        if (Test-Path -LiteralPath $taskImagePath) { Remove-Item -LiteralPath $taskImagePath -Force }
    }
}
