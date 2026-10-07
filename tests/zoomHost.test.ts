import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { hostNamespace } from '../src/shared/host.ts';

const hostSource = fs.readFileSync('dist/cep/jsx/index.js', 'utf8');

// Model Illustrator's tag-name limit, inherited tags, nested clipping and
// transforms about uncropped bounds. Pixel rendering needs the real host.
function fixture(strokedPosition = false, undoSupport = false) {
  const items: any[] = [];
  let transformCalls = 0;
  let selectionOrder: any[] = [];
  const layer: any = {
    typename: 'Layer',
    locked: false,
    visible: true,
    pageItems: []
  };
  function tags(parent: any) {
    const collection: any = [];
    collection.getByName = (name: string) => {
      const tag = collection.find((entry: any) => entry.name === name);
      if (!tag) throw new Error('Tag not found');
      return tag;
    };
    collection.add = () => {
      let name = '';
      const tag = {
        parent,
        get name() {
          return name;
        },
        set name(value: string) {
          if (value.length > 30)
            throw new Error('TGNM: tag name exceeds Illustrator limit');
          name = value;
        },
        value: '',
        remove: () => collection.splice(collection.indexOf(tag), 1)
      };
      collection.push(tag);
      return tag;
    };
    return collection;
  }
  function item(
    type: string,
    left: number,
    top: number,
    width: number,
    height: number,
    parent = layer
  ): any {
    const box = { left, top, width, height };
    let removed = false;
    let readableAfterRemoval = false;
    const artwork: any = {
      get typename() {
        if (removed && !readableAfterRemoval)
          throw new Error('Artwork has been removed');
        return type;
      },
      keepRemovedReferenceReadable() {
        readableAfterRemoval = true;
      },
      captureNativeState() {
        return {
          box: { ...box }, parent: this.parent, selected: this.selected,
          tags: this.tags.map((tag: any) => ({ name: tag.name, value: tag.value })),
          children: [...(this.pageItems ?? [])],
          points: this.points?.map((point: number[]) => [...point])
        };
      },
      restoreNativeState(state: any) {
        Object.assign(box, state.box);
        removed = false;
        this.parent = state.parent;
        this.selected = state.selected;
        this.tags.splice(0);
        for (const tag of state.tags) Object.assign(this.tags.add(), tag);
        if (this.pageItems) this.pageItems.splice(0, this.pageItems.length, ...state.children);
        if (state.points) {
          this.points = state.points.map((point: number[]) => [...point]);
          this.pathPoints = this.points.map((anchor: number[]) => ({ anchor }));
        }
      },
      markNativeRemoved() { removed = true; },
      parent,
      layer,
      selected: false,
      hidden: false,
      locked: false,
      tags: undefined,
      embedded: true,
      opacity: 100,
      get geometricBounds() {
        if (type === 'GroupItem' && this.pageItems.length) {
          const bounds = this.pageItems.map(
            (child: any) => child.geometricBounds
          );
          return [
            Math.min(...bounds.map((b: number[]) => b[0])),
            Math.max(...bounds.map((b: number[]) => b[1])),
            Math.max(...bounds.map((b: number[]) => b[2])),
            Math.min(...bounds.map((b: number[]) => b[3]))
          ];
        }
        return [box.left, box.top, box.left + box.width, box.top - box.height];
      },
      get left() {
        const stroke = strokedPosition && type === 'PathItem' && this.stroked ? this.strokeWidth / 2 : 0;
        return this.geometricBounds[0] - stroke;
      },
      set left(value: number) {
        this.translate(value - this.left, 0);
      },
      get top() {
        const stroke = strokedPosition && type === 'PathItem' && this.stroked ? this.strokeWidth / 2 : 0;
        return this.geometricBounds[1] + stroke;
      },
      set top(value: number) {
        this.translate(0, value - this.top);
      },
      get width() {
        const b = this.geometricBounds;
        return b[2] - b[0];
      },
      set width(value: number) {
        this.resize((value / this.width) * 100, 100);
      },
      get height() {
        const b = this.geometricBounds;
        return b[1] - b[3];
      },
      set height(value: number) {
        this.resize(100, (value / this.height) * 100);
      },
      moveToBeginning(group: any) {
        this.parent.pageItems.splice(this.parent.pageItems.indexOf(this), 1);
        group.pageItems.unshift(this);
        this.parent = group;
      },
      transform(
        horizontal: number,
        vertical: number,
        anchor: number[],
        dx = 0,
        dy = 0
      ) {
        if (type === 'GroupItem') {
          for (const child of this.pageItems)
            child.transform(horizontal, vertical, anchor, dx, dy);
        } else {
          box.left = anchor[0] + (box.left - anchor[0]) * horizontal + dx;
          box.top = anchor[1] + (box.top - anchor[1]) * vertical + dy;
          box.width *= horizontal;
          box.height *= vertical;
        }
      },
      resize(horizontal: number, vertical: number) {
        transformCalls++;
        this.transform(horizontal / 100, vertical / 100, this.geometricBounds);
      },
      translate(dx: number, dy: number) {
        transformCalls++;
        this.transform(1, 1, [0, 0], dx, dy);
      },
      duplicate(destination = this.parent) {
        const copy = item(
          type,
          this.left,
          this.top,
          this.width,
          this.height,
          destination
        );
        for (const property of [
          'selected',
          'clipped',
          'clipping',
          'filled',
          'stroked',
          'strokeWidth',
          'strokeDashes',
          'strokeColor'
        ]) {
          copy[property] = this[property];
        }
        for (const tag of this.tags)
          Object.assign(copy.tags.add(), { name: tag.name, value: tag.value });
        for (const child of [...(this.pageItems ?? [])].reverse())
          child.duplicate(copy);
        return copy;
      },
      remove() {
        for (const child of [...(this.pageItems ?? [])]) child.remove();
        this.parent.pageItems.splice(this.parent.pageItems.indexOf(this), 1);
        items.splice(items.indexOf(this), 1);
        removed = true;
      }
    };
    artwork.tags = tags(artwork);
    if (type === 'GroupItem') {
      artwork.pageItems = [];
      artwork.pathItems = paths(artwork);
    }
    if (type === 'PathItem')
      Object.assign(artwork, { closed: true, pathPoints: [{}, {}, {}, {}] });
    parent.pageItems.unshift(artwork);
    items.push(artwork);
    return artwork;
  }
  function paths(parent: any) {
    return {
      rectangle: (top: number, left: number, width: number, height: number) =>
        item('PathItem', left, top, width, height, parent),
      add: () => {
        const line = item('PathItem', 0, 0, 0, 0, parent);
        line.setEntirePath = (points: number[][]) => {
          line.points = Array.from(points, (point) => Array.from(point));
          line.pathPoints = line.points.map((anchor: number[]) => ({ anchor }));
        };
        return line;
      }
    };
  }
  layer.pathItems = paths(layer);
  layer.groupItems = { add: () => item('GroupItem', 0, 0, 0, 0) };
  const source = item('RasterItem', 0, 100, 100, 100);
  const captures: any[] = [];
  const document = {
    typename: 'Document',
    name: 'test.ai',
    layers: [layer],
    pageItems: items,
    get tags() {
      return items.flatMap((artwork) => [...artwork.tags]);
    },
    activeLayer: layer,
    imageCapture(_file: any, bounds: number[]) {
      captures.push([...bounds]);
    },
    get selection() {
      return [
        ...selectionOrder.filter(
          (artwork) => items.includes(artwork) && artwork.selected
        ),
        ...items.filter(
          (artwork) => artwork.selected && !selectionOrder.includes(artwork)
        )
      ];
    },
    set selection(value: any) {
      for (const artwork of items) artwork.selected = false;
      selectionOrder = [...(value ?? [])];
      for (const artwork of selectionOrder) artwork.selected = true;
    }
  };
  layer.parent = document;
  document.selection = [source];
  const undoStack: any[] = [], redoStack: any[] = [];
  let historyUsed = false, undoCalls = 0, redoCalls = 0;
  function snapshotNative() {
    const state = items.map((artwork) => ({ artwork, state: artwork.captureNativeState() }));
    const signature = JSON.stringify(state.map(({ state: value }) => [
      value.box, value.tags, value.points, value.selected,
      value.children.map((child: any) => items.indexOf(child))
    ]));
    return { state, signature, children: [...layer.pageItems], selection: [...selectionOrder] };
  }
  function restoreNative(snapshot: ReturnType<typeof snapshotNative>) {
    const live = snapshot.state.map(({ artwork }) => artwork);
    for (const artwork of items) if (!live.includes(artwork)) artwork.markNativeRemoved();
    items.splice(0, items.length, ...live);
    for (const { artwork, state } of snapshot.state) artwork.restoreNativeState(state);
    layer.pageItems.splice(0, layer.pageItems.length, ...snapshot.children);
    selectionOrder = [...snapshot.selection];
  }
  function commitNative<T>(task: () => T): T {
    if (!undoSupport) return task();
    const before = snapshotNative();
    historyUsed = false;
    const result = task();
    const after = snapshotNative();
    if (!historyUsed && before.signature !== after.signature) {
      undoStack.push({ before, after });
      redoStack.splice(0);
    }
    return result;
  }
  function nativeUndo() {
    undoCalls++;
    historyUsed = true;
    const transaction = undoStack.pop();
    if (transaction) { restoreNative(transaction.before); redoStack.push(transaction); }
  }
  function nativeRedo() {
    redoCalls++;
    historyUsed = true;
    const transaction = redoStack.pop();
    if (transaction) { restoreNative(transaction.after); undoStack.push(transaction); }
  }
  // CEP panels can have separate ExtendScript caches for the same document.
  const forkHost = () => {
    const context = vm.createContext({
      $: {},
      app: { documents: [document], activeDocument: document,
        ...(undoSupport ? { undo: nativeUndo, redo: nativeRedo } : {}) },
      RGBColor: function (this: any) {
        this.typename = 'RGBColor';
      },
      Transformation: { TOPLEFT: 'TOPLEFT' },
      Folder: { temp: { fsName: 'D:/Temp' } },
      File: function (this: any, filename: string) {
        this.fsName = filename;
      },
      ImageCaptureOptions: function () {}
    });
    const reload = () => vm.runInContext(hostSource, context);
    reload();
    const call = (operation: string, args: unknown[] = []) =>
      commitNative(() => JSON.parse(
        context.$[hostNamespace].call(
          operation,
          encodeURIComponent(JSON.stringify(args))
        )
      ));
    const apply = (entries: any[], deletedKeys: string[] = []) =>
      call('applyZoomImages', [JSON.stringify({ entries, deletedKeys })]);
    const inspect = (...targets: any[]) => {
      document.selection = targets;
      const response = call('inspectZoomTarget');
      assert.equal(response.ok, true, response.error);
      return JSON.parse(response.data);
    };
    return { reload, call, apply, inspect };
  };
  const find = (prefix: string, key: string) =>
    items.find((artwork) =>
      artwork.tags.some((tag: any) => tag.name === prefix + key)
    );
  return {
    source,
    items,
    document,
    ...forkHost(),
    forkHost,
    item,
    captures,
    find,
    userEdit: commitNative,
    nativeUndo,
    nativeRedo,
    get undoCalls() { return undoCalls; },
    get redoCalls() { return redoCalls; },
    get transformCalls() { return transformCalls; }
  };
}

function entry(index: number) {
  return {
    recordKey: null,
    name: `放大图 ${index + 1}`,
    region: { x: 0.1 + index * 0.2, y: 0.1, width: 0.1, height: 0.1 },
    strokeColor: '#ff0000',
    strokeWidth: 1.5,
    strokeDash: 'dash',
    useRectangleColor: true,
    addGuideLines: false,
    placement: 'right'
  };
}

function assertBounds(actual: number[], expected: number[]) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < 0.001,
      `Coordinate ${i}: expected ${expected[i]}, got ${actual[i]}`);
  }
}

function trackedFixture(count = 1) {
  const host = fixture();
  host.apply(Array.from({ length: count }, (_, i) => ({
    ...entry(i), addGuideLines: true, guideLineExtent: 'acrossImages'
  })));
  const zooms = [...host.document.selection];
  const records = zooms.map((zoom) => {
    const key = zoom.tags.find((tag: any) => tag.name.startsWith('ILST_ZOOM_ITEM_'))
      .name.substring('ILST_ZOOM_ITEM_'.length);
    return { key, zoom, marker: host.find('ILST_ZOOM_MARKER_', key), mask: zoom.pageItems[0] };
  });
  assert.equal(host.call('syncZoomTracker').data, 'OK');
  return { host, records };
}

for (const hasZoom of [false, true]) {
  test(`background tracking avoids unrelated artwork with ${hasZoom ? 'an existing zoom' : 'no zooms'}`, () => {
    const host = hasZoom ? trackedFixture().host : fixture();
    // Ordinary paths must not be accessed through the host artwork collection
    // while idle. Tag parents still expose the live tracked objects.
    for (let i = 0; i < 5000; i++) host.items.push({ tags: [] });
    const readTags = Object.getOwnPropertyDescriptor(host.document, 'tags')!.get!;
    let tagPasses = 0;
    Object.defineProperty(host.document, 'tags', {
      get() { tagPasses++; return readTags.call(host.document); }
    });
    Object.defineProperty(host.document, 'pageItems', {
      get() { throw new Error('Idle polling must not enumerate document.pageItems'); }
    });
    assert.equal(host.call('syncZoomTracker').data, 'OK');
    const previousPasses = tagPasses;
    const previousTransforms = host.transformCalls;
    for (let i = 0; i < 5; i++) assert.equal(host.call('syncZoomTracker').data, 'OK');
    assert.equal(tagPasses - previousPasses, 5, 'Unchanged polls build only one tag index');
    assert.equal(host.transformCalls, previousTransforms, 'Idle polls do not transform artwork');
    if (hasZoom) {
      host.source.translate(10, 0);
      const movementPasses = tagPasses;
      assert.equal(host.call('syncZoomTracker').data, 'OK', 'Source movement also uses the tag index');
      assert.equal(tagPasses - movementPasses, 1, 'Geometry updates reuse the same index for guides and history');
      const marker = host.items.find((artwork) => artwork.tags.some((tag: any) => tag.name.startsWith('ILST_ZOOM_MARKER_')));
      assertBounds(marker.geometricBounds, [20, 90, 30, 80]);
    }
  });
}

test('zoom editor session setup and cancellation do not scan unrelated artwork', () => {
  const host = fixture();
  const source = host.item('PlacedItem', 0, 100, 100, 100);
  Object.assign(source, {
    embedded: false,
    file: { exists: true, name: 'linked.png', fsName: 'D:/Temp/linked.png' },
    matrix: { mValueA: 1, mValueB: 0, mValueC: 0, mValueD: 1 }
  });
  Object.defineProperty(host.document, 'pageItems', {
    get() { throw new Error('Editor session tags must not require a full artwork scan'); }
  });
  // Linked PNG preview avoids the separate, necessary visibility traversal
  // used when rasterizing embedded artwork against overlapping siblings.
  const preview = host.inspect(source);
  assert.equal(preview.previewPath, 'D:/Temp/linked.png');
  assert.ok(source.tags.some((tag: any) => tag.name === 'ILST_ZOOM_ACTIVE_TARGET'));
  assert.equal(host.call('cancelZoomTarget').data, 'OK');
  assert.equal(source.tags.some((tag: any) => tag.name.startsWith('ILST_ZOOM_ACTIVE_')), false);
});

function undoFixture() {
  const host = fixture(false, true);
  host.apply([{ ...entry(0), addGuideLines: true, guideLineExtent: 'acrossImages' }]);
  const key = host.document.selection[0].tags[0].name.substring('ILST_ZOOM_ITEM_'.length);
  host.call('syncZoomTracker');
  const snapshot = () => {
    const zoom = host.find('ILST_ZOOM_ITEM_', key);
    const marker = host.find('ILST_ZOOM_MARKER_', key);
    return {
      source: [...host.source.geometricBounds],
      marker: marker ? [...marker.geometricBounds] : null,
      zoom: zoom ? [...zoom.pageItems[0].geometricBounds] : null,
      duplicate: zoom ? [...zoom.pageItems[2].geometricBounds] : null,
      guides: [1, 2].map((number) => host.find(`ILST_ZOOM_GUIDE${number}_`, key)?.points.map((point: number[]) => [...point]) ?? null),
      sourceTag: host.source.tags.find((tag: any) => tag.name === 'ILST_ZOOM_SRC_' + key)?.value ?? null
    };
  };
  return { host, key, snapshot };
}

test('one undo and redo restore the user source move together with its automatic marker and guide update', () => {
  const { host, snapshot } = undoFixture();
  const before = snapshot();
  host.userEdit(() => host.source.translate(35, -25));
  host.call('syncZoomTracker');
  const after = snapshot();
  host.nativeUndo();
  host.call('syncZoomTracker');
  assert.deepEqual(snapshot(), before);
  assert.equal(host.undoCalls, 2, 'Undo the automatic update and its verified source move');
  for (let i = 0; i < 3; i++) host.call('syncZoomTracker');
  host.nativeRedo();
  host.call('syncZoomTracker');
  assert.deepEqual(snapshot(), after);
  assert.equal(host.redoCalls, 2);
  host.nativeUndo();
  host.call('syncZoomTracker');
  assert.deepEqual(snapshot(), before, 'A redone edit must remain undoable');
});

test('undo and redo preserve crop coordinates after a user edits its marker', () => {
  const { host, key, snapshot } = undoFixture();
  const before = snapshot();
  const marker = host.find('ILST_ZOOM_MARKER_', key);
  host.userEdit(() => { marker.translate(20, -10); marker.width *= 1.5; });
  host.call('syncZoomTracker');
  const after = snapshot();
  host.nativeUndo();
  host.call('syncZoomTracker');
  assert.deepEqual(snapshot(), before);
  host.nativeRedo();
  host.call('syncZoomTracker');
  assert.deepEqual(snapshot(), after);
});

test('undoing zoom deletion revives document associations instead of deleting the restored artwork again', () => {
  const { host, key, snapshot } = undoFixture();
  const before = snapshot();
  host.userEdit(() => host.find('ILST_ZOOM_ITEM_', key).remove());
  host.call('syncZoomTracker');
  const deleted = snapshot();
  host.nativeUndo();
  host.call('syncZoomTracker');
  assert.deepEqual(snapshot(), before);
  for (let i = 0; i < 3; i++) host.call('syncZoomTracker');
  host.nativeRedo();
  host.call('syncZoomTracker');
  assert.deepEqual(snapshot(), deleted);
});

test('an unrelated command between the source edit and polling keeps its own undo and redo', () => {
  const { host, snapshot } = undoFixture();
  const before = snapshot();
  const other = host.item('PathItem', 300, 100, 10, 10);
  const otherBefore = [...other.geometricBounds];
  host.userEdit(() => host.source.translate(35, -25));
  host.userEdit(() => other.translate(10, -15));
  const otherAfter = [...other.geometricBounds];
  host.call('syncZoomTracker');
  const after = snapshot();
  host.nativeUndo();
  host.call('syncZoomTracker');
  assert.deepEqual(other.geometricBounds, otherAfter, 'Put back a probe that undid an unrelated command');
  const calls = host.undoCalls;
  for (let i = 0; i < 3; i++) host.call('syncZoomTracker');
  assert.equal(host.undoCalls, calls, 'Do not repeatedly probe the blocked history');
  host.nativeUndo();
  host.call('syncZoomTracker');
  assert.deepEqual(other.geometricBounds, otherBefore);
  host.nativeUndo();
  host.call('syncZoomTracker');
  assert.deepEqual(snapshot(), before);
  host.nativeRedo();
  host.call('syncZoomTracker');
  assert.deepEqual(other.geometricBounds, otherBefore, 'Do not automatically redo an unrelated command');
  host.nativeRedo();
  host.call('syncZoomTracker');
  host.nativeRedo();
  host.call('syncZoomTracker');
  assert.deepEqual(snapshot(), after);
  assert.deepEqual(other.geometricBounds, otherAfter);
});

test('manually moving a marker back does not trigger automatic undo without a rolled-back history tag', () => {
  const { host, key } = undoFixture();
  host.userEdit(() => host.source.translate(35, -25));
  host.call('syncZoomTracker');
  const marker = host.find('ILST_ZOOM_MARKER_', key);
  host.userEdit(() => marker.translate(-35, 25));
  host.call('syncZoomTracker');
  assert.equal(host.undoCalls, 0);
  assert.deepEqual(host.source.geometricBounds, [35, 75, 135, -25]);
  assertBounds(marker.geometricBounds, [10, 90, 20, 80]);
});

test('source tracking uses geometric coordinates for stroked markers and zoom borders', () => {
  const host = fixture(true);
  host.apply([{ ...entry(0), strokeWidth: 4 }]);
  const zoom = host.document.selection[0];
  const key = zoom.tags[0].name.substring('ILST_ZOOM_ITEM_'.length);
  const marker = host.find('ILST_ZOOM_MARKER_', key);
  const before = [...marker.geometricBounds];
  host.call('syncZoomTracker');
  host.source.translate(35, -20);
  host.source.resize(140, 80);
  host.call('syncZoomTracker');
  assertBounds(marker.geometricBounds, [35 + before[0] * 1.4, 80 + (before[1] - 100) * 0.8,
    35 + before[2] * 1.4, 80 + (before[3] - 100) * 0.8]);
  assertBounds(zoom.pageItems[1].geometricBounds, zoom.pageItems[0].geometricBounds);
});

test('source translation, enlargement and reduction keep zooms fixed while their markers follow the source', () => {
  const { host, records } = trackedFixture(2);
  const before = records.map(({ marker, mask }) => ({
    marker: [...marker.geometricBounds], zoom: [...mask.geometricBounds]
  }));
  host.source.translate(40, -30);
  const callsBeforeSync = host.transformCalls;
  const duplicateBounds = records.map(({ zoom }) => [...zoom.pageItems[2].geometricBounds]);
  assert.equal(host.call('syncZoomTracker').data, 'OK');
  const moved = (bounds: number[]) => [bounds[0] + 40, bounds[1] - 30, bounds[2] + 40, bounds[3] - 30];
  for (let i = 0; i < records.length; i++) {
    assertBounds(records[i].marker.geometricBounds, moved(before[i].marker));
    assertBounds(records[i].mask.geometricBounds, before[i].zoom);
    assertBounds(records[i].zoom.pageItems[2].geometricBounds, duplicateBounds[i]);
  }
  assert.equal(host.transformCalls - callsBeforeSync, records.length,
    'Source translation transforms only each marker, leaving every zoom child untouched');
  for (const [horizontal, vertical] of [[200, 150], [25, 40]]) {
    const oldSource = [...host.source.geometricBounds];
    const oldMarkers = records.map(({ marker }) => [...marker.geometricBounds]);
    host.source.resize(horizontal, vertical);
    assert.equal(host.call('syncZoomTracker').data, 'OK');
    const resized = (bounds: number[]) => [
      oldSource[0] + (bounds[0] - oldSource[0]) * horizontal / 100,
      oldSource[1] + (bounds[1] - oldSource[1]) * vertical / 100,
      oldSource[0] + (bounds[2] - oldSource[0]) * horizontal / 100,
      oldSource[1] + (bounds[3] - oldSource[1]) * vertical / 100
    ];
    for (let i = 0; i < records.length; i++) {
      const { marker, mask, zoom } = records[i];
      assertBounds(marker.geometricBounds, resized(oldMarkers[i]));
      assertBounds(mask.geometricBounds, before[i].zoom);
      const duplicate = zoom.pageItems.find((child: any) => child.typename === 'RasterItem');
      const scaleX = mask.width / marker.width;
      const scaleY = mask.height / marker.height;
      assertBounds(duplicate.geometricBounds, [
        mask.left - (marker.left - host.source.left) * scaleX,
        mask.top + (host.source.top - marker.top) * scaleY,
        mask.left - (marker.left - host.source.left) * scaleX + host.source.width * scaleX,
        mask.top + (host.source.top - marker.top) * scaleY - host.source.height * scaleY
      ]);
    }
  }
  const calls = host.transformCalls;
  for (let i = 0; i < 4; i++) host.call('syncZoomTracker');
  assert.equal(host.transformCalls, calls, 'Idle polling must not transform artwork');
});

test('moving and resizing a marker updates its cropped image and preserves the revised region on source movement', () => {
  const { host, records: [{ zoom, marker, mask }] } = trackedFixture();
  const before = [...mask.geometricBounds];
  const duplicate = zoom.pageItems.find((child: any) => child.typename === 'RasterItem');
  const oldImageLeft = duplicate.left;
  marker.translate(20, -15);
  assert.equal(host.call('syncZoomTracker').data, 'OK');
  assertBounds(mask.geometricBounds, before);
  assert.ok(duplicate.left < oldImageLeft, 'The crop must pan with the source rectangle');
  marker.width *= 2;
  assert.equal(host.call('syncZoomTracker').data, 'OK');
  assertBounds(mask.geometricBounds, before);
  const editedMarker = [...marker.geometricBounds];
  const editedZoom = [...mask.geometricBounds];
  host.source.translate(-35, 25);
  host.call('syncZoomTracker');
  const moved = (bounds: number[]) => [bounds[0] - 35, bounds[1] + 25, bounds[2] - 35, bounds[3] + 25];
  assertBounds(marker.geometricBounds, moved(editedMarker));
  assertBounds(mask.geometricBounds, editedZoom);
});

test('moving source, marker and zoom together does not apply the source movement twice', () => {
  const { host, records: [{ zoom, marker, mask }] } = trackedFixture();
  host.source.translate(40, -25);
  marker.translate(40, -25);
  zoom.translate(40, -25);
  const expectedMarker = [...marker.geometricBounds];
  const expectedZoom = [...mask.geometricBounds];
  const calls = host.transformCalls;
  host.call('syncZoomTracker');
  assertBounds(marker.geometricBounds, expectedMarker);
  assertBounds(mask.geometricBounds, expectedZoom);
  assert.equal(host.transformCalls, calls, 'A matching combined move needs no extra object transforms');
});

test('source translation keeps a manually resized and repositioned zoom fixed and reconnects guides', () => {
  const { host, records: [{ key, zoom, marker, mask }] } = trackedFixture();
  zoom.resize(75, 60);
  zoom.translate(-mask.left, -40 - mask.top);
  host.call('syncZoomTracker');
  const movedBounds = [...mask.geometricBounds];
  assertBounds(host.find('ILST_ZOOM_GUIDE1_', key).points[1], [mask.left, mask.top]);
  assertBounds(host.find('ILST_ZOOM_GUIDE2_', key).points[1], [mask.left + mask.width, mask.top]);
  host.source.translate(50, 10);
  host.call('syncZoomTracker');
  assertBounds(mask.geometricBounds, movedBounds);
  assertBounds(host.find('ILST_ZOOM_GUIDE1_', key).points[1], [mask.left, mask.top]);
  assertBounds(host.find('ILST_ZOOM_GUIDE2_', key).points[1], [mask.left + mask.width, mask.top]);
  assertBounds(host.find('ILST_ZOOM_GUIDE1_', key).points[0], [marker.left, marker.top - marker.height]);
  assertBounds(host.find('ILST_ZOOM_GUIDE2_', key).points[0], [marker.left + marker.width, marker.top - marker.height]);
});

for (const [horizontal, vertical] of [[180, 140], [60, 45]]) {
  test(`manual zoom resize to ${horizontal}% by ${vertical}% survives source resize, marker edits and reopened confirmation`, () => {
    const { host, records: [{ key, zoom, marker, mask }] } = trackedFixture();
    zoom.resize(horizontal, vertical);
    const expected = [...mask.geometricBounds];
    host.call('syncZoomTracker');
    assertBounds(mask.geometricBounds, expected);
    host.source.resize(160, 130);
    host.call('syncZoomTracker');
    assertBounds(mask.geometricBounds, expected);
    marker.width *= 1.4;
    host.call('syncZoomTracker');
    assertBounds(mask.geometricBounds, expected);
    const loaded = host.inspect(host.source).existingEntries;
    host.reload();
    assert.equal(host.apply(loaded).data, 'Success');
    for (let i = 0; i < 4; i++) host.call('syncZoomTracker');
    assertBounds(host.find('ILST_ZOOM_ITEM_', key).pageItems[0].geometricBounds, expected);
  });
}

test('resizing the source and zoom together preserves the explicit zoom size without applying the source scale twice', () => {
  const { host, records: [{ zoom, marker, mask }] } = trackedFixture();
  const anchor = [...host.source.geometricBounds];
  host.source.resize(180, 150);
  marker.transform(1.8, 1.5, anchor);
  zoom.resize(140, 120);
  const expectedMarker = [...marker.geometricBounds];
  const expectedZoom = [...mask.geometricBounds];
  host.call('syncZoomTracker');
  assertBounds(marker.geometricBounds, expectedMarker);
  assertBounds(mask.geometricBounds, expectedZoom);
});

for (const reload of [false, true]) {
  test(`deleting a zoom cleans its own marker and guides with ${reload ? 'a cold' : 'an existing'} tracking cache`, () => {
    const { host, records } = trackedFixture(2);
    const unrelated = host.item('PathItem', 30, 30, 5, 5);
    records[0].zoom.remove();
    if (reload) host.reload();
    assert.equal(host.call('syncZoomTracker').data, 'OK');
    for (const prefix of ['ILST_ZOOM_SRC_', 'ILST_ZOOM_MARKER_', 'ILST_ZOOM_GUIDE1_', 'ILST_ZOOM_GUIDE2_']) {
      assert.equal(host.find(prefix, records[0].key), undefined);
      assert.ok(host.find(prefix, records[1].key));
    }
    assert.ok(host.items.includes(unrelated));
    assert.ok(host.items.includes(host.source));
  });
}

test('an already-running tracker discovers newly created zooms from another editor', () => {
  const { host } = trackedFixture();
  const otherSource = host.item('RasterItem', 300, 100, 100, 100);
  const editor = host.forkHost();
  editor.inspect(otherSource);
  editor.apply([entry(0)]);
  const zoom = host.document.selection[0];
  const mask = zoom.pageItems[0];
  const before = [...mask.geometricBounds];
  host.call('syncZoomTracker');
  otherSource.translate(30, -15);
  host.call('syncZoomTracker');
  assertBounds(mask.geometricBounds, before);
  const key = zoom.tags[0].name.substring('ILST_ZOOM_ITEM_'.length);
  assertBounds(host.find('ILST_ZOOM_MARKER_', key).geometricBounds, [340, 75, 350, 65]);
});

for (const count of [1, 2]) {
  test(`creating ${count} zoom image(s) selects finished clipping groups and keeps masks above borders`, () => {
    const { source, items, document, apply } = fixture();
    assert.deepEqual(apply(Array.from({ length: count }, (_, i) => entry(i))), {
      ok: true,
      data: 'Success'
    });
    const groups = items.filter((artwork) => artwork.typename === 'GroupItem');
    assert.equal(groups.length, count);
    assert.deepEqual(
      document.selection,
      groups,
      'Select the complete results rather than source, markers or internal images'
    );
    assert.equal(source.selected, false);
    for (const group of groups) {
      assert.equal(group.clipped, true);
      const [mask, border, image] = group.pageItems;
      assert.equal(
        mask.clipping,
        true,
        'The first child must be the clipping mask'
      );
      assert.equal(mask.stroked, false);
      assert.equal(mask.filled, false);
      assert.equal(border.stroked, true);
      assert.equal(image.typename, 'RasterItem');
      assert.ok(
        image.width > mask.width,
        'The uncropped duplicate remains larger than the visible zoom'
      );
      assert.equal(
        image.selected,
        false,
        'Internal source image must not remain directly selected'
      );
      assert.equal(mask.selected, false);
      assert.equal(border.selected, false);
    }
  });
}

test('source records survive host reload and editing preserves position, styles and later additions', () => {
  const host = fixture();
  const first = {
    ...entry(0),
    addGuideLines: true,
    guideLineExtent: 'acrossImages'
  };
  assert.equal(host.apply([first]).data, 'Success');
  const oldGroup = host.document.selection[0];
  const oldBounds = [...oldGroup.pageItems[0].geometricBounds];
  const loaded = host.inspect(host.source).existingEntries;
  assert.equal(
    loaded.length,
    1,
    'All association tags must fit the real host limit'
  );
  assert.equal(loaded[0].addGuideLines, true);
  assert.equal(loaded[0].strokeDash, 'dash');
  host.reload(); // The independent editor evaluates the host script again.
  loaded[0].region = { x: 0.45, y: 0.3, width: 0.15, height: 0.15 };
  loaded[0].strokeColor = '#00ff00';
  loaded[0].strokeWidth = 3;
  loaded[0].strokeDash = 'solid';
  assert.equal(host.apply([...loaded, entry(1)]).data, 'Success');
  assert.equal(host.call('syncZoomTracker').data, 'OK');
  const reopened = host.inspect(host.source).existingEntries;
  assert.equal(reopened.length, 2);
  assert.equal(reopened[0].recordKey, loaded[0].recordKey);
  assert.equal(reopened[0].strokeColor, '#00ff00');
  assert.equal(reopened[0].strokeWidth, 3);
  assert.equal(reopened[0].strokeDash, 'solid');
  assert.deepEqual(reopened[0].region, loaded[0].region);
  assert.deepEqual(
    host.find('ILST_ZOOM_ITEM_', loaded[0].recordKey).pageItems[0]
      .geometricBounds,
    oldBounds
  );
  for (const artwork of host.items)
    for (const tag of artwork.tags) assert.ok(tag.name.length <= 30);
  for (const image of host.items.filter(
    (artwork) => artwork.typename === 'RasterItem' && artwork !== host.source
  )) {
    assert.equal(
      image.tags.filter((tag: any) => tag.name.startsWith('ILST_ZOOM_')).length,
      0
    );
  }
});

test('editing without a host reload does not let stale tracking remove the source associations', () => {
  const host = fixture();
  host.apply([entry(0)]);
  host.call('syncZoomTracker');
  const loaded = host.inspect(host.source).existingEntries;
  host.apply(loaded);
  host.call('syncZoomTracker');
  assert.equal(host.inspect(host.source).existingEntries.length, 1);
});

test('confirming a reopened source reconnects guides to the moved zoom without changing its position', () => {
  const host = fixture();
  host.apply([
    { ...entry(0), addGuideLines: true, guideLineExtent: 'acrossImages' }
  ]);
  const zoom = host.document.selection[0];
  zoom.translate(-6, -85);
  const movedBounds = [...zoom.pageItems[0].geometricBounds];
  const loaded = host.inspect(host.source).existingEntries;
  host.reload();
  assert.equal(host.apply(loaded).data, 'Success');
  const key = loaded[0].recordKey;
  const updatedZoom = host.find('ILST_ZOOM_ITEM_', key);
  const marker = host.find('ILST_ZOOM_MARKER_', key);
  assert.deepEqual(updatedZoom.pageItems[0].geometricBounds, movedBounds);
  assert.deepEqual(host.find('ILST_ZOOM_GUIDE1_', key).points, [
    [marker.left + marker.width, marker.top],
    [movedBounds[0], movedBounds[1]]
  ]);
  assert.deepEqual(host.find('ILST_ZOOM_GUIDE2_', key).points, [
    [marker.left + marker.width, marker.top - marker.height],
    [movedBounds[0], movedBounds[3]]
  ]);
});

test('rebuilding tracking refreshes stale guide endpoints even when the zoom moved before the first poll', () => {
  const host = fixture();
  host.apply([
    { ...entry(0), addGuideLines: true, guideLineExtent: 'acrossImages' }
  ]);
  const zoom = host.document.selection[0];
  const key = zoom.tags[0].name.substring('ILST_ZOOM_ITEM_'.length);
  zoom.translate(25, -90);
  const movedBounds = [...zoom.pageItems[0].geometricBounds];
  host.reload();
  assert.equal(host.call('syncZoomTracker').data, 'OK');
  assert.deepEqual(host.find('ILST_ZOOM_GUIDE1_', key).points[1], [
    movedBounds[0],
    movedBounds[1]
  ]);
  assert.deepEqual(host.find('ILST_ZOOM_GUIDE2_', key).points[1], [
    movedBounds[0],
    movedBounds[3]
  ]);
});

for (const side of [
  {
    name: 'bottom',
    left: 0,
    top: -30,
    guides: [
      [
        [10, 80],
        [0, -30]
      ],
      [
        [20, 80],
        [100, -30]
      ]
    ]
  },
  {
    name: 'left',
    left: -160,
    top: 100,
    guides: [
      [
        [10, 90],
        [-60, 100]
      ],
      [
        [10, 80],
        [-60, 0]
      ]
    ]
  },
  {
    name: 'top',
    left: 0,
    top: 260,
    guides: [
      [
        [10, 90],
        [0, 160]
      ],
      [
        [20, 90],
        [100, 160]
      ]
    ]
  },
  {
    name: 'right',
    left: 180,
    top: 100,
    guides: [
      [
        [20, 90],
        [180, 100]
      ],
      [
        [20, 80],
        [180, 0]
      ]
    ]
  }
]) {
  test(`moving a right-side zoom to ${side.name} reconnects facing edges and survives reopening and background polls`, () => {
    const host = fixture();
    host.apply([
      { ...entry(0), addGuideLines: true, guideLineExtent: 'acrossImages' }
    ]);
    const zoom = host.document.selection[0];
    const key = zoom.tags[0].name.substring('ILST_ZOOM_ITEM_'.length);
    const mask = zoom.pageItems[0];
    host.call('syncZoomTracker');
    zoom.translate(side.left - mask.left, side.top - mask.top);
    assert.equal(host.call('syncZoomTracker').data, 'OK');
    const assertEndpoints = () => {
      for (let g = 0; g < 2; g++) {
        const points = host.find(`ILST_ZOOM_GUIDE${g + 1}_`, key).points;
        for (let p = 0; p < 2; p++) {
          for (let axis = 0; axis < 2; axis++) {
            assert.ok(
              Math.abs(points[p][axis] - side.guides[g][p][axis]) < 0.0001
            );
          }
        }
      }
    };
    assertEndpoints();
    const editor = host.forkHost();
    const loaded = editor.inspect(host.source).existingEntries;
    assert.equal(
      loaded[0].placement,
      'right',
      'Moving a zoom only changes its guide attachment side'
    );
    assert.equal(editor.apply(loaded).data, 'Success');
    for (let i = 0; i < 4; i++) host.call('syncZoomTracker');
    assertEndpoints();
  });
}

test('background tracking in another panel keeps the editor confirmation and binds to its replacement objects', () => {
  const host = fixture();
  host.apply([
    { ...entry(0), addGuideLines: true, guideLineExtent: 'acrossImages' }
  ]);
  host.call('syncZoomTracker');
  const editor = host.forkHost();
  const loaded = editor.inspect(host.source).existingEntries;
  loaded[0].region = { x: 0.4, y: 0.3, width: 0.2, height: 0.15 };
  loaded[0].strokeColor = '#00ff00';
  editor.apply(loaded);
  const key = loaded[0].recordKey;
  const confirmedZoom = host.find('ILST_ZOOM_ITEM_', key);
  const confirmedMarker = host.find('ILST_ZOOM_MARKER_', key);
  const confirmedGuide = host.find('ILST_ZOOM_GUIDE1_', key);
  const points = confirmedGuide.points.map((point: number[]) => [...point]);
  for (let i = 0; i < 4; i++)
    assert.equal(host.call('syncZoomTracker').data, 'OK');
  assert.equal(host.find('ILST_ZOOM_ITEM_', key), confirmedZoom);
  assert.equal(
    host.find('ILST_ZOOM_MARKER_', key) === confirmedMarker,
    true,
    'A stale cache must not remove a marker still used by the new zoom'
  );
  assert.equal(host.find('ILST_ZOOM_GUIDE1_', key), confirmedGuide);
  assert.deepEqual(confirmedGuide.points, points);
  assert.equal(
    editor.inspect(host.source).existingEntries[0].strokeColor,
    '#00ff00'
  );
});

test('background tracking does not rewrite source rectangles while their editor is open', () => {
  const host = fixture();
  host.apply([
    { ...entry(0), addGuideLines: true, guideLineExtent: 'acrossImages' }
  ]);
  host.call('syncZoomTracker');
  const editor = host.forkHost();
  const loaded = editor.inspect(host.source).existingEntries;
  const key = loaded[0].recordKey;
  const marker = host.find('ILST_ZOOM_MARKER_', key);
  const zoom = host.find('ILST_ZOOM_ITEM_', key);
  const guide = host.find('ILST_ZOOM_GUIDE1_', key);
  const before = {
    marker: [...marker.geometricBounds],
    zoom: [...zoom.pageItems[0].geometricBounds],
    points: guide.points.map((point: number[]) => [...point])
  };
  host.source.translate(30, -20);
  assert.equal(host.call('syncZoomTracker').data, 'OK');
  assert.deepEqual(marker.geometricBounds, before.marker);
  assert.deepEqual(zoom.pageItems[0].geometricBounds, before.zoom);
  assert.deepEqual(guide.points, before.points);
  editor.call('cancelZoomTarget');
});

test('a readable stale native object cannot restore old guide positions after another panel confirms', () => {
  const host = fixture();
  host.apply([
    { ...entry(0), addGuideLines: true, guideLineExtent: 'acrossImages' }
  ]);
  const staleZoom = host.document.selection[0];
  staleZoom.keepRemovedReferenceReadable();
  host.call('syncZoomTracker');
  const editor = host.forkHost();
  const entries = editor.inspect(host.source).existingEntries;
  staleZoom.translate(35, -85);
  editor.apply(entries);
  const key = entries[0].recordKey;
  const confirmed = host
    .find('ILST_ZOOM_GUIDE1_', key)
    .points.map((point: number[]) => [...point]);
  assert.equal(
    staleZoom.typename,
    'GroupItem',
    'Simulate a readable native handle outside the document'
  );
  for (let i = 0; i < 4; i++) host.call('syncZoomTracker');
  assert.deepEqual(host.find('ILST_ZOOM_GUIDE1_', key).points, confirmed);
});

test('refreshing guides to a moved zoom still clips the inside-source mode to the original image', () => {
  const host = fixture();
  host.apply([
    { ...entry(0), addGuideLines: true, guideLineExtent: 'insideSourceImage' }
  ]);
  const zoom = host.document.selection[0];
  const key = zoom.tags[0].name.substring('ILST_ZOOM_ITEM_'.length);
  const oldEnd = [...host.find('ILST_ZOOM_GUIDE1_', key).points[1]];
  zoom.translate(20, -90);
  const entries = host.inspect(host.source).existingEntries;
  assert.equal(host.apply(entries).data, 'Success');
  const firstLine = host.find('ILST_ZOOM_GUIDE1_', key);
  assert.notDeepEqual(firstLine.points[1], oldEnd);
  for (const number of [1, 2]) {
    const line = host.find(`ILST_ZOOM_GUIDE${number}_`, key);
    for (const [x, y] of line.points) {
      assert.ok(
        x >= 0 && x <= 100 && y >= 0 && y <= 100,
        'Guide stays inside the source image'
      );
    }
    const [x, y] = line.points[1];
    assert.ok(
      Math.abs(x - 100) < 0.0001 || Math.abs(y) < 0.0001,
      'Guide ends at the source boundary toward the moved zoom'
    );
  }
});

test('magnifying an existing zoom aligns its visible mask and keeps both source generations editable', () => {
  const host = fixture();
  host.apply([entry(0)]);
  const firstZoom = host.document.selection[0];
  const firstMaskBounds = [...firstZoom.pageItems[0].geometricBounds];
  const outerRecord = firstZoom.tags[0].name;
  assert.equal(host.inspect(firstZoom).existingEntries.length, 0);
  const secondEntry = {
    ...entry(0),
    region: { x: 0.4, y: 0.3, width: 0.2, height: 0.2 }
  };
  host.apply([secondEntry]);
  const secondZoom = host.document.selection[0];
  const [mask, , nestedSource] = secondZoom.pageItems;
  const nestedMask = nestedSource.pageItems[0];
  const scale =
    mask.width /
    (firstMaskBounds[2] - firstMaskBounds[0]) /
    secondEntry.region.width;
  assert.ok(
    Math.abs(
      nestedMask.left - (mask.left - secondEntry.region.x * 100 * scale)
    ) < 0.00001
  );
  assert.ok(
    Math.abs(nestedMask.top - (mask.top + secondEntry.region.y * 100 * scale)) <
      0.00001
  );
  assert.ok(
    nestedMask.left <= mask.left &&
      nestedMask.left + nestedMask.width >= mask.left + mask.width
  );
  assert.ok(
    nestedMask.top >= mask.top &&
      nestedMask.top - nestedMask.height <= mask.top - mask.height
  );
  assert.deepEqual(firstZoom.pageItems[0].geometricBounds, firstMaskBounds);
  assert.equal(
    firstZoom.tags.some((tag: any) => tag.name === outerRecord),
    true
  );
  assert.equal(
    nestedSource.tags.length,
    0,
    'Copied zoom IDs must not alias the original zoom'
  );
  assert.equal(host.inspect(host.source).existingEntries.length, 1);
  assert.equal(host.inspect(firstZoom).existingEntries.length, 1);
});

test('batch preview uses the first selected image and maps additions to every image after host reload', () => {
  const host = fixture();
  const large = host.item('RasterItem', 500, 800, 240, 360);
  const small = host.item('PlacedItem', -200, -100, 80, 60);
  const preview = host.inspect(host.source, large, small);
  assert.ok(Math.abs(preview.sourceWidth - 100 / 2.83464567) < 0.00001);
  assert.deepEqual(
    host.captures,
    [[0, 100, 100, 0]],
    'Only the first image is rendered'
  );
  host.reload();
  assert.equal(host.apply([entry(0), entry(1)]).data, 'Success');
  assert.equal(host.document.selection.length, 6);
  for (const image of [host.source, large, small]) {
    const records = host.inspect(image).existingEntries;
    assert.equal(records.length, 2);
    for (let i = 0; i < records.length; i++) {
      for (const coordinate of ['x', 'y', 'width', 'height'] as const) {
        assert.ok(
          Math.abs(
            records[i].region[coordinate] - entry(i).region[coordinate]
          ) < 0.00001
        );
      }
    }
  }
  host.call('cancelZoomTarget');
  assert.equal(
    host.items.some((artwork) =>
      artwork.tags.some((tag: any) => tag.name === 'ILST_ZOOM_ACTIVE_TARGET')
    ),
    false
  );
});

test('batch editing changes first-image records and appends only new regions to other images', () => {
  const host = fixture();
  const second = host.item('RasterItem', 500, 600, 200, 200);
  host.apply([entry(0), entry(1)]);
  host.inspect(second);
  host.apply([{ ...entry(0), strokeColor: '#0000ff' }]);
  const secondBefore = host.inspect(second).existingEntries[0];
  const secondGroup = host.find('ILST_ZOOM_ITEM_', secondBefore.recordKey);
  const firstEntries = host.inspect(host.source, second).existingEntries;
  firstEntries[0].strokeWidth = 4;
  host.apply([firstEntries[0], entry(0)], [firstEntries[1].recordKey]);
  const firstAfter = host.inspect(host.source).existingEntries;
  assert.equal(firstAfter.length, 2);
  assert.equal(firstAfter[0].strokeWidth, 4);
  const secondAfter = host.inspect(second).existingEntries;
  assert.equal(secondAfter.length, 2);
  assert.equal(secondAfter[0].recordKey, secondBefore.recordKey);
  assert.equal(secondAfter[0].strokeColor, '#0000ff');
  assert.equal(
    host.find('ILST_ZOOM_ITEM_', secondBefore.recordKey),
    secondGroup
  );
  assert.notEqual(secondAfter[0].name, secondAfter[1].name);
  assert.deepEqual(secondAfter[1].region, entry(0).region);
});

test('a manual rectangle remains supported and cancelling a multi-image editor clears all session tags', () => {
  const host = fixture();
  const rectangle = host.item('PathItem', 20, 80, 10, 10);
  const manual = host.inspect(rectangle, host.source).manualRect;
  assert.deepEqual(manual.region, { x: 0.2, y: 0.2, width: 0.1, height: 0.1 });
  host.apply([{ ...entry(0), region: manual.region }]);
  assert.equal(host.items.includes(rectangle), true);
  const second = host.item('RasterItem', 500, 600, 200, 200);
  host.inspect(host.source, second);
  const selection = [...host.document.selection];
  host.call('cancelZoomTarget');
  assert.deepEqual(host.document.selection, selection);
  for (const artwork of host.items) {
    assert.equal(
      artwork.tags.some((tag: any) => tag.name.startsWith('ILST_ZOOM_ACTIVE_')),
      false
    );
  }
});
