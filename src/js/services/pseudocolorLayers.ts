export const layerColorIds = [
  'red',
  'green',
  'blue',
  'cyan',
  'magenta',
  'yellow',
  'grays'
] as const;
export type LayerColorId = (typeof layerColorIds)[number];
export const layerColorHex: Record<LayerColorId, string> = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  yellow: '#ffff00',
  grays: '#ffffff'
};
export function isLayerColor(value: unknown): value is LayerColorId {
  return layerColorIds.some((color) => color === value);
}
export interface LayerChannel {
  enabled: boolean;
  lut: LayerColorId;
}
export function defaultMergeChannels(count: number): LayerChannel[] {
  return Array.from({ length: count }, (_, index) => ({
    enabled: index < layerColorIds.length,
    lut: layerColorIds[index % layerColorIds.length]
  }));
}
export function enabledChannelIndices(channels: LayerChannel[]): number[] {
  const indices: number[] = [];
  channels.forEach((channel, index) => {
    if (channel.enabled) indices.push(index);
  });
  return indices;
}
export function mergeSizeMatches(
  dimensions: { width: number; height: number }[],
  indices: number[]
): boolean {
  const first = dimensions[indices[0]];
  return (
    !!first &&
    indices.every((index) => {
      const size = dimensions[index];
      return (
        !!size &&
        Math.abs(size.width - first.width) <= 0.001 &&
        Math.abs(size.height - first.height) <= 0.001
      );
    })
  );
}
