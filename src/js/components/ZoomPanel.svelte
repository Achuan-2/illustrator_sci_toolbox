<script lang="ts">
  import { t } from '../i18n';
  import { settings } from '../stores/settings';
  import { actions } from '../services/actions';
  import {
    openZoomModal,
    openZoomLoading,
    saveZoomSession,
    hasZoomExtension,
    ZOOM_EXTENSION_ID
  } from '../stores/zoomModal';
  import { HostError } from '../services/bridge';

  let loading = $state(false);

  async function openEditor() {
    if (loading) return;
    loading = true;
    const separateWindow = hasZoomExtension();
    try {
      // Open the window while Illustrator prepares the preview.
      if (separateWindow) {
        saveZoomSession(null, $settings);
        window.__adobe_cep__?.requestOpenExtension?.(ZOOM_EXTENSION_ID, '');
      } else {
        openZoomLoading();
      }
      const data = await actions.inspectZoom();
      if (data) {
        if (separateWindow) {
          saveZoomSession(data, $settings);
        } else {
          openZoomModal(data, $settings);
        }
      }
    } catch (error) {
      const message =
        error instanceof HostError
          ? $t(error.key, error.args)
          : $t('errors.details', [String(error)]);
      if (separateWindow) saveZoomSession(null, $settings, message);
      else openZoomLoading(message);
    } finally {
      loading = false;
    }
  }
</script>

<div class="panel active" id="panel-zoom">
  <fieldset class="settings-group">
    <legend>{$t('zoom.rectSettings')}</legend>
    <div class="grid">
      <div class="input-group">
        <label for="default-line-width">{$t('zoom.lineWidth')}</label>
        <input
          type="number"
          id="default-line-width"
          step="0.5"
          min="0.1"
          max="50"
          bind:value={$settings.zoomLineWidth}
        />
      </div>

      <div class="input-group">
        <label for="default-line-color">{$t('zoom.lineColor')}</label>
        <input
          type="color"
          id="default-line-color"
          bind:value={$settings.zoomLineColor}
        />
      </div>

      <div class="input-group">
        <label for="default-line-style">{$t('zoom.lineStyle')}</label>
        <select id="default-line-style" bind:value={$settings.zoomLineStyle}>
          <option value="dash">{$t('zoom.styleDash')}</option>
          <option value="solid">{$t('zoom.styleSolid')}</option>
          <option value="dot">{$t('zoom.styleDot')}</option>
          <option value="dashdot">{$t('zoom.styleDashDot')}</option>
          <option value="dashdotdot">{$t('zoom.styleDashDotDot')}</option>
        </select>
      </div>

      <div class="input-group">
        <label for="default-keep-square">{$t('zoom.keepSquare')}</label>
        <input
          type="checkbox"
          id="default-keep-square"
          bind:checked={$settings.zoomKeepSquare}
        />
      </div>
    </div>
  </fieldset>

  <fieldset class="settings-group">
    <legend>{$t('zoom.guideSettings')}</legend>
    <div class="grid">
      <div class="input-group">
        <label for="default-add-guides">{$t('zoom.addGuides')}</label>
        <input
          type="checkbox"
          id="default-add-guides"
          bind:checked={$settings.zoomAddGuideLines}
        />
      </div>

      <div class="input-group">
        <label for="default-guide-extent">{$t('zoom.guideExtent')}</label>
        <select
          id="default-guide-extent"
          disabled={!$settings.zoomAddGuideLines}
          bind:value={$settings.zoomGuideLineExtent}
        >
          <option value="insideSourceImage">{$t('zoom.extentInside')}</option>
          <option value="acrossImages">{$t('zoom.extentAcross')}</option>
        </select>
      </div>
    </div>
  </fieldset>

  <fieldset class="settings-group">
    <legend>{$t('zoom.zoomSettings')}</legend>
    <div class="grid">
      <div class="input-group">
        <label for="default-placement">{$t('zoom.placement')}</label>
        <select id="default-placement" bind:value={$settings.zoomPlacement}>
          <option value="right">{$t('zoom.placementRight')}</option>
          <option value="left">{$t('zoom.placementLeft')}</option>
          <option value="top">{$t('zoom.placementTop')}</option>
          <option value="bottom">{$t('zoom.placementBottom')}</option>
        </select>
      </div>
      <div class="input-group">
        <label for="default-use-rect-color">{$t('zoom.useRectColor')}</label>
        <input
          type="checkbox"
          id="default-use-rect-color"
          bind:checked={$settings.zoomUseRectangleColor}
        />
      </div>
    </div>
  </fieldset>

  <div class="toolbar">
    <button
      class="btn btn-primary make-zoom-btn"
      id="make-zoom-button"
      disabled={loading}
      onclick={openEditor}
    >
      {loading ? '...' : $t('zoom.makeZoom')}
    </button>
  </div>
</div>

<style>
  .settings-group {
    min-width: 0;
    margin: 0 0 12px;
    padding: 10px 12px 12px;
    border: 1px solid var(--border, #3a3a3a);
    border-radius: var(--radius-sm, 6px);
  }

  .settings-group legend {
    padding: 0 6px;
    color: var(--text, #eaeaea);
    font-size: 12px;
    font-weight: 600;
  }

  .make-zoom-btn {
    width: 100%;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
</style>
