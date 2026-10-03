// These functions are concatenated from ilst/*.jsx inside the same private scope.
// Declarations describe that boundary; they do not change the Illustrator algorithms.
declare var $: Record<string, unknown>;
declare function sciError(key: string, args?: unknown[]): string;
declare function arrangeImages(...args: unknown[]): string;
declare function copyRelativePosition(...args: unknown[]): string;
declare function pasteRelativePosition(...args: unknown[]): string;
declare function copySize(...args: unknown[]): string;
declare function pasteSize(...args: unknown[]): string;
declare function addBorder(...args: unknown[]): string;
declare function addLabelsToImages(...args: unknown[]): string;
declare function updateLabelIndex(...args: unknown[]): string;
declare function updateLabelOffsets(...args: unknown[]): string;
declare function filterTextFrames(...args: unknown[]): string;
declare function filterSelection(...args: unknown[]): string;
declare function swapSelectedPositions(...args: unknown[]): string;
declare function distributeSpacing(...args: unknown[]): string;
declare function alignObjects(...args: unknown[]): string;
declare function distributeObjects(...args: unknown[]): string;
declare function copySpacing(...args: unknown[]): string;
declare function pasteSpacing(...args: unknown[]): string;
declare function inspectZoomTarget(...args: unknown[]): string;
declare function applyZoomImages(...args: unknown[]): string;
declare function cancelZoomTarget(...args: unknown[]): string;
declare function syncZoomTracker(...args: unknown[]): string;
declare function applyPaletteFill(...args: unknown[]): string;

var methods: Record<string, (...args: unknown[]) => string> = {
  arrangeImages: arrangeImages,
  copyRelativePosition: copyRelativePosition,
  pasteRelativePosition: pasteRelativePosition,
  copySize: copySize,
  pasteSize: pasteSize,
  addBorder: addBorder,
  addLabelsToImages: addLabelsToImages,
  updateLabelIndex: updateLabelIndex,
  updateLabelOffsets: updateLabelOffsets,
  filterTextFrames: filterTextFrames,
  filterSelection: filterSelection,
  swapSelectedPositions: swapSelectedPositions,
  distributeSpacing: distributeSpacing,
  alignObjects: alignObjects,
  distributeObjects: distributeObjects,
  copySpacing: copySpacing,
  pasteSpacing: pasteSpacing,
  inspectZoomTarget: inspectZoomTarget,
  applyZoomImages: applyZoomImages,
  cancelZoomTarget: cancelZoomTarget,
  syncZoomTracker: syncZoomTracker,
  applyPaletteFill: applyPaletteFill
};

$['com.example.achuanPlugin'] = {
  call: function (operation: string, payload: string): string {
    try {
      if (!Object.prototype.hasOwnProperty.call(methods, operation))
        throw new Error('Unknown operation');
      var args = JSON.parse(decodeURIComponent(payload));
      if (!(args instanceof Array)) throw new Error('Invalid arguments');
      var result = String(methods[operation].apply(null, args));
      if (result.indexOf('Error:') === 0) {
        var parts = result.replace(/^Error:\s*/, '').split('|');
        var key = parts.shift();
        var details: string[] = [];
        for (var i = 0; i < parts.length; i++)
          details.push(decodeURIComponent(parts[i]));
        return JSON.stringify({ ok: false, error: key, args: details });
      }
      return JSON.stringify({ ok: true, data: result });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: 'errors.details',
        args: [String(error)]
      });
    }
  }
};
