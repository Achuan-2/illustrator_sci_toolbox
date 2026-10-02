<script lang="ts">
  import { onMount } from 'svelte';
  import { settings, persistSettings } from '../stores/settings';
  import { exitLabelEditing } from '../stores/workspace';
  import { t, loadInstalledTranslations } from '../i18n';
  import { bridge } from '../services/bridge';
  import RelativePanel from '../components/RelativePanel.svelte';
  import ArrangePanel from '../components/ArrangePanel.svelte';
  import SpacingPanel from '../components/SpacingPanel.svelte';
  import SwapPanel from '../components/SwapPanel.svelte';
  import LabelsPanel from '../components/LabelsPanel.svelte';
  import SizePanel from '../components/SizePanel.svelte';
  import BorderPanel from '../components/BorderPanel.svelte';
  import SelectionPanel from '../components/SelectionPanel.svelte';
  import SettingsPanel from '../components/SettingsPanel.svelte';
  import AboutPanel from '../components/AboutPanel.svelte';

  const panels = [
    { id: 'relative', component: RelativePanel },
    { id: 'distribute', component: SpacingPanel },
    { id: 'swap', component: SwapPanel },
    { id: 'size', component: SizePanel },
    { id: 'arrange', component: ArrangePanel },
    { id: 'labels', component: LabelsPanel },
    { id: 'border', component: BorderPanel },
    { id: 'selection', component: SelectionPanel },
    { id: 'settings', component: SettingsPanel },
    { id: 'about', component: AboutPanel }
  ];
  let active = $state('relative');
  $effect(() => {
    document.documentElement.lang =
      $settings.language === 'zh_CN' ? 'zh-CN' : 'en';
  });

  function readHash() {
    const hash = location.hash.slice(1);
    active = panels.some((panel) => panel.id === hash) ? hash : 'relative';
  }
  function activate(id: string) {
    active = id;
    location.hash = id;
  }
  function endOffsetEditing(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.matches('input, select, button')) return;
    if (target.id !== 'label-offset-x' && target.id !== 'label-offset-y')
      exitLabelEditing();
  }

  onMount(() => {
    readHash();
    let dispose = () => {};
    try {
      dispose = persistSettings(localStorage);
    } catch (error) {
      console.error('Settings storage unavailable', error);
    }
    void loadInstalledTranslations();
    if (window.__adobe_cep__)
      void bridge
        .initialize()
        .catch((error) => console.error('Host initialization failed', error));
    return dispose;
  });
</script>

<svelte:head>
  <title>{$t('app.title')}</title>
</svelte:head>
<svelte:window
  onhashchange={readHash}
  onfocusin={endOffsetEditing}
  onclick={endOffsetEditing}
/>
<svelte:document
  onkeydown={(event) => {
    if (event.key === 'Escape') exitLabelEditing();
  }}
/>

<div class="app" lang={$settings.language === 'zh_CN' ? 'zh-CN' : 'en'}>
  <nav class="tabs" id="tabs" aria-label={$t('app.title')}>
    {#each panels as panel}
      <button
        class="tab"
        class:active={active === panel.id}
        title={$t(`tabs.${panel.id}`)}
        aria-current={active === panel.id ? 'page' : undefined}
        onclick={() => activate(panel.id)}>{$t(`tabs.${panel.id}`)}</button
      >
    {/each}
  </nav>
  <main class="content">
    <div class="panel-title" id="panel-title">{$t(`tabs.${active}`)}</div>
    {#each panels as panel}
      <!-- Keep mounted so changing tabs preserves in-progress values. -->
      <div hidden={active !== panel.id}>
        <panel.component />
      </div>
    {/each}
  </main>
</div>
