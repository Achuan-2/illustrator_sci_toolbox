<script lang="ts">
  import { workspace } from '../stores/workspace';
  import { t } from '../i18n';
  import { actions } from '../services/actions';
</script>

<div class="panel active" id="panel-distribute">
  <h3>{$t('spacing.even')}</h3>
  <div class="toolbar">
    <button
      class="btn"
      id="distribute-horizontal-button"
      onclick={() => actions.distribute('horizontal')}
      >{$t('spacing.horizontal')}</button
    >
    <button
      class="btn"
      id="distribute-vertical-button"
      onclick={() => actions.distribute('vertical')}
      >{$t('spacing.vertical')}</button
    >
  </div>
  <h3>{$t('spacing.paste')}</h3>

  <div class="grid">
    <div class="input-group">
      <label for="spacing-value-horizontal"
        >{$t('spacing.horizontalValue')}</label
      >
      <input
        type="number"
        id="spacing-value-horizontal"
        step="0.1"
        bind:value={$workspace.spacingHorizontal}
      />
    </div>
  </div>
  <div class="toolbar">
    <button
      class="btn"
      id="copy-spacing-horizontal-button"
      onclick={() => actions.copySpacing('horizontal')}
      >{$t('common.copy')}</button
    >
    <button
      class="btn"
      id="move-left-horizontal-button"
      onclick={() => actions.pasteSpacing('horizontal', true)}
      >{$t('spacing.moveLeft')}</button
    >
    <button
      class="btn"
      id="move-right-horizontal-button"
      onclick={() => actions.pasteSpacing('horizontal', false)}
      >{$t('spacing.moveRight')}</button
    >
  </div>

  <div class="grid">
    <div class="input-group">
      <label for="spacing-value-vertical">{$t('spacing.verticalValue')}</label>
      <input
        type="number"
        id="spacing-value-vertical"
        step="0.1"
        bind:value={$workspace.spacingVertical}
      />
    </div>
  </div>
  <div class="toolbar">
    <button
      class="btn"
      id="copy-spacing-vertical-button"
      onclick={() => actions.copySpacing('vertical')}
      >{$t('common.copy')}</button
    >
    <button
      class="btn"
      id="move-top-vertical-button"
      onclick={() => actions.pasteSpacing('vertical', true)}
      >{$t('spacing.moveTop')}</button
    >
    <button
      class="btn"
      id="move-bottom-vertical-button"
      onclick={() => actions.pasteSpacing('vertical', false)}
      >{$t('spacing.moveBottom')}</button
    >
  </div>
</div>
