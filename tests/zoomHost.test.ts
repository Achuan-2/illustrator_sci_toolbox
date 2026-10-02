import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { hostNamespace } from '../src/shared/host.ts';

const hostSource = fs.readFileSync('dist/cep/jsx/index.js', 'utf8');

// Model Illustrator's tag-name limit, inherited tags, nested clipping and
// transforms about uncropped bounds. Pixel rendering needs the real host.
function fixture() {
  const items: any[] = [];
  let selectionOrder: any[] = [];
  const layer: any = {
    typename: 'Layer',
    locked: false,
    visible: true,
    pageItems: []
  };
  function tags() {
    const collection: any = [];
    collection.getByName = (name: string) => {
      const tag = collection.find((entry: any) => entry.name === name);
      if (!tag) throw new Error('Tag not found');
      return tag;
    };
    collection.add = () => {
      let name = '';
      const tag = {
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
      parent,
      layer,
      selected: false,
      hidden: false,
      locked: false,
      tags: tags(),
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
        return this.geometricBounds[0];
      },
      set left(value: number) {
        this.translate(value - this.left, 0);
      },
      get top() {
        return this.geometricBounds[1];
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
        this.transform(horizontal / 100, vertical / 100, this.geometricBounds);
      },
      translate(dx: number, dy: number) {
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
  // CEP panels can have separate ExtendScript caches for the same document.
  const forkHost = () => {
    const context = vm.createContext({
      $: {},
      app: { documents: [document], activeDocument: document },
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
      JSON.parse(
        context.$[hostNamespace].call(
          operation,
          encodeURIComponent(JSON.stringify(args))
        )
      );
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
    find
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
