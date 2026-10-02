import { writable } from 'svelte/store';
import type { Corner, Order, SizeMode } from '../../shared/host';

export interface Workspace {
  deltaX: string;
  deltaY: string;
  copiedPosition: string;
  relativeCount: number;
  relativeCorner: Corner;
  relativeOrder: Order;
  reverseMove: boolean;
  allowMismatchPaste: boolean;
  useArtboardRef: boolean;
  columns: number;
  rowGap: number;
  colGap: number;
  autoLayout: boolean;
  alignEdges: boolean;
  layoutWidth: number;
  sizeMode: SizeMode;
  uniformWidth: number;
  uniformHeight: number;
  useUniformWidth: boolean;
  useUniformHeight: boolean;
  arrangeOrder: Order;
  arrangeReverseOrder: boolean;
  spacingHorizontal: number;
  spacingVertical: number;
  sizeW: number;
  sizeH: number;
  useSizeW: boolean;
  useSizeH: boolean;
  borderColor: string;
  borderThickness: number;
  borderDash: number;
  autoGroupBorder: boolean;
  labelStartCount: number;
  labelHistory: number[];
  labelSession: number | null;
  labelEditing: boolean;
}

export const workspace = writable<Workspace>({
  deltaX: '0',
  deltaY: '0',
  copiedPosition: '[]',
  relativeCount: 0,
  relativeCorner: 'TL',
  relativeOrder: 'grid',
  reverseMove: false,
  allowMismatchPaste: false,
  useArtboardRef: false,
  columns: 1,
  rowGap: 1,
  colGap: 1,
  autoLayout: false,
  alignEdges: false,
  layoutWidth: 0,
  sizeMode: 'original',
  uniformWidth: 100,
  uniformHeight: 100,
  useUniformWidth: true,
  useUniformHeight: true,
  arrangeOrder: 'grid',
  arrangeReverseOrder: false,
  spacingHorizontal: 0,
  spacingVertical: 0,
  sizeW: 0,
  sizeH: 0,
  useSizeW: true,
  useSizeH: true,
  borderColor: '#000000',
  borderThickness: 1,
  borderDash: 0,
  autoGroupBorder: true,
  labelStartCount: 1,
  labelHistory: [1],
  labelSession: null,
  labelEditing: false
});

export function labelPreview(template: string, start: number): string {
  const alphabet = template.includes('A')
    ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    : 'abcdefghijklmnopqrstuvwxyz';
  const index = Math.max(1, Math.floor(start || 1)) - 1;
  const letter = alphabet[index % alphabet.length];
  return template.startsWith('(')
    ? `(${letter})`
    : template.endsWith(')')
      ? `${letter})`
      : letter;
}

export function exitLabelEditing(): void {
  workspace.update((value) => ({ ...value, labelEditing: false }));
}
