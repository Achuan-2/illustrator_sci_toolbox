param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ScalebarIllustrator {
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
$taskRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path.Replace('\', '/')
$taskTemp = Join-Path ([IO.Path]::GetTempPath()) ('sci-scalebar-test-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($taskTemp) | Out-Null
$taskTiff = Join-Path $taskTemp 'imagej.tif'
$taskAi = Join-Path $taskTemp 'persistence.ai'
$taskFixtureScript = 'import fs from "node:fs"; import { calibratedTiff } from "./tests/fixtures/scalebarTiff.ts"; fs.writeFileSync(process.argv[1], calibratedTiff());'
Push-Location -LiteralPath $RepositoryRoot
try { node --import tsx --input-type=module -e $taskFixtureScript $taskTiff; if ($LASTEXITCODE) { throw 'TIFF fixture generation failed' } }
finally { Pop-Location }
$taskScript = '(function(){ var repositoryRoot=' + (ConvertTo-Json $taskRoot -Compress) + '; var tiffPath=' + (ConvertTo-Json $taskTiff.Replace('\', '/') -Compress) + '; var aiPath=' + (ConvertTo-Json $taskAi.Replace('\', '/') -Compress) + ';' + @'
    function read(path) {
        var f = new File(repositoryRoot + path); f.encoding = "UTF-8";
        if (!f.open("r")) throw new Error("Cannot read " + path);
        var text = f.read(); f.close(); return text;
    }
    function makeApi() {
        return eval("(function(){" + read("/src/jsx/lib/json2.js") + read("/src/jsx/ilst/arrange.jsx") +
            read("/src/jsx/ilst/scalebar.jsx") + ";return {inspect:inspectScalebar,apply:applyScalebar,fov:scaleReadFov," +
            "opts:scaleReadOptions,tag:getTag,bounds:getVisibleBounds,picture:scaleWrapperPicture," +
            "zoom:applyZoomImages,zoomInspect:inspectZoomTarget,entries:readZoomEntries,sync:syncZoomTracker," +
            "find:findItemByTag,setBounds:setZoomRectangleBounds,tiff:readScaleTiff,factor:scaleUnitFactor,clear:scaleClearDuplicate};})()");
    }
    function assert(condition, message) { if (!condition) throw new Error(message); }
    function near(actual, expected, message) { assert(Math.abs(actual - expected) < 0.05, message + ": " + actual + " != " + expected); }
    var api = makeApi(), checks = [], doc = null, oldDoc = app.documents.length ? app.activeDocument : null;
    var documentCount = app.documents.length, result, preview = null;
    function inspect(item) {
        doc.selection = null; item.selected = true;
        var output = api.inspect(); assert(output.indexOf("Error:") !== 0, output);
        return JSON.parse(output);
    }
    function apply(item, fov, options, saveOnly) {
        var info = inspect(item);
        var output = api.apply(JSON.stringify({ token:info.token,fov:fov,options:options,saveOnly:saveOnly === true }));
        assert(output === "OK", output); return doc.selection[0];
    }
    function barFor(target) {
        var owner = target.typename === "GroupItem" ? target : target.parent;
        for (var i=0;i<owner.pageItems.length;i++) {
            var child=owner.pageItems[i];
            if (child.parent === owner && api.tag(child,"SCI_SCALE_BAR")) return child;
        }
        throw new Error("Missing scalebar");
    }
    function barPath(bar) {
        for (var i=0;i<bar.pathItems.length;i++) if (bar.pathItems[i].parent === bar) return bar.pathItems[i];
        throw new Error("Missing bar path");
    }
    function assertBar(target, expectedUm, message) {
        var fov=api.fov(target), opt=api.opts(target), b=api.bounds(target), p=barPath(barFor(target));
        var vertical=opt.orientation === "vertical";
        near(vertical ? p.height : p.width, expectedUm / ((vertical ? fov.height : fov.width)*api.factor(fov.unit)) * (vertical ? b[1]-b[3] : b[2]-b[0]),message);
        near(vertical ? p.width : p.height,opt.thickness,"Bar thickness");
    }
    try {
        doc=app.documents.add(DocumentColorSpace.RGB,900,600);
        var source=doc.placedItems.add(); source.file=new File(tiffPath);
        source.position=[30,550]; source.width=400; source.height=200;
        var info=inspect(source);
        var diagnostic={}; api.tiff(source.file,diagnostic);
        assert(info.fov,"Missing TIFF calibration: "+JSON.stringify(diagnostic)+" path="+source.file.fsName);
        near(info.fov.width,16,"Read linked ImageJ TIFF width"); near(info.fov.height,8,"Read linked ImageJ TIFF height");
        checks.push("automatic ImageJ TIFF calibration in Illustrator");
        var fov={width:1000,height:500,unit:"um",source:"manual"};
        var options={orientation:"horizontal",lengthUm:50,thickness:3,color:"#ffffff",showText:true,
            fontColor:"#ff0000",fontSize:12,bold:true,position:"BR",autoGroup:true};
        source.note="Preserve original notes";
        var wrapper=apply(source,fov,options);
        assert(api.tag(wrapper,"SCI_SCALE_WRAPPER"),"Default grouping");
        assert(source.parent === wrapper,"Source remains in group");
        assertBar(source,50,"Horizontal physical length");
        var bar=barFor(source), label=bar.textFrames[0];
        assert(label.contents === "50μm","Scale label");
        assert(label.textRange.characterAttributes.textFont.name === "Arial-BoldMT","Bold font");
        near(label.textRange.characterAttributes.size,12,"Font size");
        near(label.textRange.characterAttributes.fillColor.red,255,"Font color");
        assert(source.note.indexOf("Preserve original notes") === 0,"Preserve unrelated note");
        checks.push("vector bar, editable label, font color/size/bold, default grouping and note persistence");
        for (var o=0;o<2;o++) for (var c=0;c<4;c++) {
            options.orientation=o ? "vertical" : "horizontal";
            options.position=["TL","TR","BL","BR"][c];
            var before=doc.pageItems.length;
            apply(wrapper,fov,options);
            assert(doc.pageItems.length === before,"Editing replaces the existing scale");
            assertBar(source,50,"Orientation length");
            var bb=barFor(source).geometricBounds, sb=api.bounds(source);
            assert(bb[0]>=sb[0]-0.05 && bb[2]<=sb[2]+0.05 && bb[1]<=sb[1]+0.05 && bb[3]>=sb[3]-0.05,"Annotation inside image");
            assert(((bb[0]+bb[2])/2 < (sb[0]+sb[2])/2) === (c%2 === 0),"Left/right corner");
            assert(((bb[1]+bb[3])/2 > (sb[1]+sb[3])/2) === (c<2),"Top/bottom corner");
        }
        checks.push("horizontal/vertical bars at all four corners and editing without duplicates");
        options.orientation="horizontal"; options.position="BR"; options.lengthUm=50;
        apply(wrapper,fov,options);
        api=makeApi(); info=inspect(barFor(source).textFrames[0]);
        near(info.options.lengthUm,50,"Read selection on scale text after script reload");
        near(info.fov.width,1000,"Read stored FOV after script reload");
        var copy=wrapper.duplicate(); copy.translate(450,0);
        var copiedSource=api.picture(copy), originalCount=doc.pageItems.length;
        options.lengthUm=100; apply(copy,fov,options);
        assertBar(source,50,"Editing duplicated image preserves original bar");
        assertBar(copiedSource,100,"Copied image owns its bar");
        assert(doc.pageItems.length === originalCount,"Copied scale replaced once");
        copy.remove(); options.lengthUm=50;
        checks.push("saved parameters survive host reload and copied groups edit independently");
        var other=source.duplicate(doc.activeLayer);
        info=inspect(source); doc.selection=null; other.selected=true;
        assert(api.apply(JSON.stringify({token:info.token,fov:fov,options:options})).indexOf("errors.scaleTargetChanged")>=0,"Reject changed selection");
        other.remove();
        info=inspect(source); var count=doc.pageItems.length;
        options.lengthUm=1001;
        assert(api.apply(JSON.stringify({token:info.token,fov:fov,options:options})).indexOf("errors.scaleTooLong")>=0,"Reject scale larger than FOV");
        assert(doc.pageItems.length===count,"Invalid length preserves artwork"); options.lengthUm=50;
        checks.push("selection changes and invalid lengths cannot overwrite artwork");
        options.showText=false; apply(wrapper,fov,options);
        assert(barFor(source).textFrames.length===0,"Optional text hidden");
        options.showText=true; apply(wrapper,fov,options);
        info=inspect(wrapper);
        fov.width=2000; apply(wrapper,fov,options,true); assertBar(source,50,"Saving FOV recalculates existing scale");
        fov.width=1000; apply(wrapper,fov,options);
        checks.push("text visibility and FOV-only updates recalculate an existing scale");
        info=inspect(wrapper);
        var oldNote=source.note, oldCount=doc.pageItems.length;
        assert(api.inspect(info.signature)==="null","Unchanged selections avoid reloading metadata");
        assert(source.note===oldNote && doc.pageItems.length===oldCount,"Selection polling leaves artwork untouched");
        var autoOther=source.duplicate(doc.activeLayer); api.clear(autoOther);
        var otherInfo=inspect(autoOther);
        var manualOtherFov={width:2,height:1,unit:"cm",source:"manual"};
        assert(api.apply(JSON.stringify({token:otherInfo.token,documentKey:otherInfo.documentKey,fov:manualOtherFov,
            options:options,saveOnly:true,autoSave:true}))==="OK","Automatically save FOV without adding a bar");
        assert(!api.opts(autoOther),"FOV-only autosave does not create a scale");
        assert(doc.selection[0]===autoOther,"FOV autosave keeps selection");
        options.unit="cm";
        var cmFov={width:0.1,height:0.05,unit:"cm",source:"manual"};
        assert(api.apply(JSON.stringify({token:info.token,documentKey:info.documentKey,fov:cmFov,
            options:options,saveOnly:false,autoSave:true}))==="OK","Autosave pinned image after selection changed");
        assert(doc.selection[0]===autoOther,"Editing previous image must not reselect it");
        assert(barFor(source).textFrames[0].contents==="0.005cm","Scale label uses FOV unit with calibrated conversion");
        assertBar(source,50,"cm bar keeps physical calibration");
        assert(api.fov(autoOther).width===2 && api.fov(autoOther).height===1,"Other image FOV remains independent");
        autoOther.remove();
        options.unit="um"; apply(wrapper,fov,options);
        checks.push("selection polling, FOV autosave, pinned saves, selection preservation and FOV-unit scale labels");
        options.autoGroup=false; apply(wrapper,fov,options);
        assert(source.parent.typename === "Layer","Ungrouping restores the image to its layer");
        var ungroupedCount=doc.pageItems.length;
        apply(source,fov,options);
        assert(doc.pageItems.length === ungroupedCount,"Ungrouped editing replaces its own bar");
        options.autoGroup=true; wrapper=apply(source,fov,options);
        assert(api.tag(wrapper,"SCI_SCALE_WRAPPER"),"Regrouping creates a wrapper");
        assertBar(source,50,"Regrouped scale");
        checks.push("grouping can be disabled and restored without duplicate bars");
        var entry={recordKey:null,name:"scale zoom",region:{x:0.1,y:0.1,width:0.5,height:0.5},regionRotation:0,
            strokeColor:"#ff0000",strokeWidth:1.5,strokeDash:"solid",useRectangleColor:true,addGuideLines:true,
            placement:"right",guideLineExtent:"acrossImages",preservesLayout:false};
        doc.selection=null; wrapper.selected=true;
        assert(api.zoom(JSON.stringify({entries:[entry],deletedKeys:[]})) === "Success","Create zoom with inherited scalebar");
        var saved=api.entries(doc,source), key=saved[0].recordKey;
        var zoom=api.find(doc,"ILST_ZOOM_ITEM_"+key);
        near(api.fov(zoom).width,500,"Zoom physical FOV"); assertBar(zoom,50,"Zoom inherits represented length");
        var initialBounds=api.bounds(zoom);
        saved[0].scaleLengthUm=100; doc.selection=null; wrapper.selected=true;
        assert(api.zoom(JSON.stringify({entries:saved,deletedKeys:[]})) === "Success","Edit zoom represented length");
        zoom=api.find(doc,"ILST_ZOOM_ITEM_"+key); assertBar(zoom,100,"Custom zoom represented length");
        for (var k=0;k<4;k++) near(api.bounds(zoom)[k],initialBounds[k],"Preserve zoom output layout");
        api.sync();
        zoom.resize(150,125); api.sync(); assertBar(zoom,100,"Manually resized zoom keeps calibrated length");
        var beforeMove=api.bounds(zoom); source.translate(15,-10); api.sync();
        for (var k=0;k<4;k++) near(api.bounds(zoom)[k],beforeMove[k],"Source movement preserves zoom frame");
        assertBar(zoom,100,"Source movement preserves zoom scale");
        var marker=api.find(doc,"ILST_ZOOM_MARKER_"+key), mb=api.bounds(marker);
        api.setBounds(marker,[mb[0],mb[1],mb[0]+100,mb[3]]); api.sync();
        near(api.fov(zoom).width,250,"Crop edit updates zoom FOV"); assertBar(zoom,100,"Crop edit recalibrates scale");
        checks.push("zoom inheritance, custom length, manual sizing, source movement and crop calibration");
        doc.selection=null; wrapper.selected=true;
        var previewInfo=JSON.parse(api.zoomInspect()); preview=new File(previewInfo.previewPath);
        assert(previewInfo.sourceScalebar.lengthUm===50,"Zoom editor receives source scale length");
        assert(previewInfo.existingEntries[0].scaleLengthUm===100,"Zoom editor receives custom scale length");
        checks.push("zoom editor reads source and existing zoom scale settings");
        var saveOptions=new IllustratorSaveOptions(); saveOptions.pdfCompatible=false;
        doc.saveAs(new File(aiPath),saveOptions); doc.close(SaveOptions.DONOTSAVECHANGES);
        doc=null; doc=app.open(new File(aiPath)); api=makeApi();
        var restored=null;
        for(var i=0;i<doc.pageItems.length;i++) {
            var candidate=doc.pageItems[i], stored=api.fov(candidate);
            if(api.opts(candidate) && stored && stored.width===1000 && stored.height===500) { restored=candidate; break; }
        }
        assert(restored,"FOV and scale options persist in saved AI file");
        info=inspect(restored); near(info.options.lengthUm,50,"Saved represented length");
        assert(restored.note.indexOf("Preserve original notes")===0,"Saved original note");
        assertBar(restored,50,"Saved bar remains calibrated");
        checks.push("FOV, editable scale and original notes survive saving and reopening an AI document");
        result={ok:true,checks:checks};
    } catch(error) { result={ok:false,error:String(error),line:error.line,checks:checks}; }
    finally {
        if(preview && preview.exists) preview.remove();
        if(doc) doc.close(SaveOptions.DONOTSAVECHANGES);
        if(oldDoc) oldDoc.activate();
    }
    result.cleanup=app.documents.length===documentCount;
    if(!result.cleanup) result.ok=false;
    return JSON.stringify(result);
})()
'@
try {
    $taskIllustrator = [ScalebarIllustrator]::Attach()
    $taskResult = $taskIllustrator.DoJavaScript($taskScript)
    $taskResult
    $taskParsed = ConvertFrom-Json -InputObject $taskResult
    if (!$taskParsed.ok) { throw "Illustrator scalebar verification failed: $($taskParsed.error)" }
} finally {
    if (Test-Path -LiteralPath $taskTiff) { Remove-Item -LiteralPath $taskTiff }
    if (Test-Path -LiteralPath $taskAi) { Remove-Item -LiteralPath $taskAi }
    Remove-Item -LiteralPath $taskTemp
}
