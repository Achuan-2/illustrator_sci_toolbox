import type { Language } from '../stores/settings';

export type Dictionary = Record<string, string>;
export type TranslationParams = Record<string, unknown> | string[];

export function translate(
  language: Language,
  dictionaries: Record<Language, Dictionary>,
  key: string,
  params: TranslationParams = {}
): string {
  const value = dictionaries[language]?.[key] || dictionaries.en[key] || key;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => {
    const item = (params as Record<string, unknown>)[name];
    return item === undefined ? match : String(item);
  });
}

export function parseHostError(result: string): {
  error: string;
  args: string[];
} {
  const parts = result.replace(/^Error:\s*/, '').split('|');
  return {
    error: parts.shift() || 'errors.script',
    args: parts.map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
  };
}
