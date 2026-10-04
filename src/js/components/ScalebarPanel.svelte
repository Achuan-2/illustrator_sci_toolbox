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
    maxScalebarLengthUm,
    normalizeScalebarStyle,
    type ImageFov,
    type ScalebarOptions,
    type ScalebarInspection,
    type ScalebarTargetInspection
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
  let targets = $state<ScalebarTargetInspection[]>([]);
  let updateFov = $state(false);
  let batch = $derived(targets.length > 1);
  let missingFovCount = $derived(targets.filter((target) =>
    !((options.orientation === 'vertical' ? target.fov?.height : target.fov?.width) ?? 0)
  ).length);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingSave: ReturnType<typeof snapshot> | undefined;
  let editingRevision = 0;
  let maxLength = $derived.by(() => {
    const limits = batch && !updateFov
      ? targets.map((target) => maxScalebarLengthUm(target.fov, options.orientation))
      : [maxScalebarLengthUm(fov, options.orientation)];
    // Each image is capped independently when a batch has different FOVs.
    const maximum = limits.some((limit) => limit === undefined)
      ? undefined
      : Math.max(...(limits as number[]));
    return maximum === undefined
      ? undefined
      : lengthInUnit(maximum, options.unit || fov.unit);
  });

  function clampLength() {
    if (maxLength !== undefined && displayLength > maxLength)
      displayLength = maxLength;
  }

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
      targets = result.targets || (result.token ? [{ token: result.token, fov: result.fov, options: result.options }] : []);
      updateFov = false;
      documentKey = result.documentKey || '';
      error = '';
      fov = result.fov
        ? { ...result.fov }
        : { width: 0, height: 0, unit: 'um' };
      fov.unit = fovUnit(fov.unit);
      options = { ...(result.options || $settings.scalebarStyle) };
      options.unit = fovUnit(options.unit || fov.unit);
      displayLength = lengthInUnit(options.lengthUm, options.unit);
      clampLength();
      hasScalebar = targets.length > 0 && targets.every((target) => Boolean(target.options));
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
    clampLength();
    return {
      token,
      selectionSignature: signature,
      targets: targets.map((target) => ({ token: target.token })),
      updateFov,
      calibrated: batch && !updateFov
        ? missingFovCount === 0
        : (options.orientation === 'vertical' ? fov.height : fov.width) > 0,
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
        payload.selectionSignature === signature &&
        payload.documentKey === documentKey &&
        revision === editingRevision
      ) {
        error = '';
        message = $t('scale.autoSaved');
      }
    } catch (cause) {
      if (
        payload.token === token &&
        payload.selectionSignature === signature &&
        payload.documentKey === documentKey &&
        revision === editingRevision
      )
        report(cause);
    }
  }
  function queueSave(event?: Event) {
    if ((event?.target as HTMLElement | null)?.id?.startsWith('fov-')) updateFov = true;
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
    if (!payload || !payload.calibrated) return;
    // An incomplete numeric input stays editable until a valid value is entered.
    if (
      !payload.saveOnly &&
      (!Number.isFinite(payload.options.lengthUm) ||
        payload.options.lengthUm < 0 ||
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
      if (payload.token === token && payload.selectionSignature === signature && payload.documentKey === documentKey) {
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
    {#if batch}<p id="scalebar-batch-info" class="hint">{$t('scale.batchInfo', { count: targets.length })}</p>{/if}
    {#if batch && !updateFov && missingFovCount > 0}<p class="hint">{$t('scale.batchMissingFov', { count: missingFovCount })}</p>{/if}
    <form
      onsubmit={(event) => event.preventDefault()}
      oninput={queueSave}
      onchange={(event) => {
        queueSave(event);
        void flushSave();
      }}
    >
      <fieldset class="settings-group">
        <legend>{$t('scale.fov')}</legend>
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
      </fieldset>
      <fieldset class="settings-group">
        <legend>{$t('scale.barStyle')}</legend>
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
              max={maxLength}
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
            <label for="scale-auto-group">{$t('scale.autoGroup')}</label><input
              id="scale-auto-group"
              type="checkbox"
              bind:checked={options.autoGroup}
            />
          </div>
        </div>
      </fieldset>
      <fieldset class="settings-group">
        <legend>{$t('scale.fontStyle')}</legend>
        <div class="grid">
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
        </div>
      </fieldset>
    </form>
    {#if !hasScalebar}<div class="toolbar">
        <button
          id="apply-scalebar-button"
          class="btn btn-primary"
          disabled={busy}
          onclick={apply}>{$t(batch ? 'scale.batchAdd' : 'scale.add')}</button
        >
      </div>{/if}
  {/if}
  {#if busy}<p role="status">{$t('scale.loading')}</p>{/if}
  {#if message}<p role="status" class="hint">{message}</p>{/if}
  {#if error}<p role="alert" class="scale-error">{error}</p>{/if}
</div>

<style>
  .settings-group {
    min-width: 0;
    margin: 0 0 12px;
    padding: 10px 12px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .settings-group legend {
    padding: 0 6px;
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
  }
  .scale-error {
    color: var(--danger);
  }
  .hint {
    line-height: 1.5;
    color: var(--muted);
  }
</style>
