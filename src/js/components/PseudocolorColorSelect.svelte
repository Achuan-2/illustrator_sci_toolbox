<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../i18n';
  import {
    layerColorIds,
    layerColorHex,
    type LayerColorId
  } from '../services/pseudocolorLayers';
  const colorOptions: readonly LayerColorId[] = [
    'green',
    ...layerColorIds.filter((color) => color !== 'green')
  ];
  interface Props {
    id: string;
    value: LayerColorId;
    disabled?: boolean;
    onchange?: (value: LayerColorId) => void;
  }
  let { id, value = $bindable(), disabled = false, onchange }: Props = $props();
  let open = $state(false);
  let root: HTMLDivElement;
  let trigger: HTMLButtonElement;
  $effect(() => {
    if (disabled) open = false;
  });
  async function focusOption(index: number) {
    await tick();
    root
      ?.querySelectorAll<HTMLButtonElement>('[role="option"]')
      [index]?.focus();
  }
  function close(restoreFocus = false) {
    open = false;
    if (restoreFocus) trigger?.focus();
  }
  function choose(color: LayerColorId) {
    value = color;
    onchange?.(color);
    close(true);
  }
  function toggle() {
    open = !open;
    if (open) void focusOption(colorOptions.indexOf(value));
  }
  function keydown(event: KeyboardEvent, index = colorOptions.indexOf(value)) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') close();
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const wasOpen = open;
      open = true;
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? colorOptions.length - 1
            : wasOpen
              ? (index +
                  (event.key === 'ArrowDown' ? 1 : -1) +
                  colorOptions.length) %
                colorOptions.length
              : index;
      void focusOption(next);
    } else if (open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      choose(colorOptions[index]);
    }
  }
</script>

<svelte:document
  onpointerdown={(event) => {
    if (open && root && !root.contains(event.target as Node)) close();
  }}
/>
<div
  class="color-select"
  bind:this={root}
  onfocusout={(event) => {
    if (open && !root.contains(event.relatedTarget as Node | null)) close();
  }}
>
  <button
    {id}
    bind:this={trigger}
    type="button"
    class="color-trigger"
    role="combobox"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={`${id}-options`}
    aria-labelledby={`${id}-label`}
    {disabled}
    onclick={toggle}
    onkeydown={(event) => keydown(event)}
  >
    <span
      class="color-swatch"
      style:background={`linear-gradient(90deg, #000000, ${layerColorHex[value]})`}
      aria-hidden="true"
    ></span>
    <span class="color-name">{$t(`pseudocolor.luts.${value}`)}</span><span
      class="arrow"
      aria-hidden="true">▾</span
    >
  </button>
  {#if open}
    <div
      id={`${id}-options`}
      class="color-options"
      role="listbox"
      aria-labelledby={`${id}-label`}
    >
      {#each colorOptions as color, index}
        <button
          type="button"
          role="option"
          aria-selected={color === value}
          data-color={color}
          class="color-option"
          onclick={() => choose(color)}
          onkeydown={(event) => keydown(event, index)}
        >
          <span
            class="color-swatch"
            style:background={`linear-gradient(90deg, #000000, ${layerColorHex[color]})`}
            aria-hidden="true"
          ></span>
          <span class="color-name">{$t(`pseudocolor.luts.${color}`)}</span><span
            class="check"
            aria-hidden="true">{color === value ? '✓' : ''}</span
          >
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .color-select {
    position: relative;
    flex: 1 1 150px;
    min-width: 0;
  }
  .color-trigger,
  .color-option {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 7px 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--input-bg, #303030);
    color: var(--text);
    text-align: left;
    font: inherit;
    cursor: pointer;
  }
  .color-trigger:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .color-trigger:focus,
  .color-option:focus {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .color-swatch {
    flex: 0 0 44px;
    height: 14px;
    border: 1px solid #777;
    border-radius: 3px;
    margin-right: 9px;
  }
  .color-name {
    flex: 1;
    min-width: 0;
  }
  .arrow,
  .check {
    margin-left: 8px;
    width: 12px;
  }
  .color-options {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 20;
    margin-top: 3px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface, #252525);
    box-shadow: 0 4px 12px #0008;
  }
  .color-option {
    border-color: transparent;
    background: transparent;
  }
  .color-option:hover,
  .color-option:focus,
  .color-option[aria-selected='true'] {
    background: var(--hover, #444);
  }
</style>
