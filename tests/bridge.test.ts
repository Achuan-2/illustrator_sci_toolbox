import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { parse } from 'acorn';
import {
  createBridge,
  extensionPath,
  HostError,
  type CepAdapter
} from '../src/js/services/bridge.ts';
import { hostNamespace } from '../src/shared/host.ts';
import { isHostSource } from '../vite.es.config.ts';

const hostSource = fs.readFileSync('dist/cep/jsx/index.js', 'utf8');

function documentTags(items: any[]) {
  return items.flatMap((item) => [...(item.tags || [])].map((tag) => ({ ...tag, parent: item })));
}

test('host file watching accepts Vite paths and Windows drive-letter casing', () => {
  const host = path.resolve('src/jsx/index.ts').replace(/\\/g, '/');
  assert.equal(isHostSource(host), true);
  if (process.platform === 'win32')
    assert.equal(isHostSource(host.toLowerCase()), true);
  assert.equal(isHostSource(path.resolve('src/js/services/bridge.ts')), false);
});

test('complete host output is ES3 and works without native JSON or a document', () => {
  assert.equal(
    hostSource.charCodeAt(0),
    0xfeff,
    'Host output must declare UTF-8 for $.evalFile'
  );
  parse(hostSource, { ecmaVersion: 3 });
  const context = vm.createContext({
    $: {},
    app: { documents: [] },
    JSON: undefined
  });
  vm.runInContext(hostSource, context);
  for (const operation of [
    'arrangeImages',
    'copyRelativePosition',
    'pasteRelativePosition',
    'copySize',
    'pasteSize',
    'addLabelsToImages',
    'updateLabelIndex',
    'updateLabelOffsets',
    'updateLabelSessionIndex',
    'filterTextFrames',
    'filterSelection',
    'swapSelectedPositions',
    'distributeSpacing',
    'copySpacing',
    'pasteSpacing',
    'addBorder',
    'inspectZoomTarget',
    'applyZoomImages',
    'syncZoomTracker',
    'inspectPseudocolorLayerTargets',
    'applyPaletteFill'
  ]) {
    const result = JSON.parse(
      context.$[hostNamespace].call(operation, '%5B%5D')
    );
    assert.deepEqual(
      result,
      { ok: false, error: 'errors.noDocument', args: [] },
      operation
    );
  }
  assert.equal(
    context.arrangeImages,
    undefined,
    'Host algorithms must not pollute global scope'
  );
  assert.deepEqual(JSON.parse(context.$[hostNamespace].call('applyPseudocolorLayers',
    encodeURIComponent(JSON.stringify([JSON.stringify({ mode: 'batch', lut: 'red', keepOriginal: false })])))),
    { ok: false, error: 'errors.noDocument', args: [] });
  for (const removed of ['inspectPseudocolorTargets', 'capturePseudocolorTargets', 'applyPseudocolorImages', 'applyMergedChannels', 'cancelPseudocolorTargets'])
    assert.equal(JSON.parse(context.$[hostNamespace].call(removed, '%5B%5D')).error, 'errors.details');
  const unknown = JSON.parse(
    context.$[hostNamespace].call('constructor', '%5B%5D')
  );
  assert.equal(
    unknown.ok,
    false,
    'Inherited names cannot become callable operations'
  );
});

test('bridge waits for initialization, serializes requests and continues after an error', async () => {
  const calls: string[] = [];
  let active = 0;
  let maximum = 0;
  let count = 0;
  const cep: CepAdapter = {
    getSystemPath: () => 'file:///D:/a%20b/extension',
    evalScript(script, callback) {
      calls.push(script);
      maximum = Math.max(maximum, ++active);
      setTimeout(() => {
        active--;
        if (script.includes('$.evalFile')) return callback('SCI_READY');
        count++;
        callback(
          JSON.stringify(
            count === 1
              ? { ok: false, error: 'errors.noDocument', args: [] }
              : { ok: true, data: 'Success' }
          )
        );
      }, 1);
    }
  };
  const bridge = createBridge(cep);
  const first = bridge.call('copySize');
  const second = bridge.call('pasteSize', 1, 2, true, true);
  await assert.rejects(
    first,
    (error: HostError) => error.key === 'errors.noDocument'
  );
  assert.equal(await second, 'Success');
  assert.equal(maximum, 1);
  assert.equal(
    calls.filter((script) => script.includes('$.evalFile')).length,
    1
  );
  assert.ok(calls[0].includes('D:/a b/extension/jsx/index.js'));
});

test('zoom preview bounds raster size for large images and retains detail for small images', () => {
  for (const [width, height] of [[5000, 2500], [2500, 5000], [200, 100]]) {
    let captureOptions: { resolution: number } | undefined;
    const source = {
      typename: 'RasterItem', geometricBounds: [0, height, width, 0], tags: []
    };
    const document = {
      selection: [source],
      pageItems: [source],
      get tags() { return documentTags(this.pageItems); },
      documentColorSpace: 'RGB',
      imageCapture(_file: unknown, bounds: unknown, options: { resolution: number }) {
        assert.deepEqual(Array.from(bounds as number[]), [0, height, width, 0]);
        captureOptions = options;
      }
    };
    Object.assign(source, { parent: document });
    const documents = Object.assign([document], { add: () => assert.fail('Preview must not open a document') });
    const context = vm.createContext({
      $: {},
      app: { documents, activeDocument: document },
      ElementPlacement: { PLACEATBEGINNING: 'beginning' },
      SaveOptions: { DONOTSAVECHANGES: 'no-save' },
      Folder: { temp: { fsName: 'D:/Temp' } },
      File: function (this: { fsName: string }, filename: string) { this.fsName = filename; },
      ImageCaptureOptions: function () {}
    });
    vm.runInContext(hostSource, context);
    const response = JSON.parse(context.$[hostNamespace].call('inspectZoomTarget', '%5B%5D'));
    assert.equal(response.ok, true);
    assert.ok(JSON.parse(response.data).previewPath.endsWith('.png'));
    assert.ok(captureOptions);
    assert.ok(Math.max(width, height) * captureOptions.resolution / 72 <= 1600);
    if (width === 200) assert.equal(captureOptions.resolution, 150);
    assert.deepEqual(source.geometricBounds, [0, height, width, 0]);
    assert.equal(document.selection[0], source);
  }
});

test('quoted, multiline and Unicode inputs cannot escape the serialized payload', async () => {
  const value = 'Arial"; throw new Error("injected"); //\n中文\\font';
  let received: unknown;
  const cep: CepAdapter = {
    getSystemPath: () => 'D:/test',
    evalScript(script, callback) {
      if (script.includes('$.evalFile')) return callback('SCI_READY');
      const context = vm.createContext({
        $: {
          [hostNamespace]: {
            call(operation: string, payload: string) {
              received = {
                operation,
                args: JSON.parse(decodeURIComponent(payload))
              };
              return JSON.stringify({ ok: true, data: '2' });
            }
          }
        }
      });
      callback(vm.runInContext(script, context));
    }
  };
  await createBridge(cep).call(
    'addLabelsToImages',
    value,
    8,
    false,
    0,
    0,
    'a',
    '#000000',
    'grid',
    false,
    1,
    123
  );
  assert.equal((received as { args: unknown[] }).args[0], value);
});

test('zoom preview excludes overlapping rectangles without switching documents and restores state on failure', () => {
  for (const failure of [null, 'hide', 'capture']) {
    let captures = 0;
    const source = {
      typename: 'RasterItem', geometricBounds: [0, 100, 100, 0], tags: [], hidden: false
    };
    const rectangle = {
      typename: 'PathItem', closed: true, pathPoints: [{}, {}, {}, {}], tags: [],
      geometricBounds: [10, 90, 30, 70], strokeWidth: 1.5,
      strokeColor: { typename: 'RGBColor', red: 255, green: 0, blue: 0 },
      hidden: false, locked: true, strokeDashes: [4, 2]
    };
    let rectangleHidden = false;
    Object.defineProperty(rectangle, 'hidden', {
      get: () => rectangleHidden,
      set(value: boolean) {
        if (failure === 'hide' && value) throw new Error('Hide failed');
        rectangleHidden = value;
      }
    });
    const document = {
      selection: [source, rectangle], pageItems: [source, rectangle], documentColorSpace: 'RGB',
      get tags() { return documentTags(this.pageItems); },
      imageCapture() {
        captures++;
        assert.equal(source.hidden, false);
        assert.equal(rectangle.hidden, true, 'Overlapping rectangles must not be rendered');
        if (failure === 'capture') throw new Error('Capture failed');
      }
    };
    Object.assign(source, { parent: document });
    Object.assign(rectangle, { parent: document });
    const documents = Object.assign([document], {
      add() { assert.fail('Preview must not create a document'); }
    });
    const app: { documents: typeof documents; activeDocument: unknown } = { documents, activeDocument: document };
    const context = vm.createContext({
      $: {}, app,
      Folder: { temp: { fsName: 'D:/Temp' } },
      File: function (this: { fsName: string }, filename: string) { this.fsName = filename; },
      ImageCaptureOptions: function () {},
      ElementPlacement: { PLACEATBEGINNING: 'beginning' },
      SaveOptions: { DONOTSAVECHANGES: 'no-save' }
    });
    vm.runInContext(hostSource, context);
    const response = JSON.parse(context.$[hostNamespace].call('inspectZoomTarget', '%5B%5D'));
    assert.equal(response.ok, failure === null);
    if (failure) assert.equal(response.error, 'errors.zoomCaptureFailed');
    else {
      const data = JSON.parse(response.data);
      assert.equal(data.manualRect.strokeColor, '#ff0000', 'The editable marker retains its style independently');
      assert.equal(data.manualRect.region.width, 0.2);
    }
    assert.equal(captures, failure === 'hide' ? 0 : 1);
    assert.equal(app.activeDocument, document);
    assert.deepEqual(Array.from(document.selection), [source, rectangle]);
    assert.equal(source.hidden, false);
    assert.equal(rectangle.hidden, false);
    assert.equal(rectangle.locked, true);
  }
});

test('preview isolation follows nested groups and layers and preserves initially hidden artwork', () => {
  for (const failure of [false, true]) {
    const source: any = { typename: 'RasterItem', geometricBounds: [0, 100, 100, 0], tags: [], hidden: false };
    const sibling: any = { typename: 'PathItem', hidden: false, locked: false };
    const preHidden: any = { typename: 'PathItem', hidden: true, locked: true };
    const group: any = { typename: 'GroupItem', pageItems: [source, sibling, preHidden] };
    for (const artwork of group.pageItems) artwork.parent = group;
    const layerSibling: any = { typename: 'PathItem', hidden: false, locked: true };
    const mainLayer: any = { typename: 'Layer', visible: true, pageItems: [group, source, sibling, preHidden, layerSibling] };
    group.parent = mainLayer;
    layerSibling.parent = mainLayer;
    const otherLayer: any = { typename: 'Layer', visible: true, locked: true };
    const document = {
      selection: [source], pageItems: [source, sibling, preHidden, group, layerSibling],
      get tags() { return documentTags(this.pageItems); },
      layers: [mainLayer, otherLayer],
      imageCapture() {
        assert.equal(sibling.hidden, true);
        assert.equal(layerSibling.hidden, true);
        assert.equal(otherLayer.visible, false);
        assert.equal(mainLayer.visible, true);
        assert.equal(preHidden.hidden, true);
        assert.equal(preHidden.locked, true);
        assert.equal(source.hidden, false);
        if (failure) throw new Error('Capture failed');
      }
    };
    mainLayer.parent = document;
    otherLayer.parent = document;
    const context = vm.createContext({
      $: {}, app: { documents: [document], activeDocument: document },
      Folder: { temp: { fsName: 'D:/Temp' } },
      File: function (this: { fsName: string }, filename: string) { this.fsName = filename; },
      ImageCaptureOptions: function () {}
    });
    vm.runInContext(hostSource, context);
    const response = JSON.parse(context.$[hostNamespace].call('inspectZoomTarget', '%5B%5D'));
    assert.equal(response.ok, !failure);
    assert.equal(sibling.hidden, false);
    assert.equal(layerSibling.hidden, false);
    assert.equal(layerSibling.locked, true);
    assert.equal(otherLayer.visible, true);
    assert.equal(otherLayer.locked, true);
    assert.equal(preHidden.hidden, true);
    assert.equal(preHidden.locked, true);
    assert.equal(document.selection[0], source);
  }
});

test('plain linked PNG and JPEG images use their source files while embedded and rotated images are rendered', () => {
  for (const mode of ['png', 'jpg', 'embedded', 'rotated', 'missing']) {
    let captures = 0;
    const linked = mode === 'png' || mode === 'jpg';
    const source = {
      typename: mode === 'embedded' ? 'RasterItem' : 'PlacedItem',
      embedded: mode === 'embedded', opacity: 100,
      matrix: { mValueA: 1, mValueB: mode === 'rotated' ? 1 : 0, mValueC: 0, mValueD: 1 },
      geometricBounds: [0, 100, 100, 0], tags: [],
      file: { exists: mode !== 'missing', name: `source.${mode === 'jpg' ? 'jpg' : 'png'}`, fsName: `D:/user/source.${mode === 'jpg' ? 'jpg' : 'png'}` }
    };
    const document = {
      selection: [source], pageItems: [source],
      get tags() { return documentTags(this.pageItems); },
      imageCapture() { captures++; }
    };
    Object.assign(source, { parent: document });
    const context = vm.createContext({
      $: {}, app: { documents: [document], activeDocument: document },
      Folder: { temp: { fsName: 'D:/Temp' } },
      File: function (this: { fsName: string }, filename: string) { this.fsName = filename; },
      ImageCaptureOptions: function () {}
    });
    vm.runInContext(hostSource, context);
    const response = JSON.parse(context.$[hostNamespace].call('inspectZoomTarget', '%5B%5D'));
    assert.equal(response.ok, true);
    const data = JSON.parse(response.data);
    assert.equal(data.previewIsTemporary, !linked);
    assert.equal(captures, linked ? 0 : 1);
    if (linked) {
      assert.equal(data.previewPath, source.file.fsName);
      assert.equal(data.previewMimeType, mode === 'jpg' ? 'image/jpeg' : 'image/png');
    }
  }
});

test('host loading failure can be retried and browser preview rejects host operations', async () => {
  let attempt = 0;
  const bridge = createBridge({
    getSystemPath: () => '/extension',
    evalScript: (_script, callback) =>
      callback(++attempt === 1 ? 'SCI_LOAD_ERROR' : 'SCI_READY')
  });
  await assert.rejects(
    bridge.initialize(),
    (error: HostError) => error.key === 'errors.hostLoad'
  );
  await bridge.initialize();
  assert.equal(attempt, 2);
  await assert.rejects(
    createBridge(undefined).call('copySize'),
    (error: HostError) => error.key === 'errors.hostUnavailable'
  );
  assert.equal(
    extensionPath({
      getSystemPath: () => 'file:///Users/me/plugin',
      evalScript() {}
    }),
    '/Users/me/plugin'
  );
});
