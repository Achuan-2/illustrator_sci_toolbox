import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Exercise actual Illustrator transactions through separate CEP evalScript
// calls. A single script cannot reproduce the user's undo-history boundary.
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url)).replaceAll('\\', '/');
const targets = await (await fetch('http://localhost:8088/json')).json();
const target = targets.find((page) => page.type === 'page' && page.url.includes('com.example.achuanPlugin/main/index.html'));
assert.ok(target, 'Open the installed SCI panel in Illustrator first');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
async function native(script) {
  const id = ++nextId;
  const response = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener('message', receive);
      reject(new Error(`Illustrator undo test timed out at call ${id}: ${script.slice(0, 100)}`));
    }, 20000);
    function receive(event) {
      const result = JSON.parse(event.data);
      if (result.id !== id) return;
      clearTimeout(timeout);
      socket.removeEventListener('message', receive);
      if (result.error) reject(new Error(result.error.message));
      else resolve(result.result);
    }
    socket.addEventListener('message', receive);
  });
  const expression = `new Promise(function(resolve){window.__adobe_cep__.evalScript(${JSON.stringify(script)},resolve);})`;
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  const result = await response;
  assert.equal(result.exceptionDetails, undefined);
  return result.result.value;
}
const checks = [];
const states = [];
let setupStarted = false;
try {
  setupStarted = true;
  const setup = await native(`(function(){
    function read(path){var file=new File(${JSON.stringify(repositoryRoot)}+path);file.encoding="UTF-8";if(!file.open("r"))throw new Error("Cannot read "+path);var code=file.read();file.close();return code;}
    eval(read("/src/jsx/lib/json2.js"));
    if($.SCI_ZOOM_UNDO_TEST)throw new Error("A previous undo fixture still exists");
    var doc=app.activeDocument,original=null;
    for(var i=0;i<doc.pageItems.length;i++){
      var item=doc.pageItems[i];
      for(var t=0;t<item.tags.length;t++)if(item.tags[t].name==="ILST_ZOOM_ACTIVE_TARGET")throw new Error("Close the zoom editor before this test");
      if(!original&&(item.typename==="RasterItem"||item.typename==="PlacedItem"))original=item;
    }
    if(!original)throw new Error("The document must contain an image");
    var fixture={doc:doc,oldSelection:doc.selection,oldLayer:doc.activeLayer,itemCount:doc.pageItems.length,documentCount:app.documents.length,oldCall:$["com.example.achuanPlugin"].call};
    $.SCI_ZOOM_UNDO_TEST=fixture;
    $["com.example.achuanPlugin"].call=function(operation,payload){if(operation==="syncZoomTracker")return JSON.stringify({ok:true,data:"OK"});return fixture.oldCall(operation,payload);};
    fixture.layer=doc.layers.add();fixture.layer.name="SCI temporary undo test "+new Date().getTime();doc.activeLayer=fixture.layer;doc.selection=null;
    fixture.other=fixture.layer.pathItems.rectangle(20000,-19980,10,10);fixture.other.filled=false;fixture.other.stroked=false;
    var scope=';var fullIndex=readCurrentZoomRecords;readCurrentZoomRecords=function(doc){var index=fullIndex(doc),maps=["records","pictures","markers","guides1","guides2"];for(var i=0;i<maps.length;i++){var map=index[maps[i]];for(var key in map){var item=map[key];if(maps[i]==="records")item=item.zoom;if(item.layer!==testLayer)delete map[key];}}return index;};return {apply:applyZoomImages,sync:syncZoomTracker,tag:addTag,clear:clearCopiedZoomTags,find:findItemByTag,visible:getVisibleBounds,index:readCurrentZoomRecords,state:captureZoomTrackingState};';
    fixture.api=new Function("JSON","testLayer",read("/src/jsx/ilst/arrange.jsx")+read("/src/jsx/ilst/scalebar.jsx")+scope)(JSON,fixture.layer);
    fixture.source=original.duplicate(fixture.layer);fixture.api.clear(fixture.source);
    var p=fixture.api.visible(fixture.source);fixture.source.translate(-20000-p[0],20000-p[1]);
    fixture.api.tag(fixture.source,"ILST_ZOOM_ACTIVE_TARGET","1");
    var entries=[{name:"Undo test",recordKey:null,region:{x:0.1,y:0.1,width:0.15,height:0.15},placement:"right",strokeColor:"#ff0000",strokeWidth:1.5,strokeDash:"dash",useRectangleColor:true,addGuideLines:true,guideLineExtent:"acrossImages"}];
    var extra=JSON.parse(JSON.stringify(entries[0]));extra.name="Undo test 2";extra.region.x=0.5;entries.push(extra);
    if(fixture.api.apply(JSON.stringify({entries:entries,deletedKeys:[]}))!=="Success")throw new Error("Cannot create fixture zoom");
    for(var t=0;t<fixture.source.tags.length;t++)if(fixture.source.tags[t].name.indexOf("ILST_ZOOM_SRC_")===0)fixture.key=fixture.source.tags[t].name.substring(14);
    fixture.api.sync();
    fixture.snapshot=function(){return fixture.api.state(fixture.api.index(doc));};
    return "SCI_UNDO_FIXTURE_READY";
  })()`);
  assert.equal(setup, 'SCI_UNDO_FIXTURE_READY');
  console.log('Native undo fixture ready');
  states.push(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());')));
  for (const [name, edit] of [
    ['source translation', 'fixture.source.translate(35,-25);'],
    ['marker movement and resize', 'var marker=fixture.api.find(fixture.doc,"ILST_ZOOM_MARKER_"+fixture.key);marker.translate(7,-9);marker.width*=1.4;'],
    ['manual zoom position', 'var zoom=fixture.api.find(fixture.doc,"ILST_ZOOM_ITEM_"+fixture.key),p=fixture.api.visible(fixture.source),z=fixture.api.visible(zoom);zoom.translate(p[0]-z[0],p[3]-40-z[1]);'],
    ['manual zoom enlargement', 'fixture.api.find(fixture.doc,"ILST_ZOOM_ITEM_"+fixture.key).resize(180,140,true,true,true,true,100,Transformation.TOPLEFT);'],
    ['manual zoom reduction', 'fixture.api.find(fixture.doc,"ILST_ZOOM_ITEM_"+fixture.key).resize(60,45,true,true,true,true,100,Transformation.TOPLEFT);'],
    ['source nonuniform enlargement', 'fixture.source.resize(140,180,true,true,true,true,100,Transformation.TOPLEFT);'],
    ['source nonuniform reduction', 'fixture.source.resize(50,40,true,true,true,true,100,Transformation.TOPLEFT);']
  ]) {
    console.log(`Verifying ${name}`);
    const before = JSON.parse(await native('(function(){var fixture=$.SCI_ZOOM_UNDO_TEST;return JSON.stringify(fixture.snapshot());})()'));
    const edited = JSON.parse(await native(`(function(){var fixture=$.SCI_ZOOM_UNDO_TEST;${edit}return JSON.stringify(fixture.snapshot());})()`));
    await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
    const after = JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());'));
    for (const key of Object.keys(edited)) {
      assert.deepEqual(after[key].zoom, edited[key].zoom, `${name}: automatic updates must keep each live zoom rectangle`);
    }
    await native('app.undo();"USER_UNDO";');
    await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
    const undone = JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());'));
    assert.deepEqual(undone, before, `${name}: one undo plus polling must restore the entire association`);
    for (let i = 0; i < 3; i++) await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
    await native('app.redo();"USER_REDO";');
    await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
    const redone = JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());'));
    assert.deepEqual(redone, after, `${name}: redo must restore the combined edit and automatic update`);
    checks.push(name);
    states.push(after);
    console.log(`Passed ${name}`);
  }
  for (let i = states.length - 2; i >= 0; i--) {
    await native('app.undo();"USER_UNDO";');
    await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
    assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());')), states[i], 'Repeated undo must walk earlier combined edits');
  }
  for (let i = 1; i < states.length; i++) {
    await native('app.redo();"USER_REDO";');
    await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
    assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());')), states[i], 'Repeated redo must preserve the original history');
  }
  checks.push('repeated undo and redo');
  // Three native undos cross the latest complete pair and reach the previous
  // automatic update before polling. The tracker must recognize that pair.
  await native('app.undo();app.undo();app.undo();"RAPID_UNDO";');
  await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
  assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());')), states.at(-3));
  for (let i = states.length - 2; i < states.length; i++) {
    await native('app.redo();"USER_REDO";');
    await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
    assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());')), states[i]);
  }
  checks.push('rapid undo between polls');
  const beforeForeignEdit = JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());'));
  const otherBefore = JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.other.geometricBounds);'));
  await native('$.SCI_ZOOM_UNDO_TEST.source.translate(12,-15);"SOURCE_EDIT";');
  await native('$.SCI_ZOOM_UNDO_TEST.other.translate(5,-8);"UNRELATED_EDIT";');
  const otherAfter = JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.other.geometricBounds);'));
  await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
  const afterForeignEdit = JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());'));
  await native('app.undo();"USER_UNDO_UPDATE";');
  await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
  assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.other.geometricBounds);')), otherAfter,
    'Do not keep an unrelated undo while trying to combine automatic history');
  await native('app.undo();"USER_UNDO_OTHER";');
  await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
  assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.other.geometricBounds);')), otherBefore);
  await native('app.undo();"USER_UNDO_SOURCE";');
  await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
  assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());')), beforeForeignEdit);
  await native('app.redo();"USER_REDO_SOURCE";');
  await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
  assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.other.geometricBounds);')), otherBefore,
    'Do not keep an unrelated redo while trying to combine automatic history');
  await native('app.redo();"USER_REDO_OTHER";');
  await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
  await native('app.redo();"USER_REDO_UPDATE";');
  await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
  assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.other.geometricBounds);')), otherAfter);
  assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());')), afterForeignEdit);
  checks.push('unrelated edits keep their own undo and redo');
  const beforeDelete = JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());'));
  await native('(function(){var fixture=$.SCI_ZOOM_UNDO_TEST;fixture.api.find(fixture.doc,"ILST_ZOOM_ITEM_"+fixture.key).remove();return "DELETED";})()');
  await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
  const deleted = JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());'));
  await native('app.undo();"USER_UNDO";');
  await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
  assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());')), beforeDelete, 'Undo deletion must revive the zoom, marker, guides and source tag');
  await native('app.redo();"USER_REDO";');
  await native('$.SCI_ZOOM_UNDO_TEST.api.sync();');
  assert.deepEqual(JSON.parse(await native('JSON.stringify($.SCI_ZOOM_UNDO_TEST.snapshot());')), deleted, 'Redo deletion must keep associations removed');
  checks.push('zoom deletion and restored native references');
} finally {
  try {
    if (setupStarted) {
      const cleanup = await native('(function(){var fixture=$.SCI_ZOOM_UNDO_TEST;if(!fixture)return "NO_FIXTURE";var doc=fixture.doc;doc.selection=null;if(fixture.layer)fixture.layer.remove();doc.activeLayer=fixture.oldLayer;doc.selection=fixture.oldSelection;$["com.example.achuanPlugin"].call=fixture.oldCall;delete $.SCI_ZOOM_UNDO_TEST;return JSON.stringify({cleanup:doc.pageItems.length===fixture.itemCount&&app.documents.length===fixture.documentCount});})()');
      assert.equal(JSON.parse(cleanup).cleanup, true);
    }
  } finally {
    socket.close();
  }
}
console.log(JSON.stringify({ ok: true, checks, cleanup: true }));
