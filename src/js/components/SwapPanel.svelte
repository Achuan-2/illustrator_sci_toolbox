<script lang="ts">
  import { t } from '../i18n';
  import { actions } from '../services/actions';
  import SwapIcon from './SwapIcon.svelte';
  import type { SwapAnchor } from '../../shared/host';

  const buttons: { anchor: SwapAnchor; label: string }[] = [
    { anchor: 'TL', label: 'swap.topLeft' },
    { anchor: 'TC', label: 'swap.topCenter' },
    { anchor: 'TR', label: 'swap.topRight' },
    { anchor: 'LC', label: 'swap.leftCenter' },
    { anchor: 'C', label: 'swap.center' },
    { anchor: 'RC', label: 'swap.rightCenter' },
    { anchor: 'BL', label: 'swap.bottomLeft' },
    { anchor: 'BC', label: 'swap.bottomCenter' },
    { anchor: 'BR', label: 'swap.bottomRight' }
  ];
</script>

<div class="panel active" id="panel-swap">
  <div class="swap-anchor-grid">
    {#each buttons as button}
      <button
        class="btn swap-button"
        id={`swap-${button.anchor.toLowerCase()}-button`}
        title={$t(button.label)}
        aria-label={$t(button.label)}
        onclick={() => actions.swap(button.anchor)}
      >
        <SwapIcon anchor={button.anchor} />
        <span>{$t(button.label)}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .swap-anchor-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-gap: 8px;
    max-width: 360px;
  }

  .swap-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px 6px;
    min-width: 0;
    font: inherit;
  }

  .swap-button span {
    margin-top: 6px;
    overflow-wrap: break-word;
  }

  .swap-button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
</style>
