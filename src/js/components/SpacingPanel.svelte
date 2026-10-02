<script lang="ts">
  import { workspace } from '../stores/workspace';
  import { t } from '../i18n';
  import { actions } from '../services/actions';
  import ArrangementIcon from './ArrangementIcon.svelte';
  import HelpHint from './HelpHint.svelte';
  import type { AlignmentMode, DistributionMode } from '../../shared/host';

  const alignmentRows: AlignmentMode[][] = [
    ['left', 'horizontalCenter', 'right', 'center'],
    ['top', 'verticalCenter', 'bottom']
  ];
  const distributionRows: DistributionMode[][] = [
    ['left', 'horizontalCenter', 'right'],
    ['top', 'verticalCenter', 'bottom']
  ];
</script>

<div class="panel active" id="panel-distribute">
  <h3 class="help-heading">
    {$t('alignment.title')}<HelpHint
      id="alignment-help"
      text={$t('alignment.hint')}
    />
  </h3>
  {#each alignmentRows as row}
    <div class="toolbar">
      {#each row as mode}
        <button
          class="btn arrangement-icon-button"
          id={`align-${mode}-button`}
          title={$t(`alignment.${mode}`)}
          aria-label={$t(`alignment.${mode}`)}
          onclick={() => actions.alignObjects(mode)}
          ><ArrangementIcon kind="align" {mode} /></button
        >
      {/each}
    </div>
  {/each}

  <h3 class="help-heading">
    {$t('distribution.title')}<HelpHint
      id="distribution-help"
      text={$t('distribution.hint')}
    />
  </h3>
  {#each distributionRows as row}
    <div class="toolbar">
      {#each row as mode}
        <button
          class="btn arrangement-icon-button"
          id={`distribute-${mode}-button`}
          title={$t(`distribution.${mode}`)}
          aria-label={$t(`distribution.${mode}`)}
          onclick={() => actions.distributeObjects(mode)}
          ><ArrangementIcon kind="distribute" {mode} /></button
        >
      {/each}
    </div>
  {/each}

  <h3>{$t('spacing.even')}</h3>
  <div class="toolbar">
    <span class="help-action">
      <button
        class="btn spacing-button"
        id="distribute-horizontal-button"
        aria-label={$t('spacing.horizontalHint')}
        onclick={() => actions.distribute('horizontal')}
        ><ArrangementIcon kind="spacing" mode="horizontal" />{$t(
          'spacing.horizontal'
        )}</button
      >
      <HelpHint
        id="distribute-horizontal-help"
        text={$t('spacing.horizontalHint')}
      />
    </span>
    <span class="help-action">
      <button
        class="btn spacing-button"
        id="distribute-vertical-button"
        aria-label={$t('spacing.verticalHint')}
        onclick={() => actions.distribute('vertical')}
        ><ArrangementIcon kind="spacing" mode="vertical" />{$t(
          'spacing.vertical'
        )}</button
      >
      <HelpHint
        id="distribute-vertical-help"
        text={$t('spacing.verticalHint')}
      />
    </span>
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

<style>
  h3 {
    display: flex;
    align-items: center;
    margin: 16px 0 8px;
  }

  h3:first-child {
    margin-top: 0;
  }

  .arrangement-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 36px;
    padding: 5px;
  }

  .spacing-button {
    display: inline-flex;
    align-items: center;
  }

  .spacing-button :global(svg) {
    margin-right: 6px;
  }

  .arrangement-icon-button:focus-visible,
  .spacing-button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
</style>
