export type Corner = 'TL' | 'TR' | 'BL' | 'BR';
export type Order = 'grid' | 'stacking' | 'horizontal' | 'vertical';
export type Direction = 'horizontal' | 'vertical';
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
  swapSelectedPositions: [Corner];
  distributeSpacing: [Direction];
  copySpacing: [Direction];
  pasteSpacing: [Direction, number, boolean];
}

export type HostOperation = keyof HostArguments;
export type HostResponse =
  { ok: true; data: string } | { ok: false; error: string; args: string[] };
export const hostNamespace = 'com.example.achuanPlugin';
