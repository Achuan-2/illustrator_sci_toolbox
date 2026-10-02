<script lang="ts">
  import { settings } from '../stores/settings';
  import { workspace, labelPreview } from '../stores/workspace';
  import { t } from '../i18n';
  import { actions, offsetInput, offsetWheel } from '../services/actions';
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
        title={$t('labels.fontBoldHint')}
        bind:checked={$settings.fontBold}
      />
    </div>
    <div class="input-group">
      <label for="font-color">{$t('labels.fontColor')}</label>
      <input
        type="color"
        id="font-color"
        title={$t('labels.fontColorHint')}
        bind:value={$settings.fontColor}
      />
    </div>
    <div class="input-group">
      <label for="label-offset-x">{$t('labels.offsetX')}</label>
      <input
        type="number"
        id="label-offset-x"
        value={$settings.labelOffsetX}
        class:editing-mode={$workspace.labelEditing}
        title={$workspace.labelEditing ? $t('labels.editingHint') : ''}
        oninput={(event) => offsetInput(event, 'labelOffsetX')}
        onwheel={(event) => offsetWheel(event, 'labelOffsetX')}
      />
    </div>
    <div class="input-group">
      <label for="label-offset-y">{$t('labels.offsetY')}</label>
      <input
        type="number"
        id="label-offset-y"
        value={$settings.labelOffsetY}
        class:editing-mode={$workspace.labelEditing}
        title={$workspace.labelEditing ? $t('labels.editingHint') : ''}
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
        title={$t('labels.undoIndexHint')}
        style="flex: 0 0 auto; padding: 6px 10px;"
        onclick={actions.undoLabelIndex}>↶</button
      >
      <input
        type="checkbox"
        id="auto-update-index"
        title={$t('labels.autoIndexHint')}
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
      <select id="labels-order" bind:value={$settings.labelsOrder}>
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
      <label for="labels-reverse-order">{$t('common.reverseOrder')}</label>
      <input
        type="checkbox"
        id="labels-reverse-order"
        title={$t('common.reverseOrderHint')}
        bind:checked={$settings.labelsReverseOrder}
      />
    </div>
  </div>
  <div class="toolbar">
    <button
      class="btn"
      id="filter-text-button"
      title={$t('selection.textOnlyHint')}
      onclick={actions.filterText}>{$t('labels.selectText')}</button
    >
  </div>
  <div class="toolbar">
    <button
      class="btn btn-primary"
      id="add-label-button"
      title={$t('labels.addHint')}
      onclick={actions.addLabels}>{$t('labels.add')}</button
    >
    <button
      class="btn"
      id="update-label-button"
      title={$t('labels.updateHint')}
      onclick={actions.updateLabels}>{$t('labels.update')}</button
    >
  </div>
</div>
