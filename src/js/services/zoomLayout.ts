export type ZoomPlacement = 'right' | 'left' | 'top' | 'bottom';
export type ZoomGuideLineExtent = 'insideSourceImage' | 'acrossImages';
export type ZoomLineStyle =
  | 'dash'
  | 'solid'
  | 'dot'
  | 'dashdot'
  | 'dashdotdot'
  | 'original';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NormalizedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZoomEntry {
  recordKey: string | null;
  name: string;
  region: NormalizedRegion;
  regionRotation: number;
  strokeColor: string;
  strokeWidth: number;
  strokeDash: ZoomLineStyle;
  useRectangleColor: boolean;
  addGuideLines: boolean;
  placement: ZoomPlacement;
  guideLineExtent: ZoomGuideLineExtent;
  originalZoomRegion: NormalizedRegion | null;
  originalZoomRotation: number;
  preservesLayout?: boolean;
  scaleLengthUm?: number | null;
  scaleUnit?: string;
}

export const GAP_POINTS = (0.5 * 72) / 2.54; // ~14.17 points (0.5 cm)

export function rotatePoint(
  point: Point,
  center: Point,
  rotationDegrees: number
): Point {
  const angle = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + (x * cos - y * sin),
    y: center.y + (x * sin + y * cos)
  };
}

/** Corners ordered: TL (0), TR (1), BR (2), BL (3) */
export function getCorners(bounds: Rect, rotationDegrees = 0): Point[] {
  const corners: Point[] = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top + bounds.height },
    { x: bounds.left, y: bounds.top + bounds.height }
  ];
  if (rotationDegrees === 0) return corners;
  const center: Point = {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2
  };
  return corners.map((p) => rotatePoint(p, center, rotationDegrees));
}

export function hasOverlap(
  first: Rect,
  firstRotation: number,
  second: Rect,
  secondRotation: number
): boolean {
  if (
    first.width <= 0 ||
    first.height <= 0 ||
    second.width <= 0 ||
    second.height <= 0
  )
    return false;
  const a = getCorners(first, firstRotation);
  const b = getCorners(second, secondRotation);
  const shapes = [a, b];
  for (let s = 0; s < shapes.length; s++) {
    const corners = shapes[s];
    for (let i = 0; i < 2; i++) {
      let axisX = -(corners[i + 1].y - corners[i].y);
      let axisY = corners[i + 1].x - corners[i].x;
      const length = Math.sqrt(axisX * axisX + axisY * axisY);
      if (length <= 0) return false;
      axisX /= length;
      axisY /= length;
      let aMin = Infinity,
        aMax = -Infinity;
      let bMin = Infinity,
        bMax = -Infinity;
      for (let j = 0; j < 4; j++) {
        const aProj = a[j].x * axisX + a[j].y * axisY;
        const bProj = b[j].x * axisX + b[j].y * axisY;
        aMin = Math.min(aMin, aProj);
        aMax = Math.max(aMax, aProj);
        bMin = Math.min(bMin, bProj);
        bMax = Math.max(bMax, bProj);
      }
      if (Math.min(aMax, bMax) - Math.max(aMin, bMin) <= 0.0001) return false;
    }
  }
  return true;
}

/** Endpoints for 2 guide lines: [start1, end1, start2, end2] */
export function getGuideEndpoints(
  region: Point[],
  zoom: Point[],
  placement: ZoomPlacement
): [Point, Point, Point, Point] {
  switch (placement) {
    case 'left':
      return [region[0], zoom[1], region[3], zoom[2]];
    case 'top':
      return [region[0], zoom[3], region[1], zoom[2]];
    case 'bottom':
      return [region[3], zoom[0], region[2], zoom[1]];
    case 'right':
    default:
      return [region[1], zoom[0], region[2], zoom[3]];
  }
}

function clipEdge(
  direction: number,
  distance: number,
  limits: { first: number; last: number }
): boolean {
  if (Math.abs(direction) < 0.000001) {
    return distance >= 0;
  }
  const ratio = distance / direction;
  if (direction < 0) {
    if (ratio > limits.last) return false;
    limits.first = Math.max(limits.first, ratio);
  } else {
    if (ratio < limits.first) return false;
    limits.last = Math.min(limits.last, ratio);
  }
  return true;
}

export function tryClipLineToRectangle(
  start: Point,
  end: Point,
  bounds: Rect,
  rotationDegrees = 0
): { clippedStart: Point; clippedEnd: Point } | null {
  const center: Point = {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2
  };
  const localStart = rotatePoint(start, center, -rotationDegrees);
  const localEnd = rotatePoint(end, center, -rotationDegrees);
  const dx = localEnd.x - localStart.x;
  const dy = localEnd.y - localStart.y;
  const limits = { first: 0, last: 1 };
  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;

  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    !clipEdge(-dx, localStart.x - bounds.left, limits) ||
    !clipEdge(dx, right - localStart.x, limits) ||
    !clipEdge(-dy, localStart.y - bounds.top, limits) ||
    !clipEdge(dy, bottom - localStart.y, limits) ||
    (limits.last - limits.first) * Math.max(Math.abs(dx), Math.abs(dy)) < 0.0001
  ) {
    return null;
  }

  const clippedStart = rotatePoint(
    {
      x: localStart.x + limits.first * dx,
      y: localStart.y + limits.first * dy
    },
    center,
    rotationDegrees
  );
  const clippedEnd = rotatePoint(
    {
      x: localStart.x + limits.last * dx,
      y: localStart.y + limits.last * dy
    },
    center,
    rotationDegrees
  );
  return { clippedStart, clippedEnd };
}

export function getZoomBounds(
  source: Rect,
  regionSize: { width: number; height: number },
  placement: ZoomPlacement,
  gap: number
): Rect {
  if (regionSize.width <= 0 || regionSize.height <= 0) {
    throw new Error('regionSize must have positive dimensions');
  }
  const horizontal = placement === 'left' || placement === 'right';
  const scale = horizontal
    ? source.height / regionSize.height
    : source.width / regionSize.width;
  const width = regionSize.width * scale;
  const height = regionSize.height * scale;

  switch (placement) {
    case 'left':
      return {
        left: source.left - gap - width,
        top: source.top,
        width,
        height
      };
    case 'top':
      return {
        left: source.left,
        top: source.top - gap - height,
        width,
        height
      };
    case 'bottom':
      return {
        left: source.left,
        top: source.top + source.height + gap,
        width,
        height
      };
    case 'right':
    default:
      return {
        left: source.left + source.width + gap,
        top: source.top,
        width,
        height
      };
  }
}

export function getRelativePlacement(
  source: Rect,
  zoom: Rect,
  fallback: ZoomPlacement = 'right'
): ZoomPlacement {
  const dx = zoom.left + zoom.width / 2 - (source.left + source.width / 2);
  const dy = zoom.top + zoom.height / 2 - (source.top + source.height / 2);
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return fallback;
  return Math.abs(dx) / Math.max(0.01, source.width) >=
    Math.abs(dy) / Math.max(0.01, source.height)
    ? dx >= 0
      ? 'right'
      : 'left'
    : dy >= 0
      ? 'bottom'
      : 'top';
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

export function calculateZoomLayout(
  source: Rect,
  entries: ZoomEntry[],
  gap: number
): Map<ZoomEntry, Rect> {
  const result = new Map<ZoomEntry, Rect>();

  // Keep the live position and size of saved zooms until placement is changed.
  for (const entry of entries) {
    if (entry.region.width <= 0 || entry.region.height <= 0) continue;
    if (entry.preservesLayout && entry.originalZoomRegion) {
      const old = entry.originalZoomRegion;
      const bounds: Rect = {
        left: source.left + old.x * source.width,
        top: source.top + old.y * source.height,
        width: old.width * source.width,
        height: old.height * source.height
      };
      result.set(entry, bounds);
    }
  }

  // 2. Lay out remaining entries outward along placement direction
  for (const entry of entries) {
    if (entry.region.width <= 0 || entry.region.height <= 0) continue;
    if (result.has(entry)) continue;

    const cropSize = {
      width: entry.region.width * source.width,
      height: entry.region.height * source.height
    };
    if (cropSize.width <= 0 || cropSize.height <= 0) continue;

    const bounds = getZoomBounds(source, cropSize, entry.placement, gap);
    for (let attempt = 0; attempt <= result.size; attempt++) {
      let moved = false;
      for (const occupied of result.values()) {
        if (!rectsIntersect(bounds, occupied)) continue;
        switch (entry.placement) {
          case 'left':
            bounds.left = occupied.left - gap - bounds.width;
            break;
          case 'top':
            bounds.top = occupied.top - gap - bounds.height;
            break;
          case 'bottom':
            bounds.top = occupied.top + occupied.height + gap;
            break;
          case 'right':
          default:
            bounds.left = occupied.left + occupied.width + gap;
            break;
        }
        moved = true;
      }
      if (!moved) break;
    }
    result.set(entry, bounds);
  }

  return result;
}
