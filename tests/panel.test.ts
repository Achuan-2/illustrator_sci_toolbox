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
    assert.equal(
      panel.element('label-offset-x').getAttribute('title'),
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
