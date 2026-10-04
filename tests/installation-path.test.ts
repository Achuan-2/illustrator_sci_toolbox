import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import { createBridge } from '../src/js/services/bridge.ts';
import { hostNamespace } from '../src/shared/host.ts';

const installations = [
  {
    reported:
      'file:///C:/Users/Other/AppData/Roaming/Adobe/CEP/extensions/custom-folder',
    expected:
      'C:/Users/Other/AppData/Roaming/Adobe/CEP/extensions/custom-folder'
  },
  {
    reported:
      'file:///C:/Program%20Files%20(x86)/Common%20Files/Adobe/CEP/extensions/SCI%20Toolbox',
    expected:
      'C:/Program Files (x86)/Common Files/Adobe/CEP/extensions/SCI Toolbox'
  },
  {
    reported:
      'file:///Users/%E5%85%B6%E4%BB%96%E7%94%A8%E6%88%B7/Library/Application%20Support/Adobe/CEP/extensions/toolbox',
    expected:
      '/Users/其他用户/Library/Application Support/Adobe/CEP/extensions/toolbox'
  }
];

for (const installation of installations) {
  test(`zoom loads its bundled host script from ${installation.expected}`, async () => {
    let loadedPath = '';
    let calledOperation = '';
    const context = vm.createContext({
      $: {
        evalFile(filename: string) {
          loadedPath = filename;
        },
        [hostNamespace]: {
          call(operation: string) {
            calledOperation = operation;
            return JSON.stringify({ ok: true, data: '{}' });
          }
        }
      }
    });
    const bridge = createBridge({
      getSystemPath(name) {
        assert.equal(name, 'extension');
        return installation.reported;
      },
      evalScript(script, callback) {
        callback(vm.runInContext(script, context));
      }
    });
    await bridge.call('inspectZoomTarget');
    assert.equal(loadedPath, `${installation.expected}/jsx/index.js`);
    assert.equal(calledOperation, 'inspectZoomTarget');
  });
}
