import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCorners,
  rotatePoint,
  hasOverlap,
  getGuideEndpoints,
  tryClipLineToRectangle,
  getZoomBounds,
  getRelativePlacement,
  calculateZoomLayout,
  type ZoomEntry
} from '../src/js/services/zoomLayout.ts';

test('rotatePoint rotates 90 degrees around origin', () => {
  const p = { x: 10, y: 0 };
  const center = { x: 0, y: 0 };
  const rotated = rotatePoint(p, center, 90);
  assert.ok(Math.abs(rotated.x) < 0.0001);
  assert.ok(Math.abs(rotated.y - 10) < 0.0001);
});

test('getCorners returns four points for unrotated rectangle', () => {
  const rect = { left: 10, top: 20, width: 30, height: 40 };
  const corners = getCorners(rect, 0);
  assert.equal(corners.length, 4);
  assert.deepEqual(corners[0], { x: 10, y: 20 });
  assert.deepEqual(corners[1], { x: 40, y: 20 });
  assert.deepEqual(corners[2], { x: 40, y: 60 });
  assert.deepEqual(corners[3], { x: 10, y: 60 });
});

test('hasOverlap detects overlap and separation between rectangles', () => {
  const r1 = { left: 0, top: 0, width: 100, height: 100 };
  const r2 = { left: 50, top: 50, width: 100, height: 100 };
  const r3 = { left: 120, top: 120, width: 50, height: 50 };
  assert.equal(hasOverlap(r1, 0, r2, 0), true);
  assert.equal(hasOverlap(r1, 0, r3, 0), false);
});

test('getGuideEndpoints returns correct endpoints for placement directions', () => {
  const rCorners = [
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 30, y: 30 },
    { x: 10, y: 30 }
  ];
  const zCorners = [
    { x: 50, y: 0 },
    { x: 90, y: 0 },
    { x: 90, y: 40 },
    { x: 50, y: 40 }
  ];

  // Right placement: [TR -> TL, BR -> BL]
  const rightGuides = getGuideEndpoints(rCorners, zCorners, 'right');
  assert.deepEqual(rightGuides[0], { x: 30, y: 10 });
  assert.deepEqual(rightGuides[1], { x: 50, y: 0 });
  assert.deepEqual(rightGuides[2], { x: 30, y: 30 });
  assert.deepEqual(rightGuides[3], { x: 50, y: 40 });

  // Left placement: [TL -> TR, BL -> BR]
  const leftGuides = getGuideEndpoints(rCorners, zCorners, 'left');
  assert.deepEqual(leftGuides[0], { x: 10, y: 10 });
  assert.deepEqual(leftGuides[1], { x: 90, y: 0 });
  assert.deepEqual(leftGuides[2], { x: 10, y: 30 });
  assert.deepEqual(leftGuides[3], { x: 90, y: 40 });
});

test('guide placement follows the actual side instead of the original placement setting', () => {
  const source = { left: 100, top: 100, width: 300, height: 100 };
  for (const [left, top, expected] of [
    [410, 100, 'right'],
    [-210, 100, 'left'],
    [100, -10, 'top'],
    [100, 210, 'bottom'],
    [340, 220, 'bottom'] // Compare displacement relative to each image dimension.
  ] as const) {
    assert.equal(
      getRelativePlacement(source, { ...source, left, top }, 'right'),
      expected
    );
  }
  assert.equal(getRelativePlacement(source, source, 'left'), 'left');
});

test('tryClipLineToRectangle clips line passing through rectangle', () => {
  const bounds = { left: 0, top: 0, width: 100, height: 100 };
  const start = { x: -50, y: 50 };
  const end = { x: 150, y: 50 };
  const clipped = tryClipLineToRectangle(start, end, bounds, 0);
  assert.ok(clipped);
  assert.ok(Math.abs(clipped.clippedStart.x - 0) < 0.0001);
  assert.ok(Math.abs(clipped.clippedStart.y - 50) < 0.0001);
  assert.ok(Math.abs(clipped.clippedEnd.x - 100) < 0.0001);
  assert.ok(Math.abs(clipped.clippedEnd.y - 50) < 0.0001);
});

test('tryClipLineToRectangle returns null for non-intersecting line', () => {
  const bounds = { left: 0, top: 0, width: 100, height: 100 };
  const start = { x: -50, y: -50 };
  const end = { x: -10, y: -10 };
  const clipped = tryClipLineToRectangle(start, end, bounds, 0);
  assert.equal(clipped, null);
});

test('getZoomBounds positions bounds correctly according to placement', () => {
  const source = { left: 100, top: 100, width: 200, height: 100 };
  const region = { width: 50, height: 50 };
  const gap = 10;

  // Right placement: equal height to source, placed to the right
  const right = getZoomBounds(source, region, 'right', gap);
  assert.equal(right.height, 100);
  assert.equal(right.width, 100);
  assert.equal(right.left, 100 + 200 + 10);
  assert.equal(right.top, 100);

  // Bottom placement: equal width to source, placed below
  const bottom = getZoomBounds(source, region, 'bottom', gap);
  assert.equal(bottom.width, 200);
  assert.equal(bottom.height, 200);
  assert.equal(bottom.left, 100);
  assert.equal(bottom.top, 100 + 100 + 10);
});

test('calculateZoomLayout arranges multiple zoom images outward without overlapping', () => {
  const source = { left: 0, top: 0, width: 200, height: 100 };
  const gap = 10;
  const entry1: ZoomEntry = {
    recordKey: '1',
    name: '放大图 1',
    region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    regionRotation: 0,
    strokeColor: '#ff0000',
    strokeWidth: 1.5,
    strokeDash: 'dash',
    useRectangleColor: true,
    addGuideLines: true,
    placement: 'right',
    guideLineExtent: 'acrossImages',
    originalZoomRegion: null,
    originalZoomRotation: 0
  };
  const entry2: ZoomEntry = {
    recordKey: '2',
    name: '放大图 2',
    region: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
    regionRotation: 0,
    strokeColor: '#00ff00',
    strokeWidth: 1.5,
    strokeDash: 'solid',
    useRectangleColor: true,
    addGuideLines: true,
    placement: 'right',
    guideLineExtent: 'acrossImages',
    originalZoomRegion: null,
    originalZoomRotation: 0
  };

  const layout = calculateZoomLayout(source, [entry1, entry2], gap);
  const b1 = layout.get(entry1);
  const b2 = layout.get(entry2);
  assert.ok(b1);
  assert.ok(b2);
  assert.equal(b1.left, source.width + gap);
  assert.equal(b2.left, b1.left + b1.width + gap);
});
