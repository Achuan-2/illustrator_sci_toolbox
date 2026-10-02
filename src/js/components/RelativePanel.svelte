<script lang="ts">
  import { workspace } from '../stores/workspace';
  import { t } from '../i18n';
  import { actions } from '../services/actions';
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
        <option value="grid" title={$t('order.gridHint')}
          >{$t('order.grid')}</option
        >
        <option value="stacking" title={$t('order.stackingHint')}
          >{$t('order.stacking')}</option
        >
        <option value="horizontal" title={$t('order.horizontalHint')}
          >{$t('order.horizontal')}</option
        >
        <option value="vertical" title={$t('order.verticalHint')}
          >{$t('order.vertical')}</option
        >
      </select>
    </div>
    <div class="input-group">
      <label for="reverse-move-checkbox">{$t('relative.reverse')}</label>
      <input
        type="checkbox"
        id="reverse-move-checkbox"
        title={$t('relative.reverseHint')}
        bind:checked={$workspace.reverseMove}
      />
    </div>
    <div class="input-group">
      <label for="allow-mismatch-paste">{$t('relative.forcePaste')}</label>
      <input
        type="checkbox"
        id="allow-mismatch-paste"
        title={$t('relative.forcePasteHint')}
        bind:checked={$workspace.allowMismatchPaste}
      />
    </div>
    <div class="input-group">
      <label for="use-artboard-ref">{$t('relative.artboard')}</label>
      <input
        type="checkbox"
        id="use-artboard-ref"
        title={$t('relative.artboardHint')}
        bind:checked={$workspace.useArtboardRef}
      />
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
