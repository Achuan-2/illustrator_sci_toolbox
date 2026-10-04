export type FovUnit = 'nm' | 'um' | 'mm' | 'cm' | 'm' | 'inch';
export interface ImageFov {
  // Zero denotes an unknown dimension; each bar requires only its own axis.
  width: number;
  height: number;
  unit: string;
  source?: string;
}
export interface ScalebarOptions {
  orientation: 'horizontal' | 'vertical';
  lengthUm: number;
  unit?: string;
  thickness: number;
  color: string;
  showText: boolean;
  fontColor: string;
  fontSize: number;
  bold: boolean;
  position: 'TL' | 'TR' | 'BL' | 'BR';
  autoGroup: boolean;
}
export interface ScalebarTargetInspection {
  token: string;
  fov: ImageFov | null;
  options: ScalebarOptions | null;
}
export interface ScalebarInspection extends ScalebarTargetInspection {
  signature?: string;
  documentKey?: string;
  errorKey?: string;
  targets?: ScalebarTargetInspection[];
}

export function fovUnit(unit: string): FovUnit {
  const normalized = unit.toLowerCase().replace(/[μµ]/g, 'u');
  if (/^(microns?|micrometers?)$/.test(normalized)) return 'um';
  if (/^(in|inches)$/.test(normalized)) return 'inch';
  return ['nm', 'um', 'mm', 'cm', 'm', 'inch'].includes(normalized)
    ? (normalized as FovUnit)
    : 'um';
}
export function unitFactor(unit: string): number {
  return { nm: 0.001, um: 1, mm: 1000, cm: 10000, m: 1000000, inch: 25400 }[
    fovUnit(unit)
  ];
}
export function unitSymbol(unit: string): string {
  return fovUnit(unit) === 'um' ? 'μm' : fovUnit(unit);
}
export function lengthInUnit(lengthUm: number, unit: string): number {
  return Number((lengthUm / unitFactor(unit)).toPrecision(12));
}
export function maxScalebarLengthUm(
  fov: ImageFov | null,
  orientation: ScalebarOptions['orientation']
): number | undefined {
  if (!fov) return undefined;
  const dimension = orientation === 'vertical' ? fov.height : fov.width;
  return Number.isFinite(dimension) && dimension > 0
    ? dimension * unitFactor(fov.unit) * 0.9
    : undefined;
}
export const defaultScalebar: ScalebarOptions = {
  orientation: 'horizontal',
  lengthUm: 50,
  thickness: 2,
  color: '#ffffff',
  showText: true,
  fontColor: '#ffffff',
  fontSize: 8,
  bold: false,
  position: 'BR',
  autoGroup: true
};

// Image calibration and units belong to the image. Reusable styles retain the
// physical length, while new images choose their own FOV unit for display.
export type ScalebarStyle = Omit<ScalebarOptions, 'unit'>;
export function normalizeScalebarStyle(
  value: unknown,
  fallback: ScalebarStyle = defaultScalebar
): ScalebarStyle {
  const saved =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const result: ScalebarStyle = { ...fallback };
  for (const key of ['lengthUm', 'thickness', 'fontSize'] as const) {
    const item = saved[key];
    if (
      typeof item === 'number' &&
      Number.isFinite(item) &&
      (key === 'lengthUm' ? item >= 0 : item > 0)
    )
      result[key] = item;
  }
  for (const key of ['color', 'fontColor'] as const)
    if (typeof saved[key] === 'string' && /^#[0-9a-f]{6}$/i.test(saved[key]))
      result[key] = saved[key];
  for (const key of ['showText', 'bold', 'autoGroup'] as const)
    if (typeof saved[key] === 'boolean') result[key] = saved[key];
  if (saved.orientation === 'horizontal' || saved.orientation === 'vertical')
    result.orientation = saved.orientation;
  if (['TL', 'TR', 'BL', 'BR'].includes(String(saved.position)))
    result.position = saved.position as ScalebarStyle['position'];
  return result;
}
