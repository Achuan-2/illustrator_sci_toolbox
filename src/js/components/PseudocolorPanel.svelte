<script lang="ts">
  import { t } from '../i18n';
  import PseudocolorLayersPanel from './PseudocolorLayersPanel.svelte';
  let busy = $state(false);
  let mergeRevision = $state(0);
</script>

<div class="panel active" id="panel-pseudocolor">
  <fieldset id="pseudocolor-group">
    <legend>{$t('tabs.pseudocolor')}</legend>
    <PseudocolorLayersPanel
      mode="batch"
      bind:busy
      onapplied={() => mergeRevision++}
    />
  </fieldset>
  <fieldset id="merge-channels-group">
    <legend>{$t('merge.title')}</legend>
    {#key mergeRevision}
      <PseudocolorLayersPanel mode="merge" bind:busy />
    {/key}
  </fieldset>
</div>

<style>
  fieldset {
    min-width: 0;
    margin: 0 0 16px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  legend {
    padding: 0 6px;
    font-weight: 600;
  }
</style>
