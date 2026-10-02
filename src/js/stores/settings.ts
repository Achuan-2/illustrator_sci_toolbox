import { writable } from 'svelte/store';
import type { Order } from '../../shared/host';

export type Language = 'en' | 'zh_CN';
export interface Settings {
  language: Language;
  fontFamily: string;
  fontSize: number;
  fontBold: boolean;
  labelOffsetX: number;
  labelOffsetY: number;
  labelTemplate: string;
  fontColor: string;
  labelsOrder: Order;
  labelsReverseOrder: boolean;
  autoUpdateIndex: boolean;
  zoomLineWidth: number;
  zoomLineColor: string;
  zoomLineStyle: string;
  zoomUseRectangleColor: boolean;
  zoomAddGuideLines: boolean;
  zoomPlacement: string;
  zoomGuideLineExtent: string;
  zoomKeepSquare: boolean;
  zoomAutoUpdate: boolean;
}

export const storageKey = 'illustrator_sci_plugin_settings';
export const defaults: Settings = {
  language: 'en',
  fontFamily: 'ArialMT',
  fontSize: 8,
  fontBold: false,
  labelOffsetX: -6,
  labelOffsetY: -6,
  labelTemplate: 'a',
  fontColor: '#000000',
  labelsOrder: 'grid',
  labelsReverseOrder: false,
  autoUpdateIndex: true,
  zoomLineWidth: 1.5,
  zoomLineColor: '#ff0000',
  zoomLineStyle: 'dash',
  zoomUseRectangleColor: true,
  zoomAddGuideLines: false,
  zoomPlacement: 'right',
  zoomGuideLineExtent: 'acrossImages',
  zoomKeepSquare: true,
  zoomAutoUpdate: true
};

export function normalizeSettings(value: unknown): Settings {
  const result = { ...defaults };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return result;
  const saved = value as Record<string, unknown>;
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    const item = saved[key];
    if (typeof item !== typeof defaults[key]) continue;
    if (typeof item === 'number' && !Number.isFinite(item)) continue;
    Object.assign(result, { [key]: item });
  }
  result.language = result.language === 'zh_CN' ? 'zh_CN' : 'en';
  if (
    !['grid', 'stacking', 'horizontal', 'vertical'].includes(result.labelsOrder)
  )
    result.labelsOrder = defaults.labelsOrder;
  if (!['a', 'A', '(a)', '(A)', 'a)', 'A)'].includes(result.labelTemplate))
    result.labelTemplate = defaults.labelTemplate;
  if (result.fontSize < 1) result.fontSize = defaults.fontSize;
  if (!/^#[0-9a-f]{6}$/i.test(result.fontColor))
    result.fontColor = defaults.fontColor;
  if (!result.fontFamily) result.fontFamily = defaults.fontFamily;
  if (result.zoomLineWidth <= 0) result.zoomLineWidth = defaults.zoomLineWidth;
  if (!/^#[0-9a-f]{6}$/i.test(result.zoomLineColor))
    result.zoomLineColor = defaults.zoomLineColor;
  if (
    !['dash', 'solid', 'dot', 'dashdot', 'dashdotdot', 'original'].includes(
      result.zoomLineStyle
    )
  )
    result.zoomLineStyle = defaults.zoomLineStyle;
  if (!['right', 'left', 'top', 'bottom'].includes(result.zoomPlacement))
    result.zoomPlacement = defaults.zoomPlacement;
  if (
    !['insideSourceImage', 'acrossImages'].includes(result.zoomGuideLineExtent)
  )
    result.zoomGuideLineExtent = defaults.zoomGuideLineExtent;
  return result;
}

export function readSettings(storage: Pick<Storage, 'getItem'>): Settings {
  try {
    return normalizeSettings(JSON.parse(storage.getItem(storageKey) || '{}'));
  } catch {
    return { ...defaults };
  }
}

export const settings = writable<Settings>({ ...defaults });

/** Called once from the mounted app. Unsubscribe on HMR and component teardown. */
export function persistSettings(
  storage: Pick<Storage, 'getItem' | 'setItem'>
): () => void {
  settings.set(readSettings(storage));
  return settings.subscribe((value) => {
    try {
      storage.setItem(storageKey, JSON.stringify(normalizeSettings(value)));
    } catch (error) {
      console.error('Could not save settings', error);
    }
  });
}
