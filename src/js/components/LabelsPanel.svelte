<script lang="ts">
  import { settings } from '../stores/settings';
  import { workspace, labelPreview } from '../stores/workspace';
  import { t } from '../i18n';
  import { actions, offsetInput, offsetWheel } from '../services/actions';
  import { tooltip } from '../services/tooltip';
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
      <input
        type="checkbox"
        id="font-bold"
        use:tooltip={$t('labels.fontBoldHint')}
        bind:checked={$settings.fontBold}
      />
    </div>
    <div class="input-group">
      <label for="font-color">{$t('labels.fontColor')}</label>
      <input
        type="color"
        id="font-color"
        use:tooltip={$t('labels.fontColorHint')}
        bind:value={$settings.fontColor}
      />
    </div>
    <div class="input-group">
      <label for="label-offset-x">{$t('labels.offsetX')}</label>
      <input
        type="number"
        id="label-offset-x"
        use:tooltip={$workspace.labelEditing
          ? $t('labels.editingHint')
          : undefined}
        value={$settings.labelOffsetX}
        class:editing-mode={$workspace.labelEditing}
        oninput={(event) => offsetInput(event, 'labelOffsetX')}
        onwheel={(event) => offsetWheel(event, 'labelOffsetX')}
      />
    </div>
    <div class="input-group">
      <label for="label-offset-y">{$t('labels.offsetY')}</label>
      <input
        type="number"
        id="label-offset-y"
        use:tooltip={$workspace.labelEditing
          ? $t('labels.editingHint')
          : undefined}
        value={$settings.labelOffsetY}
        class:editing-mode={$workspace.labelEditing}
        oninput={(event) => offsetInput(event, 'labelOffsetY')}
        onwheel={(event) => offsetWheel(event, 'labelOffsetY')}
      />
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
        use:tooltip={$t('labels.undoIndexHint')}
        aria-label={$t('labels.undoIndexHint')}
        style="flex: 0 0 auto; padding: 6px 10px;"
        onclick={actions.undoLabelIndex}>↶</button
      >

      <input
        type="checkbox"
        id="auto-update-index"
        use:tooltip={$t('labels.autoIndexHint')}
        bind:checked={$settings.autoUpdateIndex}
      />
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
      <select
        id="labels-order"
        use:tooltip={$t(`order.${$settings.labelsOrder}Hint`)}
        bind:value={$settings.labelsOrder}
      >
        <option value="grid">{$t('order.grid')}</option>
        <option value="stacking">{$t('order.stacking')}</option>
        <option value="horizontal">{$t('order.horizontal')}</option>
        <option value="vertical">{$t('order.vertical')}</option>
      </select>
    </div>
    <div class="input-group">
      <label for="labels-reverse-order">{$t('common.reverseOrder')}</label>
      <input
        type="checkbox"
        id="labels-reverse-order"
        use:tooltip={$t('common.reverseOrderHint')}
        bind:checked={$settings.labelsReverseOrder}
      />
    </div>
  </div>
  <div class="toolbar">
    <button
      class="btn"
      id="filter-text-button"
      use:tooltip={$t('selection.textOnlyHint')}
      onclick={actions.filterText}>{$t('labels.selectText')}</button
    >
  </div>
  <div class="toolbar">
    <button
      class="btn btn-primary"
      id="add-label-button"
      use:tooltip={$t('labels.addHint')}
      onclick={actions.addLabels}>{$t('labels.add')}</button
    >

    <button
      class="btn"
      id="update-label-button"
      use:tooltip={$t('labels.updateHint')}
      onclick={actions.updateLabels}>{$t('labels.update')}</button
    >
  </div>
</div>
