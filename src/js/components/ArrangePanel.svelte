<script lang="ts">
  import { workspace } from '../stores/workspace';
  import { t } from '../i18n';
  import { actions } from '../services/actions';
</script>

<div class="panel active" id="panel-arrange">
  <div class="grid">
    <div class="input-group">
      <label for="auto-layout">{$t('arrange.auto')}</label>
      <input
        type="checkbox"
        id="auto-layout"
        title={$t('arrange.autoHint')}
        bind:checked={$workspace.autoLayout}
      />
    </div>
    <div class="input-group" id="align-edges-group">
      <label for="align-edges">{$t('arrange.alignEdges')}</label>
      <input
        type="checkbox"
        id="align-edges"
        title={$t('arrange.alignEdgesHint')}
        bind:checked={$workspace.alignEdges}
      />
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
        title={$t('arrange.layoutWidthHint')}
        bind:value={$workspace.layoutWidth}
      />
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
        <option value="original" title={$t('arrange.originalHint')}
          >{$t('arrange.original')}</option
        >
        <option value="auto" title={$t('arrange.autoSizeHint')}
          >{$t('arrange.autoSize')}</option
        >
        <option value="custom" title={$t('arrange.customSizeHint')}
          >{$t('arrange.customSize')}</option
        >
      </select>
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
        title={$t('arrange.useWidth')}
        bind:checked={$workspace.useUniformWidth}
      />
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
        title={$t('arrange.useHeight')}
        bind:checked={$workspace.useUniformHeight}
      />
    </div>

    <div class="input-group">
      <label for="arrange-order">{$t('common.order')}</label>
      <select id="arrange-order" bind:value={$workspace.arrangeOrder}>
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
      <label for="arrange-reverse-order">{$t('common.reverseOrder')}</label>
      <input
        type="checkbox"
        id="arrange-reverse-order"
        title={$t('common.reverseOrderHint')}
        bind:checked={$workspace.arrangeReverseOrder}
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
