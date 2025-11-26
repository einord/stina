<script setup lang="ts">
  import { t } from '@stina/i18n';

  import NavButtonIcon from './NavButtonIcon.vue';

  type alternatives = 'chat' | 'tools' | 'settings';

  const value = defineModel<alternatives>();
</script>

<template>
  <aside class="nav">
    <NavButtonIcon v-model="value" :value="'chat'" :title="t('nav.chat')"
      ><i-hugeicons-chat-01
    /></NavButtonIcon>
    <NavButtonIcon v-model="value" :value="'tools'" :title="t('nav.tools')"
      ><i-hugeicons-wrench-01
    /></NavButtonIcon>
    <NavButtonIcon v-model="value" :value="'settings'" :title="t('nav.settings')"
      ><i-hugeicons-settings-02
    /></NavButtonIcon>
  </aside>
</template>

<style scoped>
  .nav {
    display: flex;
    flex-direction: column;
  }
  .navbtn {
    width: 50px;
    height: 50px;
    border: none;
    color: var(--text);
    font-size: 18px;
    padding-right: 2px;
  }
  .navbtn:hover {
    filter: brightness(0.85);
  }
</style>
