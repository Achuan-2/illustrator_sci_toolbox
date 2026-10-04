import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { build, createServer } from 'vite';
import { panelEntryRedirect } from '../scripts/panel-entry.ts';
import {
  developmentPanel,
  developmentReloadPath,
  developmentStatusPath
} from '../scripts/development-panel.ts';

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
    const response = await fetchLocal(`${origin}/?preview=true`, {
      redirect: 'manual'
    });
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('location'),
      '/main/index.html?preview=true'
    );
    const entry = await fetchLocal(`${origin}/`);
    assert.equal(entry.status, 200);
    assert.match(await entry.text(), /id="root"/);
    const missing = await fetchLocal(`${origin}/missing.html`, {
      redirect: 'manual'
    });
    assert.equal(missing.status, 404);
  } finally {
    await server.close();
  }
});

test('build preserves HMR, packaging stays static, and locale changes refresh connected panels', { timeout: 15000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sci-development-panel-'));
  const root = path.join(directory, 'src');
  const outDir = path.join(directory, 'dist');
  const entry = path.join(outDir, 'main/index.html');
  const locale = path.join(root, 'i18n/zh_CN.json');
  fs.mkdirSync(path.join(root, 'main'), { recursive: true });
  fs.mkdirSync(path.dirname(locale), { recursive: true });
  fs.writeFileSync(path.join(root, 'main/index.html'), '<html><body>Static panel</body></html>');
  fs.writeFileSync(locale, '{"title":"Original translation"}');

  const buildPanel = (development: boolean) => build({
    configFile: false,
    root,
    logLevel: 'silent',
    plugins: [developmentPanel(3000, development)],
    build: { outDir, emptyOutDir: true, rollupOptions: { input: path.join(root, 'main/index.html') } }
  });
  const server = await createServer({
    configFile: false,
    root,
    cacheDir: path.join(directory, 'cache'),
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [developmentPanel(3000, true)],
    build: { outDir },
    server: { host: '127.0.0.1', port: 0, watch: null }
  });
  let socket: WebSocket | undefined;
  try {
    await server.listen();
    const address = server.httpServer!.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    const status = await fetchLocal(origin + developmentStatusPath);
    assert.deepEqual(await status.json(), { root: root.replace(/\\/g, '/') });

    await buildPanel(true);
    let destination = '';
    const html = fs.readFileSync(entry, 'utf8');
    vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)![1], {
      location: { search: '?session=zoom', hash: '#zoom-window', replace: (url: string) => { destination = url; } }
    });
    assert.equal(destination, 'http://localhost:3000/main/index.html?session=zoom#zoom-window');

    await buildPanel(false);
    assert.match(fs.readFileSync(entry, 'utf8'), /Static panel/);
    assert.doesNotMatch(fs.readFileSync(entry, 'utf8'), /localhost|location\.replace/);

    socket = new WebSocket(`${origin.replace('http:', 'ws:')}/?token=${server.config.webSocketToken}`, 'vite-hmr');
    await nextMessage(socket, 'connected');
    const reload = nextMessage(socket, 'full-reload');
    const response = await fetchLocal(origin + developmentReloadPath, { method: 'POST' });
    assert.equal(response.status, 204);
    await reload;
    assert.equal(fs.readFileSync(entry, 'utf8'), html, 'Reusing a running server restores the development entry after packaging');

    const localeUrl = `${origin}/i18n/zh_CN.json?import`;
    assert.match(await (await fetchLocal(localeUrl)).text(), /Original translation/);
    const localeReload = nextMessage(socket, 'full-reload');
    fs.writeFileSync(locale, '{"title":"Updated translation"}');
    server.watcher.emit('change', locale);
    await localeReload;
    assert.match(await (await fetchLocal(localeUrl)).text(), /Updated translation/);
  } finally {
    socket?.close();
    await server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function fetchLocal(url: string, options: RequestInit = {}): Promise<Response> {
  // Ephemeral ports can be reused between tests; do not reuse a closed server's socket.
  return fetch(url, { ...options, headers: { Connection: 'close' } });
}

function nextMessage(socket: WebSocket, type: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error(`Timed out waiting for Vite ${type}`));
    }, 5000);
    const onMessage = (event: MessageEvent) => {
      if (JSON.parse(String(event.data)).type !== type) return;
      clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
      resolve();
    };
    socket.addEventListener('message', onMessage);
  });
}
