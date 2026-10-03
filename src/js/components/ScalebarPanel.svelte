<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '../i18n';
  import { bridge, HostError } from '../services/bridge';
  import { settings } from '../stores/settings';
  import {
    defaultScalebar,
    fovUnit,
    unitFactor,
    unitSymbol,
    lengthInUnit,
    normalizeScalebarStyle,
    type ImageFov,
    type ScalebarOptions,
    type ScalebarInspection
  } from '../services/scalebar';

  let { active = false, revision = 0 } = $props<{
    active?: boolean;
    revision?: number;
  }>();
  let token = $state('');
  let documentKey = '';
  let signature = '';
  let inspecting = false;
  let displayLength = $state(50);
  let fov = $state<ImageFov>({ width: 0, height: 0, unit: 'um' });
  let options = $state<ScalebarOptions>({ ...defaultScalebar });
  let busy = $state(false);
  let message = $state('');
  let error = $state('');
  let hasScalebar = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingSave: ReturnType<typeof snapshot> | undefined;
  let editingRevision = 0;

  function report(cause: unknown) {
    error =
      cause instanceof HostError ? $t(cause.key, cause.args) : String(cause);
  }
  async function inspect(force = false) {
    if (inspecting) return;
    inspecting = true;
    try {
      const result: ScalebarInspection | null = JSON.parse(
        await bridge.call('inspectScalebar', force ? '' : signature)
      );
      if (!result) return;
      // The pending snapshot belongs to the previous image, not the new form.
      void flushSave();
      signature = result.signature || result.token;
      token = result.token;
      documentKey = result.documentKey || '';
      error = '';
      fov = result.fov
        ? { ...result.fov }
        : { width: 0, height: 0, unit: 'um' };
      fov.unit = fovUnit(fov.unit);
      options = { ...(result.options || $settings.scalebarStyle) };
      options.unit = fovUnit(options.unit || fov.unit);
      displayLength = lengthInUnit(options.lengthUm, options.unit);
      hasScalebar = Boolean(result.options);
      message = result.errorKey
        ? $t(result.errorKey)
        : result.fov
          ? ''
          : $t('scale.noMetadata');
    } catch (cause) {
      report(cause);
    } finally {
      inspecting = false;
    }
  }

  function snapshot(create = false) {
    return {
      token,
      documentKey,
      fov: { ...fov, source: 'manual' },
      options: {
        ...options,
        lengthUm: displayLength * unitFactor(options.unit || fov.unit)
      },
      saveOnly: !create && !hasScalebar,
      autoSave: !create
    };
  }
  async function save(payload: ReturnType<typeof snapshot>, revision: number) {
    try {
      await bridge.call('applyScalebar', JSON.stringify(payload));
      if (
        payload.token === token &&
        payload.documentKey === documentKey &&
        revision === editingRevision
      ) {
        error = '';
        message = $t('scale.autoSaved');
      }
    } catch (cause) {
      if (
        payload.token === token &&
        payload.documentKey === documentKey &&
        revision === editingRevision
      )
        report(cause);
    }
  }
  function queueSave() {
    if (!token) return;
    const style = normalizeScalebarStyle(
      snapshot().options,
      $settings.scalebarStyle
    );
    settings.update((value) => ({ ...value, scalebarStyle: style }));
    editingRevision += 1;
    if (saveTimer) clearTimeout(saveTimer);
    pendingSave = snapshot();
    saveTimer = setTimeout(() => {
      void flushSave();
    }, 250);
  }
  async function flushSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    const payload = pendingSave;
    pendingSave = undefined;
    if (
      !payload ||
      !(
        (payload.options.orientation === 'vertical'
          ? payload.fov.height
          : payload.fov.width) > 0
      )
    )
      return;
    // An incomplete numeric input stays editable until a valid value is entered.
    if (
      !payload.saveOnly &&
      (!(payload.options.lengthUm > 0) ||
        !(payload.options.thickness > 0) ||
        !(payload.options.fontSize > 0))
    )
      return;
    await save(payload, editingRevision);
  }
  function changeFovUnit(event: Event) {
    const physicalLength = displayLength * unitFactor(options.unit || 'um');
    fov.unit = (event.currentTarget as HTMLSelectElement).value;
    options.unit = fov.unit;
    displayLength = lengthInUnit(physicalLength, fov.unit);
  }
  function changeScaleUnit(event: Event) {
    const nextUnit = (event.currentTarget as HTMLSelectElement).value;
    const physicalLength = displayLength * unitFactor(options.unit || fov.unit);
    options.unit = nextUnit;
    displayLength = lengthInUnit(physicalLength, nextUnit);
  }
  async function apply() {
    if (busy || !token) return;
    const payload = snapshot(true);
    await flushSave();
    busy = true;
    error = '';
    message = '';
    try {
      await bridge.call('applyScalebar', JSON.stringify(payload));
      if (payload.token === token && payload.documentKey === documentKey) {
        hasScalebar = true;
        message = $t('scale.saved');
      }
    } catch (cause) {
      report(cause);
    } finally {
      busy = false;
    }
  }
  // Polling checks identity only. Unchanged selections do not reload drafts,
  // reread TIFFs, write artwork or accumulate bridge requests.
  $effect(() => {
    if (active) {
      void revision;
      untrack(() => {
        void inspect(true);
      });
      const timer = setInterval(() => {
        void inspect();
      }, 350);
      return () => {
        clearInterval(timer);
        void flushSave();
      };
    }
  });
</script>

<div class="panel active" id="panel-scalebar">
  <p class="hint">{$t('scale.description')}</p>
  {#if token}
    <form
      onsubmit={(event) => event.preventDefault()}
      oninput={queueSave}
      onchange={() => {
        queueSave();
        void flushSave();
      }}
    >
      <h3>{$t('scale.fov')}</h3>
      <div class="grid">
        {#if options.orientation === 'horizontal'}
          <div class="input-group">
            <label for="fov-width">{$t('scale.fovWidth')}</label><input
              id="fov-width"
              type="number"
              min="0"
              step="any"
              bind:value={fov.width}
            />
          </div>
        {:else}
          <div class="input-group">
            <label for="fov-height">{$t('scale.fovHeight')}</label><input
              id="fov-height"
              type="number"
              min="0"
              step="any"
              bind:value={fov.height}
            />
          </div>
        {/if}
        <div class="input-group">
          <label for="fov-unit">{$t('scale.unit')}</label><select
            id="fov-unit"
            bind:value={fov.unit}
            onchange={changeFovUnit}
            ><option value="nm">nm</option><option value="um">μm</option><option
              value="mm">mm</option
            ><option value="cm">cm</option><option value="m">m</option><option
              value="inch">inch</option
            ></select
          >
        </div>
      </div>
      <h3>{$t('tabs.scalebar')}</h3>
      <div class="grid">
        <div class="input-group">
          <label for="scale-orientation">{$t('scale.orientation')}</label
          ><select id="scale-orientation" bind:value={options.orientation}
            ><option value="horizontal">{$t('scale.horizontal')}</option><option
              value="vertical">{$t('scale.vertical')}</option
            ></select
          >
        </div>
        <div class="input-group">
          <label for="scale-length"
            >{$t(
              options.orientation === 'horizontal'
                ? 'scale.width'
                : 'scale.height',
              { unit: unitSymbol(options.unit || fov.unit) }
            )}</label
          ><input
            id="scale-length"
            type="number"
            min="0"
            step="any"
            bind:value={displayLength}
          />
        </div>
        <div class="input-group">
          <label for="scale-unit">{$t('scale.barUnit')}</label>
          <select
            id="scale-unit"
            value={options.unit}
            onchange={changeScaleUnit}
          >
            <option value="nm">nm</option><option value="um">μm</option><option
              value="mm">mm</option
            ><option value="cm">cm</option><option value="m">m</option><option
              value="inch">inch</option
            >
          </select>
        </div>
        <div class="input-group">
          <label for="scale-thickness">{$t('scale.thickness')}</label><input
            id="scale-thickness"
            type="number"
            min="0.1"
            step="0.1"
            bind:value={options.thickness}
          />
        </div>
        <div class="input-group">
          <label for="scale-color">{$t('scale.color')}</label><input
            id="scale-color"
            type="color"
            bind:value={options.color}
          />
        </div>
        <div class="input-group">
          <label for="scale-position">{$t('scale.position')}</label><select
            id="scale-position"
            bind:value={options.position}
            ><option value="TL">{$t('scale.TL')}</option><option value="BL"
              >{$t('scale.BL')}</option
            ><option value="TR">{$t('scale.TR')}</option><option value="BR"
              >{$t('scale.BR')}</option
            ></select
          >
        </div>
        <div class="input-group">
          <label for="scale-show-text">{$t('scale.showText')}</label><input
            id="scale-show-text"
            type="checkbox"
            bind:checked={options.showText}
          />
        </div>
        <div class="input-group">
          <label for="scale-font-color">{$t('scale.fontColor')}</label><input
            id="scale-font-color"
            type="color"
            bind:value={options.fontColor}
          />
        </div>
        <div class="input-group">
          <label for="scale-font-size">{$t('scale.fontSize')}</label><input
            id="scale-font-size"
            type="number"
            min="1"
            step="0.5"
            bind:value={options.fontSize}
          />
        </div>
        <div class="input-group">
          <label for="scale-bold">{$t('scale.bold')}</label><input
            id="scale-bold"
            type="checkbox"
            bind:checked={options.bold}
          />
        </div>
        <div class="input-group">
          <label for="scale-auto-group">{$t('scale.autoGroup')}</label><input
            id="scale-auto-group"
            type="checkbox"
            bind:checked={options.autoGroup}
          />
        </div>
      </div>
    </form>
    {#if !hasScalebar}<div class="toolbar">
        <button
          id="apply-scalebar-button"
          class="btn btn-primary"
          disabled={busy}
          onclick={apply}>{$t('scale.add')}</button
        >
      </div>{/if}
  {/if}
  {#if busy}<p role="status">{$t('scale.loading')}</p>{/if}
  {#if message}<p role="status" class="hint">{message}</p>{/if}
  {#if error}<p role="alert" class="scale-error">{error}</p>{/if}
</div>

<style>
  .scale-error {
    color: var(--danger);
  }
  .hint {
    line-height: 1.5;
    color: var(--muted);
  }
</style>
