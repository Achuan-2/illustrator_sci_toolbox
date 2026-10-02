import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { Window } from 'happy-dom';
import { parse } from 'acorn';
import { hostNamespace } from '../src/shared/host.ts';

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

test('explanation icons support hover, pinned clicks, single-popup dismissal and dynamic translations', async () => {
  const panel = await createPanel();
  try {
    const control = panel.element('reverse-move-checkbox') as unknown as HTMLInputElement;
    const checked = control.checked;
    const icon = panel.element('reverse-move-help');
    const content = 'reverse-move-help-content';
    const hostCalls = () => panel.requests.filter((request) => request.operation !== 'syncZoomTracker');
    const requests = hostCalls().length;
    const pause = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));

    icon.dispatchEvent(new panel.window.MouseEvent('mouseenter'));
    await pause();
    assert.equal(panel.window.document.getElementById(content), null, 'Quick hovering does not open help');
    icon.dispatchEvent(new panel.window.MouseEvent('mouseleave'));
    await pause(650);
    assert.equal(panel.window.document.getElementById(content), null, 'Leaving cancels delayed help');
    icon.dispatchEvent(new panel.window.MouseEvent('mouseenter'));
    await pause(650);
    assert.equal(panel.element(content).getAttribute('role'), 'tooltip');
    assert.equal(panel.element(content).parentElement, panel.window.document.body);
    icon.dispatchEvent(new panel.window.MouseEvent('mouseleave'));
    await pause();
    assert.equal(panel.window.document.getElementById(content), null);

    await panel.click(icon.id);
    icon.dispatchEvent(new panel.window.MouseEvent('mouseleave'));
    await pause();
    assert.ok(panel.window.document.getElementById(content), 'Clicked explanation stays open after the pointer leaves');
    await panel.click(icon.id);
    assert.equal(panel.window.document.getElementById(content), null);

    await panel.click(icon.id);
    await panel.click('allow-mismatch-paste-help');
    assert.equal(panel.window.document.getElementById(content), null);
    assert.equal(panel.window.document.querySelectorAll('.help-popup').length, 1);
    panel.window.document.body.click();
    await panel.flush();
    assert.equal(panel.window.document.querySelectorAll('.help-popup').length, 0);

    await panel.click('relative-order-help');
    await panel.input('relative-order', 'horizontal');
    assert.equal(panel.element('relative-order-help-content').textContent, 'Sort strictly from left to right');
    await panel.input('language', 'zh_CN');
    assert.equal(panel.element('relative-order-help').getAttribute('aria-label'), '查看提示');
    assert.equal(panel.element('relative-order-help-content').textContent, '严格从左到右排序');
    panel.element('relative-order-help').dispatchEvent(new panel.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await panel.flush();
    assert.equal(panel.window.document.querySelectorAll('.help-popup').length, 0);
    assert.equal(control.checked, checked);
    assert.equal(hostCalls().length, requests, 'Viewing help must not call Illustrator operations');
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

test('explanations fit narrow viewports and do not interrupt label live editing', async () => {
  const panel = await createPanel();
  try {
    Object.defineProperty(panel.window, 'innerWidth', { value: 220, configurable: true });
    Object.defineProperty(panel.window, 'innerHeight', { value: 180, configurable: true });
    const icon = panel.element('auto-layout-help');
    icon.getBoundingClientRect = () => ({ left: 185, top: 150, right: 207, bottom: 172, width: 22, height: 22 } as ReturnType<typeof icon.getBoundingClientRect>);
    await panel.click(icon.id);
    const popup = panel.element('auto-layout-help-content');
    popup.getBoundingClientRect = () => ({ left: 0, top: 0, right: 204, bottom: 80, width: 204, height: 80 } as ReturnType<typeof popup.getBoundingClientRect>);
    panel.window.dispatchEvent(new panel.window.Event('resize'));
    await panel.flush();
    const left = parseFloat(popup.style.left), top = parseFloat(popup.style.top);
    assert.ok(left >= 8 && left + 204 <= 212);
    assert.ok(top >= 8 && top + 80 <= 172);

    await panel.click('add-label-button');
    const offset = panel.element('label-offset-x');
    assert.equal(offset.classList.contains('editing-mode'), true);
    panel.element('label-offset-x-help').focus();
    await panel.click('label-offset-x-help');
    assert.equal(offset.classList.contains('editing-mode'), true);
    assert.ok(panel.window.document.getElementById('label-offset-x-help-content'));
    panel.element('label-offset-x-help').dispatchEvent(new panel.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await panel.flush();
    assert.equal(offset.classList.contains('editing-mode'), true);
    await panel.input('label-offset-x', '3');
    assert.equal(panel.requests.at(-1)?.operation, 'updateLabelOffsets');
    assert.deepEqual(panel.alerts, []);
  } finally {
    await panel.window.happyDOM.close();
  }
});

async function createPanel(saved?: string, legacy = false) {
  const window = new Window({ url: 'http://localhost:3000/main/index.html' });
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
                arrangeImages: '{"layoutWidth":50}'
              };
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
    await panel.click('label-offset-x-help');
    assert.equal(
      panel.element('label-offset-x-help-content').textContent,
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
