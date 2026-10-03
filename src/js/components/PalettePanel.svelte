<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../i18n';
  import { openExternal } from '../services/cep';
  import { copyTextToClipboard } from '../services/clipboard';
  import { bridge, HostError } from '../services/bridge';
  import PaletteGroupManager from './PaletteGroupManager.svelte';
  import {
    builtinPalettes,
    defaultPaletteGroups,
    type ColorPalette,
    type PaletteGroup
  } from '../services/paletteCatalog';
  import {
    emptyPaletteLibrary,
    readPaletteLibrary,
    normalizeHex,
    formatColorValue,
    paletteId,
    paletteGroups,
    libraryPalettes,
    paletteStorageKey
  } from '../services/paletteLibrary';

  interface PaletteDraft {
    id: string | null;
    name: string;
    groupId: string;
    colors: { id: number; value: string }[];
  }
  let library = $state(emptyPaletteLibrary());
  let loaded = $state(false);
  let storageReady = $state(false);
  let storageError = $state<'read' | 'write' | ''>('');
  let groupManagerOpen = $state(false);
  let paletteDraft = $state<PaletteDraft | null>(null);
  let pendingDelete = $state<{
    id: string;
    name: string;
  } | null>(null);
  let errorKey = $state('');
  let errorArgs = $state<string[] | Record<string, string>>([]);
  let copiedValue = $state('');
  let copyToastTimer: number | undefined;
  let appliedValue = $state('');
  let lastSaved = '';
  let nextColorId = 0;

  const groups = $derived(paletteGroups(library));
  const activeGroup = $derived(
    groups.find((group) => group.id === library.activeGroupId) || groups[0]
  );
  const allPalettes = $derived(libraryPalettes(library));
  const visiblePalettes = $derived(
    allPalettes.filter((palette) => palette.groupId === activeGroup?.id)
  );
  const groupCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const palette of allPalettes)
      counts[palette.groupId] = (counts[palette.groupId] || 0) + 1;
    return counts;
  });

  function groupName(group: PaletteGroup): string {
    return group.nameKey ? $t(group.nameKey) : group.name;
  }
  function clearStatus() {
    errorKey = '';
    errorArgs = [];
    appliedValue = '';
  }

  onMount(() => {
    try {
      library = readPaletteLibrary(localStorage);
      lastSaved = JSON.stringify(library);
      storageReady = true;
    } catch {
      storageError = 'read';
    }
    loaded = true;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== paletteStorageKey) return;
      try {
        const next = readPaletteLibrary(localStorage);
        lastSaved = JSON.stringify(next);
        library = next;
        storageReady = true;
        storageError = '';
      } catch {
        storageError = 'read';
        storageReady = false;
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      if (copyToastTimer !== undefined) window.clearTimeout(copyToastTimer);
    };
  });

  $effect(() => {
    if (!loaded || !storageReady) return;
    const serialized = JSON.stringify(library);
    if (serialized === lastSaved) return;
    try {
      localStorage.setItem(paletteStorageKey, serialized);
      lastSaved = serialized;
      storageError = '';
    } catch {
      storageError = 'write';
    }
  });

  function activateGroup(id: string) {
    library.activeGroupId = id;
    pendingDelete = null;
    clearStatus();
  }

  function openGroupManager() {
    groupManagerOpen = true;
    pendingDelete = null;
    clearStatus();
  }

  function saveGroup(groupId: string | null, value: string): string {
    const name = value.trim();
    if (!name) return 'palettes.errors.groupName';
    if (groupId && !groups.some((group) => group.id === groupId))
      return 'palettes.errors.groupMissing';
    if (
      groups.some(
        (group) =>
          group.id !== groupId &&
          groupName(group).toLowerCase() === name.toLowerCase()
      )
    ) {
      return 'palettes.errors.duplicateGroup';
    }
    const id = groupId || paletteId('group');
    if (defaultPaletteGroups.some((group) => group.id === id)) {
      library.groupNames[id] = name;
    } else {
      const saved = library.groups.find((group) => group.id === id);
      if (saved) saved.name = name;
      else library.groups.push({ id, name });
    }
    if (!groupId) library.activeGroupId = id;
    clearStatus();
    return '';
  }

  function editPalette(source?: ColorPalette) {
    if (!activeGroup) return;
    paletteDraft = {
      id: source?.id || null,
      name: source?.name || '',
      groupId: source?.groupId || activeGroup.id,
      colors: (source?.colors || ['#4477AA']).map((value) => ({
        id: ++nextColorId,
        value
      }))
    };
    pendingDelete = null;
    clearStatus();
  }

  function savePalette(event: SubmitEvent) {
    event.preventDefault();
    if (!paletteDraft) return;
    const name = paletteDraft.name.trim();
    if (!name) {
      errorKey = 'palettes.errors.paletteName';
      return;
    }
    const colors = paletteDraft.colors.map((color) =>
      normalizeHex(color.value)
    );
    if (!colors.length || colors.some((color) => !color)) {
      errorKey = 'palettes.errors.hex';
      return;
    }
    if (!groups.some((group) => group.id === paletteDraft?.groupId)) {
      errorKey = 'palettes.errors.groupMissing';
      return;
    }
    const palette: ColorPalette = {
      id: paletteDraft.id || paletteId('palette'),
      name,
      groupId: paletteDraft.groupId,
      colors: colors as string[]
    };
    const index = library.palettes.findIndex(
      (saved) => saved.id === palette.id
    );
    if (index < 0) library.palettes.push(palette);
    else library.palettes[index] = palette;
    library.deletedPaletteIds = library.deletedPaletteIds.filter(
      (id) => id !== palette.id
    );
    library.activeGroupId = palette.groupId;
    paletteDraft = null;
    clearStatus();
  }

  function deleteGroup(id: string) {
    if (!groups.some((group) => group.id === id)) return;
    for (const palette of allPalettes.filter(
      (palette) => palette.groupId === id
    ))
      removePalette(palette.id);
    if (defaultPaletteGroups.some((group) => group.id === id)) {
      library.deletedGroupIds.push(id);
      delete library.groupNames[id];
    }
    library.groups = library.groups.filter((group) => group.id !== id);
    library.palettes = library.palettes.filter(
      (palette) => palette.groupId !== id
    );
    const nextGroupId = paletteGroups(library)[0]?.id || '';
    if (library.activeGroupId === id) library.activeGroupId = nextGroupId;
    if (paletteDraft?.groupId === id) {
      if (nextGroupId) paletteDraft.groupId = nextGroupId;
      else paletteDraft = null;
    }
    clearStatus();
  }

  function removePalette(id: string) {
    if (
      builtinPalettes.some((palette) => palette.id === id) &&
      !library.deletedPaletteIds.includes(id)
    )
      library.deletedPaletteIds.push(id);
    library.palettes = library.palettes.filter((palette) => palette.id !== id);
  }

  function deleteConfirmed() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    removePalette(id);
    if (paletteDraft?.id === id) paletteDraft = null;
    pendingDelete = null;
    clearStatus();
  }

  async function applyColor(hex: string) {
    clearStatus();
    try {
      await bridge.call('applyPaletteFill', hex);
      appliedValue = hex;
    } catch (error) {
      errorKey = error instanceof HostError ? error.key : 'errors.paletteFill';
      errorArgs = error instanceof HostError ? error.args : [String(error)];
    }
  }

  async function copyColor(hex: string) {
    clearStatus();
    if (copyToastTimer !== undefined) window.clearTimeout(copyToastTimer);
    copiedValue = '';
    const value = formatColorValue(hex, library.copyFormat);
    try {
      await copyTextToClipboard(value);
      copiedValue = value;
      copyToastTimer = window.setTimeout(() => {
        copiedValue = '';
        copyToastTimer = undefined;
      }, 3000);
    } catch {
      errorKey = 'palettes.errors.clipboard';
    }
  }
</script>

<div class="panel active" id="panel-palettes">
  <div class="palette-header">
    <nav class="palette-groups" aria-label={$t('palettes.groupList')}>
      {#each groups as group (group.id)}
        <button
          class="btn group-button"
          class:selected={group.id === activeGroup?.id}
          id={`palette-group-${group.id}`}
          aria-pressed={group.id === activeGroup?.id}
          onclick={() => activateGroup(group.id)}>{groupName(group)}</button
        >
      {/each}
    </nav>
    <button
      class="btn settings-button"
      id="palette-manage-groups"
      aria-label={$t('palettes.manageGroups')}
      title={$t('palettes.manageGroups')}
      aria-haspopup="dialog"
      aria-expanded={groupManagerOpen}
      onclick={openGroupManager}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="m9.5 3-.6 2.5-1.7 1-2.5-.7-2.5 4.4 1.9 1.7v2l-1.9 1.7 2.5 4.4 2.5-.7 1.7 1 .6 2.5h5l.6-2.5 1.7-1 2.5.7 2.5-4.4-1.9-1.7v-2l1.9-1.7-2.5-4.4-2.5.7-1.7-1L14.5 3z"
          transform="translate(0 -1)"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  </div>
  <div class="toolbar palette-toolbar">
    <button
      class="btn btn-primary"
      id="palette-add-card"
      disabled={!activeGroup}
      onclick={() => editPalette()}>{$t('palettes.addPalette')}</button
    >
    <div class="input-group copy-format">
      <label for="palette-copy-format">{$t('palettes.copyFormat')}</label>
      <select id="palette-copy-format" bind:value={library.copyFormat}>
        <option value="hex">HEX</option><option value="rgb">RGB</option>
      </select>
    </div>
  </div>
  {#if paletteDraft}
    <form class="editor" id="palette-card-editor" onsubmit={savePalette}>
      <div class="input-group">
        <label for="palette-card-name">{$t('palettes.paletteName')}</label>
        <input
          id="palette-card-name"
          type="text"
          maxlength="120"
          bind:value={paletteDraft.name}
        />
      </div>
      <div class="input-group">
        <label for="palette-card-group">{$t('palettes.group')}</label>
        <select id="palette-card-group" bind:value={paletteDraft.groupId}>
          {#each groups as group}<option value={group.id}
              >{groupName(group)}</option
            >{/each}
        </select>
      </div>
      <div class="color-editor-list">
        {#each paletteDraft.colors as color, index (color.id)}
          <div class="color-editor-row">
            <label class="color-index" for={`palette-color-hex-${index}`}
              >{index + 1}</label
            >
            <input
              id={`palette-color-picker-${index}`}
              type="color"
              value={normalizeHex(color.value) || '#000000'}
              aria-label={$t('palettes.pickColor', { number: index + 1 })}
              oninput={(event) => {
                color.value = event.currentTarget.value.toUpperCase();
              }}
            />
            <input
              id={`palette-color-hex-${index}`}
              class="hex-input"
              type="text"
              bind:value={color.value}
              aria-label={$t('palettes.hexColor', { number: index + 1 })}
              placeholder="#RRGGBB"
              maxlength="7"
            />
            <button
              class="btn compact"
              id={`palette-remove-color-${index}`}
              type="button"
              disabled={paletteDraft.colors.length === 1}
              onclick={() => {
                if (paletteDraft)
                  paletteDraft.colors = paletteDraft.colors.filter(
                    (row) => row.id !== color.id
                  );
              }}>{$t('palettes.removeColor')}</button
            >
          </div>
        {/each}
      </div>
      <div class="toolbar">
        <button
          class="btn"
          id="palette-add-color"
          type="button"
          onclick={() =>
            paletteDraft?.colors.push({ id: ++nextColorId, value: '#EE6677' })}
          >{$t('palettes.addColor')}</button
        >
        <button class="btn btn-primary" id="palette-save-card" type="submit"
          >{$t('palettes.save')}</button
        >
        <button
          class="btn"
          id="palette-cancel-card"
          type="button"
          onclick={() => {
            paletteDraft = null;
            clearStatus();
          }}>{$t('palettes.cancel')}</button
        >
      </div>
    </form>
  {/if}
  {#if pendingDelete}
    <div class="delete-confirm" role="alert">
      <p>
        {$t('palettes.deletePaletteConfirm', { name: pendingDelete.name })}
      </p>
      <div class="toolbar">
        <button
          class="btn"
          id="palette-confirm-delete"
          onclick={deleteConfirmed}>{$t('palettes.confirmDelete')}</button
        >
        <button
          class="btn"
          onclick={() => {
            pendingDelete = null;
          }}>{$t('palettes.cancel')}</button
        >
      </div>
    </div>
  {/if}
  {#if storageError}<p class="error" role="alert">
      {$t(
        storageError === 'read'
          ? 'palettes.errors.readStorage'
          : 'palettes.errors.saveStorage'
      )}
    </p>{/if}
  {#if errorKey}<p class="error" role="alert">{$t(errorKey, errorArgs)}</p>{/if}
  <p
    class="apply-status"
    class:has-message={!!appliedValue}
    role="status"
    aria-live="polite"
  >
    {appliedValue ? $t('palettes.applied', { value: appliedValue }) : ''}
  </p>

  <div class="palette-list">
    {#each visiblePalettes as palette (palette.id)}
      <article class="palette-card" data-palette-id={palette.id}>
        <div class="card-heading">
          <h3>{palette.name}</h3>
          <div class="card-actions">
            <button
              class="btn compact"
              data-action="edit"
              onclick={() => editPalette(palette)}>{$t('palettes.edit')}</button
            >
            <button
              class="btn compact"
              data-action="delete"
              onclick={() => {
                pendingDelete = {
                  id: palette.id,
                  name: palette.name
                };
                clearStatus();
              }}>{$t('palettes.delete')}</button
            >
          </div>
        </div>
        <div class="swatches">
          {#each palette.colors as color, index}
            <button
              class="color-swatch"
              data-color={color}
              title={$t('palettes.colorAction', {
                value: formatColorValue(color, library.copyFormat)
              })}
              aria-label={$t('palettes.colorAction', {
                value: formatColorValue(color, library.copyFormat)
              })}
              onclick={() => applyColor(color)}
              oncontextmenu={(event) => {
                event.preventDefault();
                copyColor(color);
              }}
            >
              <span class="color-sample" style:background-color={color}
              ></span><span class="color-value">{color}</span>
            </button>
          {/each}
        </div>
        {#if palette.source}<a
            class="palette-source"
            href={palette.source.url}
            target="_blank"
            rel="noreferrer"
            onclick={openExternal}>{palette.source.name}</a
          >{/if}
      </article>
    {/each}
    {#if !visiblePalettes.length}<p class="hint empty-group">
        {$t(activeGroup ? 'palettes.emptyGroup' : 'palettes.emptyGroups')}
      </p>{/if}
  </div>
  {#if groupManagerOpen}
    <PaletteGroupManager
      {groups}
      counts={groupCounts}
      onsave={saveGroup}
      storageMessage={storageError
        ? $t(
            storageError === 'read'
              ? 'palettes.errors.readStorage'
              : 'palettes.errors.saveStorage'
          )
        : ''}
      ondelete={deleteGroup}
      onclose={() => {
        groupManagerOpen = false;
      }}
    />
  {/if}
  {#if copiedValue}
    <div
      class="copy-toast"
      id="palette-copy-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m5 12 4 4 10-10" />
      </svg>
      <span>{$t('palettes.copied', { value: copiedValue })}</span>
    </div>
  {/if}
</div>

<style>
  .palette-header {
    display: flex;
    align-items: flex-start;
    margin-bottom: 8px;
  }
  .palette-groups {
    display: flex;
    flex-wrap: wrap;
    flex: 1;
    min-width: 0;
    margin: -3px;
  }
  .group-button {
    margin: 3px;
    padding: 6px 10px;
    max-width: 100%;
    overflow-wrap: break-word;
  }
  .group-button.selected {
    background: var(--primary);
    color: #0d1117;
  }
  .palette-toolbar {
    justify-content: space-between;
    margin: 0 0 12px;
    align-items: center;
  }
  .copy-format {
    margin: 0;
    flex-wrap: nowrap;
  }
  .copy-format select {
    width: auto;
    flex: none;
    min-width: 66px;
  }
  .settings-button {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    padding: 0;
    margin-left: 10px;
    background: transparent;
    border-color: transparent;
  }
  .hint {
    color: var(--muted);
    line-height: 1.6;
    margin: 10px 0;
  }
  .editor {
    display: grid;
    grid-gap: 10px;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    margin: 12px 0;
  }
  .editor input[type='text'],
  .editor select {
    min-width: 30px;
  }
  .color-editor-list {
    display: grid;
    grid-gap: 8px;
    gap: 8px;
  }
  .color-editor-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    margin: -3px;
  }
  .color-editor-row > * {
    margin: 3px;
  }
  .color-index {
    min-width: 16px;
  }
  .hex-input {
    font-family: monospace;
  }
  .compact {
    padding: 5px 8px;
    font-size: 12px;
  }
  .delete-confirm {
    border: 1px solid var(--danger);
    border-radius: var(--radius-sm);
    padding: 10px;
    margin: 10px 0;
  }
  .delete-confirm p {
    margin: 0;
    line-height: 1.6;
    overflow-wrap: break-word;
  }
  .error {
    color: var(--danger);
    line-height: 1.6;
    margin: 8px 0;
  }
  .apply-status {
    color: var(--primary);
    line-height: 1.5;
    margin: 0;
    overflow-wrap: break-word;
  }
  .apply-status.has-message {
    margin: 0 0 8px;
  }
  .copy-toast {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 1200;
    display: flex;
    align-items: center;
    max-width: calc(100vw - 24px);
    box-sizing: border-box;
    padding: 10px 14px;
    border: 1px solid var(--primary);
    border-radius: var(--radius-sm);
    background: var(--bg-panel-2);
    color: var(--text);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    pointer-events: none;
  }
  .copy-toast svg {
    color: var(--primary);
    flex-shrink: 0;
    margin-right: 8px;
  }
  .copy-toast span {
    min-width: 0;
    overflow-wrap: break-word;
    line-height: 1.5;
  }
  .palette-list {
    display: grid;
    grid-gap: 12px;
    gap: 12px;
  }
  .palette-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px;
    min-width: 0;
  }
  .card-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .card-heading h3 {
    font-size: 13px;
    margin: 0 8px 8px 0;
    overflow-wrap: break-word;
  }
  .card-actions {
    display: flex;
    flex-wrap: wrap;
    margin: -3px -3px 5px;
  }
  .card-actions > * {
    margin: 3px;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
    grid-gap: 6px;
    gap: 6px;
  }
  .color-swatch {
    display: block;
    min-width: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    background: var(--bg-panel-2);
    color: var(--text);
    cursor: pointer;
  }
  .color-swatch:hover,
  .color-swatch:focus {
    border-color: var(--primary);
    outline: 1px solid var(--primary);
  }
  .color-sample {
    display: block;
    height: 34px;
    border-bottom: 1px solid var(--border);
  }
  .color-value {
    display: block;
    padding: 5px 1px;
    font: 11px/1.4 monospace;
  }
  .palette-source {
    display: inline-block;
    margin-top: 8px;
    color: var(--muted);
    font-size: 11px;
    overflow-wrap: break-word;
  }
</style>
