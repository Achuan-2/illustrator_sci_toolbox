import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { Window } from 'happy-dom';
import { parse } from 'acorn';
import { hostNamespace } from '../src/shared/host.ts';
import { paletteStorageKey } from '../src/js/services/paletteLibrary.ts';

const assets = fs.readdirSync('dist/cep/assets');
const bundle = fs.readFileSync(
  `dist/cep/assets/${assets.find((file) => /^main-.*\.js$/.test(file))}`,
  'utf8'
);
const storageKey = 'illustrator_sci_plugin_settings';

test('arrangement icon buttons dispatch every alignment and distribution mode with translated labels', async () => {
  const panel = await createPanel();
  try {
    const alignment = ['left', 'horizontalCenter', 'right', 'center', 'top', 'verticalCenter', 'bottom'];
    const distribution = ['left', 'horizontalCenter', 'right', 'top', 'verticalCenter', 'bottom'];
    assert.deepEqual(
      [...panel.window.document.querySelectorAll('#panel-distribute .arrangement-icon-button[id^="distribute-"]')]
        .map((button) => button.id),
      distribution.map((mode) => `distribute-${mode}-button`)
    );
    for (const [prefix, operation, modes] of [
      ['align', 'alignObjects', alignment],
      ['distribute', 'distributeObjects', distribution]
    ] as const) {
      for (const mode of modes) {
        const button = panel.element(`${prefix}-${mode}-button`);
        assert.ok(button.querySelector('svg path')?.getAttribute('d'));
        assert.ok(button.getAttribute('title'));
        assert.equal(button.getAttribute('title'), button.getAttribute('aria-label'));
        await panel.click(button.id);
        assert.deepEqual(panel.requests.at(-1), { operation, args: [mode] });
      }
    }
    assert.equal(panel.element('align-center-button').getAttribute('title'), 'Horizontal and Vertical Align Center');
    await panel.input('language', 'zh_CN');
    assert.equal(panel.element('align-center-button').getAttribute('title'), '水平与垂直居中对齐');
    const tab = [...panel.window.document.querySelectorAll('.tab')].find(
      (button) => button.textContent === '排列分布'
    );
    assert.ok(tab);
    (tab as unknown as HTMLButtonElement).click();
    await panel.flush();
    assert.equal(panel.element('panel-title').textContent, '排列分布');
    for (const direction of ['horizontal', 'vertical']) {
      assert.ok(panel.element(`distribute-${direction}-button`).querySelector('svg'));
      await panel.click(`distribute-${direction}-button`);
      assert.deepEqual(panel.requests.at(-1), { operation: 'distributeSpacing', args: [direction] });
    }
    await panel.click('copy-spacing-horizontal-button');
    await panel.click('move-right-horizontal-button');
    assert.deepEqual(panel.requests.at(-1), { operation: 'pasteSpacing', args: ['horizontal', 1.234, false] });
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('swap panel shows nine icon buttons in anchor order and dispatches each anchor', async () => {
  const panel = await createPanel();
  try {
    const anchors = ['TL', 'TC', 'TR', 'LC', 'C', 'RC', 'BL', 'BC', 'BR'];
    const buttons = [...panel.window.document.querySelectorAll('#panel-swap .swap-button')];
    assert.deepEqual(buttons.map((button) => button.id), anchors.map((anchor) => `swap-${anchor.toLowerCase()}-button`));
    for (const anchor of anchors) {
      const button = panel.element(`swap-${anchor.toLowerCase()}-button`);
      assert.equal(button.querySelectorAll('svg .swap-object').length, 2);
      assert.equal(button.querySelectorAll('svg .reference-mark').length, 2);
      assert.ok(button.querySelector('svg .swap-arrows'));
      assert.equal(button.getAttribute('title'), button.getAttribute('aria-label'));
      await panel.click(button.id);
      assert.deepEqual(panel.requests.at(-1), { operation: 'swapSelectedPositions', args: [anchor] });
    }
    await panel.input('language', 'zh_CN');
    assert.equal(panel.element('swap-c-button').getAttribute('title'), '交换居中');
    assert.equal(panel.element('swap-lc-button').getAttribute('title'), '交换左居中');
    assert.equal(panel.element('swap-rc-button').getAttribute('title'), '交换右居中');
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('relative position center option is translated and reaches copy and paste operations', async () => {
  const panel = await createPanel();
  try {
    const select = panel.element('relative-corner') as unknown as HTMLSelectElement;
    assert.equal(select.value, 'TL');
    const option = panel.window.document.querySelector('#relative-corner option[value="C"]');
    assert.ok(option);
    assert.equal(option.textContent, 'Center');
    await panel.input('relative-corner', 'C');
    await panel.click('copy-pos-button');
    assert.equal(panel.requests.at(-1)?.operation, 'copyRelativePosition');
    assert.equal(panel.requests.at(-1)?.args[0], 'C');
    await panel.click('paste-pos-button');
    assert.equal(panel.requests.at(-1)?.operation, 'pasteRelativePosition');
    assert.equal(panel.requests.at(-1)?.args[2], 'C');
    await panel.input('language', 'zh_CN');
    assert.equal(option.textContent, '中心');
    assert.equal(select.value, 'C');
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('hover explanations wait, dismiss, update translations and add no buttons', async () => {
  const panel = await createPanel();
  try {
    assert.equal(panel.window.document.querySelector('.help-hint'), null);
    assert.equal(panel.window.document.querySelector('.help-action'), null);
    const control = panel.element('reverse-move-checkbox') as unknown as HTMLInputElement;
    const checked = control.checked;
    const hostCalls = () => panel.requests.filter((request) => request.operation !== 'syncZoomTracker');
    const requests = hostCalls().length;
    const pause = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));
    const popup = () => panel.window.document.querySelector('.sci-tooltip');
    control.dispatchEvent(new panel.window.MouseEvent('mouseenter'));
    await pause();
    assert.equal(popup(), null, 'Quick hovering does not open an explanation');
    control.dispatchEvent(new panel.window.MouseEvent('mouseleave'));
    await pause(650);
    assert.equal(popup(), null, 'Leaving cancels pending hover');
    control.dispatchEvent(new panel.window.MouseEvent('mouseenter'));
    await pause(650);
    assert.equal(popup()?.getAttribute('role'), 'tooltip');
    assert.equal(popup()?.parentElement, panel.window.document.body);
    assert.equal(control.getAttribute('aria-describedby'), popup()?.id);
    control.dispatchEvent(new panel.window.MouseEvent('mouseleave'));
    await pause();
    assert.equal(popup(), null);
    assert.equal(control.getAttribute('aria-describedby'), null);

    const order = panel.element('relative-order');
    await panel.click(order.id);
    await pause(650);
    assert.equal(popup(), null, 'Clicking does not pin or open an explanation');
    control.dispatchEvent(new panel.window.MouseEvent('mouseenter'));
    await pause(650);
    order.dispatchEvent(new panel.window.MouseEvent('mouseenter'));
    await pause(650);
    assert.equal(panel.window.document.querySelectorAll('.sci-tooltip').length, 1);
    assert.equal(control.getAttribute('aria-describedby'), null);
    await panel.input('relative-order', 'horizontal');
    assert.equal(popup()?.textContent, 'Sort strictly from left to right');
    await panel.input('language', 'zh_CN');
    assert.equal(popup()?.textContent, '严格从左到右排序');
    order.dispatchEvent(new panel.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await panel.flush();
    assert.equal(popup(), null);
    order.dispatchEvent(new panel.window.MouseEvent('mouseenter'));
    await pause(650);
    panel.window.dispatchEvent(new panel.window.Event('hashchange'));
    await panel.flush();
    assert.equal(popup(), null, 'Changing tabs dismisses floating explanations');
    assert.equal(control.checked, checked);
    assert.equal(hostCalls().length, requests, 'Hovering must not call Illustrator operations');
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('hover explanations fit narrow viewports and preserve label live editing', async () => {
  const panel = await createPanel();
  try {
    Object.defineProperty(panel.window, 'innerWidth', { value: 220, configurable: true });
    Object.defineProperty(panel.window, 'innerHeight', { value: 180, configurable: true });
    const control = panel.element('auto-layout');
    control.getBoundingClientRect = () => ({ left: 185, top: 150, right: 207, bottom: 172, width: 22, height: 22 } as ReturnType<typeof control.getBoundingClientRect>);
    control.dispatchEvent(new panel.window.MouseEvent('mouseenter'));
    await new Promise((resolve) => setTimeout(resolve, 650));
    const popup = panel.window.document.querySelector('.sci-tooltip')!;
    assert.ok(popup);
    popup.getBoundingClientRect = () => ({ left: 0, top: 0, right: 204, bottom: 80, width: 204, height: 80 } as ReturnType<typeof popup.getBoundingClientRect>);
    panel.window.dispatchEvent(new panel.window.Event('resize'));
    await panel.flush();
    const left = parseFloat(popup.style.left), top = parseFloat(popup.style.top);
    assert.ok(left >= 8 && left + 204 <= 212);
    assert.ok(top >= 8 && top + 80 <= 172);

    await panel.click('add-label-button');
    const offset = panel.element('label-offset-x');
    assert.equal(offset.classList.contains('editing-mode'), true);
    offset.focus();
    offset.dispatchEvent(new panel.window.MouseEvent('mouseenter'));
    await new Promise((resolve) => setTimeout(resolve, 650));
    assert.equal(offset.classList.contains('editing-mode'), true);
    assert.equal(panel.window.document.querySelector('.sci-tooltip')?.textContent, 'Change the value to move labels in real time');
    offset.dispatchEvent(new panel.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await panel.flush();
    assert.equal(offset.classList.contains('editing-mode'), true);
    assert.equal(panel.window.document.querySelector('.sci-tooltip'), null);
    await panel.input('label-offset-x', '3');
    assert.equal(panel.requests.at(-1)?.operation, 'updateLabelOffsets');
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});


function configureLayerPanel(
  window: Window,
  targets = [{ name: 'first', width: 100, height: 100, lut: 'blue' },
    { name: 'second', width: 100, height: 100, lut: 'magenta' }]
) {
  const cep = (window as any).__adobe_cep__, evaluate = cep.evalScript;
  cep.evalScript = (script: string, callback: (result: string) => void) => evaluate(script, (result: string) => {
    if (script.includes('"inspectPseudocolorLayerTargets"'))
      callback(JSON.stringify({ ok: true, data: JSON.stringify({ sessionId: 'layers-session', targets }) }));
    else if (script.includes('"applyPseudocolorLayers"')) callback(JSON.stringify({ ok: true, data: '2' }));
    else callback(result);
  });
  (window as any).require = () => { throw new Error('Layer coloring must not access image files'); };
}
async function chooseLayerColor(panel: Awaited<ReturnType<typeof createPanel>>, id: string, color: string) {
  await panel.click(id);
  const option = panel.window.document.querySelector(`#${id}-options [data-color="${color}"]`);
  assert.ok(option);
  (option as unknown as HTMLButtonElement).click();
  await panel.flush();
}

test('pseudocolor tab has two independent layer-only groups and preserves configured channel colors', async () => {
  const panel = await createPanel('{"language":"zh_CN","pseudocolorMethod":"pixels","pseudocolorLut":"fire"}', true, undefined, configureLayerPanel);
  try {
    assert.equal(panel.element('pseudocolor-group').querySelector('legend')?.textContent, '伪彩');
    assert.equal(panel.element('merge-channels-group').querySelector('legend')?.textContent, '合并通道（Merge Channels）');
    for (const id of ['pseudocolor-method', 'pseudocolor-mode', 'pseudocolor-resolution', 'pseudocolor-invert', 'pseudocolor-read-button'])
      assert.equal(panel.window.document.getElementById(id), null);
    assert.equal((panel.element('pseudocolor-keep') as any).checked, false);
    await chooseLayerColor(panel, 'pseudocolor-lut', 'blue');
    await panel.click('pseudocolor-apply-button');
    const applied = () => panel.requests.filter((request) => request.operation === 'applyPseudocolorLayers').at(-1)!;
    assert.deepEqual(JSON.parse(applied().args[0] as string), { mode: 'batch', lut: 'blue', keepOriginal: false });
    assert.match(panel.element('pseudocolor-group').querySelector('[role="status"]')?.textContent || '', /2 张图片.*可编辑/);
    await panel.click('merge-apply-button');
    assert.equal(JSON.parse(applied().args[0] as string).mode, 'merge');
    await panel.click('merge-read-button');
    assert.match(panel.element('merge-lut-0').textContent || '', /Blue/);
    assert.match(panel.element('merge-lut-1').textContent || '', /Magenta/);
    await chooseLayerColor(panel, 'merge-lut-1', 'cyan');
    await panel.click('merge-enable-0');
    assert.equal((panel.element('merge-apply-button') as any).disabled, true);
    assert.equal((panel.element('pseudocolor-apply-button') as any).disabled, false);
    assert.equal((panel.element('merge-lut-0') as any).disabled, true);
    await panel.click('merge-enable-0');
    await panel.click('merge-apply-button');
    const request = JSON.parse(applied().args[0] as string);
    assert.equal(request.sessionId, 'layers-session');
    assert.equal(request.channels[0].lut, 'blue');
    assert.equal(request.channels[1].lut, 'cyan');
    assert.deepEqual(Object.keys(request.channels[0]).sort(), ['enabled', 'lut']);
    assert.equal(panel.requests.some((request) => /capture|PseudocolorImages|MergedChannels/.test(request.operation)), false);
    const saved = JSON.parse(panel.window.localStorage.getItem(storageKey)!);
    assert.equal(saved.pseudocolorLut, 'blue');
    assert.equal('pseudocolorMethod' in saved, false);
  } finally { await panel.window.happyDOM.close(); }
});

test('color dropdown previews all seven colors and supports keyboard, Escape and outside-click dismissal', async () => {
  const panel = await createPanel(undefined, true);
  try {
    await panel.click('pseudocolor-lut');
    const options = [...panel.window.document.querySelectorAll('#pseudocolor-lut-options [role="option"]')];
    assert.equal(options.length, 7);
    for (const option of options) {
      assert.match(option.querySelector('.color-swatch')?.getAttribute('style') || '', /linear-gradient/);
      assert.ok(option.textContent?.trim());
    }
    options[0].dispatchEvent(new panel.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await panel.flush();
    assert.equal(panel.window.document.activeElement?.getAttribute('data-color'), 'green');
    panel.window.document.activeElement?.dispatchEvent(new panel.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await panel.flush();
    assert.equal(panel.element('pseudocolor-lut').getAttribute('aria-expanded'), 'false');
    assert.match(panel.element('pseudocolor-lut').textContent || '', /Green/);
    assert.match(panel.element('pseudocolor-lut').querySelector('.color-swatch')?.getAttribute('style') || '', /00ff00/);
    assert.equal(JSON.parse(panel.window.localStorage.getItem(storageKey)!).pseudocolorLut, 'green');
    await panel.click('pseudocolor-lut');
    panel.window.document.activeElement?.dispatchEvent(new panel.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await panel.flush();
    assert.equal(panel.window.document.activeElement?.id, 'pseudocolor-lut');
    assert.equal(panel.window.document.getElementById('pseudocolor-lut-options'), null);
    await panel.click('pseudocolor-lut');
    panel.window.document.body.dispatchEvent(new panel.window.Event('pointerdown', { bubbles: true }));
    await panel.flush();
    assert.equal(panel.window.document.getElementById('pseudocolor-lut-options'), null);
  } finally { await panel.window.happyDOM.close(); }
});

test('channel size errors only block merging and coloring invalidates previously read channels', async () => {
  const panel = await createPanel(undefined, false, undefined, (window) => configureLayerPanel(window, [
    {name:'first', width:100, height:100, lut:'red'}, {name:'second', width:200, height:100, lut:'green'}
  ]));
  try {
    await panel.click('merge-read-button');
    assert.equal((panel.element('merge-apply-button') as any).disabled, true);
    assert.match(panel.element('merge-channels-group').querySelector('.error')?.textContent || '', /same width and height/);
    assert.equal((panel.element('pseudocolor-apply-button') as any).disabled, false);
    await panel.click('pseudocolor-apply-button');
    assert.equal(panel.window.document.getElementById('merge-lut-0'), null);
    assert.equal(panel.element('merge-channels-group').querySelector('.error'), null);
    assert.equal((panel.element('merge-apply-button') as any).disabled, false);
    assert.ok(panel.requests.some((request) => request.operation === 'cancelPseudocolorLayerTargets'));
  } finally { await panel.window.happyDOM.close(); }
});

test('palette tab puts groups first, copies color values and reopens named custom palettes', async () => {
  const copied: string[] = [];
  const panel = await createPanel(undefined, true, undefined, (window) => {
    Object.defineProperty(window.navigator, 'clipboard', { value: undefined, configurable: true });
    (window.document as any).execCommand = (command: string) => {
      assert.equal(command, 'copy');
      copied.push((window.document.activeElement as any).value);
      return true;
    };
  });
  let saved = '';
  try {
    await panel.input('language', 'zh_CN');
    const tab = [...panel.window.document.querySelectorAll('.tab')].find((button) => button.textContent === '色卡');
    assert.ok(tab);
    (tab as any).click();
    await panel.flush();
    assert.equal(panel.element('panel-palettes').firstElementChild?.classList.contains('palette-header'), true);
    assert.deepEqual([...panel.window.document.querySelectorAll('.palette-groups button')].map((button) => button.textContent), ['期刊配色','分类配色','连续配色','发散配色']);
    assert.equal(panel.window.document.querySelectorAll('#panel-palettes .palette-card').length, 5);
    const first = panel.window.document.querySelector('#panel-palettes .color-swatch') as any;
    first.click();
    await panel.flush();
    assert.deepEqual(panel.requests.at(-1), { operation: 'applyPaletteFill', args: ['#E64B35'] });
    assert.deepEqual(copied, [], 'Left click applies a fill without copying');
    assert.match(panel.window.document.querySelector('#panel-palettes [role="status"]')?.textContent || '', /已应用填充色 #E64B35/);
    const requestCount = panel.requests.length;
    const rightClick = new panel.window.MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true });
    first.dispatchEvent(rightClick);
    await panel.flush();
    assert.equal(rightClick.defaultPrevented, true);
    assert.deepEqual(copied, ['#E64B35']);
    await panel.input('palette-copy-format', 'rgb');
    first.dispatchEvent(new panel.window.MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    await panel.flush();
    assert.equal(copied.at(-1), 'rgb(230, 75, 53)');
    assert.equal(panel.requests.length, requestCount, 'Right click never calls the fill operation');
    assert.match(panel.element('palette-copy-toast').textContent || '', /已复制 rgb\(230, 75, 53\)/);
    assert.doesNotMatch(panel.window.document.querySelector('#panel-palettes .apply-status')?.textContent || '', /已复制/);
    await new Promise((resolve) => setTimeout(resolve, 3100));
    await panel.flush();
    assert.equal(panel.window.document.getElementById('palette-copy-toast'), null, 'Copy toast closes after three seconds');

    await panel.click('palette-manage-groups');
    await panel.click('palette-add-group');
    await panel.input('palette-group-name', '我的实验');
    await panel.click('palette-save-group');
    await panel.click('palette-close-manager');
    assert.equal(panel.window.document.querySelector('.palette-groups button[aria-pressed="true"]')?.textContent, '我的实验');
    await panel.click('palette-add-card');
    await panel.input('palette-card-name', '对照与处理');
    await panel.input('palette-color-hex-0', '#47a');
    await panel.click('palette-add-color');
    await panel.input('palette-color-hex-1', 'EE6677');
    await panel.click('palette-save-card');
    const card = panel.window.document.querySelector('#panel-palettes .palette-card')!;
    assert.equal(card.querySelector('h3')?.textContent, '对照与处理');
    assert.deepEqual([...card.querySelectorAll('.color-swatch')].map((button) => button.getAttribute('data-color')), ['#4477AA', '#EE6677']);
    (card.querySelector('[data-action="edit"]') as any).click();
    await panel.flush();
    await panel.input('palette-card-name', '实验主配色');
    await panel.click('palette-save-card');
    await manageGroup(panel, 'rename', JSON.parse(panel.window.localStorage.getItem(paletteStorageKey)!).groups[0].id);
    await panel.input('palette-group-name', '论文配色');
    await panel.click('palette-save-group');
    await panel.click('palette-close-manager');
    saved = panel.window.localStorage.getItem(paletteStorageKey)!;
    const stored = JSON.parse(saved);
    assert.equal(stored.groups[0].name, '论文配色');
    assert.equal(stored.palettes[0].name, '实验主配色');
    assert.equal(stored.copyFormat, 'rgb');
    assert.deepEqual(panel.alerts, []);
  } finally { await panel.window.happyDOM.close(); }
  const reopened = await createPanel('{"language":"zh_CN"}', false, undefined, (window) => window.localStorage.setItem(paletteStorageKey, saved));
  try {
    assert.equal(reopened.window.document.querySelector('.palette-groups button[aria-pressed="true"]')?.textContent, '论文配色');
    assert.equal(reopened.window.document.querySelector('#panel-palettes h3')?.textContent, '实验主配色');
    assert.equal((reopened.element('palette-copy-format') as any).value, 'rgb');
    await manageGroup(reopened, 'delete', JSON.parse(saved).groups[0].id);
    assert.equal(reopened.window.document.querySelectorAll('#panel-palettes .palette-card').length, 1, 'Deletion waits for an explicit user click');
    await reopened.click('palette-confirm-delete');
    assert.equal(reopened.window.document.querySelectorAll('.palette-groups button').length, 4);
    assert.equal(JSON.parse(reopened.window.localStorage.getItem(paletteStorageKey)!).palettes.length, 0);
  } finally { await reopened.window.happyDOM.close(); }
});

test('failed palette fill shows a localized error while right-click copying remains independent', async () => {
  const panel = await createPanel('{"language":"zh_CN"}', false, undefined, (window) => {
    Object.defineProperty(window.navigator, 'clipboard', { value: undefined, configurable: true });
    (window.document as any).execCommand = () => true;
  });
  try {
    const adapter = (panel.window as any).__adobe_cep__;
    const evaluate = adapter.evalScript;
    let fills = 0;
    adapter.evalScript = (script: string, callback: (value: string) => void) => {
      if (script.includes('"applyPaletteFill"')) {
        fills++;
        callback(JSON.stringify({ ok: false, error: 'errors.paletteFillSelection', args: [] }));
      } else evaluate(script, callback);
    };
    const color = panel.window.document.querySelector('#panel-palettes .color-swatch') as any;
    color.click();
    await panel.flush();
    assert.match(panel.window.document.querySelector('#panel-palettes .error')?.textContent || '', /请选择需要应用填充色的形状/);
    assert.doesNotMatch(panel.window.document.querySelector('#panel-palettes [role="status"]')?.textContent || '', /已应用/);
    color.dispatchEvent(new panel.window.MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    await panel.flush();
    assert.match(panel.element('palette-copy-toast').textContent || '', /已复制 #E64B35/);
    assert.equal(fills, 1);
  } finally { await panel.window.happyDOM.close(); }
});

test('default palettes can be edited, moved and deleted directly with persistent changes', async () => {
  const panel = await createPanel();
  let saved = '';
  try {
    const original = panel.window.document.querySelector('[data-palette-id="builtin-npg"]')!;
    assert.equal(panel.window.document.querySelector('[data-action="duplicate"]'), null);
    assert.ok(original.querySelector('[data-action="delete"]'));
    (original.querySelector('[data-action="edit"]') as any).click();
    await panel.flush();
    assert.equal((panel.element('palette-card-group') as any).value, 'journals');
    await panel.input('palette-card-name', 'My Nature Colors');
    await panel.input('palette-color-hex-0', 'oops');
    await panel.click('palette-save-card');
    assert.ok(panel.window.document.getElementById('palette-card-editor'));
    assert.match(panel.window.document.querySelector('#panel-palettes .error')?.textContent || '', /valid HEX/);
    await panel.input('palette-color-hex-0', '#FFFFFF');
    await panel.input('palette-card-group', 'categorical');
    await panel.click('palette-save-card');
    assert.ok([...panel.window.document.querySelectorAll('#panel-palettes h3')].some((heading) => heading.textContent === 'My Nature Colors'));
    assert.equal(panel.window.document.querySelectorAll('[data-palette-id="builtin-npg"]').length, 1);
    assert.equal(panel.window.document.querySelector('[data-palette-id="builtin-npg"] .color-swatch')?.getAttribute('data-color'), '#FFFFFF');
    assert.equal(panel.window.document.querySelectorAll('#panel-palettes .palette-card').length, 9);
    saved = panel.window.localStorage.getItem(paletteStorageKey)!;
    assert.equal(JSON.parse(saved).palettes[0].id, 'builtin-npg');
    await panel.click('palette-manage-groups');
    await panel.click('palette-add-group');
    await panel.input('palette-group-name', 'Journal Palettes');
    await panel.click('palette-save-group');
    assert.match(panel.window.document.querySelector('#panel-palettes .error')?.textContent || '', /already exists/);
  } finally { await panel.window.happyDOM.close(); }
  const reopened = await createPanel(undefined, false, undefined, (window) => window.localStorage.setItem(paletteStorageKey, saved));
  try {
    const edited = reopened.window.document.querySelector('[data-palette-id="builtin-npg"]')!;
    assert.equal(edited.querySelector('h3')?.textContent, 'My Nature Colors');
    assert.equal(edited.querySelector('.color-swatch')?.getAttribute('data-color'), '#FFFFFF');
    (edited.querySelector('[data-action="delete"]') as any).click();
    await reopened.flush();
    assert.ok(reopened.window.document.querySelector('[data-palette-id="builtin-npg"]'), 'Deleting a preset waits for confirmation');
    await reopened.click('palette-confirm-delete');
    assert.equal(reopened.window.document.querySelector('[data-palette-id="builtin-npg"]'), null);
    saved = reopened.window.localStorage.getItem(paletteStorageKey)!;
  } finally { await reopened.window.happyDOM.close(); }
  const deleted = await createPanel(undefined, false, undefined, (window) => window.localStorage.setItem(paletteStorageKey, saved));
  try {
    assert.equal(deleted.window.document.querySelector('[data-palette-id="builtin-npg"]'), null);
    await deleted.click('palette-group-journals');
    assert.equal(deleted.window.document.querySelector('[data-palette-id="builtin-npg"]'), null);
    assert.equal(deleted.window.document.querySelectorAll('#panel-palettes .palette-card').length, 4);
  } finally { await deleted.window.happyDOM.close(); }
});

test('deleting a custom group also permanently deletes default palettes moved into it', async () => {
  const panel = await createPanel();
  let saved = '';
  try {
    await panel.click('palette-manage-groups');
    await panel.click('palette-add-group');
    await panel.input('palette-group-name', 'Experiment');
    await panel.click('palette-save-group');
    await panel.click('palette-close-manager');
    const groupId = JSON.parse(panel.window.localStorage.getItem(paletteStorageKey)!).groups[0].id;
    await panel.click('palette-group-journals');
    (panel.window.document.querySelector('[data-palette-id="builtin-npg"] [data-action="edit"]') as any).click();
    await panel.flush();
    await panel.input('palette-card-group', groupId);
    await panel.click('palette-save-card');
    await manageGroup(panel, 'delete', groupId);
    assert.match(panel.element('palette-group-manager').textContent || '', /all 1 palette/);
    await panel.click('palette-confirm-delete');
    await panel.click('palette-close-manager');
    assert.equal(panel.window.document.querySelector('[data-palette-id="builtin-npg"]'), null);
    saved = panel.window.localStorage.getItem(paletteStorageKey)!;
  } finally { await panel.window.happyDOM.close(); }
  const reopened = await createPanel(undefined, false, undefined, (window) => window.localStorage.setItem(paletteStorageKey, saved));
  try {
    assert.equal(reopened.window.document.querySelector('[data-palette-id="builtin-npg"]'), null);
  } finally { await reopened.window.happyDOM.close(); }
});

test('default groups can all be deleted and remain deleted after reopening; new groups still work', async () => {
  const panel = await createPanel('{"language":"zh_CN"}');
  let saved = '';
  try {
    await panel.click('palette-add-card');
    await panel.input('palette-card-name', '期刊自定义');
    await panel.click('palette-save-card');
    await manageGroup(panel, 'delete', 'journals');
    assert.match(panel.element('panel-palettes').textContent || '', /期刊配色.*全部 6 张色卡/);
    assert.equal(panel.window.document.querySelectorAll('.palette-groups button').length, 4);
    await panel.click('palette-confirm-delete');
    assert.equal(panel.window.document.getElementById('palette-group-journals'), null);
    assert.equal(JSON.parse(panel.window.localStorage.getItem(paletteStorageKey)!).palettes.length, 0);
    for (const id of ['categorical', 'sequential', 'diverging']) {
      await manageGroup(panel, 'delete', id);
      await panel.click('palette-confirm-delete');
    }
    await panel.click('palette-close-manager');
    assert.equal(panel.window.document.querySelectorAll('.palette-groups button').length, 0);
    assert.equal((panel.element('palette-add-card') as any).disabled, true);
    assert.match(panel.element('panel-palettes').textContent || '', /暂无分组/);
    saved = panel.window.localStorage.getItem(paletteStorageKey)!;
  } finally { await panel.window.happyDOM.close(); }
  const reopened = await createPanel('{"language":"zh_CN"}', false, undefined, (window) => window.localStorage.setItem(paletteStorageKey, saved));
  try {
    assert.equal(reopened.window.document.querySelectorAll('.palette-groups button').length, 0);
    await reopened.click('palette-manage-groups');
    await reopened.click('palette-add-group');
    await reopened.input('palette-group-name', '新实验');
    await reopened.click('palette-save-group');
    await reopened.click('palette-close-manager');
    assert.equal((reopened.element('palette-add-card') as any).disabled, false);
    await reopened.click('palette-add-card');
    await reopened.input('palette-card-name', '新配色');
    await reopened.click('palette-save-card');
    assert.equal(reopened.window.document.querySelector('#panel-palettes h3')?.textContent, '新配色');
    assert.equal(reopened.window.document.querySelectorAll('.palette-groups button').length, 1);
  } finally { await reopened.window.happyDOM.close(); }
});

test('group settings open a keyboard-accessible modal and renamed defaults survive reopening', async () => {
  const panel = await createPanel('{"language":"zh_CN"}');
  let saved = '';
  try {
    assert.equal(panel.window.document.getElementById('palette-add-group'), null);
    assert.equal(panel.window.document.getElementById('palette-group-manager'), null);
    const settings = panel.element('palette-manage-groups');
    assert.equal(settings.textContent?.trim(), '');
    assert.equal(settings.getAttribute('aria-label'), '管理分组');
    (settings as any).focus();
    await panel.click('palette-manage-groups');
    const modal = panel.element('palette-group-manager');
    assert.equal(modal.getAttribute('role'), 'dialog');
    assert.equal(modal.getAttribute('aria-modal'), 'true');
    assert.equal(panel.window.document.activeElement?.id, 'palette-close-manager');
    panel.element('palette-close-manager').dispatchEvent(new panel.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    assert.equal(panel.window.document.activeElement?.id, 'palette-add-group');
    await manageGroup(panel, 'rename', 'journals');
    assert.equal((panel.element('palette-group-name') as any).value, '期刊配色');
    await panel.input('palette-group-name', '论文常用');
    await panel.click('palette-save-group');
    assert.equal(panel.element('palette-group-journals').textContent, '论文常用');
    assert.equal(panel.window.document.querySelectorAll('#panel-palettes .palette-card').length, 5);
    saved = panel.window.localStorage.getItem(paletteStorageKey)!;
    modal.dispatchEvent(new panel.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await panel.flush();
    assert.equal(panel.window.document.getElementById('palette-group-manager'), null);
    assert.equal(panel.window.document.activeElement, settings);
  } finally { await panel.window.happyDOM.close(); }
  const reopened = await createPanel('{"language":"zh_CN"}', false, undefined, (window) => window.localStorage.setItem(paletteStorageKey, saved));
  try {
    assert.equal(reopened.element('palette-group-journals').textContent, '论文常用');
    assert.equal(reopened.window.document.getElementById('palette-add-group'), null);
    await manageGroup(reopened, 'delete', 'journals');
    assert.match(reopened.element('palette-group-manager').textContent || '', /论文常用.*全部 5 张色卡/);
    await reopened.click('palette-close-manager');
    assert.ok(reopened.window.document.getElementById('palette-group-journals'), 'Closing before confirmation preserves the group');
  } finally { await reopened.window.happyDOM.close(); }
});

async function manageGroup(panel: Awaited<ReturnType<typeof createPanel>>, action: 'rename' | 'delete', id: string) {
  if (!panel.window.document.getElementById('palette-group-manager')) await panel.click('palette-manage-groups');
  const button = panel.window.document.querySelector(`[data-group-${action}="${id}"]`) as any;
  assert.ok(button, `Missing group ${action} button for ${id}`);
  button.click();
  await panel.flush();
}

test('unreadable palette storage is not overwritten and clipboard failures show an error', async () => {
  const panel = await createPanel(undefined, false, undefined, (window) => {
    window.localStorage.setItem(paletteStorageKey, '{broken');
    Object.defineProperty(window.navigator, 'clipboard', { value: undefined, configurable: true });
    (window.document as any).execCommand = () => false;
  });
  try {
    assert.match(panel.window.document.querySelector('#panel-palettes .error')?.textContent || '', /Could not read/);
    assert.equal(panel.window.localStorage.getItem(paletteStorageKey), '{broken');
    (panel.window.document.querySelector('#panel-palettes .color-swatch') as any).dispatchEvent(new panel.window.MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    await panel.flush();
    assert.match(panel.window.document.getElementById('panel-palettes')?.textContent || '', /Could not copy/);
    assert.doesNotMatch(panel.window.document.querySelector('#panel-palettes [role="status"]')?.textContent || '', /Copied/);
    assert.equal(panel.window.document.querySelector('textarea'), null);
  } finally { await panel.window.happyDOM.close(); }
});

async function createPanel(
  saved?: string,
  legacy = false,
  url = 'http://localhost:3000/main/index.html',
  configure?: (window: Window) => void
) {
  const window = new Window({ url });
  // happy-dom 20 implements :checked only for INPUT. Svelte also uses it for
  // selected OPTIONs; supply that missing browser behavior in this adapter.
  const querySelector = window.HTMLSelectElement.prototype.querySelector;
  window.HTMLSelectElement.prototype.querySelector = function (
    selector: string
  ) {
    if (selector === ':checked')
      return [...this.options].find((option) => option.selected) ?? null;
    return querySelector.call(this, selector);
  };
  const requests: { operation: string; args: unknown[] }[] = [];
  const alerts: string[] = [];
  if (saved) window.localStorage.setItem(storageKey, saved);
  window.document.body.innerHTML = '<div id="root"></div>';
  window.alert = (message?: unknown) => {
    alerts.push(String(message));
  };
  const adapter = {
    getSystemPath: () => 'D:/SCI Toolbox',
    evalScript(script: string, callback: (result: string) => void) {
      if (script.includes('$.evalFile')) return callback('SCI_READY');
      const context = vm.createContext({
        $: {
          [hostNamespace]: {
            call(operation: string, payload: string) {
              const args = JSON.parse(decodeURIComponent(payload));
              requests.push({ operation, args });
              const data: Record<string, string> = {
                copyRelativePosition:
                  '[{"deltaX":1,"deltaY":2},{"deltaX":3,"deltaY":4}]',
                copySize: '{"width":12.345,"height":23.456}',
                copySpacing: '1.234',
                addLabelsToImages: '3',
                updateLabelIndex: 'Success|2',
                arrangeImages: '{"layoutWidth":50}',
                inspectZoomTarget: JSON.stringify({
                  sourceWidth: 100,
                  sourceHeight: 100,
                  previewDataUrl:
                    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                  existingEntries: [],
                  manualRect: null
                }),
                applyZoomImages: 'Success',
                inspectScalebar: JSON.stringify({
                  token: 'image-token', signature: 'image-token', documentKey: 'test.ai',
                  fov: { width: 0.2, height: 0.1, unit: 'cm' },
                  options: { orientation: 'horizontal', lengthUm: 75, thickness: 3, color: '#ffffff',
                    showText: true, fontColor: '#ff0000', fontSize: 12, bold: true, position: 'BL', autoGroup: true }
                }),
                applyScalebar: 'OK',
                syncZoomTracker: 'OK'
              };
              if (operation === 'inspectScalebar') {
                const selection = (window as any).__scaleSelection;
                if (selection) data[operation] = JSON.stringify(selection);
                if (JSON.parse(data[operation]).signature === args[0]) data[operation] = 'null';
              }
              return JSON.stringify({
                ok: true,
                data: data[operation] || 'Success'
              });
            }
          }
        }
      });
      callback(vm.runInContext(script, context));
    }
  };
  Object.assign(window, { __adobe_cep__: adapter });
  configure?.(window);
  if (legacy) {
    // Remove APIs absent from Chromium 57 in this isolated browser context.
    window.eval(`
      delete String.prototype.replaceAll;
      delete Promise.allSettled;
      delete Promise.prototype.finally;
      // Shadow happy-dom's prototype method as well as its bound instance method.
      Object.defineProperty(window, 'queueMicrotask', {
        value: undefined, configurable: true, writable: true
      });
      delete window.globalThis;
    `);
  }
  window.eval(bundle);
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
  await flush();
  const element = (id: string) => {
    const value = window.document.getElementById(id);
    assert.ok(value, `Missing panel element ${id}`);
    return value;
  };
  const input = async (id: string, value: string) => {
    const field = element(id) as unknown as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(
      new window.Event(field.tagName === 'SELECT' ? 'change' : 'input', {
        bubbles: true
      })
    );
    await flush();
  };
  const click = async (id: string) => {
    element(id).click();
    await flush();
  };
  return { window, requests, alerts, element, input, click, flush };
}

test('scalebar selection loads automatically, follows FOV units and autosaves without read/import/save buttons', async () => {
  const panel = await createPanel(undefined, true, 'http://localhost:3000/main/index.html#scalebar');
  try {
    assert.equal(panel.requests.filter((r) => r.operation === 'inspectScalebar').length, 1);
    assert.equal((panel.element('fov-width') as any).value, '0.2');
    assert.equal((panel.element('fov-unit') as any).value, 'cm');
    assert.equal((panel.element('scale-length') as any).value, '0.0075');
    assert.equal((panel.element('scale-unit') as any).value, 'cm');
    assert.equal((panel.element('scale-auto-group') as any).checked, true);
    for (const id of ['inspect-scalebar-button', 'import-scale-tiff-button', 'save-fov-button', 'apply-scalebar-button'])
      assert.equal(panel.window.document.getElementById(id), null);
    await panel.input('scale-orientation', 'vertical');
    assert.equal(panel.element('scale-length').previousElementSibling?.textContent, 'Height (cm):');
    await panel.input('scale-length', '0.01');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const applied = panel.requests.filter((r) => r.operation === 'applyScalebar').at(-1)!;
    assert.equal(applied.operation, 'applyScalebar');
    const payload = JSON.parse(applied.args[0] as string);
    assert.equal(payload.token, 'image-token');
    assert.equal(payload.fov.width, 0.2); assert.equal(payload.fov.unit, 'cm');
    assert.equal(payload.options.orientation, 'vertical'); assert.equal(payload.options.lengthUm, 100);
    assert.equal(payload.options.unit, 'cm'); assert.equal(payload.autoSave, true);
    assert.equal(payload.options.bold, true); assert.equal(payload.options.fontColor, '#ff0000');
    await panel.input('fov-width', '0.3');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const saved = JSON.parse(panel.requests.filter((r) => r.operation === 'applyScalebar').at(-1)!.args[0] as string);
    assert.equal(saved.fov.width, 0.3); assert.equal(saved.saveOnly, false);
    await panel.input('fov-unit', 'mm');
    assert.equal((panel.element('scale-unit') as any).value, 'mm');
    assert.equal((panel.element('scale-length') as any).value, '0.1');
    await panel.input('language', 'zh_CN');
    assert.equal(panel.element('scale-length').previousElementSibling?.textContent, 'Height（mm）：');
    (panel.window as any).__scaleSelection = { token: 'second-image', signature: 'second-image', documentKey: 'test.ai',
      fov: { width: 2, height: 1, unit: 'mm' }, options: null };
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal((panel.element('fov-width') as any).value, '2');
    assert.equal((panel.element('scale-unit') as any).value, 'mm');
    assert.equal((panel.element('scale-length') as any).value, '0.05');
    assert.equal(panel.element('apply-scalebar-button').textContent, '添加比例尺');
    await panel.input('fov-height', '1.5');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const newFov = JSON.parse(panel.requests.filter((r) => r.operation === 'applyScalebar').at(-1)!.args[0] as string);
    assert.equal(newFov.token, 'second-image'); assert.equal(newFov.saveOnly, true);
    assert.equal(newFov.fov.height, 1.5);
    await panel.click('apply-scalebar-button');
    assert.equal(JSON.parse(panel.requests.filter((r) => r.operation === 'applyScalebar').at(-1)!.args[0] as string).autoSave, false);
    assert.deepEqual(panel.alerts, []);
  } finally { await panel.window.happyDOM.close(); }
});

test('zoom automatic update switch persists and gates background host polling', async () => {
  const panel = await createPanel();
  try {
    const control = panel.element('default-zoom-auto-update') as unknown as HTMLInputElement;
    assert.equal(control.checked, true);
    await panel.click(control.id);
    assert.equal(control.checked, false);
    assert.equal(JSON.parse(panel.window.localStorage.getItem(storageKey)!).zoomAutoUpdate, false);
    const pause = () => new Promise((resolve) => setTimeout(resolve, 450));
    await pause();
    assert.equal(panel.requests.filter((request) => request.operation === 'syncZoomTracker').length, 0);
    await panel.click(control.id);
    await pause();
    assert.ok(panel.requests.some((request) => request.operation === 'syncZoomTracker'));
    await panel.click(control.id);
    const count = panel.requests.length;
    await pause();
    assert.equal(panel.requests.length, count);
    await panel.input('language', 'zh_CN');
    assert.equal(panel.window.document.querySelector(`label[for="${control.id}"]`)?.textContent, '放大图自动更新');
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('checkbox activation survives the browser checkpoint between click and change', async () => {
  const panel = await createPanel();
  try {
    const controls = [...panel.window.document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    assert.ok(controls.length >= 14, 'Cover workspace and persisted settings controls');
    for (const control of controls) {
      const initial = control.checked;
      for (const expected of [!initial, initial]) {
        control.focus();
        await panel.flush();
        // happy-dom's .click() runs activation, click and change synchronously.
        // Native user activation allows queued rendering after click listeners,
        // before the subsequent input/change events. Model that checkpoint.
        control.checked = expected;
        panel.window.HTMLElement.prototype.dispatchEvent.call(
          control,
          new panel.window.MouseEvent('click', { bubbles: true, cancelable: true })
        );
        await panel.flush();
        assert.equal(control.checked, expected, `${control.id}: click must preserve the activated value`);
        control.dispatchEvent(new panel.window.Event('input', { bubbles: true }));
        control.dispatchEvent(new panel.window.Event('change', { bubbles: true }));
        await panel.flush();
        assert.equal(control.checked, expected, `${control.id}: binding must save the activated value`);
        await panel.input('language', 'zh_CN');
        await panel.input('language', 'en');
        assert.equal(control.checked, expected, `${control.id}: a later render must retain the saved value`);
      }
    }
    await panel.click('add-label-button');
    assert.equal(panel.element('label-offset-x').classList.contains('editing-mode'), true);
    const reverse = panel.element('reverse-move-checkbox') as unknown as HTMLInputElement;
    reverse.checked = true;
    panel.window.HTMLElement.prototype.dispatchEvent.call(
      reverse,
      new panel.window.MouseEvent('click', { bubbles: true, cancelable: true })
    );
    await panel.flush();
    assert.equal(reverse.checked, true, 'Active label editing must also preserve checkbox activation');
    reverse.dispatchEvent(new panel.window.Event('change', { bubbles: true }));
    await panel.flush();
    assert.equal(panel.element('label-offset-x').classList.contains('editing-mode'), false);
    await panel.click('add-label-button');
    await panel.click('font-bold');
    assert.equal(panel.element('label-offset-x').classList.contains('editing-mode'), false);
    assert.equal(JSON.parse(panel.window.localStorage.getItem(storageKey)!).fontBold, true);
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('installed panel starts and calls the host without newer Chromium APIs', async () => {
  // Chromium 57 supports ES2017; later syntax must be transpiled in the package.
  parse(bundle, { ecmaVersion: 2017 });
  const panel = await createPanel(undefined, true);
  try {
    assert.equal(panel.window.eval('globalThis === window'), true);
    assert.equal(panel.window.eval('typeof queueMicrotask'), 'function');
    assert.equal(panel.window.eval('"a.a".replaceAll("a", "b")'), 'b.b');
    assert.equal(panel.window.eval('"a.a".replaceAll(/a/g, "b")'), 'b.b');
    const settled = await panel.window.eval(
      'Promise.allSettled([Promise.resolve(1), Promise.reject(2)])'
    );
    assert.equal(settled[0].value, 1);
    assert.equal(settled[1].reason, 2);
    assert.equal(
      await panel.window.eval('Promise.resolve(3).finally(() => {})'),
      3
    );
    await panel.input('language', 'zh_CN');
    assert.equal(panel.element('copy-pos-button').textContent, '复制');
    await panel.click('copy-size-button');
    assert.equal(panel.requests.at(-1)?.operation, 'copySize');
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('production Svelte panel switches tabs and persists language without losing form edits', async () => {
  const panel = await createPanel();
  try {
    assert.equal(panel.element('copy-pos-button').textContent, 'Copy');
    await panel.input('label-offset-x', '0');
    await panel.input('language', 'zh_CN');
    assert.equal(panel.element('copy-pos-button').textContent, '复制');
    assert.equal(
      (panel.element('label-offset-x') as unknown as HTMLInputElement).value,
      '0'
    );
    const saved = panel.window.localStorage.getItem(storageKey)!;
    assert.equal(JSON.parse(saved).language, 'zh_CN');
    assert.equal(JSON.parse(saved).labelOffsetX, 0);
    const reopened = await createPanel(saved);
    try {
      assert.equal(reopened.element('copy-pos-button').textContent, '复制');
      assert.equal(
        (reopened.element('label-offset-x') as unknown as HTMLInputElement)
          .value,
        '0'
      );
    } finally {
      await reopened.window.happyDOM.close();
    }
    const arrangeTab = [...panel.window.document.querySelectorAll('.tab')].find(
      (button) => button.textContent === '网格排布'
    );
    assert.ok(arrangeTab);
    (arrangeTab as unknown as HTMLButtonElement).click();
    await panel.flush();
    assert.equal(panel.element('panel-arrange').parentElement?.hidden, false);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('production controls preserve dynamic placeholders, arrange visibility and label live editing', async () => {
  const panel = await createPanel();
  try {
    await panel.click('copy-pos-button');
    assert.equal(
      panel.element('delta-x').getAttribute('placeholder'),
      'Multiple Values (2)'
    );
    await panel.input('language', 'zh_CN');
    assert.equal(
      panel.element('delta-x').getAttribute('placeholder'),
      '多个值（2）'
    );
    await panel.click('paste-pos-button');
    assert.equal(panel.requests.at(-1)?.operation, 'pasteRelativePosition');
    assert.equal(
      panel.requests.at(-1)?.args[5],
      null,
      'Empty multi-object inputs must not overwrite copied offsets'
    );

    await panel.input('arrange-size-mode', 'custom');
    assert.equal(panel.element('arrange-custom-width-group').hidden, false);
    assert.equal(panel.element('arrange-custom-height-group').hidden, false);
    await panel.click('auto-layout');
    assert.equal(panel.element('columns-group').hidden, true);
    await panel.click('arrange-button');
    assert.equal(
      (panel.element('layout-width') as unknown as HTMLInputElement).value,
      '50'
    );

    await panel.click('add-label-button');
    assert.equal(
      (panel.element('label-start-count') as unknown as HTMLInputElement).value,
      '3'
    );
    assert.equal(
      panel.element('label-offset-x').classList.contains('editing-mode'),
      true
    );
    await panel.input('label-offset-x', '0');
    assert.equal(panel.requests.at(-1)?.operation, 'updateLabelOffsets');
    assert.equal(panel.requests.at(-1)?.args[0], 0);
    await panel.input('language', 'en');
    panel.element('label-offset-x').dispatchEvent(new panel.window.MouseEvent('mouseenter'));
    await new Promise((resolve) => setTimeout(resolve, 650));
    assert.equal(
      panel.window.document.querySelector('.sci-tooltip')?.textContent,
      'Change the value to move labels in real time'
    );
    await panel.click('copy-size-button');
    assert.equal(
      panel.element('label-offset-x').classList.contains('editing-mode'),
      false
    );
    assert.equal(
      (panel.element('size-w') as unknown as HTMLInputElement).value,
      '12.345'
    );
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('zoom image tab renders preferences and opens modal on click', async () => {
  const panel = await createPanel();
  try {
    // Switch to zoom tab
    const tabs = panel.window.document.querySelectorAll('.tab');
    let zoomTab: Element | null = null;
    tabs.forEach((tab) => {
      if (tab.textContent?.includes('Zoom') || tab.textContent?.includes('放大')) {
        zoomTab = tab;
      }
    });
    assert.ok(zoomTab, 'Zoom tab button should exist in tabs list');
    (zoomTab as unknown as HTMLElement).click();
    await panel.flush();

    // Verify zoom panel is displayed
    const makeZoomBtn = panel.element('make-zoom-button');
    assert.ok(makeZoomBtn);

    // Verify default inputs exist
    assert.ok(panel.element('default-line-width'));
    assert.ok(panel.element('default-placement'));

    // Click make zoom button to open modal
    await panel.click('make-zoom-button');
    assert.equal(panel.requests.some((r) => r.operation === 'inspectZoomTarget'), true);

    // Verify modal elements are created
    const entrySelector = panel.element('entry-selector');
    assert.ok(entrySelector);
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('zoom window opens before the host finishes capturing its preview', async () => {
  let finishCapture: (() => void) | undefined;
  let openingSession: any;
  const panel = await createPanel(undefined, false, undefined, (window) => {
    const cep = (window as any).__adobe_cep__;
    const evaluate = cep.evalScript;
    cep.getExtensions = () => JSON.stringify([{ id: 'com.example.achuanPlugin.zoom' }]);
    cep.requestOpenExtension = () => {
      openingSession = JSON.parse(window.localStorage.getItem('sci_zoom_session')!);
    };
    cep.evalScript = (script: string, callback: (result: string) => void) => {
      if (script.includes('"inspectZoomTarget"')) {
        finishCapture = () => evaluate(script, callback);
      } else evaluate(script, callback);
    };
  });
  try {
    await panel.click('make-zoom-button');
    assert.equal(openingSession.data, null, 'Loading session must be ready when the window opens');
    assert.ok(finishCapture);
    assert.equal((panel.element('make-zoom-button') as any).disabled, true);
    finishCapture();
    await panel.flush();
    const readySession = JSON.parse(panel.window.localStorage.getItem('sci_zoom_session')!);
    assert.ok(readySession.data.previewDataUrl);
    assert.ok(readySession.timestamp > openingSession.timestamp);
    assert.equal((panel.element('make-zoom-button') as any).disabled, false);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('zoom loads linked files with their MIME type and only deletes generated previews', async () => {
  for (const temporary of [false, true]) {
    const deleted: string[] = [];
    let loadedUrl = '';
    const filename = temporary ? 'D:/Temp/generated.png' : 'D:/user/original.jpg';
    const mime = temporary ? 'image/png' : 'image/jpeg';
    const panel = await createPanel(undefined, false, undefined, (window) => {
      (window as any).require = (name: string) => {
        if (name === 'fs') return {
          existsSync: (path: string) => path === filename,
          readFileSync: () => ({ toString: () => 'YWJj' }),
          unlinkSync: (path: string) => deleted.push(path)
        };
        throw new Error(`Unexpected module: ${name}`);
      };
      (window as any).Image = class {
        set src(value: string) { loadedUrl = value; }
      };
      const cep = (window as any).__adobe_cep__;
      const evaluate = cep.evalScript;
      cep.evalScript = (script: string, callback: (result: string) => void) => {
        if (script.includes('"inspectZoomTarget"')) {
          callback(JSON.stringify({ ok: true, data: JSON.stringify({
            sourceWidth: 100, sourceHeight: 100,
            previewPath: filename, previewMimeType: mime, previewIsTemporary: temporary,
            existingEntries: [], manualRect: null
          }) }));
        } else evaluate(script, callback);
      };
    });
    try {
      await panel.click('make-zoom-button');
      assert.equal(loadedUrl, `data:${mime};base64,YWJj`);
      assert.deepEqual(deleted, temporary ? [filename] : [], 'The user-owned original must never be deleted');
      assert.deepEqual(panel.alerts, []);
    } finally {
      await panel.window.happyDOM.close();
    }
  }
});

test('failed preview capture shows a dismissible translated error in the zoom dialog', async () => {
  const panel = await createPanel(JSON.stringify({ language: 'zh_CN' }), false, undefined, (window) => {
    const cep = (window as any).__adobe_cep__;
    const evaluate = cep.evalScript;
    cep.evalScript = (script: string, callback: (result: string) => void) => {
      if (script.includes('"inspectZoomTarget"')) {
        callback(JSON.stringify({ ok: false, error: 'errors.zoomNoSelection', args: [] }));
      } else evaluate(script, callback);
    };
  });
  try {
    await panel.click('make-zoom-button');
    const loading = panel.window.document.querySelector('.zoom-loading')!;
    assert.equal(loading.querySelector('.text-danger')?.textContent, '请先选中图片。');
    loading.querySelector('button')!.click();
    await panel.flush();
    assert.equal(panel.window.document.querySelector('.zoom-loading'), null);
    assert.equal((panel.element('make-zoom-button') as any).disabled, false);
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('drawing enables Confirm, edits stay reactive and CEP 8 resize refits the image', async () => {
  let viewport = { width: 600, height: 400 };
  let imageLoads = 0;
  const draws: { canvas: any; args: any[] }[] = [];
  const panel = await createPanel(undefined, true, undefined, (window) => {
    // Simulate loaded image dimensions and canvas drawing, since happy-dom
    // does not decode PNGs or perform browser layout.
    (window as any).ResizeObserver = undefined;
    (window as any).Image = class {
      naturalWidth = 1000;
      naturalHeight = 500;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        imageLoads++;
        Promise.resolve().then(() => this.onload?.());
      }
    };
    const prototype = window.HTMLCanvasElement.prototype;
    Object.defineProperties(prototype, {
      clientWidth: { get: () => viewport.width },
      clientHeight: { get: () => viewport.height }
    });
    prototype.getBoundingClientRect = (() => ({ left: 0, top: 0, ...viewport })) as any;
    prototype.getContext = function () {
      const canvas = this;
      return new Proxy({
        drawImage: (...args: any[]) => draws.push({ canvas, args }),
        measureText: () => ({ width: 40 })
      }, { get: (target, key) => (target as any)[key] ?? (() => {}) }) as any;
    };
  });
  try {
    await panel.click('make-zoom-button');
    const canvas = panel.window.document.querySelector('.canvas-wrapper canvas')!;
    const confirm = panel.window.document.querySelector('.zoom-modal-footer .btn-primary') as any;
    assert.equal(confirm.disabled, true);
    canvas.dispatchEvent(new panel.window.MouseEvent('mousedown', { clientX: 70, clientY: 100, button: 0, bubbles: true }));
    canvas.dispatchEvent(new panel.window.MouseEvent('mousemove', { clientX: 190, clientY: 220, bubbles: true }));
    panel.window.dispatchEvent(new panel.window.MouseEvent('mouseup'));
    await panel.flush();
    assert.equal(confirm.disabled, false, 'Drawn region must enable Confirm without switching entries');
    await panel.input('zoom-line-width', '2.5');
    const add = panel.window.document.querySelector('.header-center .btn-secondary') as any;
    add.click();
    await panel.flush();
    assert.equal(confirm.disabled, true, 'An unfinished new entry must disable Confirm');
    (panel.window.document.querySelector('.header-center .btn-danger') as any).click();
    await panel.flush();
    assert.equal(confirm.disabled, false, 'Deleting the unfinished entry must restore validity');

    viewport = { width: 900, height: 500 };
    panel.window.dispatchEvent(new panel.window.Event('resize'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const imageDraw = draws.filter((draw) => draw.canvas === canvas).at(-1)!;
    assert.deepEqual(imageDraw.args.slice(1), [12, 31, 876, 438]);
    assert.equal(imageLoads, 1, 'Drawing, changing settings and resizing must reuse the loaded preview');

    confirm.click();
    await panel.flush();
    const request = panel.requests.find((r) => r.operation === 'applyZoomImages');
    assert.ok(request, 'Confirm must call the host');
    const payload = JSON.parse(request.args[0] as string);
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].strokeWidth, 2.5);
    assert.ok(Math.abs(payload.entries[0].region.width - 120 / 576) < 1e-6);
    assert.ok(Math.abs(payload.entries[0].region.height - 120 / 288) < 1e-6);
    assert.equal(panel.window.document.querySelector('.zoom-modal-window'), null);
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('standalone zoom window restores source units and edits represented length in that unit', async () => {
  const updates: { type: string; enabled: boolean }[] = [];
  const session = {
    data: {
      sourceScalebar: { lengthUm: 50, unit: 'cm' },
      sourceWidth: 500,
      sourceHeight: 400,
      previewDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      existingEntries: [
        {
          recordKey: 'saved_zoom',
          name: '放大图 1',
          region: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
          regionRotation: 0,
          strokeColor: '#ff0000',
          strokeWidth: 1.5,
          strokeDash: 'dash',
          useRectangleColor: true,
          addGuideLines: false,
          placement: 'right',
          guideLineExtent: 'acrossImages',
          originalZoomRegion: { x: 1.1, y: 0, width: 0.8, height: 1 },
          originalZoomRotation: 0,
          preservesLayout: true,
          scaleLengthUm: 75
        }
      ],
      manualRect: null
    },
    settings: {
      language: 'zh_CN'
    },
    timestamp: Date.now()
  };
  const panel = await createPanel(
    undefined,
    false,
    'http://localhost:3000/main/index.html#zoom-window',
    (window) => {
      (window as any).__adobe_cep__.dispatchEvent = (event: { type: string }) => {
        updates.push({ type: event.type, enabled: JSON.parse(window.localStorage.getItem(storageKey)!).zoomAutoUpdate });
      };
    }
  );
  try {
    panel.window.localStorage.setItem(
      'sci_zoom_session',
      JSON.stringify(session)
    );
    panel.window.dispatchEvent(
      new panel.window.StorageEvent('storage', {
        key: 'sci_zoom_session',
        newValue: JSON.stringify(session)
      })
    );
    await panel.flush();
    assert.ok(panel.window.document.querySelector('.zoom-standalone-root'));
    assert.ok(panel.window.document.querySelector('.zoom-modal-window'));
    assert.equal(panel.window.document.documentElement.lang, 'zh-CN');
    assert.equal((panel.element('zoom-scale-length') as any).value, '0.0075');
    await panel.input('zoom-scale-length', '0.01');

    await panel.click('zoom-auto-update');
    assert.equal((panel.element('zoom-auto-update') as unknown as HTMLInputElement).checked, false);
    assert.deepEqual(updates.at(-1), { type: 'com.example.achuanPlugin.settingsUpdate', enabled: false },
      'Notify the main panel only after saving the automatic update preference');

    await panel.input('zoom-line-width', '4');
    panel.window.dispatchEvent(new panel.window.StorageEvent('storage', {
      key: 'sci_zoom_session',
      newValue: JSON.stringify(session)
    }));
    await panel.flush();
    assert.equal((panel.element('zoom-line-width') as any).value, '4', 'Duplicate session notifications must preserve unsaved edits');

    await panel.input('zoom-placement', 'left');

    // Confirm button triggers applyZoomImages
    const confirmBtn = panel.window.document.querySelector(
      '.zoom-modal-footer .btn-primary'
    ) as HTMLElement;
    assert.ok(confirmBtn);
    confirmBtn.click();
    await panel.flush();
    assert.equal(
      panel.requests.some((r) => r.operation === 'applyZoomImages'),
      true
    );
    const applied = panel.requests.find((r) => r.operation === 'applyZoomImages')!;
    const editedEntry = JSON.parse(applied.args[0] as string).entries[0];
    assert.equal(editedEntry.recordKey, 'saved_zoom');
    assert.equal(editedEntry.scaleLengthUm, 100);
    assert.equal(editedEntry.scaleUnit, 'cm');
    assert.equal(editedEntry.strokeWidth, 4);
    assert.equal(editedEntry.placement, 'left');
    assert.equal(editedEntry.preservesLayout, false, 'Changing placement must release the saved layout');
    assert.equal(JSON.parse(panel.window.localStorage.getItem(storageKey)!).zoomAutoUpdate, false);
  } finally {
    await panel.window.happyDOM.close();
  }
});
