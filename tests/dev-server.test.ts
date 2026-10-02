import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';
import { panelEntryRedirect } from '../scripts/panel-entry.ts';

test('development root redirects to the panel entry and preserves query parameters', async () => {
  const server = await createServer({
    configFile: false,
    root: path.resolve('src/js'),
    cacheDir: path.resolve('.cache/vite-entry-test'),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [panelEntryRedirect()],
    server: { host: '127.0.0.1', port: 0, watch: null },
    appType: 'mpa'
  });
  try {
    await server.listen();
    const address = server.httpServer!.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${origin}/?preview=true`, {
      redirect: 'manual'
    });
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('location'),
      '/main/index.html?preview=true'
    );
    const entry = await fetch(`${origin}/`);
    assert.equal(entry.status, 200);
    assert.match(await entry.text(), /id="root"/);
    const missing = await fetch(`${origin}/missing.html`, {
      redirect: 'manual'
    });
    assert.equal(missing.status, 404);
  } finally {
    await server.close();
  }
});
