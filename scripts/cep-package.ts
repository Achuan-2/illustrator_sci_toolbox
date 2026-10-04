import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { cep, type CepOptions } from 'vite-cep-plugin';
// Use the pinned CEP plugin's signer to retain certificate and TSA behavior.
import { signZXP } from 'vite-cep-plugin/lib/lib/zxp';

export function removePackageExcludedFiles(directory: string): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.name === '.debug' || entry.name === 'node_modules') {
      fs.rmSync(filename, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      removePackageExcludedFiles(filename);
    }
  }
}

/** Copy CEP resources, exclude development files, then sign the final contents. */
export function cepPackage(options: CepOptions): ReturnType<typeof cep> {
  if (!options.isPackage) return cep(options);

  // Bolt signs inside writeBundle, so defer signing until its copies finish.
  const plugin = cep({ ...options, isPackage: false });
  const writeBundle = plugin.writeBundle;
  plugin.writeBundle = async function () {
    await writeBundle.call(this);
    const directory = path.join(options.dir, options.cepDist);
    removePackageExcludedFiles(directory);
    const require = createRequire(import.meta.url);
    const signerTempDir = path.join(
      path.dirname(require.resolve('vite-cep-plugin')),
      '.tmp'
    );
    await signZXP(
      options.cepConfig,
      directory,
      options.zxpOutput,
      signerTempDir
    );
  };
  return plugin;
}
