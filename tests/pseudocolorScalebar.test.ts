import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { defaultScalebar } from '../src/js/services/scalebar.ts';

const host = vm.createContext({});
vm.runInContext(
  fs.readFileSync('src/jsx/ilst/scalebar.jsx', 'utf8') +
    fs.readFileSync('src/jsx/ilst/pseudocolorLayers.jsx', 'utf8'),
  host
);
const entry = () => ({
  fov: { width: 1000, height: 500, unit: 'um' },
  scalebar: { ...defaultScalebar, unit: 'um' }
});

test('matching channel scales share one independent annotation with equivalent FOV units', () => {
  const first = entry(), second = entry();
  second.fov = { width: 1, height: 0.5, unit: 'mm' };
  second.scalebar.autoGroup = false;
  const shared = host.pseudocolorSharedScalebar([first, second], [0, 1]);
  assert.equal(shared.options.lengthUm, 50);
  assert.equal(shared.options.autoGroup, true);
  shared.options.lengthUm = 100;
  assert.equal(first.scalebar.lengthUm, 50);
  assert.equal(second.scalebar.lengthUm, 50);
});

test('different or missing scale styles/calibration never select an arbitrary merged scale', () => {
  for (const change of [
    { lengthUm: 75 }, { orientation: 'vertical' }, { unit: 'mm' },
    { color: '#ff0000' }, { thickness: 4 }, { showText: false },
    { fontSize: 12 }, { fontColor: '#00ff00' }, { bold: true }, { position: 'TL' }
  ]) {
    const second = entry();
    Object.assign(second.scalebar, change);
    assert.equal(host.pseudocolorSharedScalebar([entry(), second], [0, 1]), null);
  }
  for (const second of [
    { fov: entry().fov, scalebar: null },
    { fov: null, scalebar: entry().scalebar },
    { ...entry(), fov: { width: 2000, height: 500, unit: 'um' } }
  ])
    assert.equal(host.pseudocolorSharedScalebar([entry(), second], [0, 1]), null);
});

test('only enabled channels decide the shared scale and matching zero lengths remain hidden', () => {
  const first = entry(), second = entry(), excluded = entry();
  first.scalebar.lengthUm = second.scalebar.lengthUm = 0;
  excluded.scalebar.lengthUm = 100;
  assert.equal(host.pseudocolorSharedScalebar([first, excluded, second], [0, 2]).options.lengthUm, 0);
});
