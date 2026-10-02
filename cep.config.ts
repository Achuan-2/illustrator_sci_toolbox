import type { CEP_Config } from 'vite-cep-plugin';
import { version } from './package.json';

const config: CEP_Config = {
  version,
  id: 'com.example.achuanPlugin',
  displayName: 'SCI Toolbox',
  symlink: 'local',
  port: 3000,
  servePort: 5000,
  startingDebugPort: 8088,
  extensionManifestVersion: 6,
  requiredRuntimeVersion: 11,
  hosts: [{ name: 'ILST', version: '[28.0,99.9]' }],
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
      id: 'com.example.achuanPlugin.panel',
      mainPath: './main/index.html',
      panelDisplayName: 'SCI Toolbox',
      autoVisible: true
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
  copyAssets: ['icons', 'js/i18n/en.json', 'js/i18n/zh_CN.json'],
  copyZipAssets: [
    'README.md',
    'README_EN.md',
    'LICENSE',
    'CHANGELOG.md',
    'docs',
    '开启PlayerDebugMode.reg'
  ]
};

export default config;
