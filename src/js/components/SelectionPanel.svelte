<script lang="ts">
  import { t } from '../i18n';
  import { actions } from '../services/actions';
</script>

<div class="panel active" id="panel-selection">
  <h3>{$t('selection.filter')}</h3>
  <div class="toolbar">
    <button
      class="btn btn-primary"
      id="select-text-only-button"
      title={$t('selection.textOnlyHint')}
      onclick={() => actions.filterSelection('textOnly')}
      >{$t('selection.textOnly')}</button
    >
    <button
      class="btn"
      id="exclude-text-button"
      title={$t('selection.excludeTextHint')}
      onclick={() => actions.filterSelection('excludeText')}
      >{$t('selection.excludeText')}</button
    >
  </div>
</div>
