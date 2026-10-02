param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ZoomTrackingIllustrator {
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
        var code = file.read();
        file.close();
        return code;
    }
    eval(read("/src/jsx/lib/json2.js"));
    var code = read("/src/jsx/ilst/arrange.jsx");
    var doc = app.activeDocument;
    if (!doc) throw new Error("Open a document containing a raster or placed image first");
    var oldSelection = doc.selection, oldLayer = doc.activeLayer;
    var itemCount = doc.pageItems.length, documentCount = app.documents.length;
    var layer = null, checks = [], result;
    function assert(condition, message) {
        if (!condition) throw new Error(message);
    }
    function close(actual, expected, message) {
        assert(actual.length === expected.length, message + ": coordinate count");
        for (var i = 0; i < actual.length; i++) {
            assert(Math.abs(actual[i] - expected[i]) < 0.03,
                message + ": coordinate " + i + " expected " + expected[i] + ", got " + actual[i]);
        }
    }
    function makeApi() {
        // Limit automatic refresh and deletion to our temporary layer. Real
        // document objects, masks, transforms and tags remain Illustrator's.
        var scope = ';var fullIndex = readCurrentZoomRecords;' +
            'readCurrentZoomRecords = function(doc) {' +
            'var index = fullIndex(doc), maps = ["records","pictures","markers","guides1","guides2"];' +
            'for (var i=0;i<maps.length;i++) { var map=index[maps[i]];' +
            'for (var key in map) { var item=map[key]; if(maps[i]==="records") item=item.zoom;' +
            'if(item.layer!==testLayer) delete map[key]; }} return index; };' +
            'return {apply:applyZoomImages,sync:syncZoomTracker,tag:addTag,getTag:getTag,' +
            'find:findItemByTag,visible:getVisibleBounds,clear:clearCopiedZoomTags,' +
            'side:getZoomGuidePlacement,endpoints:getZoomEndpoints,entries:readZoomEntries};';
        return new Function("JSON", "testLayer", code + scope)(JSON, layer);
    }
    function bounds(api, item) { return api.visible(item) || item.geometricBounds; }
    function transform(boundsToMove, before, after) {
        var sx = (after[2] - after[0]) / (before[2] - before[0]);
        var sy = (after[1] - after[3]) / (before[1] - before[3]);
        return [after[0] + (boundsToMove[0] - before[0]) * sx,
            after[1] + (boundsToMove[1] - before[1]) * sy,
            after[0] + (boundsToMove[2] - before[0]) * sx,
            after[1] + (boundsToMove[3] - before[1]) * sy];
    }
    function assertCrop(api, source, marker, zoom) {
        var p = bounds(api, source), m = bounds(api, marker), z = bounds(api, zoom);
        var duplicate;
        for (var i = 0; i < zoom.pageItems.length; i++) {
            if (zoom.pageItems[i].typename !== "PathItem") duplicate = zoom.pageItems[i];
        }
        assert(duplicate, "Missing duplicate image");
        var sx = (z[2] - z[0]) / (m[2] - m[0]);
        var sy = (z[1] - z[3]) / (m[1] - m[3]);
        var left = z[0] - (m[0] - p[0]) * sx, top = z[1] + (p[1] - m[1]) * sy;
        close(bounds(api, duplicate), [left, top, left + (p[2] - p[0]) * sx,
            top - (p[1] - p[3]) * sy], "Crop follows source rectangle");
    }
    function assertGuides(api, record, source) {
        var p = bounds(api, source), m = bounds(api, record.marker), z = bounds(api, record.zoom);
        var ends = api.endpoints([[m[0],m[1]],[m[2],m[1]],[m[2],m[3]],[m[0],m[3]]],
            [[z[0],z[1]],[z[2],z[1]],[z[2],z[3]],[z[0],z[3]]], api.side(p,z,"right"));
        for (var i = 0; i < 2; i++) {
            var line = api.find(doc, "ILST_ZOOM_GUIDE" + (i+1) + "_" + record.key);
            assert(line, "Missing guide");
            close(line.pathPoints[0].anchor, ends[i*2], "Guide start");
            close(line.pathPoints[1].anchor, ends[i*2+1], "Guide end");
        }
    }
    try {
        var original = null;
        for (var i = 0; i < doc.pageItems.length; i++) {
            var item = doc.pageItems[i];
            for (var t = 0; t < item.tags.length; t++) {
                assert(item.tags[t].name !== "ILST_ZOOM_ACTIVE_TARGET", "Close the zoom editor before running this test");
            }
            if (!original && (item.typename === "RasterItem" || item.typename === "PlacedItem")) original = item;
        }
        assert(original, "No raster or placed image in the current document");
        layer = doc.layers.add();
        layer.name = "SCI temporary zoom tracking test " + new Date().getTime();
        doc.activeLayer = layer;
        doc.selection = null;
        var api = makeApi(), source = original.duplicate(layer);
        api.clear(source);
        var p = bounds(api, source);
        source.translate(-20000-p[0], 20000-p[1]);
        api.tag(source, "ILST_ZOOM_ACTIVE_TARGET", "1");
        var entries = [];
        for (var i = 0; i < 2; i++) entries.push({name:"Test " + i, recordKey:null,
            region:{x:0.1+i*0.3,y:0.1,width:0.1,height:0.1}, placement:"right",
            strokeColor:"#ff0000",strokeWidth:1.5,strokeDash:"dash",useRectangleColor:true,
            addGuideLines:true,guideLineExtent:"acrossImages"});
        assert(api.apply(JSON.stringify({entries:entries,deletedKeys:[]})) === "Success", "Create zooms");
        var records = [];
        for (var t = 0; t < source.tags.length; t++) {
            var tag = source.tags[t];
            if (tag.name.indexOf("ILST_ZOOM_SRC_") !== 0) continue;
            var key = tag.name.substring(14);
            records.push({key:key,marker:api.find(doc,"ILST_ZOOM_MARKER_"+key),zoom:api.find(doc,"ILST_ZOOM_ITEM_"+key)});
        }
        assert(records.length === 2, "Two tagged zooms");
        api.sync();
        var beforeSource = bounds(api, source), before = [];
        for (var i=0;i<records.length;i++) before.push({marker:bounds(api,records[i].marker),zoom:bounds(api,records[i].zoom)});
        source.translate(35,-25);
        api.sync();
        var afterMove = bounds(api,source);
        for (var i=0;i<records.length;i++) {
            close(bounds(api,records[i].marker),transform(before[i].marker,beforeSource,afterMove),"Source translation drives marker");
            close(bounds(api,records[i].zoom),before[i].zoom,"Source translation keeps zoom fixed");
            assertGuides(api,records[i],source);
            before[i] = {marker:bounds(api,records[i].marker),zoom:bounds(api,records[i].zoom)};
        }
        checks.push("source translation keeps zooms fixed and reconnects guides");
        var sizes = [[140,180],[50,40]];
        for (var s=0;s<sizes.length;s++) {
            beforeSource = bounds(api,source);
            for (var i=0;i<records.length;i++) before[i] = {marker:bounds(api,records[i].marker),zoom:bounds(api,records[i].zoom)};
            source.resize(sizes[s][0],sizes[s][1],true,true,true,true,100,Transformation.TOPLEFT);
            api.sync();
            var afterSource = bounds(api, source);
            for (var i=0;i<records.length;i++) {
                close(bounds(api,records[i].marker),transform(before[i].marker,beforeSource,afterSource),"Source drives marker");
                close(bounds(api,records[i].zoom),before[i].zoom,"Source resize keeps zoom position and size");
                assertCrop(api,source,records[i].marker,records[i].zoom);
                assertGuides(api,records[i],source);
            }
        }
        checks.push("source enlargement and reduction change only the markers and guides");
        var record = records[0];
        record.marker.translate(5,-7);
        record.marker.width *= 1.5;
        api.sync();
        assertCrop(api,source,record.marker,record.zoom);
        assertGuides(api,record,source);
        checks.push("marker position and size");
        sizes = [[180,140],[60,45]];
        for (var s=0;s<sizes.length;s++) {
            record.zoom.resize(sizes[s][0],sizes[s][1],true,true,true,true,100,Transformation.TOPLEFT);
            var expectedZoom = bounds(api,record.zoom);
            for (var poll=0;poll<4;poll++) api.sync();
            close(bounds(api,record.zoom),expectedZoom,"Manual zoom size survives polling");
            assertGuides(api,record,source);
            assertCrop(api,source,record.marker,record.zoom);
        }
        var z = bounds(api,record.zoom), p = bounds(api,source);
        record.zoom.translate(p[0]-z[0],p[3]-40-z[1]);
        api.sync();
        assertGuides(api,record,source);
        assertCrop(api,source,record.marker,record.zoom);
        beforeSource = bounds(api,source);
        var movedZoom = bounds(api,record.zoom);
        source.translate(-30,15);
        api.sync();
        close(bounds(api,record.zoom),movedZoom,"Source translation preserves manual zoom layout");
        assertGuides(api,record,source);
        checks.push("manual zoom size, position and facing guide endpoints");
        source.resize(160,130,true,true,true,true,100,Transformation.TOPLEFT);
        api.sync();
        close(bounds(api,record.zoom),movedZoom,"Source resize preserves manual zoom layout");
        record.marker.width *= 1.2;
        api.sync();
        close(bounds(api,record.zoom),movedZoom,"Marker resize preserves manual zoom layout");
        var saved = api.entries(doc,source);
        api.tag(source,"ILST_ZOOM_ACTIVE_TARGET","1");
        assert(api.apply(JSON.stringify({entries:saved,deletedKeys:[]})) === "Success","Reapply saved editor entries");
        for (var i=0;i<records.length;i++) {
            records[i].zoom = api.find(doc,"ILST_ZOOM_ITEM_"+records[i].key);
            records[i].marker = api.find(doc,"ILST_ZOOM_MARKER_"+records[i].key);
        }
        api.sync();
        close(bounds(api,record.zoom),movedZoom,"Reopened confirmation preserves manual zoom layout");
        assertGuides(api,record,source);
        assertCrop(api,source,record.marker,record.zoom);
        checks.push("manual zoom layout survives source/marker resizing and reopened confirmation");
        record.zoom.remove();
        api = makeApi();
        api.sync();
        assert(!api.find(doc,"ILST_ZOOM_MARKER_"+record.key),"Delete orphan marker after host reload");
        assert(!api.find(doc,"ILST_ZOOM_GUIDE1_"+record.key),"Delete first orphan guide");
        assert(!api.find(doc,"ILST_ZOOM_GUIDE2_"+record.key),"Delete second orphan guide");
        assert(!api.getTag(source,"ILST_ZOOM_SRC_"+record.key),"Clear source association");
        assert(api.find(doc,"ILST_ZOOM_ITEM_"+records[1].key),"Keep other zoom");
        checks.push("deletion after host reload keeps the other zoom");
        result = {ok:true,checks:checks};
    } catch (error) {
        result = {ok:false,error:String(error),checks:checks};
    } finally {
        doc.selection = null;
        if (layer) layer.remove();
        doc.activeLayer = oldLayer;
        doc.selection = oldSelection;
    }
    result.cleanup = doc.pageItems.length === itemCount && app.documents.length === documentCount;
    if (!result.cleanup) result.ok = false;
    return JSON.stringify(result);
})()
'@

$taskIllustrator = [ZoomTrackingIllustrator]::Attach()
$taskResult = $taskIllustrator.DoJavaScript($taskScript)
$taskResult
$taskParsed = ConvertFrom-Json -InputObject $taskResult
if (!$taskParsed.ok) { throw "Illustrator zoom tracking verification failed: $($taskParsed.error)" }
