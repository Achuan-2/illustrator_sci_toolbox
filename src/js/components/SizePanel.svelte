<script lang="ts">
  import { workspace } from '../stores/workspace';
  import { t } from '../i18n';
  import { actions } from '../services/actions';
  import { tooltip } from '../services/tooltip';
</script>

<div class="panel active" id="panel-size">
  <div class="grid">
    <div class="input-group">
      <label for="size-w">{$t('size.width')}</label>
      <input
        type="number"
        id="size-w"
        style="flex: 0 1 60px;"
        bind:value={$workspace.sizeW}
      />
      <input
        type="checkbox"
        id="use-size-w"
        use:tooltip={$t('size.useWidth')}
        bind:checked={$workspace.useSizeW}
      />
    </div>
    <div class="input-group">
      <label for="size-h">{$t('size.height')}</label>
      <input
        type="number"
        id="size-h"
        style="flex: 0 1 60px;"
        bind:value={$workspace.sizeH}
      />
      <input
        type="checkbox"
        id="use-size-h"
        use:tooltip={$t('size.useHeight')}
        bind:checked={$workspace.useSizeH}
      />
    </div>
  </div>
  <div class="toolbar">
    <button class="btn" id="copy-size-button" onclick={actions.copySize}
      >{$t('size.copy')}</button
    >
    <button
      class="btn btn-primary"
      id="paste-size-button"
      onclick={actions.pasteSize}>{$t('size.paste')}</button
    >
  </div>
</div>
