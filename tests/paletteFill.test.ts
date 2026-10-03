import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { hostNamespace } from '../src/shared/host.ts';

const source = fs.readFileSync('dist/cep/jsx/index.js', 'utf8');
function path(overrides: Record<string, unknown> = {}) {
  return {
    typename: 'PathItem',
    filled: false,
    fillColor: { typename: 'NoColor' },
    stroked: true,
    strokeColor: { typename: 'RGBColor', red: 255 },
    strokeWidth: 3,
    geometricBounds: [0, 10, 10, 0],
    ...overrides
  };
}
function fixture(selection: unknown[] | null, documents: unknown[] = [{}]) {
  const doc = { selection, defaultFillColor: { typename: 'NoColor' } };
  const context = vm.createContext({
    $: {},
    app: { documents, activeDocument: doc },
    RGBColor: function () {
      this.typename = 'RGBColor';
    }
  });
  vm.runInContext(source, context);
  const call = (hex: unknown = '#4477AA') =>
    JSON.parse(
      context.$[hostNamespace].call(
        'applyPaletteFill',
        encodeURIComponent(JSON.stringify([hex]))
      )
    );
  return { doc, call };
}

test('palette fill changes selected paths and enables fill while preserving strokes, geometry and selection', () => {
  const first = path(),
    second = path({ filled: true });
  const selection = [first, second];
  const { doc, call } = fixture(selection);
  const strokes = selection.map((item) => item.strokeColor);
  assert.deepEqual(call(), { ok: true, data: '2' });
  for (let i = 0; i < selection.length; i++) {
    const item = selection[i];
    assert.equal(item.filled, true);
    assert.equal((item.fillColor as any).red, 68);
    assert.equal((item.fillColor as any).green, 119);
    assert.equal((item.fillColor as any).blue, 170);
    assert.equal(item.strokeColor, strokes[i]);
    assert.equal(item.strokeWidth, 3);
    assert.equal(item.stroked, true);
    assert.deepEqual(item.geometricBounds, [0, 10, 10, 0]);
  }
  assert.equal(doc.selection, selection);
  assert.deepEqual(doc.defaultFillColor, { typename: 'NoColor' });
});

test('group and compound fills skip clipping masks, guides, locked artwork and images; targets are unique', () => {
  const child = path(),
    outer = path(),
    inner = path();
  const skipped = [
    path({ clipping: true }),
    path({ guides: true }),
    path({ locked: true }),
    path({ hidden: true }),
    path({ editable: false })
  ];
  const compound = { typename: 'CompoundPathItem', pathItems: [outer, inner] };
  const compoundMask = {
    typename: 'CompoundPathItem',
    pathItems: [path({ clipping: true }), path()]
  };
  const group = {
    typename: 'GroupItem',
    pageItems: [
      { typename: 'GroupItem', pageItems: [child] },
      compound,
      compoundMask,
      ...skipped,
      { typename: 'RasterItem' }
    ]
  };
  const { call } = fixture([group, child]);
  assert.deepEqual(call('#ffffff'), { ok: true, data: '3' });
  assert.equal(child.filled, true);
  assert.equal(outer.filled, true);
  assert.equal(inner.filled, true);
  for (const item of [...skipped, ...compoundMask.pathItems])
    assert.equal(item.filled, false);
});

test('missing documents, invalid colors and unfillable selections return errors before mutation', () => {
  assert.equal(fixture([], []).call().error, 'errors.noDocument');
  for (const selection of [
    null,
    [],
    [{ typename: 'RasterItem' }],
    [path({ clipping: true })]
  ])
    assert.equal(
      fixture(selection).call().error,
      'errors.paletteFillSelection'
    );
  const item = path();
  const { call } = fixture([item]);
  for (const value of ['#GG0000', 'red', '#fff', null])
    assert.equal(call(value).error, 'palettes.errors.hex');
  assert.equal(item.filled, false);
});

test('a failed fill setter rolls back earlier paths and the partially changed current path', () => {
  const first = path(),
    second = path();
  const oldFirst = first.fillColor,
    oldSecond = second.fillColor;
  let current = oldSecond,
    fail = true;
  Object.defineProperty(second, 'fillColor', {
    get: () => current,
    set: (value) => {
      current = value;
      if (fail) {
        fail = false;
        throw new Error('Cannot fill | test');
      }
    }
  });
  const selection = [first, second];
  const { doc, call } = fixture(selection);
  const result = call();
  assert.equal(result.error, 'errors.paletteFill');
  assert.match(result.args[0], /Cannot fill \| test/);
  assert.equal(first.fillColor, oldFirst);
  assert.equal(second.fillColor, oldSecond);
  assert.equal(first.filled, false);
  assert.equal(second.filled, false);
  assert.equal(doc.selection, selection);
});
