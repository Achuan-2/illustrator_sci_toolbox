<script lang="ts">
  import { workspace } from '../stores/workspace';
  import { t } from '../i18n';
  import { actions } from '../services/actions';
</script>

<div class="panel active" id="panel-border">
  <div class="grid">
    <div class="input-group">
      <label for="border-color">{$t('border.color')}</label>
      <input
        type="color"
        id="border-color"
        bind:value={$workspace.borderColor}
      />
    </div>
    <div class="input-group">
      <label for="border-thickness">{$t('border.thickness')}</label>
      <input
        type="number"
        id="border-thickness"
        min="0.1"
        step="0.1"
        bind:value={$workspace.borderThickness}
      />
    </div>
    <div class="input-group">
      <label for="border-dash">{$t('border.dash')}</label>
      <input
        type="number"
        id="border-dash"
        min="0"
        step="0.1"
        title={$t('border.dashHint')}
        bind:value={$workspace.borderDash}
      />
    </div>
    <div class="input-group">
      <label for="auto-group-border">{$t('border.autoGroup')}</label>
      <input
        type="checkbox"
        id="auto-group-border"
        bind:checked={$workspace.autoGroupBorder}
      />
    </div>
  </div>
  <div class="toolbar">
    <button
      class="btn btn-primary"
      id="add-border-button"
      onclick={actions.addBorder}>{$t('tabs.border')}</button
    >
  </div>
</div>
