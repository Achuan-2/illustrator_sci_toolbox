param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class UndoComIllustrator {
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
$taskTemp = Join-Path ([IO.Path]::GetTempPath()) ('sci-undo-com-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($taskTemp) | Out-Null
$taskImage = Join-Path $taskTemp 'imagej.tif'
Push-Location -LiteralPath $taskRoot
try {
    node --import tsx --input-type=module -e 'import fs from "node:fs"; import { calibratedTiff } from "./tests/fixtures/scalebarTiff.ts"; fs.writeFileSync(process.argv[1], calibratedTiff());' $taskImage
    if ($LASTEXITCODE) { throw 'Cannot generate native undo fixture' }
} finally { Pop-Location }
$taskConfig = @{root=$taskRoot.Replace('\','/');image=$taskImage.Replace('\','/')} | ConvertTo-Json -Compress
$taskAi = [UndoComIllustrator]::Attach()
$taskSetup = '(function(){var config=' + $taskConfig + ';' + @'
    function read(path){var file=new File(path);file.encoding="UTF-8";if(!file.open("r"))throw new Error(path);var code=file.read();file.close();return code;}
    eval(read(config.root+"/src/jsx/lib/json2.js"));
    var fixture={oldDoc:app.documents.length?app.activeDocument:null,doc:null};
    $.SCI_UNDO_COM_TEST=fixture;
    fixture.api=new Function("JSON",read(config.root+"/src/jsx/ilst/arrange.jsx")+read(config.root+"/src/jsx/ilst/scalebar.jsx")+
        ";return {apply:applyZoomImages,sync:syncZoomTracker,tag:addTag,index:readCurrentZoomRecords,state:captureZoomTrackingState};")(JSON);
    fixture.doc=app.documents.add(DocumentColorSpace.RGB,600,600);
    var placed=fixture.doc.placedItems.add();placed.file=new File(config.image);placed.embed();
    fixture.source=fixture.doc.rasterItems[0];fixture.source.width=100;fixture.source.height=100;fixture.source.position=[20,200];
    fixture.api.tag(fixture.source,"ILST_ZOOM_ACTIVE_TARGET","1");
    var entry={recordKey:null,name:"Undo test",region:{x:0.1,y:0.1,width:0.2,height:0.2},placement:"right",strokeColor:"#ff0000",strokeWidth:1.5,
        strokeDash:"dash",useRectangleColor:true,addGuideLines:true,guideLineExtent:"acrossImages"};
    if(fixture.api.apply(JSON.stringify({entries:[entry],deletedKeys:[]}))!=="Success")throw new Error("Create undo fixture");
    fixture.api.sync();
    for(var key in fixture.api.index(fixture.doc).records){fixture.key=key;break;}
    fixture.snapshot=function(){return JSON.stringify(fixture.api.state(fixture.api.index(fixture.doc)));};
    return "READY";
})()
'@
function Invoke-Native([string]$Code) { $taskAi.DoJavaScript($Code) }
function Get-NativeState { Invoke-Native '$.SCI_UNDO_COM_TEST.snapshot();' }
$taskScenarios = @(
    @{name='source translation'; edit='f.source.translate(10,0);'},
    @{name='source resizing'; edit='f.source.resize(140,120);'},
    @{name='marker resizing'; edit='f.api.index(f.doc).markers[f.key].resize(130,80);'},
    @{name='manual zoom resizing'; edit='f.api.index(f.doc).records[f.key].zoom.resize(160,110);'},
    @{name='zoom deletion'; edit='f.api.index(f.doc).records[f.key].zoom.remove();'}
)
$taskChecks = @()
try {
    if ((Invoke-Native $taskSetup) -ne 'READY') { throw 'Native undo fixture did not initialize' }
    foreach ($taskScenario in $taskScenarios) {
        $taskBefore = Get-NativeState
        Invoke-Native ('(function(){var f=$.SCI_UNDO_COM_TEST;' + $taskScenario.edit + 'return "EDITED";})()') | Out-Null
        Invoke-Native '$.SCI_UNDO_COM_TEST.api.sync();' | Out-Null
        $taskAfter = Get-NativeState
        if ($taskBefore -eq $taskAfter) { throw "No change in $($taskScenario.name)" }
        Invoke-Native 'app.undo();' | Out-Null
        Invoke-Native '$.SCI_UNDO_COM_TEST.api.sync();' | Out-Null
        if ((Get-NativeState) -ne $taskBefore) { throw "One undo did not restore $($taskScenario.name)" }
        for ($taskPoll = 0; $taskPoll -lt 3; $taskPoll++) { Invoke-Native '$.SCI_UNDO_COM_TEST.api.sync();' | Out-Null }
        Invoke-Native 'app.redo();' | Out-Null
        Invoke-Native '$.SCI_UNDO_COM_TEST.api.sync();' | Out-Null
        if ((Get-NativeState) -ne $taskAfter) { throw "One redo did not restore $($taskScenario.name)" }
        $taskChecks += $taskScenario.name
    }
    @{ok=$true;checks=$taskChecks} | ConvertTo-Json -Compress
} finally {
    Invoke-Native '(function(){var f=$.SCI_UNDO_COM_TEST;if(f){if(f.doc)f.doc.close(SaveOptions.DONOTSAVECHANGES);if(f.oldDoc)f.oldDoc.activate();delete $.SCI_UNDO_COM_TEST;}return "CLEANED";})()' | Out-Null
    if (Test-Path -LiteralPath $taskImage) { Remove-Item -LiteralPath $taskImage }
    if (Test-Path -LiteralPath $taskTemp) { Remove-Item -LiteralPath $taskTemp }
}
