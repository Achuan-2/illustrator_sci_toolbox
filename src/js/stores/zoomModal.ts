import { writable } from 'svelte/store';
import type {
  ZoomEntry,
  ZoomLineStyle,
  ZoomPlacement,
  ZoomGuideLineExtent
} from '../services/zoomLayout';
import type { Settings } from './settings';
import type { ImageFov, ScalebarOptions } from '../services/scalebar';

export interface ZoomInspectData {
  sourceFov?: ImageFov | null;
  sourceScalebar?: ScalebarOptions | null;
  sourceWidth: number;
  sourceHeight: number;
  previewDataUrl: string;
  existingEntries: ZoomEntry[];
  manualRect: {
    region: { x: number; y: number; width: number; height: number };
    strokeColor: string;
    strokeWidth: number;
    strokeDash: ZoomLineStyle;
  } | null;
}

export interface ZoomSession {
  data: ZoomInspectData | null;
  settings: Settings;
  timestamp: number;
  error?: string;
}

export interface ZoomModalState {
  sourceFov: ImageFov | null;
  sourceScalebar: ScalebarOptions | null;
  open: boolean;
  sourceWidth: number;
  sourceHeight: number;
  previewDataUrl: string;
  entries: ZoomEntry[];
  deletedKeys: string[];
  activeIndex: number;
  error: string;
}

const initialState: ZoomModalState = {
  sourceFov: null,
  sourceScalebar: null,
  open: false,
  sourceWidth: 100,
  sourceHeight: 100,
  previewDataUrl: '',
  entries: [],
  deletedKeys: [],
  activeIndex: 0,
  error: ''
};

export const ZOOM_EXTENSION_ID = 'com.example.achuanPlugin.zoom';
const SESSION_KEY = 'sci_zoom_session';
let lastSessionTimestamp = 0;

export const zoomModalState = writable<ZoomModalState>({ ...initialState });

function getTempFilePath(): string | null {
  try {
    if (
      typeof window !== 'undefined' &&
      (window as unknown as { require?: (mod: string) => any }).require
    ) {
      const win = window as unknown as { require: (mod: string) => any };
      const os = win.require('os');
      const path = win.require('path');
      return path.join(os.tmpdir(), 'sci_illustrator_zoom_session.json');
    }
  } catch {
    // ignore
  }
  return null;
}

export function isZoomWindow(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__adobe_cep__?.getExtensionId) {
    try {
      if (window.__adobe_cep__.getExtensionId() === ZOOM_EXTENSION_ID) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  if (
    location.hash === '#zoom-window' ||
    location.search.includes('mode=zoom')
  ) {
    return true;
  }
  return false;
}

export function hasZoomExtension(): boolean {
  if (typeof window === 'undefined' || !window.__adobe_cep__?.getExtensions)
    return false;
  try {
    const list = JSON.parse(window.__adobe_cep__.getExtensions()) as Array<{
      id: string;
    }>;
    return list.some((e) => e.id === ZOOM_EXTENSION_ID);
  } catch {
    return false;
  }
}

export function saveZoomSession(
  data: ZoomInspectData | null,
  currentSettings: Settings,
  error = ''
): void {
  lastSessionTimestamp = Math.max(Date.now(), lastSessionTimestamp + 1);
  const session: ZoomSession = {
    data,
    settings: currentSettings,
    timestamp: lastSessionTimestamp,
    error
  };
  const json = JSON.stringify(session);
  try {
    localStorage.setItem(SESSION_KEY, json);
  } catch {
    // localStorage may be full from large image data URL
  }
  try {
    const tmp = getTempFilePath();
    if (
      tmp &&
      (window as unknown as { require?: (mod: string) => any }).require
    ) {
      const win = window as unknown as { require: (mod: string) => any };
      const fs = win.require('fs');
      fs.writeFileSync(tmp, json, 'utf8');
    }
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined' && window.__adobe_cep__?.dispatchEvent) {
      window.__adobe_cep__.dispatchEvent({
        type: 'com.example.achuanPlugin.zoomSessionUpdate',
        scope: 'APPLICATION',
        data: String(session.timestamp)
      });
    }
  } catch {
    // ignore
  }
}

export function loadZoomSession(): ZoomSession | null {
  try {
    const tmp = getTempFilePath();
    if (
      tmp &&
      (window as unknown as { require?: (mod: string) => any }).require
    ) {
      const win = window as unknown as { require: (mod: string) => any };
      const fs = win.require('fs');
      if (fs.existsSync(tmp)) {
        const content = fs.readFileSync(tmp, 'utf8');
        return JSON.parse(content) as ZoomSession;
      }
    }
  } catch {
    // ignore
  }

  try {
    const item = localStorage.getItem(SESSION_KEY);
    if (item) {
      return JSON.parse(item) as ZoomSession;
    }
  } catch {
    // ignore
  }

  return null;
}

export function closeZoomWindow(): void {
  if (typeof window !== 'undefined') {
    try {
      window.__adobe_cep__?.closeExtension?.();
    } catch {
      // fallback
    }
    try {
      if (isZoomWindow()) {
        window.close?.();
      }
    } catch {
      // fallback
    }
  }
  closeZoomModal();
}

export function openZoomModal(
  data: ZoomInspectData,
  currentSettings: Settings
) {
  let entries: ZoomEntry[] = [];
  if (data.existingEntries && data.existingEntries.length > 0) {
    entries = data.existingEntries.map((e) => ({
      ...e,
      preservesLayout: true
    }));
  } else if (data.manualRect) {
    entries = [
      {
        recordKey: null,
        name: '放大图 1',
        region: data.manualRect.region,
        regionRotation: 0,
        strokeColor:
          data.manualRect.strokeColor || currentSettings.zoomLineColor,
        strokeWidth:
          data.manualRect.strokeWidth || currentSettings.zoomLineWidth,
        strokeDash:
          data.manualRect.strokeDash ||
          (currentSettings.zoomLineStyle as ZoomLineStyle),
        useRectangleColor: currentSettings.zoomUseRectangleColor,
        addGuideLines: currentSettings.zoomAddGuideLines,
        placement: currentSettings.zoomPlacement as ZoomPlacement,
        guideLineExtent:
          currentSettings.zoomGuideLineExtent as ZoomGuideLineExtent,
        originalZoomRegion: null,
        originalZoomRotation: 0,
        preservesLayout: false
      }
    ];
  } else {
    entries = [
      {
        recordKey: null,
        name: '放大图 1',
        region: { x: 0, y: 0, width: 0, height: 0 },
        regionRotation: 0,
        strokeColor: currentSettings.zoomLineColor,
        strokeWidth: currentSettings.zoomLineWidth,
        strokeDash: currentSettings.zoomLineStyle as ZoomLineStyle,
        useRectangleColor: currentSettings.zoomUseRectangleColor,
        addGuideLines: currentSettings.zoomAddGuideLines,
        placement: currentSettings.zoomPlacement as ZoomPlacement,
        guideLineExtent:
          currentSettings.zoomGuideLineExtent as ZoomGuideLineExtent,
        originalZoomRegion: null,
        originalZoomRotation: 0,
        preservesLayout: false
      }
    ];
  }

  zoomModalState.set({
    sourceFov: data.sourceFov || null,
    sourceScalebar: data.sourceScalebar || null,
    open: true,
    sourceWidth: data.sourceWidth,
    sourceHeight: data.sourceHeight,
    previewDataUrl: data.previewDataUrl,
    entries: entries.map((entry) => ({
      ...entry,
      scaleLengthUm: entry.scaleLengthUm ?? data.sourceScalebar?.lengthUm ?? null,
      scaleUnit: entry.scaleUnit ?? data.sourceScalebar?.unit ?? 'um'
    })),
    deletedKeys: [],
    activeIndex: 0,
    error: ''
  });
}

export function openZoomLoading(error = '') {
  zoomModalState.set({ ...initialState, open: true, error });
}

export function closeZoomModal() {
  zoomModalState.set({ ...initialState });
}
