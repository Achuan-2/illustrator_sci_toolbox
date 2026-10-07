param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$LegacyRevision = '9c51b31',
    [int[]]$ArtworkCounts = @(0, 1000, 5000, 10000),
    [switch]$SkipLegacy,
    [string]$ReportPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist/illustrator-performance.json')
)

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PerformanceIllustrator {
    [DllImport("oleaut32.dll", PreserveSig = false)]
    private static extern void GetActiveObject(ref Guid clsid, IntPtr reserved,
        [MarshalAs(UnmanagedType.IUnknown)] out object application);
    public static object Attach() {
        var clsid = Type.GetTypeFromProgID("Illustrator.Application", true).GUID;
        object application; GetActiveObject(ref clsid, IntPtr.Zero, out application);
        return application;
    }
}
'@

$taskRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$taskTemp = Join-Path ([IO.Path]::GetTempPath()) ('sci-performance-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($taskTemp) | Out-Null
$taskLegacyPath = Join-Path $taskTemp 'legacy.jsx'
$taskLegacyScalePath = Join-Path $taskTemp 'legacy-scalebar.jsx'
$taskImagePath = Join-Path $taskTemp 'imagej.tif'
Push-Location -LiteralPath $taskRoot
try {
    $taskLegacy = & git show "${LegacyRevision}:src/jsx/ilst/arrange.jsx"
    if ($LASTEXITCODE) { throw 'Cannot read the baseline host source' }
    [IO.File]::WriteAllText($taskLegacyPath, ($taskLegacy -join "`n"), [Text.UTF8Encoding]::new($false))
    $taskLegacyScale = & git show "${LegacyRevision}:src/jsx/ilst/scalebar.jsx"
    if ($LASTEXITCODE) { throw 'Cannot read the baseline scalebar source' }
    [IO.File]::WriteAllText($taskLegacyScalePath, ($taskLegacyScale -join "`n"), [Text.UTF8Encoding]::new($false))
    node --import tsx --input-type=module -e 'import fs from "node:fs"; import { calibratedTiff } from "./tests/fixtures/scalebarTiff.ts"; fs.writeFileSync(process.argv[1], calibratedTiff());' $taskImagePath
    if ($LASTEXITCODE) { throw 'Cannot generate the TIFF fixture' }
} finally { Pop-Location }

$taskConfig = @{
    root = $taskRoot.Replace('\', '/')
    legacyPath = $taskLegacyPath.Replace('\', '/')
    legacyScalePath = $taskLegacyScalePath.Replace('\', '/')
    imagePath = $taskImagePath.Replace('\', '/')
    legacyRevision = $LegacyRevision
    sizes = $ArtworkCounts
    skipLegacy = [bool]$SkipLegacy
    progressPath = ([IO.Path]::GetFullPath($ReportPath) + '.progress.json').Replace('\', '/')
} | ConvertTo-Json -Compress
$taskScript = '(function(){var config=' + $taskConfig + ';' + @'
    function read(path) {
        var file = new File(path); file.encoding = "UTF-8";
        if (!file.open("r")) throw new Error("Cannot read " + path);
        var code = file.read(); file.close(); return code;
    }
    eval(read(config.root + "/src/jsx/lib/json2.js"));
    var scaleCode = read(config.root + "/src/jsx/ilst/scalebar.jsx");
    // Preserve the failing native line in diagnostics; production error text
    // remains unchanged because this instrumentation is test-only.
    scaleCode = scaleCode.replace('} catch (error) { return sciError(String(error.message)); }',
        '} catch (error) { return sciError(String(error.message) + " at host line " + error.line + " target " + (targets[0] ? targets[0].typename : "none")); }');
    function makeApi(code, scale) {
        return new Function("JSON", code + scale +
            ";return {sync:syncZoomTracker,index:readCurrentZoomRecords,tag:addTag," +
            "apply:applyZoomImages,inspectScale:inspectScalebar,applyScale:applyScalebar,token:typeof scaleTargetToken==='function'?scaleTargetToken:null," +
            "find:findItemByTag,bounds:getVisibleBounds,state:captureZoomTrackingState,history:restoreZoomTrackingHistory,writeFov:scaleWriteFov};")(JSON);
    }
    var currentCode = read(config.root + "/src/jsx/ilst/arrange.jsx");
    var current = makeApi(currentCode, scaleCode);
    var legacy = makeApi(read(config.legacyPath), read(config.legacyScalePath));
    var oldDoc = app.documents.length ? app.activeDocument : null;
    var documentCount = app.documents.length, doc = null, rows = [], checks = [], result;
    function assert(condition, message) { if (!condition) throw new Error(message); }
    function measure(name, task, iterations) {
        task();
        var samples = [], total = 0;
        for (var i = 0; i < iterations; i++) {
            var start = $.hiresTimer;
            task();
            var ms = $.hiresTimer / 1000;
            total += ms; samples.push(ms);
        }
        samples.sort(function(a,b){return a-b;});
        rows.push({name:name,artworkCount:doc.pageItems.length,tagCount:doc.tags.length,
            iterations:iterations,meanMs:total/iterations,
            medianMs:samples[Math.floor(samples.length/2)],
            p95Ms:samples[Math.min(samples.length-1,Math.floor(samples.length*0.95))],
            maxMs:samples[samples.length-1]});
        var progress = new File(config.progressPath); progress.encoding = "UTF-8";
        if(progress.open("w")) { progress.write(JSON.stringify({stage:name,rows:rows})); progress.close(); }
    }
    function sync(api) { assert(api.sync() === "OK", "Tracker failed"); }
    try {
        doc = app.documents.add(DocumentColorSpace.RGB, 600, 600);
        var placed = doc.placedItems.add(); placed.file = new File(config.imagePath);
        placed.embed();
        var source = doc.rasterItems[0]; source.width = 100; source.height = 100;
        source.position = [20, 200]; doc.selection = null;
        current.writeFov(source,{width:16,height:8,unit:"um",source:"performance fixture"});
        var tag = source.tags.add(); tag.name = "SCI_PERF_PARENT"; tag.value = "native";
        var found = false;
        for (var t=0;t<doc.tags.length;t++) {
            if(doc.tags[t].name === "SCI_PERF_PARENT") {
                assert(doc.tags[t].parent === source, "Document tag parent must be the native artwork");
                found = true;
            }
        }
        assert(found, "Document.tags must expose page-item tags"); tag.remove();
        checks.push("native document tags and parents");
        var sizes = config.sizes, created = 0;
        for (var s=0;s<sizes.length;s++) {
            while(created < sizes[s]) {
                var path=doc.pathItems.rectangle(-1000-Math.floor(created/100)*3,(created%100)*3,2,2);
                path.filled=false;path.stroked=false;created++;
            }
            measure("emptyZoom/current",function(){sync(current);},20);
            if(!config.skipLegacy) measure("emptyZoom/beforeOptimization",function(){sync(legacy);},5);
        }
        // The fixture remains in this disposable document throughout the test.
        function createZooms(count) {
            current.tag(source,"ILST_ZOOM_ACTIVE_TARGET","1");
            var entries=[];
            for(var i=0;i<count;i++) entries.push({recordKey:null,name:"Performance " + i,
                region:{x:0.1,y:0.1,width:0.2,height:0.2},placement:"right",
                strokeColor:"#ff0000",strokeWidth:1.5,strokeDash:"dash",
                useRectangleColor:true,addGuideLines:true,guideLineExtent:"acrossImages"});
            assert(current.apply(JSON.stringify({entries:entries,deletedKeys:[]}))==="Success","Create zooms");
            return current.index(doc);
        }
        createZooms(1);
        measure("oneZoomIdle/current",function(){sync(current);},20);
        if(!config.skipLegacy) measure("oneZoomIdle/beforeOptimization",function(){sync(legacy);},5);
        // Moving the source must keep its zoom output fixed while the marker follows.
        var index=current.index(doc), key;
        for(key in index.records) break;
        var zoomBefore=current.bounds(index.records[key].zoom), markerBefore=current.bounds(index.markers[key]);
        source.translate(10,0); sync(current);
        var zoomAfter=current.bounds(index.records[key].zoom), markerAfter=current.bounds(index.markers[key]);
        assert(Math.abs(zoomAfter[0]-zoomBefore[0])<0.05,"Source movement changed zoom output position");
        assert(Math.abs(markerAfter[0]-markerBefore[0]-10)<0.05,"Marker did not follow source");
        checks.push("native source movement preserves zoom output");
        measure("oneZoomMove/current",function(){source.translate(1,0);sync(current);},10);
        createZooms(20);
        measure("manyZoomsIdle/current",function(){sync(current);},20);
        measure("manyZoomsIndex/current",function(){current.index(doc);},20);
        var profilingIndex=current.index(doc);
        measure("manyZoomsSnapshot/current",function(){current.state(profilingIndex);},20);
        measure("manyZoomsHistory/current",function(){current.history(doc,profilingIndex);},20);
        measure("manyZoomsMove/current",function(){source.translate(1,0);sync(current);},10);
        doc.selection=null;source.selected=true;
        var info=JSON.parse(current.inspectScale(""));
        measure("scaleSelectionUnchanged/current",function(){assert(current.inspectScale(info.signature)==="null","Selection changed");},20);
        // Remove only the UUID fast return in a test-only copy of the function.
        // The target, tags and document collections remain real native objects.
        current.tag(source,"SCI_SCALE_TARGET",info.token);
        var compatibility = makeApi(currentCode,scaleCode.replace(/if \(target\.uuid\) \{[\s\S]*?\n    \}/,""));
        var token=compatibility.token(doc,source);
        measure("scaleTokenWithoutUUID/current",function(){assert(compatibility.token(doc,source)===token,"Unstable legacy token");},10);
        var scaleOptions={orientation:"horizontal",lengthUm:1,thickness:2,color:"#ffffff",
            showText:false,fontColor:"#ffffff",fontSize:12,bold:false,position:"BR",autoGroup:true,unit:"um"};
        var payload=JSON.stringify({token:info.token,fov:info.fov,options:scaleOptions,autoSave:true});
        measure("scaleAutosave/current",function(){var output=current.applyScale(payload);assert(output==="OK","Scalebar autosave failed: " + output);},5);
        checks.push("native scalebar autosave by UUID");
        result={ok:true,illustratorVersion:app.version,legacyRevision:config.legacyRevision,rows:rows,checks:checks};
    } catch(error) {result={ok:false,error:String(error),line:error.line,rows:rows,checks:checks};}
    finally {
        if(doc) doc.close(SaveOptions.DONOTSAVECHANGES);
        if(oldDoc) oldDoc.activate();
    }
    result.cleanup=app.documents.length===documentCount;
    if(!result.cleanup) result.ok=false;
    return JSON.stringify(result);
})()
'@
try {
    $taskAi = [PerformanceIllustrator]::Attach()
    $taskResult = $taskAi.DoJavaScript($taskScript)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $ReportPath)) | Out-Null
    [IO.File]::WriteAllText($ReportPath, $taskResult, [Text.UTF8Encoding]::new($false))
    $taskResult
    $taskParsed = ConvertFrom-Json -InputObject $taskResult
    if (!$taskParsed.ok) { throw "Illustrator performance test failed: $($taskParsed.error)" }
} finally {
    foreach ($taskFile in @($taskLegacyPath, $taskLegacyScalePath, $taskImagePath)) {
        if (Test-Path -LiteralPath $taskFile) { Remove-Item -LiteralPath $taskFile }
    }
    if (Test-Path -LiteralPath $taskTemp) { Remove-Item -LiteralPath $taskTemp }
}
