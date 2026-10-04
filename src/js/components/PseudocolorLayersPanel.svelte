<script lang="ts">
  import { onDestroy } from 'svelte';
  import { settings } from '../stores/settings';
  import { t } from '../i18n';
  import { bridge, HostError } from '../services/bridge';
  import {
    defaultMergeChannels,
    enabledChannelIndices,
    isLayerColor,
    type LayerChannel,
    type LayerColorId
  } from '../services/pseudocolorLayers';
  import PseudocolorColorSelect from './PseudocolorColorSelect.svelte';

  interface Props {
    mode: 'batch' | 'merge';
    busy?: boolean;
    onapplied?: () => void;
  }
  let { mode, busy = $bindable(false), onapplied }: Props = $props();
  interface Target {
    name: string;
    width: number;
    height: number;
    lut?: LayerColorId | null;
  }
  interface Session {
    sessionId: string;
    targets: Target[];
  }
  let lut = $state<LayerColorId>(
    isLayerColor($settings.pseudocolorLut) ? $settings.pseudocolorLut : 'red'
  );
  let session = $state.raw<Session | null>(null);
  let channels = $state<LayerChannel[]>([]);
  let error = $state(''),
    success = $state('');
  const mergeError = $derived.by(() => {
    if (!session) return '';
    const indices = enabledChannelIndices(channels);
    if (indices.length < 2 || indices.length > 7) return 'errors.mergeCount';
    return '';
  });

  function showError(value: unknown) {
    error =
      value instanceof HostError
        ? $t(value.key, value.args)
        : $t('errors.details', [String(value)]);
  }
  async function clearTargets() {
    const old = session;
    session = null;
    channels = [];
    error = '';
    success = '';
    if (old)
      await bridge
        .call('cancelPseudocolorLayerTargets', old.sessionId)
        .catch(() => {});
  }
  async function readTargets() {
    if (busy) return;
    busy = true;
    try {
      await clearTargets();
      session = JSON.parse(
        await bridge.call('inspectPseudocolorLayerTargets')
      ) as Session;
      channels = defaultMergeChannels(session.targets.length);
      session.targets.forEach((target, index) => {
        if (isLayerColor(target.lut)) channels[index].lut = target.lut;
      });
    } catch (value) {
      showError(value);
    } finally {
      busy = false;
    }
  }

  async function apply() {
    if (busy || (mode === 'merge' && mergeError)) return;
    busy = true;
    error = '';
    success = '';
    try {
      const count = Number(
        await bridge.call(
          'applyPseudocolorLayers',
          JSON.stringify({
            mode,
            lut,
            keepOriginal: $settings.pseudocolorKeepOriginal,
            sessionId: mode === 'merge' ? session?.sessionId : undefined,
            channels:
              mode === 'merge' && session
                ? channels.map((channel) => ({ ...channel }))
                : undefined
          })
        )
      );
      success = $t(
        mode === 'merge' ? 'layers.mergeSuccess' : 'layers.success',
        { count }
      );
      session = null;
      channels = [];
      onapplied?.();
    } catch (value) {
      showError(value);
    } finally {
      busy = false;
    }
  }
  onDestroy(() => {
    if (session)
      void bridge
        .call('cancelPseudocolorLayerTargets', session.sessionId)
        .catch(() => {});
  });
</script>

{#if mode === 'batch'}
  <div class="input-group">
    <label id="pseudocolor-lut-label" for="pseudocolor-lut"
      >{$t('pseudocolor.lut')}</label
    >
    <PseudocolorColorSelect
      id="pseudocolor-lut"
      bind:value={lut}
      disabled={busy}
      onchange={(color) => {
        $settings.pseudocolorLut = color;
      }}
    />
  </div>
  <div class="input-group">
    <label for="pseudocolor-keep">{$t('pseudocolor.keepOriginal')}</label>
    <input
      id="pseudocolor-keep"
      type="checkbox"
      bind:checked={$settings.pseudocolorKeepOriginal}
      disabled={busy}
    />
  </div>
{:else}
  {#each channels as channel, index}
    <div class="channel-card">
      <strong
        >{$t('merge.channel', {
          number: index + 1,
          name: session?.targets[index].name || String(index + 1)
        })}</strong
      >
      <div class="input-group">
        <label for={`merge-enable-${index}`}>{$t('merge.include')}</label>
        <input
          id={`merge-enable-${index}`}
          type="checkbox"
          bind:checked={channel.enabled}
          disabled={busy}
        />
      </div>
      <div class="input-group">
        <label id={`merge-lut-${index}-label`} for={`merge-lut-${index}`}
          >{$t('pseudocolor.lut')}</label
        >
        <PseudocolorColorSelect
          id={`merge-lut-${index}`}
          bind:value={channel.lut}
          disabled={busy || !channel.enabled}
        />
      </div>
    </div>
  {/each}
{/if}
<div class="toolbar">
  {#if mode === 'merge'}
    <button
      id="merge-read-button"
      class="btn"
      onclick={readTargets}
      disabled={busy}>{$t('layers.read')}</button
    >
  {/if}
  <button
    id={mode === 'merge' ? 'merge-apply-button' : 'pseudocolor-apply-button'}
    class="btn btn-primary"
    onclick={apply}
    disabled={busy || (mode === 'merge' && !!mergeError)}
  >
    {$t(mode === 'merge' ? 'merge.apply' : 'pseudocolor.apply')}
  </button>
</div>
{#if mode === 'merge' && mergeError}<p class="error">{$t(mergeError)}</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if success}<p class="success" role="status">{success}</p>{/if}

<style>
  .error,
  .success {
    line-height: 1.6;
  }
  .error {
    color: var(--danger);
  }
  .success {
    color: var(--primary);
  }
  .channel-card {
    padding: 10px;
    margin-bottom: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .channel-card strong {
    display: block;
    overflow-wrap: break-word;
    margin-bottom: 8px;
  }
</style>
