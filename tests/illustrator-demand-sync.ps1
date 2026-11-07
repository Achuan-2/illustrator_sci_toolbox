param([int]$ArtworkCount = 5000)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DemandSyncIllustrator {
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
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskImage = Join-Path ([IO.Path]::GetTempPath()) ('sci-demand-' + [guid]::NewGuid().ToString('N') + '.tif')
Push-Location -LiteralPath $taskRoot
try {
    node --import tsx --input-type=module -e 'import fs from "node:fs"; import { calibratedTiff } from "./tests/fixtures/scalebarTiff.ts"; fs.writeFileSync(process.argv[1], calibratedTiff());' $taskImage
    if ($LASTEXITCODE) { throw 'Cannot create the test image' }
    $taskConfig = @{root=$taskRoot.Replace('\','/'); image=$taskImage.Replace('\','/'); count=$ArtworkCount} | ConvertTo-Json -Compress
    $taskScript = '(function(){var config=' + $taskConfig + ';' + @'
    function read(path) {
        var f=new File(path);f.encoding="UTF-8";
        if(!f.open("r"))throw new Error("Cannot read "+path);
        var code=f.read();f.close();return code;
    }
    eval(read(config.root+"/src/jsx/lib/json2.js"));
    var code=read(config.root+"/src/jsx/ilst/arrange.jsx");
    code="var scans=0;\n"+code.replace("var index = createZoomTrackingIndex(doc), tags = doc.tags;",
        "scans++;var index = createZoomTrackingIndex(doc), tags = doc.tags;");
    var scale=read(config.root+"/src/jsx/ilst/scalebar.jsx");
    function makeApi(){return new Function("JSON",code+scale+
        ";return {sync:syncSelectedZoomTracker,index:readCurrentZoomRecords,apply:applyZoomImages,"+
        "tag:addTag,bounds:getVisibleBounds,scans:function(){return scans;}};")(JSON);}
    function assert(value,message){if(!value)throw new Error(message);}
    var oldDoc=app.documents.length?app.activeDocument:null,count=app.documents.length,doc=null;
    try {
        doc=app.documents.add(DocumentColorSpace.RGB,600,600);
        var placed=doc.placedItems.add();placed.file=new File(config.image);placed.embed();
        var source=doc.rasterItems[0];source.width=100;source.height=100;source.position=[20,200];
        var ordinary=null;
        for(var i=0;i<config.count;i++)ordinary=doc.pathItems.rectangle(-1000-i*3,0,2,2);
        if(!ordinary)ordinary=doc.pathItems.rectangle(-1000,0,2,2);
        var editor=makeApi();editor.tag(source,"ILST_ZOOM_ACTIVE_TARGET","1");
        assert(editor.apply(JSON.stringify({entries:[{recordKey:null,name:"Demand test",
            region:{x:0.1,y:0.1,width:0.2,height:0.2},placement:"right",strokeColor:"#ff0000",
            strokeWidth:1.5,strokeDash:"dash",useRectangleColor:true,addGuideLines:true,
            guideLineExtent:"acrossImages"}],deletedKeys:[]}))==="Success","Create zoom");
        var index=editor.index(doc),key;
        for(key in index.records)break;
        var marker=index.markers[key],zoom=index.records[key].zoom;
        var tracker=makeApi(),checks=[];
        function sync(){assert(tracker.sync()==="OK","Selection check failed");}
        var m=editor.bounds(marker),z=editor.bounds(zoom);
        doc.selection=[source];
        var start=$.hiresTimer;
        for(var i=0;i<20;i++)sync();
        var idleMs=$.hiresTimer/1000/20;
        assert(tracker.scans()===0,"Opening/selection scanned the document");
        assert(Math.abs(editor.bounds(marker)[0]-m[0])<0.01,"Selecting rewrote marker");
        checks.push("opening and unchanged related selection perform zero full scans");
        source.translate(10,0);sync();
        assert(tracker.scans()===1,"First edit should discover exactly once");
        assert(Math.abs(editor.bounds(marker)[0]-m[0]-10)<0.05,"Source marker did not follow");
        assert(Math.abs(editor.bounds(zoom)[0]-z[0])<0.05,"Source movement moved zoom output");
        checks.push("first source edit discovers once and updates only derived artwork");
        source.translate(5,0);doc.selection=null;sync();
        assert(Math.abs(editor.bounds(marker)[0]-m[0]-15)<0.05,"Deselect lost final edit");
        checks.push("final edit flushes after deselection");
        var scans=tracker.scans();doc.selection=[ordinary];sync();
        start=$.hiresTimer;
        for(var i=0;i<20;i++){ordinary.translate(1,0);sync();}
        var ordinaryMs=$.hiresTimer/1000/20;
        assert(tracker.scans()===scans,"Ordinary edits scanned registered zooms");
        checks.push("ordinary artwork edits do not discover registered zooms");
        doc.selection=[zoom];sync();zoom.remove();doc.selection=null;sync();
        assert(!editor.index(doc,true).records[key],"Deleted zoom remains indexed");
        assert(!editor.index(doc).markers[key],"Deleted zoom marker remains");
        checks.push("selected zoom deletion cleans related artwork");
        return JSON.stringify({version:app.version,ordinaryArtwork:config.count,checks:checks,
            selectedIdleMeanMs:idleMs,ordinaryEditAndCheckMeanMs:ordinaryMs});
    } finally {
        if(doc)doc.close(SaveOptions.DONOTSAVECHANGES);
        if(oldDoc)oldDoc.activate();
        assert(app.documents.length===count,"Document count was not restored");
    }
})()
'@
    $taskApplication = [DemandSyncIllustrator]::Attach()
    $taskResult = $taskApplication.DoJavaScript($taskScript)
    $taskReport = Join-Path $taskRoot 'dist/zoom-demand-native.json'
    [IO.File]::WriteAllText($taskReport, $taskResult, [Text.UTF8Encoding]::new($false))
    $taskResult
} finally {
    Pop-Location
    if (Test-Path -LiteralPath $taskImage) { Remove-Item -LiteralPath $taskImage -Force }
}
