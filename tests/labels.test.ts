import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { hostNamespace } from '../src/shared/host.ts';

const hostSource = fs.readFileSync('dist/cep/jsx/index.js', 'utf8');

function createDocument() {
  const frames: any[] & { add?: () => any } = [];
  frames.add = () => {
    const frame = { typename: 'TextFrame', contents: '', note: '', left: 0, top: 0, textRange: { characterAttributes: {} } };
    // Illustrator's collection order need not match creation order.
    frames.unshift(frame);
    return frame;
  };
  const images = [0, 100, 200].map((left) => ({ typename: 'RasterItem', geometricBounds: [left, 100, left + 50, 50] }));
  const document = { textFrames: frames, selection: images as any[] };
  const app = { documents: [document], activeDocument: document, textFonts: { getByName: (name: string) => ({ name }) } };
  const context = vm.createContext({ $: {}, app, RGBColor: function () {}, JSON: undefined });
  vm.runInContext(hostSource, context);
  const call = (operation: string, args: unknown[]) => {
    const result = JSON.parse(context.$[hostNamespace].call(operation, encodeURIComponent(JSON.stringify(args))));
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.data;
  };
  const add = (session: number, template = '(a)', reverse = false) => call('addLabelsToImages', ['ArialMT', 8, true, -6, -6, template, '#ff0000', 'horizontal', reverse, 1, session]);
  return { frames, images, document, app, call, add };
}

test('renumbering follows original batch order and preserves positions, style and unrelated text', () => {
  const host = createDocument();
  host.add(101);
  const batch = [...host.frames].sort((a, b) => JSON.parse(a.note).index - JSON.parse(b.note).index);
  assert.deepEqual(batch.map((frame) => frame.contents), ['(a)', '(b)', '(c)']);
  host.add(202, 'A)', true);
  const otherBatch = host.frames.filter((frame) => JSON.parse(frame.note).sid === 202);
  const unrelated = { contents: 'Manually entered text', note: 'unrelated' };
  host.frames.push(unrelated, { contents: 'Invalid metadata', note: '{' });
  batch[0].left = 999;
  batch[1].top = -200;
  host.frames.reverse();
  const before = batch.map((frame) => JSON.stringify({ left: frame.left, top: frame.top, attributes: frame.textRange.characterAttributes, note: frame.note }));
  host.document.selection = [unrelated];
  assert.equal(host.call('updateLabelSessionIndex', [26, 101]), 'Success|3');
  assert.deepEqual(batch.map((frame) => frame.contents), ['(z)', '(a)', '(b)']);
  assert.deepEqual(batch.map((frame) => JSON.stringify({ left: frame.left, top: frame.top, attributes: frame.textRange.characterAttributes, note: frame.note })), before);
  assert.deepEqual(otherBatch.map((frame) => frame.contents), ['C)', 'B)', 'A)']);
  assert.equal(unrelated.contents, 'Manually entered text');
  host.document.selection = [];
  assert.equal(host.call('updateLabelSessionIndex', [8, 202]), 'Success|3');
  assert.deepEqual(otherBatch.map((frame) => frame.contents), ['J)', 'I)', 'H)']);
  host.app.activeDocument = { textFrames: [], selection: [] };
  assert.equal(host.call('updateLabelSessionIndex', [1, 101]), 'Success|0');
  assert.deepEqual(batch.map((frame) => frame.contents), ['(z)', '(a)', '(b)']);
});

test('session renumbering ignores invalid indices and missing sessions for every template', () => {
  for (const [template, expected] of [['a', 'h'], ['A', 'H'], ['(a)', '(h)'], ['(A)', '(H)'], ['a)', 'h)'], ['A)', 'H)']]) {
    const host = createDocument();
    host.add(101, template);
    const original = host.frames.map((frame) => frame.contents);
    for (const index of [0, -1, 1.5, null]) assert.equal(host.call('updateLabelSessionIndex', [index, 101]), 'Success|0');
    assert.equal(host.call('updateLabelSessionIndex', [8, 999]), 'Success|0');
    assert.deepEqual(host.frames.map((frame) => frame.contents), original);
    assert.equal(host.call('updateLabelSessionIndex', [8, 101]), 'Success|3');
    assert.equal(host.frames.find((frame) => JSON.parse(frame.note).index === 0).contents, expected);
  }
});
