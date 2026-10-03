<script lang="ts">
  import { t } from '../i18n';
  import type { PaletteGroup } from '../services/paletteCatalog';

  interface Props {
    groups: PaletteGroup[];
    counts: Record<string, number>;
    storageMessage: string;
    onsave: (id: string | null, name: string) => string;
    ondelete: (id: string) => void;
    onclose: () => void;
  }
  let { groups, counts, storageMessage, onsave, ondelete, onclose }: Props =
    $props();
  let draft = $state<{ id: string | null; name: string } | null>(null);
  let deleting = $state<string | null>(null);
  let errorKey = $state('');
  const deletingGroup = $derived(groups.find((group) => group.id === deleting));

  function groupName(group: PaletteGroup) {
    return group.nameKey ? $t(group.nameKey) : group.name;
  }
  function edit(group?: PaletteGroup) {
    draft = { id: group?.id || null, name: group ? groupName(group) : '' };
    deleting = null;
    errorKey = '';
  }
  function save(event: SubmitEvent) {
    event.preventDefault();
    if (!draft) return;
    errorKey = onsave(draft.id, draft.name);
    if (!errorKey) {
      draft = null;
      document.getElementById('palette-add-group')?.focus();
    }
  }
  function focusName(input: HTMLInputElement) {
    input.focus();
    input.select();
  }

  // Use a custom overlay for older CEP Chromium, with modal keyboard behavior.
  function focusDialog(element: HTMLElement) {
    const previous = document.activeElement as HTMLElement | null;
    element.querySelector<HTMLButtonElement>('button')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onclose();
      } else if (event.key === 'Tab') {
        const controls = Array.from(
          element.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled])'
          )
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    element.addEventListener('keydown', handleKey);
    return {
      destroy() {
        element.removeEventListener('keydown', handleKey);
        if (previous?.isConnected) previous.focus();
      }
    };
  }
</script>

<div class="group-modal-overlay">
  <button
    class="group-modal-backdrop"
    aria-label={$t('palettes.closeManager')}
    onclick={onclose}
  ></button>
  <div
    id="palette-group-manager"
    class="group-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="palette-group-manager-title"
    tabindex="-1"
    use:focusDialog
  >
    <header class="manager-header">
      <h3 id="palette-group-manager-title">{$t('palettes.manageGroups')}</h3>
      <button
        class="btn close-button"
        id="palette-close-manager"
        aria-label={$t('palettes.closeManager')}
        title={$t('palettes.closeManager')}
        onclick={onclose}>×</button
      >
    </header>
    <div class="manager-body">
      <ul class="managed-groups">
        {#each groups as group (group.id)}
          <li class="managed-group">
            <div class="group-info">
              <span class="group-name">{groupName(group)}</span>
              <span class="group-count"
                >{$t('palettes.paletteCount', {
                  count: counts[group.id] || 0
                })}</span
              >
            </div>
            <div class="group-actions">
              <button
                class="btn compact"
                data-group-rename={group.id}
                aria-label={$t('palettes.renameNamedGroup', {
                  name: groupName(group)
                })}
                onclick={() => edit(group)}>{$t('palettes.rename')}</button
              >
              <button
                class="btn compact"
                data-group-delete={group.id}
                aria-label={$t('palettes.deleteNamedGroup', {
                  name: groupName(group)
                })}
                onclick={() => {
                  deleting = group.id;
                  draft = null;
                  errorKey = '';
                }}>{$t('palettes.delete')}</button
              >
            </div>
          </li>
        {/each}
      </ul>
      {#if !groups.length}<p class="empty-groups">
          {$t('palettes.managerEmpty')}
        </p>{/if}
      {#if draft}
        <form class="group-editor" id="palette-group-editor" onsubmit={save}>
          <label for="palette-group-name"
            >{$t(
              draft.id ? 'palettes.renameGroup' : 'palettes.addGroup'
            )}</label
          >
          <input
            id="palette-group-name"
            type="text"
            maxlength="120"
            bind:value={draft.name}
            use:focusName
          />
          {#if errorKey}<p class="error" role="alert">{$t(errorKey)}</p>{/if}
          <div class="group-actions">
            <button
              class="btn btn-primary compact"
              id="palette-save-group"
              type="submit">{$t('palettes.save')}</button
            >
            <button
              class="btn compact"
              type="button"
              onclick={() => {
                draft = null;
                errorKey = '';
                document.getElementById('palette-add-group')?.focus();
              }}>{$t('palettes.cancel')}</button
            >
          </div>
        </form>
      {/if}
      {#if deletingGroup}
        <div class="delete-confirm" role="alert">
          <p>
            {$t('palettes.deleteGroupConfirm', {
              name: groupName(deletingGroup),
              count: counts[deletingGroup.id] || 0
            })}
          </p>
          <div class="group-actions">
            <button
              class="btn btn-danger compact"
              id="palette-confirm-delete"
              onclick={() => {
                if (deletingGroup) ondelete(deletingGroup.id);
                deleting = null;
                document.getElementById('palette-add-group')?.focus();
              }}>{$t('palettes.confirmDelete')}</button
            >
            <button
              class="btn compact"
              onclick={() => {
                deleting = null;
                document.getElementById('palette-add-group')?.focus();
              }}>{$t('palettes.cancel')}</button
            >
          </div>
        </div>
      {/if}
    </div>
    <footer class="manager-footer">
      {#if storageMessage}<p class="error storage-error" role="alert">
          {storageMessage}
        </p>{/if}
      <button class="btn compact" id="palette-add-group" onclick={() => edit()}
        >{$t('palettes.addGroup')}</button
      >
    </footer>
  </div>
</div>

<style>
  .group-modal-overlay {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 1100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
  }
  .group-modal-backdrop {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: 0;
    background: rgba(0, 0, 0, 0.55);
    cursor: default;
  }
  .group-modal {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 420px;
    max-width: 100%;
    max-height: 100%;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  }
  .manager-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }
  .manager-header h3 {
    margin: 0;
    font-size: 14px;
  }
  .close-button {
    padding: 0;
    width: 28px;
    height: 28px;
    font-size: 22px;
    line-height: 1;
    border-color: transparent;
    background: transparent;
  }
  .manager-body {
    overflow-y: auto;
    min-height: 0;
    padding: 0 12px;
  }
  .managed-groups {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .managed-group {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .managed-group:last-child {
    border-bottom: 0;
  }
  .group-info {
    flex: 1;
    min-width: 0;
    margin-right: 10px;
  }
  .group-name {
    display: block;
    overflow-wrap: break-word;
  }
  .group-count {
    display: block;
    font-size: 11px;
    margin-top: 3px;
    color: var(--muted);
  }
  .group-actions {
    display: flex;
    flex-wrap: wrap;
    flex-shrink: 0;
    margin: -3px;
  }
  .group-actions > * {
    margin: 3px;
  }
  .compact {
    padding: 5px 8px;
    font-size: 12px;
  }
  .manager-footer {
    padding: 10px 12px;
    border-top: 1px solid var(--border);
  }
  .group-editor {
    display: grid;
    grid-gap: 8px;
    gap: 8px;
    padding: 10px;
    margin: 8px 0 12px;
    background: var(--bg-panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .group-editor input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .delete-confirm {
    border: 1px solid var(--danger);
    border-radius: var(--radius-sm);
    padding: 10px;
    margin: 8px 0 12px;
  }
  .delete-confirm p {
    margin: 0 0 10px;
    line-height: 1.6;
    overflow-wrap: break-word;
  }
  .empty-groups {
    color: var(--muted);
    margin: 16px 0;
  }
  .error {
    margin: 0;
    color: var(--danger);
    line-height: 1.5;
  }
  .storage-error {
    margin-bottom: 8px;
  }
  @media (max-width: 320px) {
    .managed-group {
      align-items: flex-start;
      flex-direction: column;
    }
    .group-actions {
      margin-top: 6px;
    }
  }
</style>
