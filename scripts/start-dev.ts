import fs from 'node:fs';
import path from 'node:path';
import { build, createServer } from 'vite';
import cepConfig from '../cep.config';
import { developmentReloadPath, developmentStatusPath } from './development-panel';

const origin = `http://127.0.0.1:${cepConfig.port}`;
const normalizePath = (value: string) => {
  const normalized = path.resolve(value).replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};
const root = normalizePath('src/js');

async function reuseDevelopmentServer(): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(origin + developmentStatusPath, {
      signal: AbortSignal.timeout(1500)
    });
  } catch {
    return false;
  }
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('application/json')
  )
    throw new Error(`Port ${cepConfig.port} is occupied by another service`);
  const status = (await response.json()) as { root?: string };
  if (typeof status.root !== 'string' || normalizePath(status.root) !== root)
    throw new Error(`Port ${cepConfig.port} is occupied by another project`);
  const reload = await fetch(origin + developmentReloadPath, {
    method: 'POST',
    signal: AbortSignal.timeout(1500)
  });
  if (!reload.ok) throw new Error('Could not refresh the development panel');
  console.log(`Reused development server at ${origin}; refreshed connected panels.`);
  return true;
}

async function startDevelopmentServer(): Promise<void> {
  // Bootstrap the manifest/assets on the first pnpm dev, without requiring a build first.
  if (!fs.existsSync('dist/cep/CSXS/manifest.xml')) {
    const nodeEnv = process.env.NODE_ENV;
    try {
      await build();
    } finally {
      // Vite build sets NODE_ENV=production; serving must still enable Svelte HMR.
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
    }
  }
  if (await reuseDevelopmentServer()) return;
  const server = await createServer();
  await server.listen();
  server.printUrls();
  server.bindCLIShortcuts({ print: true });
}

await startDevelopmentServer();
