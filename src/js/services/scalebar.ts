export type FovUnit = 'nm' | 'um' | 'mm' | 'cm' | 'm' | 'inch';
export interface ImageFov {
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
export interface ScalebarInspection {
  signature?: string;
  documentKey?: string;
  errorKey?: string;
  token: string;
  fov: ImageFov | null;
  options: ScalebarOptions | null;
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
