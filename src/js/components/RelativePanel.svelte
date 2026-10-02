<script lang="ts">
  import { workspace } from '../stores/workspace';
  import { t } from '../i18n';
  import { actions } from '../services/actions';
  import HelpHint from './HelpHint.svelte';
</script>

<div class="panel active" id="panel-relative">
  <div class="grid">
    <div class="input-group">
      <label for="delta-x">{$t('relative.deltaX')}</label>
      <input
        type="text"
        id="delta-x"
        bind:value={$workspace.deltaX}
        placeholder={$workspace.relativeCount > 1
          ? $t('relative.multipleValues', { count: $workspace.relativeCount })
          : $t('relative.deltaXPlaceholder')}
      />
    </div>
    <div class="input-group">
      <label for="delta-y">{$t('relative.deltaY')}</label>
      <input
        type="text"
        id="delta-y"
        bind:value={$workspace.deltaY}
        placeholder={$workspace.relativeCount > 1
          ? $t('relative.multipleValues', { count: $workspace.relativeCount })
          : $t('relative.deltaYPlaceholder')}
      />
    </div>
    <div class="input-group">
      <label for="relative-corner">{$t('relative.corner')}</label>
      <select
        id="relative-corner"
        style="width:120px"
        bind:value={$workspace.relativeCorner}
      >
        <option value="TL">{$t('corners.topLeft')}</option>
        <option value="TR">{$t('corners.topRight')}</option>
        <option value="BL">{$t('corners.bottomLeft')}</option>
        <option value="BR">{$t('corners.bottomRight')}</option>
      </select>
    </div>

    <div class="input-group">
      <label for="relative-order">{$t('common.order')}</label>
      <select id="relative-order" bind:value={$workspace.relativeOrder}>
        <option value="grid">{$t('order.grid')}</option>
        <option value="stacking">{$t('order.stacking')}</option>
        <option value="horizontal">{$t('order.horizontal')}</option>
        <option value="vertical">{$t('order.vertical')}</option>
      </select>
      <HelpHint
        id="relative-order-help"
        text={$t(`order.${$workspace.relativeOrder}Hint`)}
      />
    </div>
    <div class="input-group">
      <label for="reverse-move-checkbox">{$t('relative.reverse')}</label>
      <input
        type="checkbox"
        id="reverse-move-checkbox"
        bind:checked={$workspace.reverseMove}
      />
      <HelpHint id="reverse-move-help" text={$t('relative.reverseHint')} />
    </div>
    <div class="input-group">
      <label for="allow-mismatch-paste">{$t('relative.forcePaste')}</label>
      <input
        type="checkbox"
        id="allow-mismatch-paste"
        bind:checked={$workspace.allowMismatchPaste}
      />
      <HelpHint
        id="allow-mismatch-paste-help"
        text={$t('relative.forcePasteHint')}
      />
    </div>
    <div class="input-group">
      <label for="use-artboard-ref">{$t('relative.artboard')}</label>
      <input
        type="checkbox"
        id="use-artboard-ref"
        bind:checked={$workspace.useArtboardRef}
      />
      <HelpHint id="use-artboard-ref-help" text={$t('relative.artboardHint')} />
    </div>
  </div>
  <div class="toolbar">
    <button class="btn" id="copy-pos-button" onclick={actions.copyPosition}
      >{$t('common.copy')}</button
    >
    <button class="btn" id="paste-pos-button" onclick={actions.pastePosition}
      >{$t('common.paste')}</button
    >
  </div>
</div>
