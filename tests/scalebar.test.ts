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

test('explicit TIFF FOV parses scientific units and invalid lengths fail before drawing', () => {
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
  assert.throws(
    () => context.validateScaleOptions({ ...options, lengthUm: 301 }, fov),
    /errors.scaleTooLong/
  );
  assert.throws(
    () => context.validateScaleOptions({ ...options, thickness: NaN }, fov),
    /errors.scaleOptions/
  );
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
