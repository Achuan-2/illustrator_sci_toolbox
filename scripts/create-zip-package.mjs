import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function createZipPackage(rootDir = process.cwd()) {
  const { version } = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
  );
  const filename = `illustrator_sci_toolbox_v${version}`;
  const zxpPath = path.join(rootDir, 'dist/zxp', `${filename}.zxp`);
  const zipPath = path.join(path.dirname(zxpPath), `${filename}.zip`);
  // Preserve the signed archive byte-for-byte for manual CEP installation.
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  fs.copyFileSync(zxpPath, zipPath);
  return { zxpPath, zipPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { zipPath } = createZipPackage();
  console.log(`Manual installation ZIP copied from signed ZXP: ${zipPath}`);
}
