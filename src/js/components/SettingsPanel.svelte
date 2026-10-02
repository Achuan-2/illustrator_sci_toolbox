<script lang="ts">
  import { settings } from '../stores/settings';
  import { t } from '../i18n';
  import HelpHint from './HelpHint.svelte';
</script>

<div class="panel active" id="panel-settings">
  <div class="grid">
    <div class="input-group">
      <label for="language">{$t('settings.language')}</label>
      <select id="language" bind:value={$settings.language}>
        <option value="en">{$t('settings.english')}</option>
        <option value="zh_CN">{$t('settings.chinese')}</option>
      </select>
      <HelpHint id="language-help" text={$t('settings.languageHint')} />
    </div>
  </div>
</div>
