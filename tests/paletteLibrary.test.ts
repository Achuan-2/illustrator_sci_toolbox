import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import {
  builtinPalettes,
  defaultPaletteGroups
} from '../src/js/services/paletteCatalog.ts';
import {
  normalizePaletteLibrary,
  readPaletteLibrary,
  paletteStorageKey,
  normalizeHex,
  formatColorValue,
  paletteGroups,
  libraryPalettes
} from '../src/js/services/paletteLibrary.ts';
import { copyTextToClipboard } from '../src/js/services/clipboard.ts';

test('unknown catalog IDs are ignored; orphaned colors move to an available group', () => {
  const library = normalizePaletteLibrary({
    version: 1,
    activeGroupId: 'missing',
    copyFormat: 'rgb',
    groups: [
      { id: 'journals', name: 'Override' },
      { id: 'mine', name: '实验配色' },
      { id: 'mine', name: 'Duplicate' }
    ],
    palettes: [
      {
        id: 'builtin-unknown',
        groupId: 'mine',
        name: 'Override',
        colors: ['#000000']
      },
      {
        id: 'custom-a',
        groupId: 'deleted-group',
        name: '恢复色卡',
        colors: ['aBc', '#112233', 'invalid'],
        source: { url: 'javascript:alert(1)' }
      },
      { id: 'custom-b', groupId: 'mine', name: '正常色卡', colors: ['#FF00AA'] }
    ]
  });
  assert.deepEqual(library.groups, [{ id: 'mine', name: '实验配色' }]);
  assert.deepEqual(library.palettes[0], {
    id: 'custom-a',
    groupId: 'journals',
    name: '恢复色卡',
    colors: ['#AABBCC', '#112233']
  });
  assert.equal(library.palettes.length, 2);
  assert.equal(library.activeGroupId, 'journals');
  assert.equal(library.copyFormat, 'rgb');
  assert.equal(
    builtinPalettes.find((palette) => palette.id === 'builtin-npg')?.colors[0],
    '#E64B35'
  );
});

test('custom groups, names, selected group and color format survive a save/read round trip', () => {
  const saved = JSON.stringify({
    version: 1,
    activeGroupId: 'my-group',
    copyFormat: 'rgb',
    groups: [{ id: 'my-group', name: '课题 A' }],
    palettes: [
      {
        id: 'my-palette',
        groupId: 'my-group',
        name: '对照与处理',
        colors: ['#47a', 'EE6677']
      }
    ]
  });
  const storage = {
    getItem: (key: string) => (key === paletteStorageKey ? saved : null)
  };
  const library = readPaletteLibrary(storage);
  assert.equal(library.activeGroupId, 'my-group');
  assert.equal(library.palettes[0].name, '对照与处理');
  assert.deepEqual(library.palettes[0].colors, ['#4477AA', '#EE6677']);
  assert.deepEqual(
    normalizePaletteLibrary(JSON.parse(JSON.stringify(library))),
    library
  );
  assert.throws(() => readPaletteLibrary({ getItem: () => '{broken' }));
  assert.throws(() => normalizePaletteLibrary({ version: 2 }));
  assert.equal(formatColorValue('#47a', 'hex'), '#4477AA');
  assert.equal(formatColorValue('#47a', 'rgb'), 'rgb(68, 119, 170)');
});

test('default palette edits merge by ID, retain canonical sources and deletions survive reopening', () => {
  const library = normalizePaletteLibrary({
    version: 1,
    palettes: [
      {
        id: 'builtin-npg',
        name: '实验配色',
        groupId: 'categorical',
        colors: ['#fff'],
        source: { name: 'Injected', url: 'javascript:alert(1)' }
      }
    ]
  });
  const entries = libraryPalettes(library);
  assert.equal(entries.length, 23);
  const edited = entries.find((palette) => palette.id === 'builtin-npg')!;
  assert.equal(edited.name, '实验配色');
  assert.equal(edited.groupId, 'categorical');
  assert.deepEqual(edited.colors, ['#FFFFFF']);
  assert.deepEqual(
    edited.source,
    builtinPalettes.find((palette) => palette.id === edited.id)!.source
  );
  assert.equal(
    builtinPalettes.find((palette) => palette.id === edited.id)!.colors[0],
    '#E64B35'
  );
  assert.deepEqual(
    libraryPalettes(
      normalizePaletteLibrary(JSON.parse(JSON.stringify(library)))
    ),
    entries
  );
  const removedGroup = normalizePaletteLibrary({
    ...library,
    deletedGroupIds: ['journals']
  });
  assert.ok(
    libraryPalettes(removedGroup).some((palette) => palette.id === edited.id),
    'Moving a palette protects it from deletion of its original group'
  );
  const deleted = normalizePaletteLibrary({
    ...library,
    deletedPaletteIds: ['builtin-npg', 'builtin-npg', 'unknown']
  });
  assert.deepEqual(deleted.deletedPaletteIds, ['builtin-npg']);
  assert.equal(deleted.palettes.length, 0);
  assert.equal(libraryPalettes(deleted).length, 22);
  assert.deepEqual(
    normalizePaletteLibrary(JSON.parse(JSON.stringify(deleted))),
    deleted
  );
});

test('all default palette colors are valid and there are four default groups', () => {
  assert.equal(builtinPalettes.length, 23);
  assert.equal(new Set(builtinPalettes.map((palette) => palette.id)).size, 23);
  assert.deepEqual(
    defaultPaletteGroups.map((group) => group.id),
    ['journals', 'categorical', 'sequential', 'diverging']
  );
  for (const palette of builtinPalettes) {
    assert.ok(
      defaultPaletteGroups.some((group) => group.id === palette.groupId)
    );
    assert.ok(palette.colors.length);
    assert.match(palette.source?.url || '', /^https:\/\//);
    for (const color of palette.colors)
      assert.equal(normalizeHex(color), color);
  }
});

test('group deletion survives normalization, including deletion of every default group', () => {
  const library = normalizePaletteLibrary({
    version: 1,
    activeGroupId: 'journals',
    deletedGroupIds: ['journals', 'journals', 'unknown'],
    groups: [{ id: 'journals', name: 'Override deleted default' }]
  });
  assert.deepEqual(library.deletedGroupIds, ['journals']);
  assert.equal(library.activeGroupId, 'categorical');
  assert.equal(paletteGroups(library).length, 3);
  const empty = normalizePaletteLibrary({
    ...library,
    deletedGroupIds: defaultPaletteGroups.map((group) => group.id)
  });
  assert.deepEqual(paletteGroups(empty), []);
  assert.equal(empty.activeGroupId, '');
  assert.deepEqual(
    normalizePaletteLibrary(JSON.parse(JSON.stringify(empty))),
    empty
  );
});

test('default group names persist without replacing catalog IDs, colors or translation defaults', () => {
  const library = normalizePaletteLibrary({
    version: 1,
    groupNames: { journals: '论文常用', categorical: '  ', unknown: 'Ignored' }
  });
  assert.deepEqual(library.groupNames, { journals: '论文常用' });
  assert.equal(paletteGroups(library)[0].name, '论文常用');
  assert.equal(paletteGroups(library)[0].nameKey, undefined);
  assert.equal(
    paletteGroups(library)[1].nameKey,
    'palettes.groups.categorical'
  );
  assert.deepEqual(
    normalizePaletteLibrary(JSON.parse(JSON.stringify(library))),
    library
  );
  assert.equal(defaultPaletteGroups[0].nameKey, 'palettes.groups.journals');
});

test('legacy personal palettes are preserved without creating a default personal group', () => {
  const legacy = {
    version: 1,
    activeGroupId: 'personal',
    palettes: [
      { id: 'legacy', name: '实验', groupId: 'personal', colors: ['#47a'] }
    ]
  };
  const migrated = normalizePaletteLibrary(legacy);
  assert.equal(migrated.palettes[0].name, '实验');
  assert.equal(migrated.palettes[0].groupId, 'journals');
  assert.equal(paletteGroups(migrated).length, 4);
  const recovered = normalizePaletteLibrary({
    ...legacy,
    deletedGroupIds: defaultPaletteGroups.map((group) => group.id)
  });
  assert.equal(recovered.palettes.length, 1);
  assert.equal(paletteGroups(recovered).length, 1);
  assert.deepEqual(
    normalizePaletteLibrary(JSON.parse(JSON.stringify(recovered))),
    recovered
  );
});

test('clipboard uses the modern API and falls back to a copy command with restored focus/selection', async () => {
  const window = new Window();
  try {
    const doc = window.document as unknown as Document;
    doc.body.innerHTML =
      '<button id="copy">Copy</button><p id="selected">original selection</p>';
    const button = doc.getElementById('copy')!;
    const range = doc.createRange();
    range.selectNodeContents(doc.getElementById('selected')!);
    doc.getSelection()!.addRange(range);
    button.focus();
    const writes: string[] = [];
    const modern = {
      clipboard: {
        writeText: async (value: string) => {
          writes.push(value);
        }
      }
    } as Pick<Navigator, 'clipboard'>;
    await copyTextToClipboard('#4477AA', doc, modern);
    assert.deepEqual(writes, ['#4477AA']);
    doc.execCommand = (command: string) => {
      assert.equal(command, 'copy');
      writes.push((doc.activeElement as HTMLTextAreaElement).value);
      return true;
    };
    const denied = {
      clipboard: {
        writeText: async () => {
          throw new Error('Denied');
        }
      }
    } as Pick<Navigator, 'clipboard'>;
    await copyTextToClipboard('rgb(68, 119, 170)', doc, denied);
    assert.equal(writes.at(-1), 'rgb(68, 119, 170)');
    assert.equal(doc.activeElement, button);
    assert.equal(doc.getSelection()!.toString(), 'original selection');
    assert.equal(doc.querySelector('textarea'), null);
    doc.execCommand = () => false;
    await assert.rejects(copyTextToClipboard('#4477AA', doc, denied));
    assert.equal(doc.querySelector('textarea'), null);
    assert.equal(doc.activeElement, button);
  } finally {
    await window.happyDOM.close();
  }
});
