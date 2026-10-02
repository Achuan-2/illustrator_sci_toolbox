import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync('src/jsx/ilst/arrange.jsx', 'utf8');
type Bounds = [number, number, number, number];
const pointsPerMm = 2.83464567;

function item(bounds: Bounds) {
  return {
    typename: 'PathItem',
    geometricBounds: [...bounds] as Bounds,
    translate(dx: number, dy: number) {
      this.geometricBounds = this.geometricBounds.map(
        (value, index) => value + (index % 2 === 0 ? dx : dy)
      ) as Bounds;
    }
  };
}

function fixture(bounds: Bounds[]) {
  const items = bounds.map(item);
  const artboards = Object.assign([
    { artboardRect: [0, 300, 300, 0] },
    { artboardRect: [400, 300, 700, 0] }
  ], { getActiveArtboardIndex: () => 1 });
  const doc = { selection: items, artboards };
  const context = vm.createContext({ app: { documents: [doc], activeDocument: doc } });
  vm.runInContext(source, context);
  const copy = (artboard = false) =>
    context.copyRelativePosition('C', 'horizontal', false, artboard) as string;
  const paste = (data: string, artboard = false, x: number | null = null, y: number | null = null) =>
    context.pasteRelativePosition(data, false, 'C', 'horizontal', false, x, y, false, artboard) as string;
  return { items, doc, copy, paste };
}

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
}

function center(bounds: Bounds, x: number, y: number) {
  near((bounds[0] + bounds[2]) / 2, x);
  near((bounds[1] + bounds[3]) / 2, y);
}

test('relative center offsets transfer between unequal objects and support manual offsets', () => {
  const f = fixture([[20, 250, 100, 190], [150, 200, 170, 120]]);
  const copied = f.copy();
  const delta = JSON.parse(copied)[0];
  near(delta.deltaX * pointsPerMm, 100);
  near(delta.deltaY * pointsPerMm, -60);
  const reference = item([10, 290, 50, 270]);
  const target = item([210, 210, 270, 170]);
  f.doc.selection = [reference, target];
  assert.equal(f.paste(copied), 'Success');
  center(target.geometricBounds, 130, 220);
  assert.deepEqual(target.geometricBounds, [100, 240, 160, 200]);
  assert.deepEqual(reference.geometricBounds, [10, 290, 50, 270]);
  assert.equal(f.paste('[]', false, 10, -20), 'Success');
  center(target.geometricBounds, 30 + 10 * pointsPerMm, 280 - 20 * pointsPerMm);
});

test('single-object center position copies and pastes relative to each object artboard', () => {
  const f = fixture([[20, 250, 100, 190]]);
  const copied = f.copy();
  const position = JSON.parse(copied);
  assert.equal(position.abs, true);
  assert.equal(position.ab, 0);
  near(position.x * pointsPerMm, 60);
  near(position.y * pointsPerMm, 80);
  const target = item([450, 190, 510, 150]);
  f.doc.selection = [target];
  assert.equal(f.paste(copied), 'Success');
  center(target.geometricBounds, 460, 220);
  assert.deepEqual(target.geometricBounds, [430, 240, 490, 200]);
  assert.equal(f.paste('[]', true, 10, 20), 'Success');
  center(target.geometricBounds, 400 + 10 * pointsPerMm, 300 - 20 * pointsPerMm);
});

test('artboard-reference lists copy and paste every object center without resizing', () => {
  const f = fixture([[420, 250, 500, 190], [550, 200, 570, 120]]);
  const copied = f.copy(true);
  const positions = JSON.parse(copied);
  assert.equal(positions.length, 2);
  near(positions[0].x * pointsPerMm, 60);
  near(positions[0].y * pointsPerMm, 80);
  near(positions[1].x * pointsPerMm, 160);
  near(positions[1].y * pointsPerMm, 140);
  const first = item([10, 280, 30, 240]);
  const second = item([120, 290, 180, 270]);
  f.doc.selection = [first, second];
  assert.equal(f.paste(copied, true), 'Success');
  assert.deepEqual(first.geometricBounds, [50, 240, 70, 200]);
  assert.deepEqual(second.geometricBounds, [130, 170, 190, 150]);
});

test('center reference uses clipping bounds rather than hidden artwork', () => {
  const f = fixture([[20, 250, 100, 190]]);
  const clip = Object.assign(item([150, 200, 170, 120]), { clipping: true });
  const hidden = item([-200, 900, 800, -900]);
  const group = {
    typename: 'GroupItem',
    clipped: true,
    pageItems: [clip, hidden],
    translate(dx: number, dy: number) {
      this.pageItems.forEach((child) => child.translate(dx, dy));
    }
  };
  f.doc.selection = [f.items[0], group] as unknown as typeof f.items;
  const copied = f.copy();
  const delta = JSON.parse(copied)[0];
  near(delta.deltaX * pointsPerMm, 100);
  near(delta.deltaY * pointsPerMm, -60);
  assert.equal(f.paste('[]', false, 0, 0), 'Success');
  center(clip.geometricBounds, 60, 220);
  assert.deepEqual(clip.geometricBounds, [50, 260, 70, 180]);
});
