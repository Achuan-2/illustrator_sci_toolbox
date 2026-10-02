import { derived } from 'svelte/store';
import { settings } from '../stores/settings';
import { translate, type Dictionary } from './translate';

const modules = import.meta.glob<Dictionary>('./*.json', {
  eager: true,
  import: 'default'
});
// JSON remains editable in the installed extension. Imported copies serve browser preview.
const dictionaries = {
  en: modules['./en.json'],
  zh_CN: modules['./zh_CN.json']
};

export const t = derived(
  settings,
  (value) =>
    (key: string, params: Record<string, unknown> | string[] = {}) =>
      translate(value.language, dictionaries, key, params)
);

export async function loadInstalledTranslations(): Promise<void> {
  if (!window.__adobe_cep__ || location.protocol !== 'file:') return;
  // CEP permits local XHR; fetch(file://) is not supported by all CEF versions.
  const sources = await Promise.allSettled(
    ['en', 'zh_CN'].map(async (locale) => {
      const dictionary = await new Promise<Dictionary>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('GET', `../js/i18n/${locale}.json`);
        request.onload = () => {
          if (request.status !== 0 && request.status !== 200)
            return reject(new Error(`Locale ${locale}: ${request.status}`));
          try {
            resolve(JSON.parse(request.responseText));
          } catch (error) {
            reject(error);
          }
        };
        request.onerror = () =>
          reject(new Error(`Could not read locale ${locale}`));
        request.send();
      });
      return [locale, dictionary] as const;
    })
  );
  for (const source of sources) {
    if (source.status === 'fulfilled')
      Object.assign(dictionaries, { [source.value[0]]: source.value[1] });
  }
  settings.update((value) => ({ ...value }));
}
