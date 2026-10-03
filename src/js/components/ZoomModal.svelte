<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { t } from '../i18n';
  import { settings } from '../stores/settings';
  import {
    zoomModalState,
    closeZoomWindow,
    isZoomWindow
  } from '../stores/zoomModal';
  import { actions } from '../services/actions';
  import { tooltip } from '../services/tooltip';
  import {
    unitFactor,
    unitSymbol,
    lengthInUnit,
    maxScalebarLengthUm
  } from '../services/scalebar';

  let { standalone = false } = $props<{ standalone?: boolean }>();
  let isStandalone = $derived(standalone || isZoomWindow());
  import {
    calculateZoomLayout,
    getCorners,
    getGuideEndpoints,
    getRelativePlacement,
    tryClipLineToRectangle,
    GAP_POINTS,
    type ZoomEntry,
    type ZoomPlacement,
    type ZoomGuideLineExtent,
    type ZoomLineStyle,
    type Rect,
    type Point
  } from '../services/zoomLayout';

  let canvasEl = $state<HTMLCanvasElement>();
  let layoutCanvasEl = $state<HTMLCanvasElement>();
  let sourceImg = $state<HTMLImageElement | null>(null);
  // Store values are plain objects. Edit a local reactive copy so drawing and
  // input bindings also update validation and the Confirm button.
  let entries = $state<ZoomEntry[]>([]);
  let deletedKeys = $state<string[]>([]);
  let renderFrame = 0;

  // Viewport / canvas navigation
  let zoomFactor = $state(1);
  let panOffset = $state<{ x: number; y: number }>({ x: 0, y: 0 });
  let panToolActive = $state(false);
  let spaceHeld = $state(false);
  let keepSquare = $state(true);

  // Drag interaction state
  type DragMode = 'none' | 'draw' | 'move' | 'resize' | 'pan';
  let dragMode: DragMode = 'none';
  let resizeHandle = -1; // 0..7
  let dragStartMouse = { x: 0, y: 0 };
  let dragStartPan = { x: 0, y: 0 };
  let dragStartRegion = { x: 0, y: 0, width: 0, height: 0 };
  let activeIndex = $state(0);

  let activeEntry = $derived(entries[activeIndex] ?? null);

  function maxZoomScaleLength(entry: ZoomEntry) {
    const fov = $zoomModalState.sourceFov;
    return maxScalebarLengthUm(
      fov ? {
        ...fov,
        width: fov.width * entry.region.width,
        height: fov.height * entry.region.height
      } : null,
      $zoomModalState.sourceScalebar?.orientation || entry.scaleOrientation || 'horizontal'
    );
  }

  let maxZoomDisplayLength = $derived.by(() => {
    if (!activeEntry) return undefined;
    const maximum = maxZoomScaleLength(activeEntry);
    return maximum === undefined
      ? undefined
      : lengthInUnit(maximum, activeEntry.scaleUnit || 'um');
  });

  // Crop edits can shrink the physical FOV after a length has been entered.
  $effect(() => {
    for (const entry of entries) {
      const maximum = maxZoomScaleLength(entry);
      if (
        maximum !== undefined &&
        entry.scaleLengthUm != null &&
        entry.scaleLengthUm > maximum
      )
        entry.scaleLengthUm = maximum;
    }
  });

  let canConfirm = $derived(
    entries.length > 0 &&
      entries.every((e) => e.region.width > 0 && e.region.height > 0)
  );

  let confirming = $state(false);
  let confirmError = $state('');

  $effect(() => {
    const session = $zoomModalState;
    untrack(() => {
      entries = session.entries.map((entry) => ({
        ...entry,
        region: { ...entry.region }
      }));
      deletedKeys = [...session.deletedKeys];
      activeIndex = session.activeIndex;
      keepSquare = $settings.zoomKeepSquare;
      confirmError = '';
      dragMode = 'none';
      spaceHeld = false;
    });
  });

  // Load only when the session image changes, never while editing/panning.
  $effect(() => {
    const url = $zoomModalState.previewDataUrl;
    const open = $zoomModalState.open;
    sourceImg = null;
    if (open && url) {
      const img = new Image();
      img.onload = () => {
        sourceImg = img;
        fitImage();
      };
      img.onerror = () => {
        confirmError = $t('errors.zoomCaptureFailed');
      };
      img.src = url;
      return () => {
        img.onload = null;
        img.onerror = null;
      };
    }
  });

  // Re-render when entries or options change
  $effect(() => {
    if ($zoomModalState.open) {
      JSON.stringify(entries);
      activeIndex;
      zoomFactor;
      panOffset.x;
      panOffset.y;
      sourceImg;
      canvasEl;
      layoutCanvasEl;
      renderAll();
    }
  });

  function fitImage() {
    zoomFactor = 1;
    panOffset = { x: 0, y: 0 };
    renderAll();
  }

  function getImageBounds(width: number, height: number): Rect {
    if (!sourceImg || sourceImg.naturalWidth <= 0) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    const fitScale = Math.min(
      Math.max(1, width - 24) / sourceImg.naturalWidth,
      Math.max(1, height - 24) / sourceImg.naturalHeight
    );
    const imgW = sourceImg.naturalWidth * fitScale * zoomFactor;
    const imgH = sourceImg.naturalHeight * fitScale * zoomFactor;
    return {
      left: (width - imgW) / 2 + panOffset.x,
      top: (height - imgH) / 2 + panOffset.y,
      width: imgW,
      height: imgH
    };
  }

  function getHandlePoints(screenRect: Rect): Point[] {
    const l = screenRect.left;
    const t = screenRect.top;
    const r = screenRect.left + screenRect.width;
    const b = screenRect.top + screenRect.height;
    const cx = (l + r) / 2;
    const cy = (t + b) / 2;
    // 0: TL, 1: T, 2: TR, 3: R, 4: BR, 5: B, 6: BL, 7: L
    return [
      { x: l, y: t },
      { x: cx, y: t },
      { x: r, y: t },
      { x: r, y: cy },
      { x: r, y: b },
      { x: cx, y: b },
      { x: l, y: b },
      { x: l, y: cy }
    ];
  }

  function setCanvasStroke(
    ctx: CanvasRenderingContext2D,
    color: string,
    width: number,
    dashStyle: ZoomLineStyle
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width);
    switch (dashStyle) {
      case 'solid':
        ctx.setLineDash([]);
        break;
      case 'dot':
        ctx.setLineDash([width * 0.8, width * 2]);
        break;
      case 'dashdot':
        ctx.setLineDash([width * 4, width * 2, width * 1, width * 2]);
        break;
      case 'dashdotdot':
        ctx.setLineDash([
          width * 4,
          width * 2,
          width * 1,
          width * 1.5,
          width * 1,
          width * 2
        ]);
        break;
      case 'dash':
      default:
        ctx.setLineDash([width * 3, width * 2]);
        break;
    }
  }

  function renderMainCanvas() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const width = canvasEl.clientWidth;
    const height = canvasEl.clientHeight;
    if (canvasEl.width !== width || canvasEl.height !== height) {
      canvasEl.width = width;
      canvasEl.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    const img = sourceImg;
    if (!img || img.naturalWidth <= 0) return;

    const imgBounds = getImageBounds(width, height);
    ctx.drawImage(
      img,
      imgBounds.left,
      imgBounds.top,
      imgBounds.width,
      imgBounds.height
    );

    // Draw other entries
    entries.forEach((entry, i) => {
      if (
        i === activeIndex ||
        entry.region.width <= 0 ||
        entry.region.height <= 0
      )
        return;
      const rx = imgBounds.left + entry.region.x * imgBounds.width;
      const ry = imgBounds.top + entry.region.y * imgBounds.height;
      const rw = entry.region.width * imgBounds.width;
      const rh = entry.region.height * imgBounds.height;

      ctx.save();
      setCanvasStroke(
        ctx,
        entry.strokeColor,
        entry.strokeWidth,
        entry.strokeDash
      );
      ctx.strokeRect(rx, ry, rw, rh);

      // Label badge
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.font = '11px sans-serif';
      const textW = ctx.measureText(entry.name).width;
      ctx.fillRect(rx, ry - 18, textW + 8, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(entry.name, rx + 4, ry - 5);
      ctx.restore();
    });

    // Draw active entry
    if (
      activeEntry &&
      activeEntry.region.width > 0 &&
      activeEntry.region.height > 0
    ) {
      const rx = imgBounds.left + activeEntry.region.x * imgBounds.width;
      const ry = imgBounds.top + activeEntry.region.y * imgBounds.height;
      const rw = activeEntry.region.width * imgBounds.width;
      const rh = activeEntry.region.height * imgBounds.height;
      const screenRect = { left: rx, top: ry, width: rw, height: rh };

      ctx.save();
      setCanvasStroke(
        ctx,
        activeEntry.strokeColor,
        activeEntry.strokeWidth,
        activeEntry.strokeDash
      );
      ctx.strokeRect(rx, ry, rw, rh);

      // Active label badge
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.font = 'bold 11px sans-serif';
      const badgeText = `${activeEntry.name} ${$t('zoom.current')}`;
      const textW = ctx.measureText(badgeText).width;
      ctx.fillRect(rx, ry - 20, textW + 8, 20);
      ctx.fillStyle = '#4ea1ff';
      ctx.fillText(badgeText, rx + 4, ry - 6);

      // Handles
      if (dragMode !== 'draw') {
        const handles = getHandlePoints(screenRect);
        ctx.setLineDash([]);
        handles.forEach((h) => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
          ctx.strokeStyle = activeEntry.strokeColor;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(h.x - 4, h.y - 4, 8, 8);
        });
      }
      ctx.restore();
    }
  }

  function renderLayoutPreview() {
    if (!layoutCanvasEl) return;
    const ctx = layoutCanvasEl.getContext('2d');
    if (!ctx) return;

    const width = layoutCanvasEl.clientWidth;
    const height = layoutCanvasEl.clientHeight;
    if (layoutCanvasEl.width !== width || layoutCanvasEl.height !== height) {
      layoutCanvasEl.width = width;
      layoutCanvasEl.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    const img = sourceImg;
    if (!img || img.naturalWidth <= 0) return;

    const validEntries = entries.filter(
      (e) => e.region.width > 0 && e.region.height > 0
    );

    if (validEntries.length === 0) {
      ctx.fillStyle = '#888888';
      ctx.font = '12px sans-serif';
      ctx.fillText($t('zoom.previewHint'), 14, 30);
      return;
    }

    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;
    const sourceRect: Rect = { left: 0, top: 0, width: srcW, height: srcH };

    // Calculate overall layout bounds
    const positions = calculateZoomLayout(
      sourceRect,
      validEntries,
      GAP_POINTS * 2
    );
    let union: Rect = { ...sourceRect };
    for (const zoomBounds of positions.values()) {
      const uL = Math.min(union.left, zoomBounds.left);
      const uT = Math.min(union.top, zoomBounds.top);
      const uR = Math.max(
        union.left + union.width,
        zoomBounds.left + zoomBounds.width
      );
      const uB = Math.max(
        union.top + union.height,
        zoomBounds.top + zoomBounds.height
      );
      union = { left: uL, top: uT, width: uR - uL, height: uB - uT };
    }

    const padding = 20;
    const scale = Math.min(
      (width - padding * 2) / union.width,
      (height - padding * 2) / union.height
    );
    const origin = {
      x: (width - union.width * scale) / 2 - union.left * scale,
      y: (height - union.height * scale) / 2 - union.top * scale
    };

    const toScreen = (r: Rect): Rect => ({
      left: origin.x + r.left * scale,
      top: origin.y + r.top * scale,
      width: r.width * scale,
      height: r.height * scale
    });

    // Draw Source Image
    const srcScreen = toScreen(sourceRect);
    ctx.drawImage(
      img,
      srcScreen.left,
      srcScreen.top,
      srcScreen.width,
      srcScreen.height
    );

    // Draw each zoom entry
    validEntries.forEach((entry) => {
      const zoomBounds = positions.get(entry);
      if (!zoomBounds) return;

      const zoomScreen = toScreen(zoomBounds);
      const regionRect: Rect = {
        left: entry.region.x * srcW,
        top: entry.region.y * srcH,
        width: entry.region.width * srcW,
        height: entry.region.height * srcH
      };
      const regionScreen = toScreen(regionRect);

      // Draw zoom content (cropped & scaled)
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        zoomScreen.left,
        zoomScreen.top,
        zoomScreen.width,
        zoomScreen.height
      );
      ctx.clip();
      ctx.drawImage(
        img,
        regionRect.left,
        regionRect.top,
        regionRect.width,
        regionRect.height,
        zoomScreen.left,
        zoomScreen.top,
        zoomScreen.width,
        zoomScreen.height
      );
      ctx.restore();

      // Guide lines & Outlines
      ctx.save();
      const rCorners = getCorners(regionScreen);
      const zCorners = getCorners(zoomScreen);

      setCanvasStroke(
        ctx,
        entry.strokeColor,
        entry.strokeWidth * scale * 1.5,
        entry.strokeDash
      );

      if (entry.addGuideLines) {
        const endpoints = getGuideEndpoints(
          rCorners,
          zCorners,
          getRelativePlacement(srcScreen, zoomScreen, entry.placement)
        );
        for (let i = 0; i < endpoints.length; i += 2) {
          let start = endpoints[i];
          let end = endpoints[i + 1];
          if (entry.guideLineExtent === 'insideSourceImage') {
            const clipped = tryClipLineToRectangle(start, end, srcScreen);
            if (clipped) {
              start = clipped.clippedStart;
              end = clipped.clippedEnd;
            }
          }
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        }
      }

      // Region outline
      ctx.strokeRect(
        regionScreen.left,
        regionScreen.top,
        regionScreen.width,
        regionScreen.height
      );

      // Zoom outline
      if (entry.useRectangleColor) {
        ctx.strokeRect(
          zoomScreen.left,
          zoomScreen.top,
          zoomScreen.width,
          zoomScreen.height
        );
      }
      ctx.restore();

      // Label below zoom image
      ctx.fillStyle = '#b8b8b8';
      ctx.font = '10px sans-serif';
      ctx.fillText(
        entry.name,
        zoomScreen.left,
        zoomScreen.top + zoomScreen.height + 12
      );
    });
  }

  function renderAll() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      renderMainCanvas();
      renderLayoutPreview();
    });
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (!canvasEl || !sourceImg) return;
    const rect = canvasEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.1, Math.min(20, zoomFactor * delta));

    // Keep point under cursor invariant
    panOffset.x = mouseX - (mouseX - panOffset.x) * (newZoom / zoomFactor);
    panOffset.y = mouseY - (mouseY - panOffset.y) * (newZoom / zoomFactor);
    zoomFactor = newZoom;
    renderAll();
  }

  function hitHandle(
    screenX: number,
    screenY: number,
    screenRect: Rect
  ): number {
    const handles = getHandlePoints(screenRect);
    for (let i = 0; i < handles.length; i++) {
      if (
        Math.abs(screenX - handles[i].x) <= 6 &&
        Math.abs(screenY - handles[i].y) <= 6
      ) {
        return i;
      }
    }
    return -1;
  }

  function handleMouseDown(e: MouseEvent) {
    if (!canvasEl || !sourceImg) return;
    const rect = canvasEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const imgBounds = getImageBounds(
      canvasEl.clientWidth,
      canvasEl.clientHeight
    );

    const isPan =
      e.button === 1 || (e.button === 0 && (panToolActive || spaceHeld));

    if (isPan) {
      dragMode = 'pan';
      dragStartMouse = { x: e.clientX, y: e.clientY };
      dragStartPan = { ...panOffset };
      return;
    }

    if (e.button !== 0) return;

    // Check hit on active entry
    if (
      activeEntry &&
      activeEntry.region.width > 0 &&
      activeEntry.region.height > 0
    ) {
      const rx = imgBounds.left + activeEntry.region.x * imgBounds.width;
      const ry = imgBounds.top + activeEntry.region.y * imgBounds.height;
      const rw = activeEntry.region.width * imgBounds.width;
      const rh = activeEntry.region.height * imgBounds.height;
      const screenRect = { left: rx, top: ry, width: rw, height: rh };

      const handle = hitHandle(mouseX, mouseY, screenRect);
      if (handle >= 0) {
        dragMode = 'resize';
        resizeHandle = handle;
        dragStartMouse = { x: mouseX, y: mouseY };
        dragStartRegion = { ...activeEntry.region };
        return;
      }

      if (
        mouseX >= rx &&
        mouseX <= rx + rw &&
        mouseY >= ry &&
        mouseY <= ry + rh
      ) {
        dragMode = 'move';
        dragStartMouse = { x: mouseX, y: mouseY };
        dragStartRegion = { ...activeEntry.region };
        return;
      }
    }

    // Check click on other entries
    for (let i = 0; i < entries.length; i++) {
      if (i === activeIndex) continue;
      const entry = entries[i];
      if (entry.region.width <= 0) continue;
      const rx = imgBounds.left + entry.region.x * imgBounds.width;
      const ry = imgBounds.top + entry.region.y * imgBounds.height;
      const rw = entry.region.width * imgBounds.width;
      const rh = entry.region.height * imgBounds.height;
      if (
        mouseX >= rx &&
        mouseX <= rx + rw &&
        mouseY >= ry &&
        mouseY <= ry + rh
      ) {
        activeIndex = i;
        renderAll();
        return;
      }
    }

    // Draw new region if current entry has no box or user wants to draw
    if (activeEntry && activeEntry.region.width <= 0) {
      dragMode = 'draw';
      const normX = Math.max(
        0,
        Math.min(1, (mouseX - imgBounds.left) / imgBounds.width)
      );
      const normY = Math.max(
        0,
        Math.min(1, (mouseY - imgBounds.top) / imgBounds.height)
      );
      dragStartMouse = { x: mouseX, y: mouseY };
      dragStartRegion = { x: normX, y: normY, width: 0, height: 0 };
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!canvasEl || !sourceImg) return;
    const rect = canvasEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const imgBounds = getImageBounds(
      canvasEl.clientWidth,
      canvasEl.clientHeight
    );

    if (dragMode === 'pan') {
      panOffset.x = dragStartPan.x + (e.clientX - dragStartMouse.x);
      panOffset.y = dragStartPan.y + (e.clientY - dragStartMouse.y);
      renderAll();
      return;
    }

    if (dragMode === 'draw' && activeEntry) {
      const curX = Math.max(
        0,
        Math.min(1, (mouseX - imgBounds.left) / imgBounds.width)
      );
      const curY = Math.max(
        0,
        Math.min(1, (mouseY - imgBounds.top) / imgBounds.height)
      );
      let minX = Math.min(dragStartRegion.x, curX);
      let minY = Math.min(dragStartRegion.y, curY);
      let w = Math.abs(curX - dragStartRegion.x);
      let h = Math.abs(curY - dragStartRegion.y);

      if (keepSquare && imgBounds.width > 0 && imgBounds.height > 0) {
        // Enforce square in pixel aspect
        const pixelW = w * imgBounds.width;
        const pixelH = h * imgBounds.height;
        const side = Math.max(pixelW, pixelH);
        w = side / imgBounds.width;
        h = side / imgBounds.height;
        if (curX < dragStartRegion.x) minX = Math.max(0, dragStartRegion.x - w);
        if (curY < dragStartRegion.y) minY = Math.max(0, dragStartRegion.y - h);
      }

      activeEntry.region = {
        x: Math.max(0, Math.min(1 - w, minX)),
        y: Math.max(0, Math.min(1 - h, minY)),
        width: Math.min(1, w),
        height: Math.min(1, h)
      };
      renderAll();
      return;
    }

    if (dragMode === 'move' && activeEntry) {
      const dx = (mouseX - dragStartMouse.x) / imgBounds.width;
      const dy = (mouseY - dragStartMouse.y) / imgBounds.height;
      const newX = Math.max(
        0,
        Math.min(1 - dragStartRegion.width, dragStartRegion.x + dx)
      );
      const newY = Math.max(
        0,
        Math.min(1 - dragStartRegion.height, dragStartRegion.y + dy)
      );
      activeEntry.region = {
        ...dragStartRegion,
        x: newX,
        y: newY
      };
      renderAll();
      return;
    }

    if (dragMode === 'resize' && activeEntry) {
      const dx = (mouseX - dragStartMouse.x) / imgBounds.width;
      const dy = (mouseY - dragStartMouse.y) / imgBounds.height;
      let left = dragStartRegion.x;
      let top = dragStartRegion.y;
      let right = dragStartRegion.x + dragStartRegion.width;
      let bottom = dragStartRegion.y + dragStartRegion.height;

      if (resizeHandle === 0 || resizeHandle === 6 || resizeHandle === 7) {
        left = Math.min(right - 0.02, left + dx);
      }
      if (resizeHandle === 2 || resizeHandle === 3 || resizeHandle === 4) {
        right = Math.max(left + 0.02, right + dx);
      }
      if (resizeHandle === 0 || resizeHandle === 1 || resizeHandle === 2) {
        top = Math.min(bottom - 0.02, top + dy);
      }
      if (resizeHandle === 4 || resizeHandle === 5 || resizeHandle === 6) {
        bottom = Math.max(top + 0.02, bottom + dy);
      }

      if (keepSquare) {
        const pW = (right - left) * imgBounds.width;
        const pH = (bottom - top) * imgBounds.height;
        const side = Math.max(pW, pH);
        const normW = side / imgBounds.width;
        const normH = side / imgBounds.height;
        if (resizeHandle === 0 || resizeHandle === 6 || resizeHandle === 7)
          left = right - normW;
        else right = left + normW;
        if (resizeHandle === 0 || resizeHandle === 1 || resizeHandle === 2)
          top = bottom - normH;
        else bottom = top + normH;
      }

      activeEntry.region = {
        x: Math.max(0, left),
        y: Math.max(0, top),
        width: Math.min(1 - left, right - left),
        height: Math.min(1 - top, bottom - top)
      };
      renderAll();
      return;
    }

    // Hover cursor updates
    if (panToolActive || spaceHeld) {
      canvasEl.style.cursor = 'grab';
    } else if (
      activeEntry &&
      activeEntry.region.width > 0 &&
      activeEntry.region.height > 0
    ) {
      const rx = imgBounds.left + activeEntry.region.x * imgBounds.width;
      const ry = imgBounds.top + activeEntry.region.y * imgBounds.height;
      const rw = activeEntry.region.width * imgBounds.width;
      const rh = activeEntry.region.height * imgBounds.height;
      const screenRect = { left: rx, top: ry, width: rw, height: rh };
      const handle = hitHandle(mouseX, mouseY, screenRect);
      if (handle === 0 || handle === 4) canvasEl.style.cursor = 'nwse-resize';
      else if (handle === 2 || handle === 6)
        canvasEl.style.cursor = 'nesw-resize';
      else if (handle === 1 || handle === 5)
        canvasEl.style.cursor = 'ns-resize';
      else if (handle === 3 || handle === 7)
        canvasEl.style.cursor = 'ew-resize';
      else if (
        mouseX >= rx &&
        mouseX <= rx + rw &&
        mouseY >= ry &&
        mouseY <= ry + rh
      )
        canvasEl.style.cursor = 'move';
      else canvasEl.style.cursor = 'default';
    } else {
      canvasEl.style.cursor = 'crosshair';
    }
  }

  function handleMouseUp() {
    dragMode = 'none';
    resizeHandle = -1;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!$zoomModalState.open) return;
    if (e.code === 'Space' && !spaceHeld) {
      spaceHeld = true;
      if (canvasEl) canvasEl.style.cursor = 'grab';
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteCurrentEntry();
    } else if (e.key === 'Escape') {
      if (dragMode !== 'none') {
        dragMode = 'none';
        renderAll();
      } else {
        handleCancel();
      }
    }
  }

  function handleCancel() {
    if (confirming) return;
    void actions.cancelZoomTarget();
    closeZoomWindow();
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') {
      spaceHeld = false;
      if (canvasEl) canvasEl.style.cursor = 'default';
    }
  }

  function addNewEntry() {
    const current = activeEntry;
    const nextNum = entries.length + 1;
    const newEntry: ZoomEntry = {
      recordKey: null,
      name: `放大图 ${nextNum}`,
      region: { x: 0, y: 0, width: 0, height: 0 },
      regionRotation: 0,
      strokeColor: current?.strokeColor ?? $settings.zoomLineColor,
      strokeWidth: current?.strokeWidth ?? $settings.zoomLineWidth,
      strokeDash:
        current?.strokeDash ?? ($settings.zoomLineStyle as ZoomLineStyle),
      useRectangleColor:
        current?.useRectangleColor ?? $settings.zoomUseRectangleColor,
      addGuideLines: current?.addGuideLines ?? $settings.zoomAddGuideLines,
      placement:
        current?.placement ?? ($settings.zoomPlacement as ZoomPlacement),
      guideLineExtent:
        current?.guideLineExtent ??
        ($settings.zoomGuideLineExtent as ZoomGuideLineExtent),
      originalZoomRegion: null,
      originalZoomRotation: 0,
      preservesLayout: false,
      scaleLengthUm: $zoomModalState.sourceScalebar?.lengthUm ?? null,
      scaleUnit: $zoomModalState.sourceScalebar?.unit ?? 'um'
    };

    entries.push(newEntry);
    activeIndex = entries.length - 1;
    renderAll();
  }

  function deleteCurrentEntry() {
    if (!activeEntry) return;
    if (activeEntry.recordKey) {
      deletedKeys.push(activeEntry.recordKey);
    }
    entries.splice(activeIndex, 1);
    activeIndex = Math.max(0, activeIndex - 1);
    renderAll();
  }

  function notifySettingsUpdate() {
    try {
      window.__adobe_cep__?.dispatchEvent?.({
        type: 'com.example.achuanPlugin.settingsUpdate',
        scope: 'APPLICATION',
        data: ''
      });
    } catch {}
  }

  function handleAutoUpdateChange(event: Event) {
    const enabled = (event.currentTarget as HTMLInputElement).checked;
    settings.update((value) => ({ ...value, zoomAutoUpdate: enabled }));
    // Persist before notifying the main panel that owns background polling.
    notifySettingsUpdate();
  }

  async function handleConfirm() {
    if (!canConfirm || confirming) return;
    confirming = true;
    confirmError = '';
    try {
      // Save preferences
      if (activeEntry) {
        settings.update((s) => ({
          ...s,
          zoomLineWidth: activeEntry.strokeWidth,
          zoomLineColor: activeEntry.strokeColor,
          zoomLineStyle: activeEntry.strokeDash,
          zoomUseRectangleColor: activeEntry.useRectangleColor,
          zoomAddGuideLines: activeEntry.addGuideLines,
          zoomPlacement: activeEntry.placement,
          zoomGuideLineExtent: activeEntry.guideLineExtent,
          zoomKeepSquare: keepSquare
        }));
      }

      await actions.applyZoom({
        entries: $state.snapshot(entries),
        deletedKeys: $state.snapshot(deletedKeys)
      });

      notifySettingsUpdate();

      closeZoomWindow();
    } catch (err: any) {
      if (err && typeof err === 'object' && 'key' in err) {
        confirmError = $t(err.key, err.args);
      } else {
        confirmError = err?.message || String(err);
      }
    } finally {
      confirming = false;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    // CEP 8 lacks ResizeObserver. Window resize covers its modeless dialog;
    // newer hosts additionally observe changes caused by toolbar wrapping.
    window.addEventListener('resize', renderAll);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', renderAll);
      window.removeEventListener('mouseup', handleMouseUp);
      if (renderFrame) cancelAnimationFrame(renderFrame);
    };
  });

  $effect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(renderAll);
    if (canvasEl) observer.observe(canvasEl);
    if (layoutCanvasEl) observer.observe(layoutCanvasEl);
    return () => observer.disconnect();
  });
</script>

{#if $zoomModalState.open || isStandalone}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="zoom-modal-overlay"
    class:is-standalone={isStandalone}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={$t('zoom.title')}
    onmouseup={handleMouseUp}
  >
    {#if !$zoomModalState.previewDataUrl}
      <div class="zoom-loading">
        {#if $zoomModalState.error}
          <span class="text-danger">{$zoomModalState.error}</span>
          <button class="btn btn-secondary" onclick={handleCancel}
            >{$t('zoom.cancel')}</button
          >
        {:else}
          <span>{$t('zoom.loading')}</span>
        {/if}
      </div>
    {:else}
      <div class="zoom-modal-window">
        <!-- Header -->
        <div class="zoom-modal-header">
          <div class="header-left">
            <span
              class="modal-title"
              use:tooltip={!isStandalone ? $t('zoom.restartHint') : undefined}
              >{$t('zoom.title')}</span
            >
          </div>
          <div class="header-center">
            <label for="entry-selector">{$t('zoom.currentEntry')}</label>
            <select
              id="entry-selector"
              class="entry-select"
              bind:value={activeIndex}
              onchange={renderAll}
            >
              {#each entries as entry, i}
                <option value={i}>{entry.name}</option>
              {/each}
            </select>
            <button class="btn btn-sm btn-secondary" onclick={addNewEntry}>
              {$t('zoom.addEntry')}
            </button>
            {#if entries.length > 1}
              <button
                class="btn btn-sm btn-danger"
                onclick={deleteCurrentEntry}
                title={$t('zoom.deleteEntry')}
              >
                {$t('zoom.deleteEntry')}
              </button>
            {/if}
          </div>
          <div class="header-right">
            <button
              class="close-btn"
              onclick={handleCancel}
              aria-label={$t('zoom.cancel')}>✕</button
            >
          </div>
        </div>

        <!-- Settings toolbar -->
        {#if activeEntry}
          <div class="zoom-settings-toolbar">
            <fieldset class="settings-group">
              <legend>{$t('zoom.rectSettings')}</legend>
              <div class="settings-row">
                <div class="control-group">
                  <label for="zoom-line-width">{$t('zoom.lineWidth')}</label>
                  <input
                    id="zoom-line-width"
                    type="number"
                    step="0.5"
                    min="0.1"
                    max="50"
                    bind:value={activeEntry.strokeWidth}
                    onchange={renderAll}
                  />
                </div>
                <div class="control-group">
                  <label for="zoom-line-color">{$t('zoom.lineColor')}</label>
                  <input
                    id="zoom-line-color"
                    type="color"
                    bind:value={activeEntry.strokeColor}
                    onchange={renderAll}
                  />
                </div>
                <div class="control-group">
                  <label for="zoom-line-style">{$t('zoom.lineStyle')}</label>
                  <select
                    id="zoom-line-style"
                    bind:value={activeEntry.strokeDash}
                    onchange={renderAll}
                  >
                    <option value="dash">{$t('zoom.styleDash')}</option>
                    <option value="solid">{$t('zoom.styleSolid')}</option>
                    <option value="dot">{$t('zoom.styleDot')}</option>
                    <option value="dashdot">{$t('zoom.styleDashDot')}</option>
                    <option value="dashdotdot"
                      >{$t('zoom.styleDashDotDot')}</option
                    >
                    {#if activeEntry.strokeDash === 'original'}
                      <option value="original"
                        >{$t('zoom.styleOriginal')}</option
                      >
                    {/if}
                  </select>
                </div>
                <div class="control-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      bind:checked={keepSquare}
                      onchange={renderAll}
                    />
                    {$t('zoom.keepSquare')}
                  </label>
                </div>
              </div>
            </fieldset>

            <fieldset class="settings-group">
              <legend>{$t('zoom.guideSettings')}</legend>
              <div class="settings-row">
                <div class="control-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      bind:checked={activeEntry.addGuideLines}
                      onchange={renderAll}
                    />
                    {$t('zoom.addGuides')}
                  </label>
                </div>
                <div class="control-group">
                  <label for="zoom-guide-extent">{$t('zoom.guideExtent')}</label
                  >
                  <select
                    id="zoom-guide-extent"
                    disabled={!activeEntry.addGuideLines}
                    bind:value={activeEntry.guideLineExtent}
                    onchange={renderAll}
                  >
                    <option value="insideSourceImage"
                      >{$t('zoom.extentInside')}</option
                    >
                    <option value="acrossImages"
                      >{$t('zoom.extentAcross')}</option
                    >
                  </select>
                </div>
              </div>
            </fieldset>

            <fieldset class="settings-group">
              <legend>{$t('zoom.zoomSettings')}</legend>
              {#if $zoomModalState.sourceScalebar || activeEntry.scaleLengthUm != null}
                <div class="settings-row control-group">
                  <label for="zoom-scale-length">{$t('scale.zoomLength', { unit: unitSymbol(activeEntry.scaleUnit || 'um') })}</label>
                  <input id="zoom-scale-length" type="number" min="0" step="any"
                    max={maxZoomDisplayLength}
                    bind:value={() => lengthInUnit(activeEntry.scaleLengthUm || 0, activeEntry.scaleUnit || 'um'),
                      (value) => { activeEntry.scaleLengthUm = Math.min(Number(value) * unitFactor(activeEntry.scaleUnit || 'um'), maxZoomScaleLength(activeEntry) ?? Infinity); }} />
                  <select aria-label={$t('scale.barUnit')} bind:value={activeEntry.scaleUnit}>
                    <option value="nm">nm</option><option value="um">μm</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="inch">inch</option>
                  </select>
                </div>
              {/if}
              <div class="settings-row">
                <div class="control-group">
                  <label for="zoom-placement">{$t('zoom.placement')}</label>
                  <select
                    id="zoom-placement"
                    bind:value={activeEntry.placement}
                    onchange={() => {
                      activeEntry.preservesLayout = false;
                      renderAll();
                    }}
                  >
                    <option value="right">{$t('zoom.placementRight')}</option>
                    <option value="left">{$t('zoom.placementLeft')}</option>
                    <option value="top">{$t('zoom.placementTop')}</option>
                    <option value="bottom">{$t('zoom.placementBottom')}</option>
                  </select>
                </div>
                <div class="control-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      bind:checked={activeEntry.useRectangleColor}
                      onchange={renderAll}
                    />
                    {$t('zoom.useRectColor')}
                  </label>
                </div>
                <div class="control-group checkbox-group">
                  <label>
                    <input
                      id="zoom-auto-update"
                      type="checkbox"
                      bind:checked={$settings.zoomAutoUpdate}
                      onchange={handleAutoUpdateChange}
                    />
                    {$t('zoom.autoUpdate')}
                  </label>
                </div>
              </div>
            </fieldset>
          </div>
        {/if}

        <!-- Work Area -->
        <div class="zoom-work-area">
          <!-- Left: Image Canvas -->
          <div class="zoom-canvas-container">
            <div class="canvas-toolbar">
              <span class="zoom-indicator">
                {$t('zoom.zoomFactor', {
                  percent: Math.round(zoomFactor * 100)
                })}
              </span>
              <button class="btn btn-xs" onclick={fitImage}>
                {$t('zoom.fitWindow')}
              </button>
              <button
                class="btn btn-xs"
                class:btn-active={panToolActive}
                onclick={() => (panToolActive = !panToolActive)}
              >
                {$t('zoom.panTool')}
              </button>
              <span class="canvas-hint">{$t('zoom.panHint')}</span>
            </div>
            <div class="canvas-wrapper">
              <canvas
                bind:this={canvasEl}
                onwheel={handleWheel}
                onmousedown={handleMouseDown}
                onmousemove={handleMouseMove}
              ></canvas>
            </div>
          </div>

          <!-- Right: Layout Preview -->
          <div class="zoom-layout-container">
            <div class="layout-header">
              <span>{$t('zoom.previewLayout')}</span>
            </div>
            <div class="layout-wrapper">
              <canvas bind:this={layoutCanvasEl}></canvas>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="zoom-modal-footer">
          <div class="footer-left">
            {#if confirmError}
              <span class="text-danger">{confirmError}</span>
            {:else if activeEntry && activeEntry.region.width <= 0}
              <span class="text-warning">{$t('errors.zoomNoRegion')}</span>
            {/if}
          </div>
          <div class="footer-right">
            <button
              class="btn btn-secondary"
              disabled={confirming}
              onclick={handleCancel}
            >
              {$t('zoom.cancel')}
            </button>
            <button
              class="btn btn-primary"
              disabled={!canConfirm || confirming}
              onclick={handleConfirm}
            >
              {confirming ? '...' : $t('zoom.confirm')}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .zoom-modal-overlay {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    box-sizing: border-box;
  }

  .zoom-modal-overlay.is-standalone {
    position: static;
    width: 100%;
    height: 100%;
    padding: 0;
    background: transparent;
  }

  .zoom-modal-window {
    background: var(--bg-panel, #262626);
    border: 1px solid var(--border, #3a3a3a);
    border-radius: var(--radius, 8px);
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .zoom-modal-overlay.is-standalone .zoom-modal-window {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .zoom-loading {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--muted, #b8b8b8);
    font-size: 14px;
    background: var(--bg-panel, #262626);
  }

  .zoom-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--bg, #1f1f1f);
    border-bottom: 1px solid var(--border, #3a3a3a);
    flex-shrink: 0;
    gap: 12px;
  }

  .modal-title {
    font-size: 14px;
    font-weight: bold;
    color: var(--text, #eaeaea);
  }

  .header-center {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .entry-select {
    padding: 4px 8px;
    background: var(--bg-panel-2, #2d2d2d);
    color: var(--text, #eaeaea);
    border: 1px solid var(--border, #3a3a3a);
    border-radius: var(--radius-sm, 6px);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--muted, #b8b8b8);
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-btn:hover {
    color: var(--text, #eaeaea);
    background: rgba(255, 255, 255, 0.1);
  }

  .zoom-settings-toolbar {
    padding: 8px 12px;
    background: var(--bg-panel-2, #2d2d2d);
    border-bottom: 1px solid var(--border, #3a3a3a);
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
    grid-gap: 8px;
    flex-shrink: 0;
  }

  .settings-group {
    min-width: 0;
    margin: 0;
    padding: 4px 10px 8px;
    border: 1px solid var(--border, #3a3a3a);
    border-radius: var(--radius-sm, 6px);
  }

  .settings-group legend {
    padding: 0 5px;
    color: var(--text, #eaeaea);
    font-size: 12px;
    font-weight: 600;
  }

  .settings-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    font-size: 12px;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 10px 0 0;
  }

  @media (max-width: 850px) {
    .zoom-settings-toolbar {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .settings-group:first-child {
      grid-column: 1 / -1;
    }
  }

  .control-group label {
    color: var(--muted, #b8b8b8);
    font-size: 12px;
  }

  .control-group input[type='number'] {
    width: 60px;
    padding: 2px 6px;
  }

  .control-group input[type='color'] {
    width: 28px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--border, #3a3a3a);
    cursor: pointer;
  }

  .control-group select {
    padding: 2px 6px;
    font-size: 12px;
  }

  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .zoom-work-area {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: row;
    gap: 8px;
    padding: 8px;
    background: var(--bg, #1f1f1f);
  }

  .zoom-canvas-container {
    flex: 6 1 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #181818;
    border: 1px solid var(--border, #3a3a3a);
    border-radius: var(--radius-sm, 6px);
    overflow: hidden;
  }

  .canvas-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    background: #222222;
    border-bottom: 1px solid #333333;
    font-size: 11px;
    flex-shrink: 0;
  }

  .zoom-indicator {
    color: var(--text, #eaeaea);
    font-family: monospace;
  }

  .canvas-hint {
    margin-left: auto;
    color: #888888;
    font-size: 11px;
  }

  .canvas-wrapper {
    flex: 1 1 0;
    min-height: 0;
    position: relative;
  }

  .canvas-wrapper canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .zoom-layout-container {
    flex: 4 1 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #181818;
    border: 1px solid var(--border, #3a3a3a);
    border-radius: var(--radius-sm, 6px);
    overflow: hidden;
  }

  .layout-header {
    padding: 6px 8px;
    background: #222222;
    border-bottom: 1px solid #333333;
    font-size: 12px;
    font-weight: bold;
    color: var(--text, #eaeaea);
  }

  .layout-wrapper {
    flex: 1 1 0;
    min-height: 0;
    position: relative;
  }

  .layout-wrapper canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .zoom-modal-footer {
    padding: 8px 12px;
    background: var(--bg-panel, #262626);
    border-top: 1px solid var(--border, #3a3a3a);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .footer-right {
    display: flex;
    gap: 8px;
  }

  .btn-xs {
    padding: 2px 6px;
    font-size: 11px;
  }

  .btn-sm {
    padding: 4px 8px;
    font-size: 12px;
  }

  .btn-active {
    background: var(--primary, #4ea1ff);
    color: #000000;
  }

  .btn-danger {
    background: #dc3545;
    color: #ffffff;
    border: none;
  }

  .btn-danger:hover {
    background: #bd2130;
  }

  .text-warning {
    color: #ffaa00;
    font-size: 12px;
  }

  .text-danger {
    color: #ff5555;
    font-size: 12px;
  }
</style>
