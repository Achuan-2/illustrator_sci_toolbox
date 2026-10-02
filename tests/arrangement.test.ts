import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {
  hostNamespace,
  type AlignmentMode,
  type DistributionMode
} from '../src/shared/host.ts';

const source = fs.readFileSync('dist/cep/jsx/index.js', 'utf8');
type Bounds = [number, number, number, number];

function item(bounds: Bounds) {
  return {
    typename: 'PathItem',
    geometricBounds: [...bounds] as Bounds,
    // The existing clipping-aware helper uses geometric bounds for paths.
    visibleBounds: bounds.map((value) => value + 500),
    translate(dx: number, dy: number) {
      this.geometricBounds = this.geometricBounds.map(
        (value, index) => value + (index % 2 === 0 ? dx : dy)
      ) as Bounds;
    }
  };
}

function fixture(
  bounds: Bounds[] = [
    [-40, 120, -10, 100],
    [15, 75, 35, 35],
    [80, -20, 130, -90]
  ]
) {
  const items = bounds.map(item);
  const app = { documents: [{}], activeDocument: { selection: items } };
  const context = vm.createContext({ $: {}, app });
  vm.runInContext(source, context);
  const call = (operation: string, mode: string) =>
    JSON.parse(
      context.$[hostNamespace].call(
        operation,
        encodeURIComponent(JSON.stringify([mode]))
      )
    );
  return { items, app, call };
}

function anchor(bounds: Bounds, mode: DistributionMode): number {
  switch (mode) {
    case 'left':
      return bounds[0];
    case 'horizontalCenter':
      return (bounds[0] + bounds[2]) / 2;
    case 'right':
      return bounds[2];
    case 'top':
      return bounds[1];
    case 'verticalCenter':
      return (bounds[1] + bounds[3]) / 2;
    case 'bottom':
      return bounds[3];
  }
}

const targets: Record<DistributionMode, number> = {
  left: -40,
  horizontalCenter: 45,
  right: 130,
  top: 120,
  verticalCenter: 15,
  bottom: -90
};

for (const mode of [...Object.keys(targets), 'center'] as AlignmentMode[]) {
  test(`alignment ${mode} uses selection bounds and preserves dimensions`, () => {
    const { items, call } = fixture();
    const before = items.map((entry) => [...entry.geometricBounds] as Bounds);
    assert.deepEqual(call('alignObjects', mode), { ok: true, data: 'Success' });
    items.forEach((entry, index) => {
      const bounds = entry.geometricBounds;
      assert.equal(bounds[2] - bounds[0], before[index][2] - before[index][0]);
      assert.equal(bounds[1] - bounds[3], before[index][1] - before[index][3]);
      if (mode === 'center') {
        assert.equal(anchor(bounds, 'horizontalCenter'), 45);
        assert.equal(anchor(bounds, 'verticalCenter'), 15);
      } else {
        assert.equal(anchor(bounds, mode), targets[mode]);
        const horizontal = ['left', 'horizontalCenter', 'right'].includes(mode);
        assert.equal(
          bounds[horizontal ? 1 : 0],
          before[index][horizontal ? 1 : 0]
        );
      }
    });
  });
}

for (const mode of Object.keys(targets) as DistributionMode[]) {
  test(`distribution ${mode} spaces anchors of differently sized objects evenly`, () => {
    const { items, app, call } = fixture();
    const before = items.map((entry) => [...entry.geometricBounds] as Bounds);
    app.activeDocument.selection = [items[2], items[0], items[1]];
    assert.deepEqual(call('distributeObjects', mode), {
      ok: true,
      data: 'Success'
    });
    assert.deepEqual(items[0].geometricBounds, before[0]);
    assert.deepEqual(items[2].geometricBounds, before[2]);
    assert.equal(
      anchor(items[1].geometricBounds, mode),
      (anchor(before[0], mode) + anchor(before[2], mode)) / 2
    );
    const horizontal = ['left', 'horizontalCenter', 'right'].includes(mode);
    assert.equal(
      items[1].geometricBounds[horizontal ? 1 : 0],
      before[1][horizontal ? 1 : 0]
    );
    assert.equal(items[1].geometricBounds[2] - items[1].geometricBounds[0], 20);
    assert.equal(items[1].geometricBounds[1] - items[1].geometricBounds[3], 40);
  });
}

test('right-edge distribution sorts by right edges even when left-edge order differs', () => {
  const { items, call } = fixture([
    [0, 100, 200, 80],
    [40, 90, 50, 70],
    [80, 80, 90, 60]
  ]);
  assert.equal(call('distributeObjects', 'right').ok, true);
  assert.deepEqual(items[0].geometricBounds, [0, 100, 200, 80]);
  assert.deepEqual(items[1].geometricBounds, [40, 90, 50, 70]);
  assert.deepEqual(items[2].geometricBounds, [115, 80, 125, 60]);
});

test('equal anchors remain stable and clipping groups align using their clipping paths', () => {
  const equal = fixture([
    [0, 90, 20, 70],
    [0, 60, 10, 50],
    [0, 20, 50, 0]
  ]);
  const before = equal.items.map((entry) => [...entry.geometricBounds]);
  assert.equal(equal.call('distributeObjects', 'left').ok, true);
  assert.deepEqual(
    equal.items.map((entry) => entry.geometricBounds),
    before
  );

  const { app, items, call } = fixture();
  const clip = Object.assign(item([30, 80, 50, 60]), { clipping: true });
  const group = {
    typename: 'GroupItem',
    clipped: true,
    pageItems: [clip, item([-100, 200, 300, -300])],
    translate(dx: number, dy: number) {
      this.pageItems.forEach((child) => child.translate(dx, dy));
    }
  };
  // The host receives Illustrator PageItems, including groups.
  app.activeDocument.selection = [items[0], group] as unknown as typeof items;
  assert.equal(call('alignObjects', 'right').ok, true);
  assert.equal(items[0].geometricBounds[2], 50);
  assert.deepEqual(clip.geometricBounds, [30, 80, 50, 60]);
});

test('missing documents, insufficient selections and invalid modes return localized errors without moves', () => {
  const { app, items, call } = fixture();
  const before = items.map((entry) => [...entry.geometricBounds]);
  for (const operation of ['alignObjects', 'distributeObjects']) {
    assert.equal(
      call(operation, 'unknown').error,
      'errors.invalidArrangementMode'
    );
  }
  assert.equal(
    call('distributeObjects', 'center').error,
    'errors.invalidArrangementMode'
  );
  assert.deepEqual(
    items.map((entry) => entry.geometricBounds),
    before
  );
  app.activeDocument.selection = items.slice(0, 1);
  assert.equal(call('alignObjects', 'left').error, 'errors.selectTwoOrMore');
  assert.equal(
    call('distributeObjects', 'left').error,
    'errors.selectThreeOrMore'
  );
  app.activeDocument.selection = items.slice(0, 2);
  for (const mode of Object.keys(targets)) {
    assert.deepEqual(call('distributeObjects', mode), { ok: true, data: 'Success' });
  }
  assert.deepEqual(
    items.map((entry) => entry.geometricBounds),
    before
  );
  app.documents = [];
  assert.equal(call('alignObjects', 'left').error, 'errors.noDocument');
  assert.equal(call('distributeObjects', 'left').error, 'errors.noDocument');
});

test('equal-gap distribution remains distinct from center distribution', () => {
  const { items, call } = fixture([
    [0, 100, 20, 80],
    [30, 90, 40, 60],
    [100, 80, 140, 40]
  ]);
  assert.equal(call('distributeSpacing', 'horizontal').ok, true);
  assert.equal(items[1].geometricBounds[0] - items[0].geometricBounds[2], 35);
  assert.equal(items[2].geometricBounds[0] - items[1].geometricBounds[2], 35);
});
