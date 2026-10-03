import { get } from 'svelte/store';
import { settings } from '../stores/settings';
import { workspace } from '../stores/workspace';
import { t } from '../i18n';
import { bridge, HostError } from './bridge';
import type {
  AlignmentMode,
  Direction,
  DistributionMode,
  SwapAnchor
} from '../../shared/host';

const number = (value: unknown, fallback = 0): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const fail = (key: string): never => {
  throw new HostError(key);
};

/** All click and live-edit handlers finish here; rejected promises never leak. */
async function run(task: () => Promise<void>, quiet = false): Promise<void> {
  try {
    await task();
  } catch (error) {
    const translate = get(t);
    const message =
      error instanceof HostError
        ? translate('errors.prefix') + translate(error.key, error.args)
        : translate('errors.prefix') +
          translate('errors.details', [String(error)]);
    if (quiet) console.error(message);
    else window.alert(message);
  }
}

async function copyPosition(): Promise<void> {
  const w = get(workspace);
  const result = await bridge.call(
    'copyRelativePosition',
    w.relativeCorner,
    w.relativeOrder,
    w.reverseMove,
    w.useArtboardRef
  );
  let data:
    | { abs?: boolean; x?: number; y?: number }
    | { deltaX: number; deltaY: number }[];
  try {
    data = JSON.parse(result);
  } catch (error) {
    throw new HostError('errors.parsePosition', { message: String(error) });
  }
  workspace.update((value) => {
    const next = {
      ...value,
      copiedPosition: result,
      relativeCount: 0,
      deltaX: '0.00',
      deltaY: '0.00'
    };
    if (!Array.isArray(data) && data.abs) {
      next.deltaX = Number(data.x).toFixed(2);
      next.deltaY = Number(data.y).toFixed(2);
    } else if (Array.isArray(data) && data.length === 1) {
      next.deltaX = Number(data[0].deltaX).toFixed(2);
      next.deltaY = (-Number(data[0].deltaY)).toFixed(2);
    } else if (Array.isArray(data) && data.length > 1) {
      next.deltaX = '';
      next.deltaY = '';
      next.relativeCount = data.length;
    }
    return next;
  });
}

async function pastePosition(): Promise<void> {
  const w = get(workspace);
  const override = w.deltaX.trim() !== '' && w.deltaY.trim() !== '';
  const x = override ? parseFloat(w.deltaX) : null;
  const y = override ? -parseFloat(w.deltaY) : null;
  if (override && (!Number.isFinite(x) || !Number.isFinite(y)))
    fail('errors.invalidDelta');
  if (!override && w.copiedPosition === '[]') fail('errors.noCopiedPosition');
  await bridge.call(
    'pasteRelativePosition',
    w.copiedPosition,
    w.reverseMove,
    w.relativeCorner,
    w.relativeOrder,
    w.reverseMove,
    x,
    y,
    w.allowMismatchPaste,
    w.useArtboardRef
  );
}

async function arrange(): Promise<void> {
  const w = get(workspace);
  const custom = w.sizeMode === 'custom';
  if (custom && w.useUniformWidth && w.uniformWidth < 0)
    fail('errors.uniformWidth');
  if (custom && w.useUniformHeight && w.uniformHeight < 0)
    fail('errors.uniformHeight');
  const result = await bridge.call(
    'arrangeImages',
    Math.floor(number(w.columns, 1)) || 1,
    number(w.rowGap, 10),
    number(w.colGap, 10),
    custom && w.useUniformWidth,
    number(w.uniformWidth),
    custom && w.useUniformHeight,
    number(w.uniformHeight),
    w.arrangeOrder,
    w.arrangeReverseOrder,
    w.autoLayout,
    w.alignEdges,
    number(w.layoutWidth),
    w.sizeMode
  );
  if (result.startsWith('{')) {
    const info = JSON.parse(result);
    if (typeof info.layoutWidth === 'number')
      workspace.update((value) => ({
        ...value,
        layoutWidth: info.layoutWidth
      }));
  }
}

async function copySize(): Promise<void> {
  const result = await bridge.call('copySize');
  let size: { width: number; height: number };
  try {
    size = JSON.parse(result);
  } catch (error) {
    throw new HostError('errors.parseSize', { message: String(error) });
  }
  workspace.update((value) => ({
    ...value,
    sizeW: Number(Number(size.width).toFixed(3)),
    sizeH: Number(Number(size.height).toFixed(3))
  }));
}

async function pasteSize(): Promise<void> {
  const w = get(workspace);
  if (
    (w.useSizeW && !Number.isFinite(w.sizeW)) ||
    (w.useSizeH && !Number.isFinite(w.sizeH))
  )
    fail('errors.invalidSize');
  if (!w.useSizeW && !w.useSizeH) fail('errors.selectDimension');
  await bridge.call(
    'pasteSize',
    number(w.sizeW),
    number(w.sizeH),
    w.useSizeW,
    w.useSizeH
  );
}

async function addLabels(): Promise<void> {
  const s = get(settings),
    w = get(workspace);
  const start = Math.floor(number(w.labelStartCount, 1)) || 1;
  const session = Date.now();
  const result = await bridge.call(
    'addLabelsToImages',
    s.fontFamily,
    number(s.fontSize, 8),
    s.fontBold,
    number(s.labelOffsetX),
    number(s.labelOffsetY),
    s.labelTemplate,
    s.fontColor,
    s.labelsOrder,
    s.labelsReverseOrder,
    start,
    session
  );
  workspace.update((value) => ({
    ...value,
    labelSession: session,
    labelEditing: true,
    labelHistory: [...value.labelHistory, start],
    labelStartCount: s.autoUpdateIndex ? parseInt(result) || start : start
  }));
}

async function updateLabels(): Promise<void> {
  const s = get(settings),
    w = get(workspace);
  const start = Math.floor(number(w.labelStartCount, 1)) || 1;
  const result = await bridge.call(
    'updateLabelIndex',
    s.fontFamily,
    number(s.fontSize, 8),
    s.fontBold,
    s.labelTemplate,
    s.fontColor,
    s.labelsOrder,
    s.labelsReverseOrder,
    start
  );
  const count = parseInt(result.split('|')[1]);
  if (
    s.autoUpdateIndex &&
    result.startsWith('Success|') &&
    Number.isFinite(count)
  ) {
    workspace.update((value) => ({
      ...value,
      labelStartCount: start + count,
      labelHistory: [...value.labelHistory, start + count]
    }));
  }
}

function undoLabelIndex(): void {
  workspace.update((value) => {
    const history =
      value.labelHistory.length > 1
        ? value.labelHistory.slice(0, -1)
        : value.labelHistory;
    return {
      ...value,
      labelHistory: history,
      labelStartCount: history[history.length - 1]
    };
  });
}

async function filterText(): Promise<void> {
  const result = await bridge.call('filterTextFrames');
  if (result === 'Success|0') fail('errors.noTextFrames');
}

async function copySpacing(direction: Direction): Promise<void> {
  const result = await bridge.call('copySpacing', direction);
  const spacing = Number(Number(result).toFixed(3));
  workspace.update((value) => ({
    ...value,
    [direction === 'horizontal' ? 'spacingHorizontal' : 'spacingVertical']:
      spacing
  }));
}

async function pasteSpacing(
  direction: Direction,
  anchor: boolean
): Promise<void> {
  const w = get(workspace);
  const value =
    direction === 'horizontal' ? w.spacingHorizontal : w.spacingVertical;
  if (!Number.isFinite(value)) fail('errors.invalidSpacing');
  await bridge.call('pasteSpacing', direction, value, anchor);
}

async function addBorder(): Promise<void> {
  const w = get(workspace);
  if (!Number.isFinite(w.borderThickness) || w.borderThickness <= 0)
    fail('errors.invalidThickness');
  await bridge.call(
    'addBorder',
    w.borderColor,
    w.borderThickness,
    number(w.borderDash),
    w.autoGroupBorder
  );
}

function liveOffsets(): void {
  const w = get(workspace),
    s = get(settings);
  if (!w.labelEditing || w.labelSession === null) return;
  void run(async () => {
    await bridge.call(
      'updateLabelOffsets',
      number(s.labelOffsetX),
      number(s.labelOffsetY),
      w.labelSession!
    );
  }, true);
}

export function offsetInput(
  event: Event,
  key: 'labelOffsetX' | 'labelOffsetY'
): void {
  const input = event.currentTarget as HTMLInputElement;
  settings.update((value) => ({ ...value, [key]: input.valueAsNumber }));
  liveOffsets();
}

export function offsetWheel(
  event: WheelEvent,
  key: 'labelOffsetX' | 'labelOffsetY'
): void {
  if (!get(workspace).labelEditing) return;
  event.preventDefault();
  const delta = (event.deltaY > 0 ? -1 : 1) * (event.shiftKey ? 10 : 1);
  settings.update((value) => ({ ...value, [key]: number(value[key]) + delta }));
  liveOffsets();
}

// Timer ticks must not build up a host queue while preview capture is running.
let zoomSyncPending: Promise<string | void> | undefined;

export const actions = {
  copyPosition: () => run(copyPosition),
  pastePosition: () => run(pastePosition),
  arrange: () => run(arrange),
  copySize: () => run(copySize),
  pasteSize: () => run(pasteSize),
  addLabels: () => run(addLabels),
  updateLabels: () => run(updateLabels),
  undoLabelIndex,
  filterText: () => run(filterText),
  filterSelection: (mode: 'textOnly' | 'excludeText') =>
    run(async () => {
      await bridge.call('filterSelection', mode);
    }),
  swap: (anchor: SwapAnchor) =>
    run(async () => {
      await bridge.call('swapSelectedPositions', anchor);
    }),
  distribute: (direction: Direction) =>
    run(async () => {
      await bridge.call('distributeSpacing', direction);
    }),
  alignObjects: (mode: AlignmentMode) =>
    run(async () => {
      await bridge.call('alignObjects', mode);
    }),
  distributeObjects: (mode: DistributionMode) =>
    run(async () => {
      await bridge.call('distributeObjects', mode);
    }),
  copySpacing: (direction: Direction) => run(() => copySpacing(direction)),
  pasteSpacing: (direction: Direction, anchor: boolean) =>
    run(() => pasteSpacing(direction, anchor)),
  addBorder: () => run(addBorder),
  inspectZoom: async () => {
    const resultStr = await bridge.call('inspectZoomTarget');
    let data: any;
    try {
      data = JSON.parse(resultStr);
    } catch (err) {
      fail('errors.zoomCaptureFailed');
    }
    let previewDataUrl = data.previewDataUrl || '';
    if (!previewDataUrl && data.previewPath) {
      try {
        const win =
          typeof window !== 'undefined'
            ? (window as unknown as { require?: (mod: string) => any })
            : undefined;
        if (win && typeof win.require === 'function') {
          const fs = win.require('fs');
          if (fs && fs.existsSync(data.previewPath)) {
            const buf = fs.readFileSync(data.previewPath);
            previewDataUrl = `data:${data.previewMimeType || 'image/png'};base64,${buf.toString('base64')}`;
            // Direct previews reference the user's linked file; only generated
            // temporary PNGs belong to the plugin and can be removed.
            if (data.previewIsTemporary !== false) {
              try {
                fs.unlinkSync(data.previewPath);
              } catch {}
            }
          }
        }
      } catch {}
      if (!previewDataUrl) {
        previewDataUrl = `file:///${data.previewPath.replace(/\\/g, '/')}`;
      }
    }
    if (!previewDataUrl) fail('errors.zoomCaptureFailed');
    return {
      sourceWidth: data.sourceWidth || 100,
      sourceHeight: data.sourceHeight || 100,
      previewDataUrl,
      existingEntries: data.existingEntries || [],
      manualRect: data.manualRect || null,
      sourceScalebar: data.sourceScalebar || null
    };
  },
  applyZoom: async (payload: {
    entries: any[];
    deletedKeys: string[];
  }): Promise<void> => {
    await bridge.call('applyZoomImages', JSON.stringify(payload));
  },
  cancelZoomTarget: async (): Promise<void> => {
    await bridge.call('cancelZoomTarget').catch(() => {
      // Quiet background cleanup
    });
  },
  syncZoom: () => {
    if (!get(settings).zoomAutoUpdate) return Promise.resolve();
    if (!zoomSyncPending) {
      zoomSyncPending = bridge
        .call('syncZoomTracker')
        .catch(() => {
          // Quiet background sync
        })
        .finally(() => {
          zoomSyncPending = undefined;
        });
    }
    return zoomSyncPending;
  }
};
