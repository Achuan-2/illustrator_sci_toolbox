export type Corner = 'TL' | 'TR' | 'BL' | 'BR' | 'C';
export type SwapAnchor = Corner | 'TC' | 'LC' | 'RC' | 'BC';
export type Order = 'grid' | 'stacking' | 'horizontal' | 'vertical';
export type Direction = 'horizontal' | 'vertical';
export type AlignmentMode =
  | 'left'
  | 'horizontalCenter'
  | 'right'
  | 'center'
  | 'top'
  | 'verticalCenter'
  | 'bottom';
export type DistributionMode = Exclude<AlignmentMode, 'center'>;
export type SizeMode = 'original' | 'auto' | 'custom';

/** Argument order matches the existing Illustrator algorithms. */
export interface HostArguments {
  arrangeImages: [
    number,
    number,
    number,
    boolean,
    number,
    boolean,
    number,
    Order,
    boolean,
    boolean,
    boolean,
    number,
    SizeMode
  ];
  copyRelativePosition: [Corner, Order, boolean, boolean];
  pasteRelativePosition: [
    string,
    boolean,
    Corner,
    Order,
    boolean,
    number | null,
    number | null,
    boolean,
    boolean
  ];
  copySize: [];
  pasteSize: [number, number, boolean, boolean];
  addBorder: [string, number, number, boolean];
  addLabelsToImages: [
    string,
    number,
    boolean,
    number,
    number,
    string,
    string,
    Order,
    boolean,
    number,
    number
  ];
  updateLabelIndex: [
    string,
    number,
    boolean,
    string,
    string,
    Order,
    boolean,
    number
  ];
  updateLabelOffsets: [number, number, number];
  filterTextFrames: [];
  filterSelection: ['textOnly' | 'excludeText'];
  swapSelectedPositions: [SwapAnchor];
  distributeSpacing: [Direction];
  alignObjects: [AlignmentMode];
  distributeObjects: [DistributionMode];
  copySpacing: [Direction];
  pasteSpacing: [Direction, number, boolean];
  inspectZoomTarget: [];
  applyZoomImages: [string];
  cancelZoomTarget: [];
  syncZoomTracker: [];
}

export type HostOperation = keyof HostArguments;
export type HostResponse =
  { ok: true; data: string } | { ok: false; error: string; args: string[] };
export const hostNamespace = 'com.example.achuanPlugin';
