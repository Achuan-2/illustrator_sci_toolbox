param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PaletteFillIllustrator {
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
    // Load only the tested function, without replacing the running panel's dispatcher.
    var api = new Function(read("/src/jsx/ilst/paletteFill.jsx") +
        ';function sciError(key,args){return JSON.stringify({error:key,args:args});}return applyPaletteFill;')();
    var originalDoc = app.documents.length ? app.activeDocument : null;
    var originalCount = app.documents.length;
    var doc = null, checks = [], result;
    function assert(value, message) { if (!value) throw new Error(message); }
    function color(hex) {
        var c = new RGBColor();
        c.red = parseInt(hex.substr(1,2),16); c.green = parseInt(hex.substr(3,2),16); c.blue = parseInt(hex.substr(5,2),16);
        return c;
    }
    function assertFill(item, r, g, b) {
        var c = item.fillColor;
        assert(item.filled && c.typename === "RGBColor" &&
            Math.abs(c.red-r)<.1 && Math.abs(c.green-g)<.1 && Math.abs(c.blue-b)<.1, "Unexpected native fill");
    }
    try {
        doc = app.documents.add(DocumentColorSpace.RGB, 160, 160);
        var first = doc.pathItems.rectangle(140,10,30,30);
        var second = doc.pathItems.rectangle(140,50,30,30);
        first.filled = false; second.filled = false;
        first.stroked = true; first.strokeWidth = 3; first.strokeColor = color("#FF0000");
        var bounds = first.geometricBounds;
        doc.selection = [first, second];
        assert(api("#4477AA") === "2", "Expected two native paths");
        assertFill(first,68,119,170); assertFill(second,68,119,170);
        assert(first.stroked && first.strokeWidth === 3 && first.strokeColor.red === 255, "Stroke changed");
        assert(first.geometricBounds.toString() === bounds.toString(), "Geometry changed");
        assert(doc.selection.length === 2, "Selection changed");
        checks.push("RGB fill on multiple paths preserves strokes, geometry and selection");

        var group = doc.groupItems.add();
        var mask = group.pathItems.rectangle(90,10,40,40);
        var artwork = group.pathItems.rectangle(95,5,50,50);
        mask.zOrder(ZOrderMethod.BRINGTOFRONT);
        mask.clipping = true; group.clipped = true; mask.filled = false;
        doc.selection = [group];
        assert(api("#EE6677") === "1", "Clipping group includes the mask");
        assertFill(artwork,238,102,119);
        assert(mask.clipping && !mask.filled && group.clipped, "Clipping mask changed");
        checks.push("selected clipping group fills artwork while preserving mask");

        var compound = doc.compoundPathItems.add();
        compound.pathItems.rectangle(90,70,40,40);
        compound.pathItems.rectangle(80,80,20,20);
        doc.selection = [compound];
        assert(api("#00AA44") === "2", "Compound path traversal failed");
        for (var i=0;i<compound.pathItems.length;i++) assertFill(compound.pathItems[i],0,170,68);
        checks.push("compound path fill");
        doc.selection = null;
        assert(JSON.parse(api("#4477AA")).error === "errors.paletteFillSelection", "Empty selection must fail");
        checks.push("empty selection returns a localized error key");
        result = {ok:true,checks:checks};
    } catch (error) {
        result = {ok:false,error:String(error),checks:checks};
    } finally {
        if (doc) doc.close(SaveOptions.DONOTSAVECHANGES);
        if (originalDoc) originalDoc.activate();
    }
    result.cleanup = app.documents.length === originalCount && (!originalDoc || app.activeDocument === originalDoc);
    if (!result.cleanup) result.ok = false;
    return JSON.stringify(result);
})()
'@
$taskIllustrator = [PaletteFillIllustrator]::Attach()
$taskResult = $taskIllustrator.DoJavaScript($taskScript)
$taskResult
$taskParsed = ConvertFrom-Json -InputObject $taskResult
if (!$taskParsed.ok) { throw "Illustrator palette fill verification failed: $($taskParsed.error)" }
