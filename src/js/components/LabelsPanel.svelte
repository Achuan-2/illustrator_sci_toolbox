<script lang="ts">
  import { settings } from '../stores/settings';
  import { workspace, labelPreview } from '../stores/workspace';
  import { t } from '../i18n';
  import { actions, offsetInput, offsetWheel } from '../services/actions';
  import HelpHint from './HelpHint.svelte';
</script>

<div class="panel active" id="panel-labels">
  <div class="grid">
    <div class="input-group">
      <label for="font-family">{$t('labels.fontFamily')}</label>
      <select id="font-family" bind:value={$settings.fontFamily}>
        <option value="ArialMT">Arial</option>
        <option value="TimesNewRomanPSMT">Times New Roman</option>
      </select>
    </div>
    <div class="input-group">
      <label for="font-size">{$t('labels.fontSize')}</label>
      <input
        type="number"
        id="font-size"
        min="1"
        bind:value={$settings.fontSize}
      />
    </div>
    <div class="input-group">
      <label for="font-bold">{$t('labels.fontBold')}</label>
      <input type="checkbox" id="font-bold" bind:checked={$settings.fontBold} />
      <HelpHint id="font-bold-help" text={$t('labels.fontBoldHint')} />
    </div>
    <div class="input-group">
      <label for="font-color">{$t('labels.fontColor')}</label>
      <input type="color" id="font-color" bind:value={$settings.fontColor} />
      <HelpHint id="font-color-help" text={$t('labels.fontColorHint')} />
    </div>
    <div class="input-group">
      <label for="label-offset-x">{$t('labels.offsetX')}</label>
      <input
        type="number"
        id="label-offset-x"
        value={$settings.labelOffsetX}
        class:editing-mode={$workspace.labelEditing}
        oninput={(event) => offsetInput(event, 'labelOffsetX')}
        onwheel={(event) => offsetWheel(event, 'labelOffsetX')}
      />
      {#if $workspace.labelEditing}
        <HelpHint id="label-offset-x-help" text={$t('labels.editingHint')} />
      {/if}
    </div>
    <div class="input-group">
      <label for="label-offset-y">{$t('labels.offsetY')}</label>
      <input
        type="number"
        id="label-offset-y"
        value={$settings.labelOffsetY}
        class:editing-mode={$workspace.labelEditing}
        oninput={(event) => offsetInput(event, 'labelOffsetY')}
        onwheel={(event) => offsetWheel(event, 'labelOffsetY')}
      />
      {#if $workspace.labelEditing}
        <HelpHint id="label-offset-y-help" text={$t('labels.editingHint')} />
      {/if}
    </div>
    <div class="input-group">
      <label for="label-template">{$t('labels.template')}</label>
      <select id="label-template" bind:value={$settings.labelTemplate}>
        <option value="a">a</option>
        <option value="A">A</option>
        <option value="(a)">(a)</option>
        <option value="(A)">(A)</option>
        <option value="A)">A)</option>
        <option value="a)">a)</option>
      </select>
    </div>

    <div class="input-group">
      <label for="label-start-count">{$t('labels.index')}</label>
      <input
        type="number"
        id="label-start-count"
        min="1"
        style="flex: 0 1 60px;"
        bind:value={$workspace.labelStartCount}
      />
      <button
        class="btn"
        id="undo-label-index"
        aria-label={$t('labels.undoIndexHint')}
        style="flex: 0 0 auto; padding: 6px 10px;"
        onclick={actions.undoLabelIndex}>↶</button
      >
      <HelpHint id="undo-label-index-help" text={$t('labels.undoIndexHint')} />
      <input
        type="checkbox"
        id="auto-update-index"
        bind:checked={$settings.autoUpdateIndex}
      />
      <HelpHint id="auto-update-index-help" text={$t('labels.autoIndexHint')} />
    </div>
    <div class="input-group">
      <span>{$t('labels.preview')}</span>
      <output
        id="label-preview"
        style="color: var(--primary); font-weight: bold;"
        >{labelPreview(
          $settings.labelTemplate,
          $workspace.labelStartCount
        )}</output
      >
    </div>

    <div class="input-group">
      <label for="labels-order">{$t('common.order')}</label>
      <select id="labels-order" bind:value={$settings.labelsOrder}>
        <option value="grid">{$t('order.grid')}</option>
        <option value="stacking">{$t('order.stacking')}</option>
        <option value="horizontal">{$t('order.horizontal')}</option>
        <option value="vertical">{$t('order.vertical')}</option>
      </select>
      <HelpHint
        id="labels-order-help"
        text={$t(`order.${$settings.labelsOrder}Hint`)}
      />
    </div>
    <div class="input-group">
      <label for="labels-reverse-order">{$t('common.reverseOrder')}</label>
      <input
        type="checkbox"
        id="labels-reverse-order"
        bind:checked={$settings.labelsReverseOrder}
      />
      <HelpHint
        id="labels-reverse-order-help"
        text={$t('common.reverseOrderHint')}
      />
    </div>
  </div>
  <div class="toolbar">
    <span class="help-action">
      <button class="btn" id="filter-text-button" onclick={actions.filterText}
        >{$t('labels.selectText')}</button
      >
      <HelpHint id="filter-text-help" text={$t('selection.textOnlyHint')} />
    </span>
  </div>
  <div class="toolbar">
    <span class="help-action">
      <button
        class="btn btn-primary"
        id="add-label-button"
        onclick={actions.addLabels}>{$t('labels.add')}</button
      >
      <HelpHint id="add-label-help" text={$t('labels.addHint')} />
    </span>
    <span class="help-action">
      <button
        class="btn"
        id="update-label-button"
        onclick={actions.updateLabels}>{$t('labels.update')}</button
      >
      <HelpHint id="update-label-help" text={$t('labels.updateHint')} />
    </span>
  </div>
</div>
