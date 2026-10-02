<script lang="ts">
  import { t } from '../i18n';
  import { actions } from '../services/actions';
</script>

<div class="panel active" id="panel-swap">
  <div class="toolbar">
    <div class="swap-grid">
      <div class="swap-col">
        <button
          class="btn"
          id="swap-tl-button"
          onclick={() => actions.swap('TL')}>{$t('swap.topLeft')}</button
        >
        <button
          class="btn"
          id="swap-bl-button"
          onclick={() => actions.swap('BL')}>{$t('swap.bottomLeft')}</button
        >
      </div>
      <div class="swap-col">
        <button
          class="btn"
          id="swap-tr-button"
          onclick={() => actions.swap('TR')}>{$t('swap.topRight')}</button
        >
        <button
          class="btn"
          id="swap-br-button"
          onclick={() => actions.swap('BR')}>{$t('swap.bottomRight')}</button
        >
      </div>
    </div>
  </div>
</div>
