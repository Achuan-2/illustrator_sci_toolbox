import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { calibratedTiff } from './fixtures/scalebarTiff.ts';

const source = fs.readFileSync('src/jsx/ilst/scalebar.jsx', 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
function file(data: Buffer) {
  let position = 0,
    closed = false,
    bytesRead = 0,
    lastReadEnd = 0;
  return {
    exists: true,
    length: data.length,
    open: () => true,
    seek: (offset: number) => {
      position = offset;
    },
    read: (count: number) => {
      bytesRead += count;
      const value = data
        .subarray(position, position + count)
        .toString('latin1');
      position += count;
      lastReadEnd = Math.max(lastReadEnd, position);
      return value;
    },
    close: () => {
      closed = true;
    },
    get closed() {
      return closed;
    },
    get bytesRead() {
      return bytesRead;
    },
    get lastReadEnd() {
      return lastReadEnd;
    }
  };
}

test('common calibration units normalize to micrometers', () => {
  for (const unit of ['um', 'µm', 'μm', 'micron', 'micrometers'])
    assert.equal(context.scaleUnitFactor(unit), 1);
  assert.equal(context.scaleUnitFactor('cm'), 10000);
  assert.equal(context.scaleUnitFactor('nm'), 0.001);
  assert.equal(context.scaleUnitFactor('pixels'), 0);
});

for (const little of [true, false])
  for (const big of [false, true]) {
    test(`ImageJ TIFF reads calibration without pixels (${little ? 'LE' : 'BE'}, ${big ? 'BigTIFF' : 'classic'})`, () => {
      const input = file(calibratedTiff({ little, big }));
      assert.deepEqual(plain(context.readScaleTiff(input)), {
        width: 16,
        height: 8,
        unit: 'um',
        source: 'ImageJ TIFF'
      });
      assert.equal(input.closed, true);
      assert.ok(input.lastReadEnd <= input.length - 512);
    });
  }

test('OME physical sizes support unequal pixel spacing and mixed units', () => {
  const description =
    '<OME><Pixels SizeX="32" SizeY="16" PhysicalSizeX="500" PhysicalSizeXUnit="nm" PhysicalSizeY="2" PhysicalSizeYUnit="&#181;m"/></OME>';
  assert.deepEqual(
    plain(context.readScaleTiff(file(calibratedTiff({ description })))),
    { width: 16000, height: 32000, unit: 'nm', source: 'OME-TIFF' }
  );
  const defaultUnits = '<Pixels PhysicalSizeX="0.25" PhysicalSizeY="0.5" />';
  assert.equal(
    context.readScaleTiff(file(calibratedTiff({ description: defaultUnits })))
      .width,
    8
  );
});

test('printing DPI, unsupported units, zero rationals and malformed TIFF are not physical calibration', () => {
  for (const description of [
    '',
    'unit=pixel\n',
    '<Pixels PhysicalSizeX="1" PhysicalSizeY="1" PhysicalSizeXUnit="unknown"/>'
  ])
    assert.equal(
      context.readScaleTiff(file(calibratedTiff({ description }))),
      null
    );
  assert.equal(
    context.readScaleTiff(file(calibratedTiff({ denominator: 0 }))),
    null
  );
  for (const bytes of [Buffer.from('bad'), calibratedTiff().subarray(0, 50)]) {
    const input = file(bytes);
    assert.equal(context.readScaleTiff(input), null);
    assert.equal(input.closed, true);
  }
});

test('explicit TIFF FOV clamps lengths to 90% along the selected axis before drawing', () => {
  assert.deepEqual(
    plain(
      context.readScaleTiff(
        file(calibratedTiff({ description: 'FOV=0.05 × 0.03 cm' }))
      )
    ),
    { width: 0.05, height: 0.03, unit: 'cm', source: 'TIFF FOV' }
  );
  const options = {
    orientation: 'vertical',
    lengthUm: 300,
    thickness: 2,
    fontSize: 8,
    color: '#ffffff',
    fontColor: '#ffffff',
    position: 'BR'
  };
  const fov = { width: 0.05, height: 0.03, unit: 'cm' };
  assert.doesNotThrow(() => context.validateScaleOptions(options, fov));
  assert.equal(options.lengthUm, 270);
  const horizontal = { ...options, orientation: 'horizontal', lengthUm: 501 };
  context.validateScaleOptions(horizontal, fov);
  assert.equal(horizontal.lengthUm, 450);
  const shorter = { ...options, lengthUm: 20 };
  context.validateScaleOptions(shorter, fov);
  assert.equal(shorter.lengthUm, 20);
  const hidden = { ...options, lengthUm: 0 };
  context.validateScaleOptions(hidden, fov);
  assert.equal(hidden.lengthUm, 0);
  for (const lengthUm of [-1, NaN, null, undefined])
    assert.throws(
      () => context.validateScaleOptions({ ...options, lengthUm }, fov),
      /errors.scaleOptions/
    );
  assert.throws(
    () => context.validateScaleOptions({ ...options, thickness: NaN }, fov),
    /errors.scaleOptions/
  );
});

test('merged channel groups accept multiple rasters and require consistent calibration to infer FOV', () => {
  const host = vm.createContext({
    getTag: () => null,
    getVisibleBounds: (item: any) => item.geometricBounds
  });
  vm.runInContext(source, host);
  const group: any = { typename: 'GroupItem', name: 'SCI Merge Channels — Screen',
    note: '', geometricBounds: [0, 100, 200, 0], pageItems: [] };
  const image = (fov: object) => ({ typename: 'RasterItem', parent: group,
    note: `[SCI_FOV]${JSON.stringify(fov)}[/SCI_FOV]`, geometricBounds: group.geometricBounds });
  group.pageItems = [image({ width: 100, height: 50, unit: 'um' }),
    image({ width: 0.1, height: 0.05, unit: 'mm' })];
  const doc = { selection: [group] };
  assert.equal(host.scaleSelectionTarget(doc), group);
  assert.deepEqual(plain(host.scaleReadFov(group)), { width: 100, height: 50, unit: 'um' });
  group.name = 'Renamed result'; group.note = 'SCI_MERGE_CHANNELS:1';
  assert.equal(host.scaleSelectionTarget(doc), group);
  group.pageItems[1].note = '[SCI_FOV]{"width":200,"height":50,"unit":"um"}[/SCI_FOV]';
  assert.equal(host.scaleReadFov(group), null);
  group.note += '\n[SCI_FOV]{"width":300,"height":150,"unit":"um"}[/SCI_FOV]';
  assert.equal(host.scaleReadFov(group).width, 300, 'Manual merged FOV overrides conflicting channels');
  group.note = '';
  assert.throws(() => host.scaleSelectionTarget(doc), /errors.scaleSelection/);
});

test('merged-channel zooms resolve the clipping frame before adding a scale and infer its cropped FOV', () => {
  const host = vm.createContext({
    getTag: () => null,
    getVisibleBounds: (item: any) => item.visibleBounds || item.geometricBounds
  });
  vm.runInContext(source, host);
  const layer = { typename: 'Layer' };
  const zoom: any = {
    typename: 'GroupItem', parent: layer, clipped: true, note: '',
    tags: [{ name: 'ILST_ZOOM_ITEM_record', value: '{}' }],
    geometricBounds: [0, 200, 400, 0], visibleBounds: [100, 150, 300, 50], pageItems: []
  };
  const merged: any = { typename: 'GroupItem', parent: zoom,
    note: 'SCI_MERGE_CHANNELS:1', pageItems: [] };
  const mask = { typename: 'PathItem', parent: zoom, clipping: true };
  merged.pageItems = [0, 1].map(() => ({ typename: 'RasterItem', parent: merged,
    note: '[SCI_FOV]{"width":200,"height":100,"unit":"um"}[/SCI_FOV]',
    geometricBounds: zoom.geometricBounds }));
  zoom.pageItems = [mask, merged];
  const doc = { selection: [zoom], pageItems: [zoom, mask, merged, ...merged.pageItems] };
  for (const selected of [zoom, mask, merged, merged.pageItems[0]]) {
    doc.selection = [selected];
    assert.equal(host.scaleSelectionTarget(doc), zoom, 'Bind to the visible zoom frame');
  }
  assert.deepEqual(plain(host.scaleReadFov(zoom)), { width: 100, height: 50, unit: 'um' });
  zoom.note = '[SCI_FOV]{"width":80,"height":40,"unit":"um","source":"zoom"}[/SCI_FOV]';
  assert.equal(host.scaleReadFov(zoom).width, 80, 'Saved crop calibration takes priority');
  zoom.tags = [];
  doc.selection = [zoom];
  assert.throws(() => host.scaleSelectionTarget(doc), /errors.scaleSelection/,
    'Unmarked multi-image groups remain ambiguous');
});

test('copied target tags on pre-UUID hosts become unique and retire the ambiguous pending-save token', () => {
  let sequence = 0;
  const first = { tags: { SCI_SCALE_TARGET: 'copied-token' } };
  const second = { tags: { SCI_SCALE_TARGET: 'copied-token' } };
  const third = { tags: { SCI_SCALE_TARGET: 'copied-token' } };
  const doc = {
    pageItems: [first, second, third],
    get tags() {
      return this.pageItems.map((item) => ({ name: 'SCI_SCALE_TARGET', value: item.tags.SCI_SCALE_TARGET, parent: item }));
    }
  };
  const host = vm.createContext({
    getTag: (item: any, name: string) => item.tags[name] || null,
    addTag: (item: any, name: string, value: string) => { item.tags[name] = value; },
    createZoomRecordKey: () => `unique-${++sequence}`
  });
  vm.runInContext(source, host);
  const tokens = doc.pageItems.map((item) => host.scaleTargetToken(doc, item));
  assert.equal(new Set(tokens).size, 3);
  assert.equal(tokens.includes('copied-token'), false);
  assert.deepEqual(doc.pageItems.map((item) => host.scaleTargetToken(doc, item)), tokens,
    'Once disambiguated, target tokens remain stable across polling');
});

test('pre-UUID scalebar identity checks only target tags in a large document', () => {
  const target = { tags: { SCI_SCALE_TARGET: 'stable-token' } };
  const doc = {
    tags: [{ name: 'SCI_SCALE_TARGET', value: 'stable-token', parent: target }],
    get pageItems() { throw new Error('Identity polling must not enumerate artwork'); }
  };
  const host = vm.createContext({ getTag: (item: any, name: string) => item.tags[name] || null });
  vm.runInContext(source, host);
  for (let i = 0; i < 10; i++) assert.equal(host.scaleTargetToken(doc, target), 'stable-token');
});

test('scalebar autosave locates native UUIDs and legacy tokens without scanning artwork', () => {
  const native = { uuid: 'native-id', typename: 'RasterItem' }, legacy = {};
  const wrapper = { uuid: native.uuid, typename: 'GroupItem', tags: { getByName: () => ({ value: native.uuid, parent: native }) } };
  const host = vm.createContext({});
  vm.runInContext(source, host);
  const doc = {
    getPageItemFromUuid(token: string) {
      if (token === native.uuid) return wrapper;
      throw new Error('Missing UUID');
    },
    tags: [{ name: 'SCI_SCALE_TARGET', value: 'legacy-id', parent: legacy }],
    get pageItems() { throw new Error('Autosave must not enumerate artwork'); }
  };
  assert.equal(host.scaleFindTargetByToken(doc, 'native-id'), native);
  assert.equal(host.scaleFindTargetByToken(doc, 'legacy-id'), legacy);
  assert.equal(host.scaleFindTargetByToken(doc, 'deleted-id'), null);
});

test('scalebar replacement snapshots tag parents before removing matching annotations', () => {
  const layer = {}, target = { uuid: 'source-id', parent: layer };
  const tags: any[] = [], removed: string[] = [];
  function bar(name: string, parent: unknown, owner: string) {
    const item = { name, parent, owner, remove() {
      removed.push(name);
      tags.splice(tags.findIndex((tag) => tag.parent === item), 1);
    } };
    tags.push({ name: 'SCI_SCALE_BAR', value: 'source-id', parent: item });
    return item;
  }
  bar('old-bar', layer, 'source-id');
  bar('old-label', layer, 'source-id');
  bar('copied-annotation', layer, 'copied-source-id');
  const host = vm.createContext({ getTag: (item: any, name: string) => {
    if (name === 'SCI_SCALE_ID' && item === target) return target.uuid;
    if (name === 'SCI_SCALE_OWNER') return item.owner;
    return null;
  } });
  vm.runInContext(source, host);
  const doc = { tags, get pageItems() { throw new Error('Bar updates must not enumerate artwork'); } };
  host.scaleRemoveBars(doc, target);
  assert.deepEqual(removed.sort(), ['old-bar', 'old-label']);
  assert.equal(tags.length, 1, 'The copied source keeps its independent annotation');
});

test('FOV note round-trips while preserving unrelated text and tags', () => {
  const tags = new Map();
  context.getTag = (_: unknown, name: string) => tags.get(name) || null;
  context.addTag = (_: unknown, name: string, data: string) =>
    tags.set(name, data);
  const item = { note: 'Original notes\n实验信息' };
  const fov = { width: 500, height: 250, unit: 'um' };
  context.scaleWriteFov(item, fov);
  context.scaleWriteFov(item, { ...fov, width: 600 });
  assert.ok(item.note.startsWith('Original notes\n实验信息\n'));
  assert.equal(item.note.match(/\[SCI_FOV\]/g)?.length, 1);
  assert.equal(context.scaleReadStoredFov(item).width, 600);
  assert.equal(context.scaleReadStoredFov(item).height, 250);
});

test('single-axis FOV validates only the requested orientation and survives notes and crop calibration', () => {
  const options = {
    orientation: 'horizontal',
    lengthUm: 50,
    thickness: 2,
    fontSize: 8,
    color: '#ffffff',
    fontColor: '#ffffff',
    position: 'BR'
  };
  const horizontal = { width: 100, height: 0, unit: 'um' };
  const vertical = { width: 0, height: 200, unit: 'um' };
  assert.doesNotThrow(() => context.validateScaleOptions(options, horizontal));
  assert.doesNotThrow(() =>
    context.validateScaleOptions(
      { ...options, orientation: 'vertical' },
      vertical
    )
  );
  assert.throws(
    () =>
      context.validateScaleOptions(
        { ...options, orientation: 'vertical' },
        horizontal
      ),
    /errors.scaleFov/
  );
  assert.throws(
    () => context.validateScaleOptions(options, vertical),
    /errors.scaleFov/
  );
  for (const fov of [
    { ...horizontal, height: NaN },
    { ...horizontal, height: -1 },
    { width: 0, height: 0, unit: 'um' }
  ])
    assert.equal(context.validScaleFov(fov), false);
  const item = { note: '' };
  context.getTag = () => null;
  context.addTag = () => undefined;
  context.scaleWriteFov(item, { width: 100, unit: 'um' });
  assert.deepEqual(plain(context.scaleReadStoredFov(item)), horizontal);
  assert.deepEqual(
    plain(context.scaleZoomFov(item, { width: 0.25, height: 0.5 })),
    { width: 25, height: 0, unit: 'um', source: 'zoom' }
  );
});
