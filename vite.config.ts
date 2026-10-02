import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { cep, runAction, type CepOptions } from 'vite-cep-plugin';
import cepConfig from './cep.config';
import { buildExtendScript, hostSources, isHostSource } from './vite.es.config';

const outDir = path.resolve('dist/cep');
const isMetaPackage = process.env.ZIP_PACKAGE === 'true';
const isPackage = isMetaPackage || process.env.ZXP_PACKAGE === 'true';
const isCheck = process.env.SCI_CHECK === 'true';

const options: CepOptions = {
  cepConfig,
  dir: path.resolve('dist'),
  cepDist: 'cep',
  isProduction: process.env.NODE_ENV === 'production',
  isPackage,
  isMetaPackage,
  isServe: false,
  debugReact: false,
  zxpOutput: path.resolve(`dist/zxp/SCI-Toolbox-${cepConfig.version}`),
  zipOutput: path.resolve(`dist/zip/SCI-Toolbox-${cepConfig.version}`),
  packages: []
};

if (process.env.BOLT_ACTION) runAction(options, process.env.BOLT_ACTION);

function illustratorScripts(): Plugin {
  return {
    name: 'sci-illustrator-scripts',
    configResolved(config) {
      if (config.command === 'serve')
        fs.mkdirSync(path.join(outDir, 'main'), { recursive: true });
    },
    // Rollup writes assets before Bolt signs the complete extension.
    buildStart() {
      if (!options.isProduction) return;
      buildExtendScript(outDir);
      this.emitFile({
        type: 'asset',
        fileName: 'jsx/index.js',
        source: fs.readFileSync(path.join(outDir, 'jsx/index.js'), 'utf8')
      });
    },
    configureServer(server) {
      buildExtendScript(outDir);
      server.watcher.add(hostSources.map((file) => path.resolve(file)));
    },
    handleHotUpdate({ file, server }) {
      if (!isHostSource(file)) return;
      buildExtendScript(outDir);
      // Reloading reinitializes the host before the next user operation.
      server.ws.send({ type: 'full-reload' });
      return [];
    }
  };
}

export default defineConfig(({ command }) => {
  options.isProduction = command === 'build';
  return {
    root: path.resolve('src/js'),
    // svelte-check loads Vite configuration too; checking must not rewrite
    // the installed panel into a dev-server redirect or register an extension.
    plugins: isCheck
      ? [svelte()]
      : [svelte(), illustratorScripts(), cep(options)],
    server: { host: '127.0.0.1', port: cepConfig.port, strictPort: true },
    build: {
      outDir,
      // This directory is owned by this build; host output is emitted as an asset.
      emptyOutDir: true,
      // Match installed CEP 8 builds; the development toolchain is separate.
      target: 'chrome57',
      sourcemap: !isPackage,
      rollupOptions: {
        input: { main: path.resolve('src/js/main/index.html') },
        output: {
          format: 'cjs',
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js'
        }
      }
    }
  };
});
