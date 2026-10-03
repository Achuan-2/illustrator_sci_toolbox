<script lang="ts">
  import { onMount } from 'svelte';
  import {
    settings,
    persistSettings,
    normalizeSettings,
    storageKey,
    readSettings
  } from '../stores/settings';
  import { exitLabelEditing } from '../stores/workspace';
  import { t, loadInstalledTranslations } from '../i18n';
  import { bridge } from '../services/bridge';
  import {
    isZoomWindow,
    loadZoomSession,
    openZoomModal,
    openZoomLoading
  } from '../stores/zoomModal';
  import RelativePanel from '../components/RelativePanel.svelte';
  import ArrangePanel from '../components/ArrangePanel.svelte';
  import SpacingPanel from '../components/SpacingPanel.svelte';
  import SwapPanel from '../components/SwapPanel.svelte';
  import LabelsPanel from '../components/LabelsPanel.svelte';
  import SizePanel from '../components/SizePanel.svelte';
  import BorderPanel from '../components/BorderPanel.svelte';
  import ZoomPanel from '../components/ZoomPanel.svelte';
  import PseudocolorPanel from '../components/PseudocolorPanel.svelte';
  import PalettePanel from '../components/PalettePanel.svelte';
  import ZoomModal from '../components/ZoomModal.svelte';
  import SelectionPanel from '../components/SelectionPanel.svelte';
  import SettingsPanel from '../components/SettingsPanel.svelte';
  import AboutPanel from '../components/AboutPanel.svelte';
  import { actions } from '../services/actions';

  const standaloneZoom = isZoomWindow();

  const panels = [
    { id: 'relative', component: RelativePanel },
    { id: 'distribute', component: SpacingPanel },
    { id: 'arrange', component: ArrangePanel },
    { id: 'swap', component: SwapPanel },
    { id: 'size', component: SizePanel },
    { id: 'labels', component: LabelsPanel },
    { id: 'border', component: BorderPanel },
    { id: 'zoom', component: ZoomPanel },
    { id: 'pseudocolor', component: PseudocolorPanel },
    { id: 'palettes', component: PalettePanel },
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
    if (standaloneZoom) return;
    const hash = location.hash.slice(1);
    active = panels.some((panel) => panel.id === hash) ? hash : 'relative';
  }
  function activate(id: string) {
    active = id;
    location.hash = id;
  }
  function endOffsetEditing(event: Event) {
    if (standaloneZoom) return;
    const target = event.target as HTMLElement;
    if (target.closest('.sci-tooltip')) return;
    if (!target.matches('input, select, button')) return;
    // Checkbox activation changes the DOM before click, but bind:checked saves
    // it on change. Wait for that binding before updating the shared workspace.
    if (event.type === 'click' && target.matches('input[type="checkbox"]'))
      return;
    if (event.type === 'change' && !target.matches('input[type="checkbox"]'))
      return;
    if (target.id !== 'label-offset-x' && target.id !== 'label-offset-y')
      exitLabelEditing();
  }

  onMount(() => {
    let dispose = () => {};
    try {
      dispose = persistSettings(localStorage);
    } catch (error) {
      console.error('Settings storage unavailable', error);
    }
    void loadInstalledTranslations();

    if (standaloneZoom) {
      if (window.__adobe_cep__) {
        void bridge
          .initialize()
          .catch((err) =>
            console.error('Zoom window host initialization failed', err)
          );
      }

      let lastLoadedTimestamp = 0;
      const applySession = (session: ReturnType<typeof loadZoomSession>) => {
        if (!session || session.timestamp <= lastLoadedTimestamp) return;
        if (session.settings) {
          const normalized = normalizeSettings(session.settings);
          settings.set(normalized);
          try {
            localStorage.setItem(storageKey, JSON.stringify(normalized));
          } catch {}
        }
        if (session.data)
          openZoomModal(session.data, normalizeSettings(session.settings));
        else openZoomLoading(session.error);
        lastLoadedTimestamp = session.timestamp;
      };

      const initialSession = loadZoomSession();
      applySession(initialSession);

      const onStorage = (e: StorageEvent) => {
        if (e.key === 'sci_zoom_session' && e.newValue) {
          try {
            const s = JSON.parse(e.newValue);
            applySession(s);
          } catch {}
        }
      };
      window.addEventListener('storage', onStorage);

      const onFocus = () => {
        const fresh = loadZoomSession();
        if (fresh && fresh.timestamp > lastLoadedTimestamp) {
          applySession(fresh);
        }
      };
      window.addEventListener('focus', onFocus);

      const onCepUpdate = () => {
        const fresh = loadZoomSession();
        if (fresh) applySession(fresh);
      };
      if (window.__adobe_cep__?.addEventListener) {
        window.__adobe_cep__.addEventListener(
          'com.example.achuanPlugin.zoomSessionUpdate',
          onCepUpdate
        );
      }

      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener('focus', onFocus);
        if (window.__adobe_cep__?.removeEventListener) {
          window.__adobe_cep__.removeEventListener(
            'com.example.achuanPlugin.zoomSessionUpdate',
            onCepUpdate
          );
        }
        dispose();
      };
    }

    readHash();
    let syncTimer: number | undefined;
    const onSettingsUpdate = () => {
      const freshSettings = readSettings(localStorage);
      settings.set(freshSettings);
    };
    if (window.__adobe_cep__?.addEventListener) {
      window.__adobe_cep__.addEventListener(
        'com.example.achuanPlugin.settingsUpdate',
        onSettingsUpdate
      );
    }
    if (window.__adobe_cep__) {
      void bridge
        .initialize()
        .then(() => {
          syncTimer = window.setInterval(() => {
            void actions.syncZoom();
          }, 400);
        })
        .catch((error) => console.error('Host initialization failed', error));
    }
    return () => {
      if (syncTimer) clearInterval(syncTimer);
      if (window.__adobe_cep__?.removeEventListener) {
        window.__adobe_cep__.removeEventListener(
          'com.example.achuanPlugin.settingsUpdate',
          onSettingsUpdate
        );
      }
      dispose();
    };
  });
</script>

<svelte:head>
  <title>{standaloneZoom ? $t('zoom.title') : $t('app.title')}</title>
</svelte:head>
<svelte:window
  onhashchange={readHash}
  onfocusin={endOffsetEditing}
  onclick={endOffsetEditing}
  onchange={endOffsetEditing}
/>
<svelte:document
  oncontextmenu={(event) => event.preventDefault()}
  onkeydown={(event) => {
    if (!standaloneZoom && event.key === 'Escape') exitLabelEditing();
  }}
/>

{#if standaloneZoom}
  <div
    class="zoom-standalone-root"
    lang={$settings.language === 'zh_CN' ? 'zh-CN' : 'en'}
  >
    <ZoomModal standalone={true} />
  </div>
{:else}
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

    <ZoomModal standalone={false} />
  </div>
{/if}

<style>
  .zoom-standalone-root {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-panel, #262626);
  }
</style>
