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
  manifest.includes('ExtensionBundleId="com.achuan-2.illustrator_sci_toolbox"'),
  'The installer must use the renamed extension bundle ID'
);
assert.ok(
  manifest.includes('com.achuan-2.illustrator_sci_toolbox.panel'),
  'The package must register the renamed panel ID'
);
assert.match(
  manifest,
  /<Extension\s+Id="com\.achuan-2\.illustrator_sci_toolbox\.zoom"\s+Version="[^"]+"\s*\/>/,
  'The package must register the zoom editor extension'
);
const zoomDispatch = manifest.match(
  /<Extension\s+Id="com\.achuan-2\.illustrator_sci_toolbox\.zoom">([\s\S]*?)<\/Extension>/
)?.[1];
assert.ok(zoomDispatch, 'The package must configure the zoom editor window');
assert.match(
  zoomDispatch,
  /<MainPath>\.\/main\/index\.html<\/MainPath>/,
  'The zoom editor must use the bundled relative HTML entry'
);
assert.match(zoomDispatch, /<Type>Modeless<\/Type>/);
for (const parameter of ['--enable-nodejs', '--mixed-context']) {
  assert.ok(
    zoomDispatch.includes(`<Parameter>${parameter}</Parameter>`),
    `The zoom editor needs ${parameter} for built-in Node APIs and session sharing`
  );
}
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
  !/localhost:|127\.0\.0\.1:|\/@vite\/client/.test(html),
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
