import type { CEP_Config } from 'vite-cep-plugin';
import { version } from './package.json';

const config: CEP_Config = {
  version,
  id: 'com.achuan-2.illustrator_sci_toolbox',
  displayName: 'SCI Toolbox',
  symlink: 'local',
  port: 3000,
  servePort: 5000,
  startingDebugPort: 8088,
  extensionManifestVersion: 6,
  // CC 2018 is the first Illustrator with CEP 8 / Chromium 57 (native Proxy).
  requiredRuntimeVersion: 8,
  hosts: [{ name: 'ILST', version: '[22.0,99.9]' }],
  type: 'Panel',
  parameters: [
    '--enable-nodejs',
    '--mixed-context',
    '--allow-file-access-from-files'
  ],
  width: 500,
  height: 300,
  minWidth: 200,
  minHeight: 150,
  maxWidth: 2000,
  maxHeight: 2000,
  iconNormal: './icons/light.png',
  iconDarkNormal: './icons/dark.png',
  iconNormalRollOver: './icons/light.png',
  iconDarkNormalRollOver: './icons/dark.png',
  panels: [
    {
      name: 'main',
      id: 'com.achuan-2.illustrator_sci_toolbox.panel',
      mainPath: './main/index.html',
      panelDisplayName: 'SCI Toolbox',
      autoVisible: true
    },
    {
      name: 'zoom',
      id: 'com.achuan-2.illustrator_sci_toolbox.zoom',
      mainPath: './main/index.html',
      panelDisplayName: '制作放大图',
      autoVisible: true,
      type: 'Modeless',
      width: 1150,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      maxWidth: 2560,
      maxHeight: 1600
    }
  ],
  build: { sourceMap: true, jsxBin: 'off' },
  zxp: {
    country: 'CN',
    province: 'Shanghai',
    org: 'Achuan-2',
    // Bolt generates a self-signed certificate. This is not an account credential.
    password: 'sci-toolbox-build',
    tsa: ['http://timestamp.digicert.com/', 'http://timestamp.apple.com/ts01'],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: 'off'
  },
  installModules: [],
  copyAssets: ['icons', 'js/i18n/en.json', 'js/i18n/zh_CN.json']
};

export default config;
