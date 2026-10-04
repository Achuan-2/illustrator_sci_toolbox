import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const filename = `illustrator_sci_toolbox_v${version}`;
const zxpPath = path.resolve(`dist/zxp/${filename}.zxp`);
const zipPath = path.resolve(`dist/zip/${filename}.zip`);
const zxp = fs.readFileSync(zxpPath);
const zip = fs.readFileSync(zipPath);
assert.ok(
  zxp.length > 0 && zip.length > 0,
  'Both release files must be nonempty'
);
assert.deepEqual(
  zip,
  zxp,
  'ZIP must be a byte-for-byte copy of the signed ZXP'
);

const extension = unzipSync(zxp);
for (const file of Object.keys(extension)) {
  assert.ok(
    !file
      .split('/')
      .some((part) => part === '.debug' || part === 'node_modules'),
    `Do not ship development files: ${file}`
  );
}
const manifest = strFromU8(extension['CSXS/manifest.xml']);
assert.ok(
  manifest.includes(`ExtensionBundleVersion="${version}"`),
  'Manifest version must match package.json'
);
assert.ok(
  manifest.includes('com.example.achuanPlugin.panel'),
  'Keep the installed panel ID'
);
assert.match(
  manifest,
  /<Host\s+Name="ILST"\s+Version="\[22\.0,99\.9\]"\s*\/>/,
  'Installer must allow Illustrator CC 2018 and later'
);
assert.match(
  manifest,
  /<RequiredRuntime\s+Name="CSXS"\s+Version="8\.0"\s*\/>/,
  'Installer must allow CEP 8 and later'
);
assert.ok(
  !manifest.includes('<ScriptPath>'),
  'Browser code must not execute as ExtendScript'
);
for (const file of [
  'main/index.html',
  'jsx/index.js',
  'js/i18n/en.json',
  'js/i18n/zh_CN.json'
]) {
  assert.ok(extension[file]?.length, `Missing extension file: ${file}`);
}
const html = strFromU8(extension['main/index.html']);
assert.ok(
  !html.includes('localhost:'),
  'Production must not depend on a dev server'
);
assert.ok(
  !Object.keys(extension).some((file) => file.endsWith('.map')),
  'Do not ship debug source maps'
);

const require = createRequire(import.meta.url);
const pluginDir = path.dirname(require.resolve('vite-cep-plugin'));
const binary = path.join(
  pluginDir,
  'bin',
  process.platform === 'win32' ? 'ZXPSignCmd.exe' : 'ZXPSignCmd'
);
if (process.platform !== 'win32') fs.chmodSync(binary, 0o755);
const verification = spawnSync(binary, ['-verify', zxpPath], {
  encoding: 'utf8'
});
if (verification.error || verification.status !== 0) {
  throw new Error(
    `ZXP signature verification failed: ${verification.error || verification.stderr || verification.stdout}`
  );
}
console.log(verification.stdout.trim());
console.log(`Verified ZIP and ZXP for v${version}`);
