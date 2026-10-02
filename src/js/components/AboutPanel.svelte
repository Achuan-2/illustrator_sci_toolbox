<script lang="ts">
  import { t } from '../i18n';
  import { openExternal } from '../services/cep';
  import donationImage from '../../icons/donate.webp';
</script>

<div class="panel active" id="panel-about">
  <h3>{$t('about.title')}</h3>
  <p>{$t('about.author')}</p>
  <p>
    <span>{$t('about.github')}</span>
    <a
      href="https://github.com/Achuan-2/illustrator_sci_toolbox"
      target="_blank"
      rel="noreferrer"
      onclick={openExternal}
      style="color: var(--primary); text-decoration: none;"
      >https://github.com/Achuan-2/illustrator_sci_toolbox</a
    >
  </p>
  <p>{$t('about.donation')}</p>
  <img src={donationImage} width="80%" alt={$t('about.donationAlt')} />
</div>
