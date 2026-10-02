<script lang="ts">
  import { t } from '../i18n';
  import { actions } from '../services/actions';
  import HelpHint from './HelpHint.svelte';
</script>

<div class="panel active" id="panel-selection">
  <h3>{$t('selection.filter')}</h3>
  <div class="toolbar">
    <span class="help-action">
      <button
        class="btn btn-primary"
        id="select-text-only-button"
        onclick={() => actions.filterSelection('textOnly')}
        >{$t('selection.textOnly')}</button
      >
      <HelpHint
        id="select-text-only-help"
        text={$t('selection.textOnlyHint')}
      />
    </span>
    <span class="help-action">
      <button
        class="btn"
        id="exclude-text-button"
        onclick={() => actions.filterSelection('excludeText')}
        >{$t('selection.excludeText')}</button
      >
      <HelpHint id="exclude-text-help" text={$t('selection.excludeTextHint')} />
    </span>
  </div>
</div>
