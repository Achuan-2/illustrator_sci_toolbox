import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { startZoomTracking } from '../src/js/services/zoomTracking.ts';

const prefix = 'com.adobe.illustrator.events.';
function adapter() {
  const listeners = new Map<string, (event: unknown) => void>();
  const dispatched: { type: string; data: string }[] = [];
  return {
    listeners,
    dispatched,
    evalScript() {},
    getSystemPath: () => '',
    dispatchEvent(event: { type: string; data: string }) {
      dispatched.push(event);
    },
    addEventListener(type: string, callback: (event: unknown) => void) {
      listeners.set(type, callback);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    }
  };
}
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

test('an unavailable native adapter falls back to selection checks and disposes cleanly', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const cep = adapter();
  const calls: boolean[] = [];
  const tracker = startZoomTracking(cep, async (invalidate) => {
    calls.push(invalidate);
  });
  assert.equal(
    calls.length,
    0,
    'Loading the panel does not immediately call Illustrator'
  );
  t.mock.timers.tick(400);
  await settle();
  assert.deepEqual(calls, [false]);
  tracker.refresh();
  t.mock.timers.tick(0);
  await settle();
  assert.deepEqual(calls, [false, true]);
  tracker.dispose();
  t.mock.timers.tick(60000);
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(cep.listeners.size, 0);
});

test('native adapter replaces idle polling, filters events, and removes native subscriptions', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const window = new Window();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'DOMParser');
  Object.defineProperty(globalThis, 'DOMParser', {
    configurable: true,
    value: window.DOMParser
  });
  const cep = adapter();
  const calls: boolean[] = [];
  const tracker = startZoomTracking(cep, async (invalidate) => {
    calls.push(invalidate);
  });
  try {
    assert.equal(cep.dispatched[0].type, prefix + 'PingRequestEvent');
    cep.listeners.get(prefix + 'PingResponseEvent')!({});
    t.mock.timers.tick(0);
    await settle();
    assert.deepEqual(
      calls,
      [false],
      'Ready only reads the current selection baseline'
    );
    t.mock.timers.tick(60000);
    await settle();
    assert.equal(calls.length, 1, 'Native mode makes no idle host requests');
    const event = cep.listeners.get(prefix + 'CppEvent')!;
    event({ data: '<event id="AI Document Opened Notifier"/>' });
    t.mock.timers.tick(1000);
    await settle();
    assert.equal(calls.length, 1, 'Opening a document does not synchronize it');
    event({
      data: '<![CDATA[<event id="AI Art Selection Changed Notifier"/>]]>'
    });
    event({ data: '<event id="AI Art Selection Changed Notifier"/>' });
    t.mock.timers.tick(0);
    await settle();
    assert.equal(calls.length, 2, 'Burst events share one selection check');
  } finally {
    tracker.dispose();
    if (original) Object.defineProperty(globalThis, 'DOMParser', original);
    else Reflect.deleteProperty(globalThis, 'DOMParser');
    await window.happyDOM.close();
  }
  assert.equal(
    cep.dispatched.filter(
      (event) => event.type === prefix + 'RemoveEventListener'
    ).length,
    3
  );
});

test('events during a host request coalesce and deferred foreground work is retried', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const cep = adapter();
  let calls = 0;
  let finish: (value: string) => void = () => {};
  const tracker = startZoomTracking(cep, () => {
    calls++;
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  });
  tracker.refresh();
  t.mock.timers.tick(0);
  tracker.refresh();
  tracker.refresh();
  t.mock.timers.tick(2000);
  assert.equal(calls, 1);
  finish('RETRY');
  await settle();
  t.mock.timers.tick(120);
  await settle();
  assert.equal(calls, 2);
  tracker.dispose();
  finish('OK');
  await settle();
  t.mock.timers.tick(60000);
  assert.equal(calls, 2);
});
