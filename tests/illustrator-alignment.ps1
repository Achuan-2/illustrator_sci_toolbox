$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AlignmentIllustrator {
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
$taskConfig = @{root=$taskRoot.Replace('\','/')} | ConvertTo-Json -Compress
$taskScript = '(function(){var config=' + $taskConfig + ';' + @'
    function read(path) {
        var file=new File(path);file.encoding="UTF-8";
        if(!file.open("r"))throw new Error("Cannot read "+path);
        var source=file.read();file.close();return source;
    }
    eval(read(config.root+"/src/jsx/lib/json2.js"));
    var align=new Function(read(config.root+"/src/jsx/ilst/arrange.jsx")+";return alignObjects;")();
    function assert(value,message){if(!value)throw new Error(message);}
    function close(a,b){return Math.abs(a-b)<0.02;}
    function anchor(bounds,mode){
        if(mode==="left")return bounds[0];
        if(mode==="horizontalCenter")return (bounds[0]+bounds[2])/2;
        if(mode==="right")return bounds[2];
        if(mode==="top")return bounds[1];
        if(mode==="verticalCenter")return (bounds[1]+bounds[3])/2;
        return bounds[3];
    }
    var previous=app.documents.length?app.activeDocument:null,count=app.documents.length;
    var doc=null,restoreMode=null,checks=[];
    var commands={selection:"Align To Selection",key:"Align To Key Object",artboard:"Align To Artboard"};
    var alignCommands={left:"Horizontal Align Left",horizontalCenter:"Horizontal Align Center",
        right:"Horizontal Align Right",top:"Vertical Align Top",verticalCenter:"Vertical Align Center",bottom:"Vertical Align Bottom"};
    function rectangle(bounds){
        var item=doc.pathItems.rectangle(bounds[1],bounds[0],bounds[2]-bounds[0],bounds[1]-bounds[3]);
        item.stroked=false;return item;
    }
    function clear(){doc.selection=null;while(doc.pageItems.length)doc.pageItems[0].remove();}
    // A disposable selection distinguishes native reference modes without
    // changing preferences first. The rightmost object is also topmost.
    function probe(){
        clear();var left=rectangle([20,200,50,170]),right=rectangle([200,120,240,80]);
        doc.selection=[left,right];app.redraw();app.executeMenuCommand("Horizontal Align Left");app.redraw();
        var x=left.geometricBounds[0],board=doc.artboards[0].artboardRect[0];
        if(close(x,20))return "selection";
        if(close(x,200))return "key";
        if(close(x,board))return "artboard";
        throw new Error("Cannot identify native alignment mode: "+x);
    }
    try {
        assert(parseFloat(app.version)>=30.6,"Test setup requires Align To menu commands (Illustrator 30.6+)");
        doc=app.documents.add(DocumentColorSpace.RGB,600,600);
        restoreMode=probe();
        var modes=["left","horizontalCenter","right","top","verticalCenter","bottom","center"];
        var bounds=[[-40,120,-10,100],[15,75,35,35],[80,-20,130,-90]];
        for(var reference in commands){
            for(var m=0;m<modes.length;m++){
                clear();var items=[];
                for(var i=0;i<bounds.length;i++)items.push(rectangle(bounds[i]));
                // Choose the interior object, so a selection-bounds fallback
                // would move the key and fail the geometric assertions.
                items[1].zOrder(ZOrderMethod.BRINGTOFRONT);
                doc.selection=items;app.redraw();app.executeMenuCommand(commands[reference]);app.redraw();
                var target=[-40,120,130,-90];
                if(reference==="key")target=bounds[1];
                else if(reference==="artboard")target=doc.artboards[0].artboardRect;
                var mode=modes[m],keyBefore=items[1].geometricBounds;
                // Compare against the native result itself: native centering
                // need not match the plugin's old overall-bounds calculation.
                if(mode==="center"){
                    app.executeMenuCommand(alignCommands.horizontalCenter);
                    app.executeMenuCommand(alignCommands.verticalCenter);
                }else app.executeMenuCommand(alignCommands[mode]);
                app.redraw();var expected=[];
                for(var i=0;i<items.length;i++){
                    expected.push(items[i].geometricBounds);
                    var current=items[i].geometricBounds;
                    items[i].translate(bounds[i][0]-current[0],bounds[i][1]-current[1]);
                }
                app.redraw();app.executeMenuCommand(commands[reference]);app.redraw();
                assert(align(mode)==="Success","Plugin alignment failed");
                app.redraw();
                for(var i=0;i<items.length;i++){
                    var after=items[i].geometricBounds;
                    assert(close(after[2]-after[0],bounds[i][2]-bounds[i][0]),"Alignment resized width");
                    assert(close(after[1]-after[3],bounds[i][1]-bounds[i][3]),"Alignment resized height");
                    for(var b=0;b<4;b++)assert(close(after[b],expected[i][b]),"Native comparison differs: "+reference+"/"+mode+" actual "+JSON.stringify(after)+" expected "+JSON.stringify(expected[i]));
                    if(reference==="selection")continue;
                    if(mode==="center"){
                        assert(close(anchor(after,"horizontalCenter"),anchor(target,"horizontalCenter")),"Wrong horizontal reference");
                        assert(close(anchor(after,"verticalCenter"),anchor(target,"verticalCenter")),"Wrong vertical reference");
                    }else assert(close(anchor(after,mode),anchor(target,mode)),"Wrong "+reference+" "+mode+" reference: item "+i+" actual "+JSON.stringify(after)+" target "+JSON.stringify(target));
                }
                if(reference==="key"){
                    var after=items[1].geometricBounds;
                    for(var i=0;i<4;i++)assert(close(after[i],keyBefore[i]),"Native key object moved");
                }
                checks.push(reference+"/"+mode);
            }
        }
        app.executeMenuCommand(commands[restoreMode]);
        assert(probe()===restoreMode,"Native alignment mode was not restored");
        return JSON.stringify({version:app.version,checks:checks,restoredReference:restoreMode});
    } finally {
        try {if(doc&&restoreMode)app.executeMenuCommand(commands[restoreMode]);}
        finally {
            if(doc)doc.close(SaveOptions.DONOTSAVECHANGES);
            if(previous)previous.activate();
            assert(app.documents.length===count,"Original documents were not restored");
        }
    }
})()
'@
$taskApplication = [AlignmentIllustrator]::Attach()
$taskResult = $taskApplication.DoJavaScript($taskScript)
[IO.File]::WriteAllText((Join-Path $taskRoot 'dist/native-alignment.json'), $taskResult, [Text.UTF8Encoding]::new($false))
$taskResult
