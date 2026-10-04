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
            read("/src/jsx/ilst/scalebar.jsx") + read("/src/jsx/ilst/pseudocolorLayers.jsx") + ";return {inspect:inspectScalebar,apply:applyScalebar,fov:scaleReadFov," +
            "merge:applyPseudocolorLayers,mergeInspect:inspectPseudocolorLayerTargets," +
            "opts:scaleReadOptions,tag:getTag,bounds:getVisibleBounds,picture:scaleWrapperPicture," +
            "zoom:applyZoomImages,zoomInspect:inspectZoomTarget,cancelZoom:cancelZoomTarget,entries:readZoomEntries,sync:syncZoomTracker," +
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
    function barFor(target, optional) {
        var owner = target.typename === "GroupItem" ? target : target.parent;
        for (var i=0;i<owner.pageItems.length;i++) {
            var child=owner.pageItems[i];
            if (child.parent === owner && api.tag(child,"SCI_SCALE_BAR")) return child;
        }
        if(optional) return null;
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
        info=inspect(wrapper); options.lengthUm=0;
        assert(api.apply(JSON.stringify({token:info.token,fov:fov,options:options,autoSave:true}))==="OK","Zero length hides the source scale");
        app.redraw();
        assert(!barFor(source,true),"Zero removes both the source bar and label");
        near(api.opts(source).lengthUm,0,"Hidden source scale settings persist");
        near(api.fov(source).width,1000,"Hiding retains source calibration");
        assert(JSON.parse(api.inspect("")).token===info.token,"Hidden source stays editable");
        options.lengthUm=50;
        assert(api.apply(JSON.stringify({token:info.token,fov:fov,options:options,autoSave:true}))==="OK","Positive length restores source scale");
        assertBar(source,50,"Restored source scale is calibrated");
        checks.push("zero hides bar and label while retaining source calibration, selection and reversible scale settings");
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
            var alignedBar=barFor(source), pathBounds=barPath(alignedBar).geometricBounds;
            var textBounds=alignedBar.textFrames[0].geometricBounds;
            if (o) near(textBounds[c<2 ? 1 : 3],pathBounds[c<2 ? 1 : 3],"Vertical text aligns with top/bottom bar edge");
            else near(textBounds[c%2 === 0 ? 0 : 2],pathBounds[c%2 === 0 ? 0 : 2],"Horizontal text aligns with left/right bar edge");
        }
        checks.push("horizontal/vertical bars at all four corners, aligned text edges and editing without duplicates");
        options.orientation="horizontal";
        apply(wrapper,{width:1000,height:0,unit:"um"},options);
        assertBar(source,50,"Width-only FOV draws horizontal bar");
        near(inspect(wrapper).fov.height,0,"Unknown height survives metadata reload");
        info=inspect(wrapper); options.orientation="vertical";
        assert(api.apply(JSON.stringify({token:info.token,fov:{width:1000,height:0,unit:"um"},options:options})).indexOf("errors.scaleFov")>=0,"Vertical bar requires known height");
        apply(wrapper,{width:0,height:500,unit:"um"},options);
        assertBar(source,50,"Height-only FOV draws vertical bar");
        near(inspect(wrapper).fov.width,0,"Unknown width survives metadata reload");
        checks.push("single-axis FOV creation, editing and stored metadata without guessing the other dimension");
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
        assert(api.apply(JSON.stringify({token:info.token,fov:fov,options:options}))==="OK","Clamp scale larger than FOV");
        near(api.opts(source).lengthUm,900,"Persist length capped at 90% of FOV");
        assertBar(source,900,"Draw capped scale"); options.lengthUm=50;
        checks.push("selection changes are rejected and oversized lengths are capped at 90%");
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
        app.redraw();
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
        // A source with only horizontal calibration must also support zoom
        // creation, custom lengths and crop/size tracking without a height.
        apply(wrapper,{width:1000,height:0,unit:"um"},options);
        var entry={recordKey:null,name:"scale zoom",region:{x:0.1,y:0.1,width:0.5,height:0.5},regionRotation:0,
            strokeColor:"#ff0000",strokeWidth:1.5,strokeDash:"solid",useRectangleColor:true,addGuideLines:true,
            placement:"right",guideLineExtent:"acrossImages",preservesLayout:false};
        doc.selection=null; wrapper.selected=true;
        assert(api.zoom(JSON.stringify({entries:[entry],deletedKeys:[]})) === "Success","Create zoom with inherited scalebar");
        var saved=api.entries(doc,source), key=saved[0].recordKey;
        var zoom=api.find(doc,"ILST_ZOOM_ITEM_"+key);
        near(api.fov(zoom).width,500,"Zoom physical FOV"); assertBar(zoom,50,"Zoom inherits represented length");
        near(api.fov(zoom).height,0,"Zoom preserves unknown perpendicular FOV");
        var initialBounds=api.bounds(zoom);
        saved[0].scaleLengthUm=0; doc.selection=null; wrapper.selected=true;
        assert(api.zoom(JSON.stringify({entries:saved,deletedKeys:[]})) === "Success","Zero hides zoom scale");
        zoom=api.find(doc,"ILST_ZOOM_ITEM_"+key);
        assert(!barFor(zoom,true),"Hidden zoom has no bar or label");
        near(api.opts(zoom).lengthUm,0,"Zoom stores zero instead of falling back to source length");
        api.sync(); zoom.resize(110,110); api.sync();
        assert(!barFor(zoom,true),"Zoom tracking preserves the hidden scale");
        zoom.resize(100/1.1,100/1.1); api.sync();
        checks.push("zero-length zoom scale remains hidden during output resizing and tracking");
        saved[0].scaleLengthUm=1000; doc.selection=null; wrapper.selected=true;
        assert(api.zoom(JSON.stringify({entries:saved,deletedKeys:[]})) === "Success","Create zoom with an oversized requested scale");
        zoom=api.find(doc,"ILST_ZOOM_ITEM_"+key);
        near(api.opts(zoom).lengthUm,450,"Zoom scale clamps to 90% of crop FOV");
        assertBar(zoom,450,"Zoom capped scale is calibrated");
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
        checks.push("width-only FOV zoom inheritance, custom length, manual sizing, source movement and crop calibration");
        doc.selection=null; wrapper.selected=true;
        var previewInfo=JSON.parse(api.zoomInspect()); preview=new File(previewInfo.previewPath);
        assert(previewInfo.sourceScalebar.lengthUm===50,"Zoom editor receives source scale length");
        assert(previewInfo.existingEntries[0].scaleLengthUm===100,"Zoom editor receives custom scale length");
        near(previewInfo.sourceFov.width,1000,"Zoom editor receives physical source FOV");
        checks.push("zoom editor reads source and existing zoom scale settings");
        api.cancelZoom();
        // Crop tracking must also clamp an existing bar when its FOV shrinks.
        api.setBounds(marker,[mb[0],mb[1],mb[0]+20,mb[3]]); api.sync();
        near(api.fov(zoom).width,50,"Small crop FOV");
        near(api.opts(zoom).lengthUm,45,"Tracking caps existing scale to reduced crop FOV");
        assertBar(zoom,45,"Tracked small-crop scale is calibrated");
        apply(wrapper,fov,options);
        api.sync();
        var channelCopy=source.duplicate(doc.activeLayer);
        channelCopy.translate(0,-250);
        var channelWrapper=apply(channelCopy,fov,options);
        options.lengthUm=75; apply(channelWrapper,fov,options); options.lengthUm=50;
        doc.selection=[wrapper,channelWrapper];
        assert(api.merge(JSON.stringify({mode:"merge"})) === "2","Merge images with different scales");
        var mismatched=doc.selection[0];
        assert(!api.opts(mismatched) && !barFor(mismatched,true),"Different scales do not choose an arbitrary merged annotation");
        assertBar(source,50,"Mismatched merge preserves first source scale");
        assertBar(channelCopy,75,"Mismatched merge preserves second source scale");
        doc.selection=[mismatched];
        assert(api.zoom(JSON.stringify({entries:[entry],deletedKeys:[]})) === "Success","Create merged-channel zoom without an inherited scale");
        var mergedZoom=doc.selection[0], mergedZoomInfo=inspect(mergedZoom);
        assert(!mergedZoomInfo.options,"New merged zoom starts without a scale");
        near(mergedZoomInfo.fov.width,500,"Merged zoom inherits cropped physical FOV");
        near(mergedZoomInfo.fov.height,250,"Merged zoom inherits vertical physical FOV");
        var mergedZoomEntry=api.entries(doc,mismatched)[0], mergedZoomKey=mergedZoomEntry.recordKey;
        mergedZoom.name="Renamed merged-channel zoom";
        mergedZoom=apply(mergedZoom,mergedZoomInfo.fov,options);
        app.redraw();
        assertBar(mergedZoom,50,"Merged-channel zoom accepts its first editable scale");
        assert(JSON.parse(api.inspect("")).token===mergedZoomInfo.token,"Merged zoom stays editable immediately after adding");
        var zoomMask=null;
        for(var childIndex=0;childIndex<mergedZoom.pageItems.length;childIndex++) {
            if(mergedZoom.pageItems[childIndex].clipping) zoomMask=mergedZoom.pageItems[childIndex];
        }
        assert(zoomMask && inspect(zoomMask).token===mergedZoomInfo.token,"Selecting clipping mask edits the outer merged zoom scale");
        api.sync(); mergedZoom.resize(125,110); api.sync();
        assertBar(mergedZoom,50,"Resized merged zoom keeps calibrated scale");
        var mergedZoomBounds=api.bounds(mergedZoom);
        options.lengthUm=0; apply(mergedZoom,mergedZoomInfo.fov,options);
        assert(!barFor(mergedZoom,true),"Zero hides merged zoom scale");
        options.lengthUm=2000; apply(mergedZoom,mergedZoomInfo.fov,options);
        near(api.opts(mergedZoom).lengthUm,450,"Merged zoom scale caps at 90% of cropped FOV");
        for(var boundIndex=0;boundIndex<4;boundIndex++) near(api.bounds(mergedZoom)[boundIndex],mergedZoomBounds[boundIndex],"Scale edits preserve merged zoom frame");
        options.lengthUm=50;
        api.clear(mergedZoom); api=makeApi();
        mergedZoom=apply(mergedZoom,mergedZoomInfo.fov,options);
        assertBar(mergedZoom,50,"Existing merged zoom without scale metadata accepts manually calibrated scale after reload");
        doc.selection=[mismatched];
        assert(api.zoom(JSON.stringify({entries:[],deletedKeys:[mergedZoomKey]})) === "Success","Clean up merged zoom test association");
        checks.push("merged-channel zoom first scale, mask selection, renaming, output resizing, hidden state, FOV cap and manual calibration after reload");
        mismatched.remove(); apply(channelWrapper,fov,options);
        doc.selection=[wrapper,channelWrapper];
        var calibratedSession=JSON.parse(api.mergeInspect());
        assert(calibratedSession.targets.length===2,"Read two scaled wrappers as two channels");
        near(calibratedSession.targets[0].width,400,"Channel dimensions exclude scale annotation");
        assert(api.merge(JSON.stringify({mode:"merge",sessionId:calibratedSession.sessionId})) === "2","Merge matching scaled wrappers");
        var inherited=doc.selection[0];
        assertBar(inherited,50,"Identical source scales generate one editable merged scale");
        assert(inherited.pageItems[0]===barFor(inherited),"Inherited scale stays above all channels");
        var inheritedCount=0;
        for(var inheritedIndex=0;inheritedIndex<inherited.pageItems.length;inheritedIndex++) {
            if(api.tag(inherited.pageItems[inheritedIndex],"SCI_SCALE_BAR")) inheritedCount++;
        }
        assert(inheritedCount===1,"Do not duplicate scales into individual channels");
        for(var pixelIndex=0;pixelIndex<inherited.placedItems.length;pixelIndex++) {
            assert(!api.opts(inherited.placedItems[pixelIndex]),"Copied pixels do not retain source scale ownership");
        }
        inherited.remove();
        // Pseudocolor groups with appended FOV notes and scales remain valid
        // channels even after users rename both root groups.
        doc.selection=[wrapper];
        assert(api.merge(JSON.stringify({mode:"batch",lut:"red",keepOriginal:true})) === "1","Tint first scaled wrapper");
        var redScaled=doc.selection[0]; redScaled.name="Renamed red scaled image";
        assertBar(redScaled,50,"Pseudocolor preserves the source scale");
        doc.selection=[channelWrapper];
        assert(api.merge(JSON.stringify({mode:"batch",lut:"green",keepOriginal:true})) === "1","Tint second scaled wrapper");
        var greenScaled=doc.selection[0]; greenScaled.name="Renamed green scaled image";
        doc.selection=[redScaled,greenScaled];
        assert(api.merge(JSON.stringify({mode:"merge"})) === "2","Merge renamed pseudocolor groups with scales");
        var coloredScaledMerge=doc.selection[0];
        assertBar(coloredScaledMerge,50,"Scaled pseudocolor channels inherit one matching annotation");
        coloredScaledMerge.remove(); redScaled.remove(); greenScaled.remove();
        assertBar(source,50,"Scaled merges leave original annotations intact");
        assertBar(channelCopy,50,"Second scaled original remains intact");
        checks.push("scaled wrappers and renamed scaled pseudocolor groups merge with one matching editable scale; mismatches and originals remain independent");
        doc.selection=[wrapper,channelWrapper];
        assert(api.merge(JSON.stringify({mode:"merge",keepOriginal:true})) === "2","Merge calibrated channels");
        var merged=doc.selection[0], mergedInfo=inspect(merged);
        near(mergedInfo.fov.width,1000,"Merged image inherits consistent channel FOV");
        merged.name="Renamed merged channels";
        merged=apply(merged,mergedInfo.fov,options);
        app.redraw();
        var afterAdd=JSON.parse(api.inspect("")), selectedItems=[];
        for(var selectionIndex=0;selectionIndex<doc.selection.length;selectionIndex++) {
            var selectedItem=doc.selection[selectionIndex];
            selectedItems.push({type:selectedItem.typename,name:selectedItem.name,parent:selectedItem.parent.name});
        }
        assert(afterAdd.token===mergedInfo.token,"Adding a merged scale keeps its image editable without reselection: " + JSON.stringify({inspection:afterAdd,selection:selectedItems}));
        options.lengthUm=75;
        assert(api.apply(JSON.stringify({token:mergedInfo.token,fov:mergedInfo.fov,options:options,autoSave:true}))==="OK","Edit merged scale immediately after creation");
        app.redraw();
        var afterEdit=JSON.parse(api.inspect(""));
        assert(afterEdit.token===mergedInfo.token,"Editing a merged scale preserves selection without reselection: " + JSON.stringify(afterEdit));
        options.lengthUm=50;
        assert(api.apply(JSON.stringify({token:mergedInfo.token,fov:mergedInfo.fov,options:options,autoSave:true}))==="OK","Continue editing merged scale");
        app.redraw();
        assert(JSON.parse(api.inspect("")).token===mergedInfo.token,"Repeated edits stay bound after redraw");
        assert(api.inspect(mergedInfo.signature)==="null","Polling preserves the merged form after creation and repeated edits");
        checks.push("merged scale creation and consecutive autosaves stay editable after Illustrator redraw without reselection");
        assertBar(merged,50,"Merged image accepts a calibrated editable scale");
        var mergedBar=barFor(merged);
        assert(merged.pageItems[0]===mergedBar,"Merged scale stays above channel overlays");
        var mergedBounds=api.bounds(merged);
        options.lengthUm=0;
        assert(api.apply(JSON.stringify({token:mergedInfo.token,fov:mergedInfo.fov,options:options,autoSave:true}))==="OK","Zero hides merged scale");
        app.redraw();
        assert(!barFor(merged,true),"Merged bar and label are hidden");
        assert(api.inspect(mergedInfo.signature)==="null","Hidden merged scale stays editable without reselection");
        api=makeApi();
        near(JSON.parse(api.inspect("")).options.lengthUm,0,"Hidden scale survives host reload");
        options.lengthUm=50;
        assert(api.apply(JSON.stringify({token:mergedInfo.token,fov:mergedInfo.fov,options:options,autoSave:true}))==="OK","Positive length restores merged scale");
        assertBar(merged,50,"Restored merged scale remains calibrated");
        checks.push("merged scales hide at zero, retain settings after host reload and restore at positive lengths");
        for(var repeat=0;repeat<3;repeat++) {
            options.lengthUm=2000; merged=apply(merged,mergedInfo.fov,options);
            near(api.opts(merged).lengthUm,900,"Merged scale also respects the FOV cap");
            for(var axis=0;axis<4;axis++) near(api.bounds(merged)[axis],mergedBounds[axis],"Scale updates preserve merged picture bounds");
        }
        merged.remove(); channelWrapper.remove(); options.lengthUm=50;
        checks.push("merged channels inherit calibration, survive renaming and support capped editable foreground scales");
        var batchImage=doc.placedItems.add(); batchImage.file=new File(tiffPath);
        batchImage.position=[600,400]; batchImage.width=200; batchImage.height=100;
        var batchImageInfo=inspect(batchImage), batchFov={width:20,height:10,unit:"um"};
        assert(api.apply(JSON.stringify({token:batchImageInfo.token,fov:batchFov,options:options,saveOnly:true,autoSave:true}))==="OK","Calibrate a second image without adding its scale");
        doc.selection=[wrapper,batchImage];
        var batchInfo=JSON.parse(api.inspect("")), batchTokens=[];
        assert(batchInfo.targets.length===2,"Inspect multiple images");
        for(var batchIndex=0;batchIndex<batchInfo.targets.length;batchIndex++) batchTokens.push({token:batchInfo.targets[batchIndex].token});
        var batchStyle=JSON.parse(JSON.stringify(options)); batchStyle.fontSize=14;
        var batchPayload={token:batchInfo.token,targets:batchTokens,documentKey:batchInfo.documentKey,
            fov:{width:9999,height:9999,unit:"um"},updateFov:false,options:batchStyle,autoSave:true,saveOnly:true};
        assert(api.apply(JSON.stringify(batchPayload))==="OK","Mixed batch updates existing scales without creating new ones");
        assertBar(source,50,"Existing batch image updates its style");
        near(api.opts(source).fontSize,14,"Batch font size");
        assert(!api.opts(batchImage),"Unscaled batch image waits for Add");
        near(api.fov(source).width,1000,"Style edits keep first calibration");
        near(api.fov(batchImage).width,20,"Style edits keep second calibration");
        batchPayload.autoSave=false; batchPayload.saveOnly=false;
        assert(api.apply(JSON.stringify(batchPayload))==="OK","Batch adds scales to every selected image");
        app.redraw();
        assert(doc.selection.length===2,"Batch keeps both pictures selected after redraw");
        assertBar(source,50,"Large FOV uses requested length");
        assertBar(batchImage,18,"Small FOV caps only its own length to 90%");
        assert(api.inspect(batchInfo.signature)==="null","Batch identity survives new wrappers and polling");
        var batchWrapper=batchImage.parent;
        doc.selection=[wrapper]; batchPayload.autoSave=true; batchStyle.color="#00ff00";
        assert(api.apply(JSON.stringify(batchPayload))==="OK","Pinned batch autosave survives selection reduction");
        app.redraw();
        assert(doc.selection.length===1 && doc.selection[0]===wrapper,"Autosave keeps the user's current selection");
        assert(api.opts(source).color==="#00ff00" && api.opts(batchImage).color==="#00ff00","Style reaches both pinned images");
        doc.selection=[batchWrapper,wrapper];
        assert(api.inspect(batchInfo.signature)==="null","Reordering the same selection does not reload the form");
        batchStyle.lengthUm=0;
        assert(api.apply(JSON.stringify(batchPayload))==="OK","Batch zero hides all scales");
        app.redraw();
        assert(!barFor(source,true) && !barFor(batchImage,true),"Both scales and labels are hidden");
        assert(doc.selection.length===2,"Hiding scales retains batch selection");
        batchStyle.lengthUm=25; batchPayload.updateFov=true; batchPayload.fov={width:200,height:100,unit:"um"};
        assert(api.apply(JSON.stringify(batchPayload))==="OK","Explicit FOV edits calibrate every batch image");
        near(api.fov(source).width,200,"Shared first FOV"); near(api.fov(batchImage).width,200,"Shared second FOV");
        assertBar(source,25,"Batch restores first scale"); assertBar(batchImage,25,"Batch restores second scale");
        var missingImage=doc.placedItems.add(); missingImage.file=preview;
        missingImage.position=[600,200]; missingImage.width=100; missingImage.height=50;
        doc.selection=[wrapper,missingImage];
        var missingInfo=JSON.parse(api.inspect("")), missingTokens=[];
        for(var missingIndex=0;missingIndex<missingInfo.targets.length;missingIndex++) missingTokens.push({token:missingInfo.targets[missingIndex].token});
        var beforeBatchFailure=doc.pageItems.length;
        var missingPayload={targets:missingTokens,documentKey:missingInfo.documentKey,options:batchStyle,
            fov:{width:300,height:150,unit:"um"},updateFov:false};
        assert(api.apply(JSON.stringify(missingPayload)).indexOf("errors.scaleFov")>=0,"A missing FOV rejects the batch before any changes");
        assert(doc.pageItems.length===beforeBatchFailure,"Invalid batch leaves artwork unchanged");
        near(api.fov(source).width,200,"Invalid batch leaves earlier calibration unchanged");
        missingPayload.updateFov=true;
        assert(api.apply(JSON.stringify(missingPayload))==="OK","Manual shared FOV supports uncalibrated selected images");
        assertBar(missingImage,25,"Newly calibrated batch image has its scale");
        near(api.fov(source).width,300,"Manual FOV intentionally updates all selected images");
        var missingWrapper=missingImage.parent;
        doc.selection=[missingWrapper]; batchPayload.updateFov=false;
        assert(api.apply(JSON.stringify(batchPayload))==="OK","Background batch still updates its original targets");
        app.redraw();
        assert(doc.selection.length===1 && doc.selection[0]===missingWrapper,"Background batch does not steal an unrelated image selection");
        missingWrapper.remove(); batchWrapper.remove();
        apply(wrapper,fov,options);
        checks.push("batch create/edit/hide, mixed existing scales, independent FOV caps, explicit calibration, missing-FOV prevalidation and selection-pinned autosaves");
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
