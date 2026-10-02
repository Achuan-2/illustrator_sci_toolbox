<script lang="ts">
  import { workspace } from '../stores/workspace';
  import { t } from '../i18n';
  import { actions } from '../services/actions';
  import HelpHint from './HelpHint.svelte';

  const sizeHints = {
    original: 'arrange.originalHint',
    auto: 'arrange.autoSizeHint',
    custom: 'arrange.customSizeHint'
  };
</script>

<div class="panel active" id="panel-arrange">
  <div class="grid">
    <div class="input-group">
      <label for="auto-layout">{$t('arrange.auto')}</label>
      <input
        type="checkbox"
        id="auto-layout"
        bind:checked={$workspace.autoLayout}
      />
      <HelpHint id="auto-layout-help" text={$t('arrange.autoHint')} />
    </div>
    <div class="input-group" id="align-edges-group">
      <label for="align-edges">{$t('arrange.alignEdges')}</label>
      <input
        type="checkbox"
        id="align-edges"
        bind:checked={$workspace.alignEdges}
      />
      <HelpHint id="align-edges-help" text={$t('arrange.alignEdgesHint')} />
    </div>
    <div
      class="input-group"
      id="layout-width-group"
      hidden={!$workspace.alignEdges}
    >
      <label for="layout-width">{$t('arrange.layoutWidth')}</label>
      <input
        type="number"
        id="layout-width"
        min="0"
        bind:value={$workspace.layoutWidth}
      />
      <HelpHint id="layout-width-help" text={$t('arrange.layoutWidthHint')} />
    </div>
    <div class="input-group" id="columns-group" hidden={$workspace.autoLayout}>
      <label for="columns">{$t('arrange.columns')}</label>
      <input
        type="number"
        id="columns"
        min="1"
        bind:value={$workspace.columns}
      />
    </div>
    <div class="input-group">
      <label for="row-gap">{$t('arrange.rowGap')}</label>
      <input
        type="number"
        id="row-gap"
        min="0"
        bind:value={$workspace.rowGap}
      />
    </div>
    <div
      class="input-group"
      id="col-gap-group"
      hidden={$workspace.alignEdges && $workspace.sizeMode !== 'auto'}
    >
      <label for="col-gap">{$t('arrange.columnGap')}</label>
      <input
        type="number"
        id="col-gap"
        min="0"
        bind:value={$workspace.colGap}
      />
    </div>
    <div class="input-group">
      <label for="arrange-size-mode">{$t('arrange.objectSize')}</label>
      <select id="arrange-size-mode" bind:value={$workspace.sizeMode}>
        <option value="original">{$t('arrange.original')}</option>
        <option value="auto">{$t('arrange.autoSize')}</option>
        <option value="custom">{$t('arrange.customSize')}</option>
      </select>
      <HelpHint
        id="arrange-size-mode-help"
        text={$t(sizeHints[$workspace.sizeMode])}
      />
    </div>
    <div
      class="input-group"
      id="arrange-custom-width-group"
      hidden={$workspace.sizeMode !== 'custom'}
    >
      <label for="uniform-width">{$t('arrange.resizeWidth')}</label>
      <input
        type="number"
        id="uniform-width"
        min="0"
        bind:value={$workspace.uniformWidth}
      />
      <input
        type="checkbox"
        id="use-uniform-width"
        bind:checked={$workspace.useUniformWidth}
      />
      <HelpHint id="use-uniform-width-help" text={$t('arrange.useWidth')} />
    </div>
    <div
      class="input-group"
      id="arrange-custom-height-group"
      hidden={$workspace.sizeMode !== 'custom'}
    >
      <label for="uniform-height">{$t('arrange.resizeHeight')}</label>
      <input
        type="number"
        id="uniform-height"
        min="0"
        bind:value={$workspace.uniformHeight}
      />
      <input
        type="checkbox"
        id="use-uniform-height"
        bind:checked={$workspace.useUniformHeight}
      />
      <HelpHint id="use-uniform-height-help" text={$t('arrange.useHeight')} />
    </div>

    <div class="input-group">
      <label for="arrange-order">{$t('common.order')}</label>
      <select id="arrange-order" bind:value={$workspace.arrangeOrder}>
        <option value="grid">{$t('order.grid')}</option>
        <option value="stacking">{$t('order.stacking')}</option>
        <option value="horizontal">{$t('order.horizontal')}</option>
        <option value="vertical">{$t('order.vertical')}</option>
      </select>
      <HelpHint
        id="arrange-order-help"
        text={$t(`order.${$workspace.arrangeOrder}Hint`)}
      />
    </div>
    <div class="input-group">
      <label for="arrange-reverse-order">{$t('common.reverseOrder')}</label>
      <input
        type="checkbox"
        id="arrange-reverse-order"
        bind:checked={$workspace.arrangeReverseOrder}
      />
      <HelpHint
        id="arrange-reverse-order-help"
        text={$t('common.reverseOrderHint')}
      />
    </div>
  </div>
  <div class="toolbar">
    <button
      class="btn btn-primary"
      id="arrange-button"
      onclick={actions.arrange}>{$t('arrange.update')}</button
    >
  </div>
</div>
