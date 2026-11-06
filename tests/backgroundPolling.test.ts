import assert from 'node:assert/strict';
import test from 'node:test';
import { startBackgroundPolling } from '../src/js/services/backgroundPolling.ts';

test('slow native requests do not overlap or catch up, and leave idle time before the next poll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let calls = 0;
  let finish: () => void = () => assert.fail('No pending poll');
  const poller = startBackgroundPolling(() => {
    calls++;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  t.mock.timers.tick(400);
  assert.equal(calls, 1);
  t.mock.timers.tick(1000);
  assert.equal(calls, 1, 'A busy Illustrator cannot accumulate timer requests');
  finish();
  await Promise.resolve();
  t.mock.timers.tick(8999);
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  assert.equal(calls, 2, 'A 1 s request leaves 9 s of host idle time');
  poller.dispose();
  finish();
  await Promise.resolve();
  t.mock.timers.tick(60000);
  assert.equal(
    calls,
    2,
    'Unmounting during a request must not restart polling'
  );
});

test('editor notifications wake a backed-off poller and coalesce while a request runs', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let calls = 0;
  let finish = () => {};
  const poller = startBackgroundPolling(() => {
    calls++;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  poller.refresh();
  t.mock.timers.tick(0);
  assert.equal(calls, 1);
  poller.refresh();
  poller.refresh();
  t.mock.timers.tick(1000);
  assert.equal(calls, 1);
  finish();
  await Promise.resolve();
  t.mock.timers.tick(0);
  assert.equal(calls, 2, 'Only one refresh follows an in-flight request');
  finish();
  await Promise.resolve();
  poller.refresh();
  t.mock.timers.tick(0);
  assert.equal(calls, 3, 'A notification bypasses the scheduled delay');
  poller.dispose();
  finish();
  await Promise.resolve();
});
