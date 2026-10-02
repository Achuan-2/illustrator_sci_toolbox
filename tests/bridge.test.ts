import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { parse } from 'acorn';
import {
  createBridge,
  extensionPath,
  HostError,
  type CepAdapter
} from '../src/js/services/bridge.ts';
import { hostNamespace } from '../src/shared/host.ts';
import { isHostSource } from '../vite.es.config.ts';

const hostSource = fs.readFileSync('dist/cep/jsx/index.js', 'utf8');

test('host file watching accepts Vite paths and Windows drive-letter casing', () => {
  const host = path.resolve('src/jsx/index.ts').replace(/\\/g, '/');
  assert.equal(isHostSource(host), true);
  if (process.platform === 'win32')
    assert.equal(isHostSource(host.toLowerCase()), true);
  assert.equal(isHostSource(path.resolve('src/js/services/bridge.ts')), false);
});

test('complete host output is ES3 and works without native JSON or a document', () => {
  parse(hostSource, { ecmaVersion: 3 });
  const context = vm.createContext({
    $: {},
    app: { documents: [] },
    JSON: undefined
  });
  vm.runInContext(hostSource, context);
  for (const operation of [
    'arrangeImages',
    'copyRelativePosition',
    'pasteRelativePosition',
    'copySize',
    'pasteSize',
    'addLabelsToImages',
    'updateLabelIndex',
    'updateLabelOffsets',
    'filterTextFrames',
    'filterSelection',
    'swapSelectedPositions',
    'distributeSpacing',
    'copySpacing',
    'pasteSpacing',
    'addBorder'
  ]) {
    const result = JSON.parse(
      context.$[hostNamespace].call(operation, '%5B%5D')
    );
    assert.deepEqual(
      result,
      { ok: false, error: 'errors.noDocument', args: [] },
      operation
    );
  }
  assert.equal(
    context.arrangeImages,
    undefined,
    'Host algorithms must not pollute global scope'
  );
  const unknown = JSON.parse(
    context.$[hostNamespace].call('constructor', '%5B%5D')
  );
  assert.equal(
    unknown.ok,
    false,
    'Inherited names cannot become callable operations'
  );
});

test('bridge waits for initialization, serializes requests and continues after an error', async () => {
  const calls: string[] = [];
  let active = 0;
  let maximum = 0;
  let count = 0;
  const cep: CepAdapter = {
    getSystemPath: () => 'file:///D:/a%20b/extension',
    evalScript(script, callback) {
      calls.push(script);
      maximum = Math.max(maximum, ++active);
      setTimeout(() => {
        active--;
        if (script.includes('$.evalFile')) return callback('SCI_READY');
        count++;
        callback(
          JSON.stringify(
            count === 1
              ? { ok: false, error: 'errors.noDocument', args: [] }
              : { ok: true, data: 'Success' }
          )
        );
      }, 1);
    }
  };
  const bridge = createBridge(cep);
  const first = bridge.call('copySize');
  const second = bridge.call('pasteSize', 1, 2, true, true);
  await assert.rejects(
    first,
    (error: HostError) => error.key === 'errors.noDocument'
  );
  assert.equal(await second, 'Success');
  assert.equal(maximum, 1);
  assert.equal(
    calls.filter((script) => script.includes('$.evalFile')).length,
    1
  );
  assert.ok(calls[0].includes('D:/a b/extension/jsx/index.js'));
});

test('quoted, multiline and Unicode inputs cannot escape the serialized payload', async () => {
  const value = 'Arial"; throw new Error("injected"); //\n中文\\font';
  let received: unknown;
  const cep: CepAdapter = {
    getSystemPath: () => 'D:/test',
    evalScript(script, callback) {
      if (script.includes('$.evalFile')) return callback('SCI_READY');
      const context = vm.createContext({
        $: {
          [hostNamespace]: {
            call(operation: string, payload: string) {
              received = {
                operation,
                args: JSON.parse(decodeURIComponent(payload))
              };
              return JSON.stringify({ ok: true, data: '2' });
            }
          }
        }
      });
      callback(vm.runInContext(script, context));
    }
  };
  await createBridge(cep).call(
    'addLabelsToImages',
    value,
    8,
    false,
    0,
    0,
    'a',
    '#000000',
    'grid',
    false,
    1,
    123
  );
  assert.equal((received as { args: unknown[] }).args[0], value);
});

test('host loading failure can be retried and browser preview rejects host operations', async () => {
  let attempt = 0;
  const bridge = createBridge({
    getSystemPath: () => '/extension',
    evalScript: (_script, callback) =>
      callback(++attempt === 1 ? 'SCI_LOAD_ERROR' : 'SCI_READY')
  });
  await assert.rejects(
    bridge.initialize(),
    (error: HostError) => error.key === 'errors.hostLoad'
  );
  await bridge.initialize();
  assert.equal(attempt, 2);
  await assert.rejects(
    createBridge(undefined).call('copySize'),
    (error: HostError) => error.key === 'errors.hostUnavailable'
  );
  assert.equal(
    extensionPath({
      getSystemPath: () => 'file:///Users/me/plugin',
      evalScript() {}
    }),
    '/Users/me/plugin'
  );
});
