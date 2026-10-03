import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { get } from 'svelte/store';
import {
  defaults,
  normalizeSettings,
  persistSettings,
  readSettings,
  settings,
  storageKey
} from '../src/js/stores/settings.ts';
import { parseHostError, translate } from '../src/js/i18n/translate.ts';
import { labelPreview } from '../src/js/stores/workspace.ts';

const dictionaries = {
  en: JSON.parse(fs.readFileSync('src/js/i18n/en.json', 'utf8')),
  zh_CN: JSON.parse(fs.readFileSync('src/js/i18n/zh_CN.json', 'utf8'))
};

test('translation keys, placeholders and all static component/host references match', () => {
  assert.deepEqual(
    Object.keys(dictionaries.en).sort(),
    Object.keys(dictionaries.zh_CN).sort()
  );
  for (const key of Object.keys(dictionaries.en)) {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(
      placeholders(dictionaries.en[key]),
      placeholders(dictionaries.zh_CN[key]),
      key
    );
  }
  const sources =
    fs
      .readdirSync('src/js/components')
      .map((file) => fs.readFileSync(`src/js/components/${file}`, 'utf8'))
      .join('\n') +
    fs.readFileSync('src/jsx/ilst/arrange.jsx', 'utf8') +
    fs.readFileSync('src/jsx/ilst/paletteFill.jsx', 'utf8') +
    fs.readFileSync('src/jsx/ilst/pseudocolorLayers.jsx', 'utf8') +
    fs.readFileSync('src/js/services/actions.ts', 'utf8');
  const references = [
    ...sources.matchAll(/(?:\$t|fail|sciError)\(['"]([^'"]+)['"]/g)
  ].map((match) => match[1]);
  for (const key of references)
    assert.ok(dictionaries.en[key], `Missing key: ${key}`);
});

test('default English, legacy settings and malformed storage normalize safely', () => {
  for (const saved of [
    null,
    '{}',
    '{broken',
    'null',
    '{"language":"fr"}',
    '{"fontSize":12}'
  ]) {
    assert.equal(readSettings({ getItem: () => saved }).language, 'en');
  }
  assert.equal(normalizeSettings({ fontSize: 12 }).fontSize, 12);
  assert.equal(normalizeSettings({}).pseudocolorKeepOriginal, false);
  const migrated = normalizeSettings({ pseudocolorKeepOriginal: true, pseudocolorLut: 'blue', pseudocolorResolution: 150 });
  assert.equal(migrated.pseudocolorKeepOriginal, false);
  assert.equal(migrated.pseudocolorLut, 'blue');
  assert.equal('pseudocolorResolution' in migrated, false);
  const oldPixelSettings = normalizeSettings({ pseudocolorMethod: 'pixels', pseudocolorLut: 'fire', pseudocolorInverted: true });
  assert.equal(oldPixelSettings.pseudocolorLut, 'red');
  assert.equal('pseudocolorMethod' in oldPixelSettings, false);
  assert.equal('pseudocolorInverted' in oldPixelSettings, false);
  assert.equal(
    normalizeSettings({ fontSize: null }).fontSize,
    defaults.fontSize
  );
});

test('language, zero offsets and false values survive persistence and reopening', () => {
  const stored = new Map<string, string>();
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value);
    }
  };
  const dispose = persistSettings(storage);
  settings.update((value) => ({
    ...value,
    language: 'zh_CN',
    labelOffsetX: 0,
    labelOffsetY: 0,
    fontBold: false,
    autoUpdateIndex: false,
    zoomAutoUpdate: false
  }));
  dispose();
  const reopened = readSettings(storage);
  assert.equal(reopened.language, 'zh_CN');
  assert.equal(reopened.labelOffsetX, 0);
  assert.equal(reopened.labelOffsetY, 0);
  assert.equal(reopened.autoUpdateIndex, false);
  assert.equal(reopened.zoomAutoUpdate, false);
  assert.equal(reopened.pseudocolorKeepOriginal, false);
  const saveNewChoice = persistSettings(storage);
  settings.update((value) => ({ ...value, pseudocolorKeepOriginal: true }));
  saveNewChoice();
  assert.equal(readSettings(storage).pseudocolorKeepOriginal, true, 'Explicit Keep Originals choice must survive reloads after migration');
  const saved = stored.get(storageKey);
  settings.set(defaults);
  assert.equal(
    stored.get(storageKey),
    saved,
    'Disposed subscription must not persist later changes'
  );
});

test('switching translations preserves settings and missing Chinese entries fall back', () => {
  settings.set({ ...defaults, labelOffsetX: -12 });
  const partial = { ...dictionaries, zh_CN: { ...dictionaries.zh_CN } };
  delete partial.zh_CN['common.copy'];
  assert.equal(translate('zh_CN', partial, 'common.copy'), 'Copy');
  assert.equal(
    translate('zh_CN', dictionaries, 'relative.multipleValues', { count: 2 }),
    '多个值（2）'
  );
  assert.equal(get(settings).labelOffsetX, -12);
});

test('encoded host errors retain separators, Unicode and newline arguments', () => {
  const detail = '包含 |、% 和换行\n的消息';
  const error = parseHostError(
    `Error: errors.addLabel|2|${encodeURIComponent(detail)}`
  );
  assert.equal(
    translate('zh_CN', dictionaries, error.error, error.args),
    `为第 2 个对象添加标签时出错：${detail}`
  );
});

test('label templates retain wrapping and alphabet rollover', () => {
  assert.equal(labelPreview('a', 27), 'a');
  assert.equal(labelPreview('(A)', 2), '(B)');
  assert.equal(labelPreview('a)', 3), 'c)');
});
