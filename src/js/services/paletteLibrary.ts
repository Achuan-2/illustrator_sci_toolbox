import {
  builtinPalettes,
  defaultPaletteGroups,
  type ColorPalette,
  type PaletteGroup
} from './paletteCatalog';

export type ColorCopyFormat = 'hex' | 'rgb';
export interface PaletteLibrary {
  version: 1;
  activeGroupId: string;
  copyFormat: ColorCopyFormat;
  deletedGroupIds: string[];
  deletedPaletteIds: string[];
  groupNames: Record<string, string>;
  groups: PaletteGroup[];
  palettes: ColorPalette[];
}

export const paletteStorageKey = 'illustrator_sci_plugin_palettes';

export function emptyPaletteLibrary(): PaletteLibrary {
  return {
    version: 1,
    activeGroupId: 'journals',
    copyFormat: 'hex',
    deletedGroupIds: [],
    deletedPaletteIds: [],
    groupNames: {},
    groups: [],
    palettes: []
  };
}

/** Support six-digit and shorthand RGB HEX; persist a single canonical form. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`;
  if (/^[\da-f]{3}$/i.test(hex))
    return `#${hex
      .split('')
      .map((digit) => digit + digit)
      .join('')
      .toUpperCase()}`;
  return null;
}

export function formatColorValue(hex: string, format: ColorCopyFormat): string {
  const color = normalizeHex(hex);
  if (!color) throw new Error('Invalid HEX color');
  if (format === 'hex') return color;
  const rgb = [1, 3, 5].map((offset) =>
    parseInt(color.slice(offset, offset + 2), 16)
  );
  return `rgb(${rgb.join(', ')})`;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

/** Deleted catalog groups stay hidden without copying catalog data into storage. */
export function paletteGroups(library: PaletteLibrary): PaletteGroup[] {
  return [
    ...defaultPaletteGroups
      .filter((group) => !library.deletedGroupIds.includes(group.id))
      .map((group) =>
        library.groupNames[group.id]
          ? { ...group, name: library.groupNames[group.id], nameKey: undefined }
          : group
      ),
    ...library.groups
  ];
}

/** User edits replace defaults by ID; source links always come from the catalog. */
export function libraryPalettes(library: PaletteLibrary): ColorPalette[] {
  const edits = new Map(
    library.palettes.map((palette) => [palette.id, palette])
  );
  const builtinIds = new Set(builtinPalettes.map((palette) => palette.id));
  const groupIds = new Set(paletteGroups(library).map((group) => group.id));
  return [
    ...builtinPalettes.map((palette) => ({
      ...palette,
      ...edits.get(palette.id),
      source: palette.source
    })),
    ...library.palettes.filter((palette) => !builtinIds.has(palette.id))
  ].filter(
    (palette) =>
      !library.deletedPaletteIds.includes(palette.id) &&
      groupIds.has(palette.groupId)
  );
}

/** Validate catalog edits and custom content. Legacy and orphaned user
 * palettes move to an available group; create a recovery group only if needed.
 */
export function normalizePaletteLibrary(value: unknown): PaletteLibrary {
  const result = emptyPaletteLibrary();
  if (!record(value)) return result;
  if (value.version !== undefined && value.version !== 1)
    throw new Error('Unsupported palette library version');
  const catalogIds = new Set(defaultPaletteGroups.map((group) => group.id));
  const builtinIds = new Set(builtinPalettes.map((palette) => palette.id));
  if (Array.isArray(value.deletedPaletteIds)) {
    result.deletedPaletteIds = [
      ...new Set(
        value.deletedPaletteIds.filter(
          (id): id is string => typeof id === 'string' && builtinIds.has(id)
        )
      )
    ];
  }
  if (record(value.groupNames)) {
    for (const id of catalogIds) {
      const name = text(value.groupNames[id]);
      if (name) result.groupNames[id] = name;
    }
  }
  if (Array.isArray(value.deletedGroupIds)) {
    result.deletedGroupIds = [
      ...new Set(
        value.deletedGroupIds.filter(
          (id): id is string => typeof id === 'string' && catalogIds.has(id)
        )
      )
    ];
  }
  const groupIds = new Set(paletteGroups(result).map((group) => group.id));
  if (Array.isArray(value.groups)) {
    for (const group of value.groups) {
      if (!record(group)) continue;
      const id = text(group.id),
        name = text(group.name);
      if (!id || !name || catalogIds.has(id) || groupIds.has(id)) continue;
      groupIds.add(id);
      result.groups.push({ id, name });
    }
  }
  const paletteIds = new Set<string>();
  if (Array.isArray(value.palettes)) {
    for (const palette of value.palettes) {
      if (!record(palette)) continue;
      const id = text(palette.id),
        name = text(palette.name);
      if (
        !id ||
        (id.startsWith('builtin-') && !builtinIds.has(id)) ||
        result.deletedPaletteIds.includes(id) ||
        paletteIds.has(id) ||
        !name ||
        !Array.isArray(palette.colors)
      )
        continue;
      const colors = palette.colors
        .map(normalizeHex)
        .filter((color): color is string => !!color);
      if (!colors.length) continue;
      paletteIds.add(id);
      const savedGroup = text(palette.groupId);
      if (result.deletedGroupIds.includes(savedGroup)) continue;
      if (!groupIds.size) {
        result.groups.push({ id: 'personal', name: 'My Palettes' });
        groupIds.add('personal');
      }
      result.palettes.push({
        id,
        name,
        colors,
        groupId: groupIds.has(savedGroup) ? savedGroup : [...groupIds][0]
      });
    }
  }
  const active = text(value.activeGroupId);
  result.activeGroupId = groupIds.has(active) ? active : [...groupIds][0] || '';
  result.copyFormat = value.copyFormat === 'rgb' ? 'rgb' : 'hex';
  return result;
}

export function readPaletteLibrary(
  storage: Pick<Storage, 'getItem'>
): PaletteLibrary {
  const saved = storage.getItem(paletteStorageKey);
  return saved
    ? normalizePaletteLibrary(JSON.parse(saved))
    : emptyPaletteLibrary();
}

export function paletteId(prefix: 'group' | 'palette'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
