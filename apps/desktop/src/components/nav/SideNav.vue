<template>
  <aside class="nav">
    <button
      class="navbtn"
      :class="{ active: value === 'chat' }"
      @click="$emit('update:value', 'chat')"
      :title="t('nav.chat')"
    >
      <i-hugeicons-chat-01 />
    </button>
    <button
      class="navbtn"
      :class="{ active: value === 'tools' }"
      @click="$emit('update:value', 'tools')"
      :title="t('nav.tools')"
    >
      <i-hugeicons-wrench-01 />
    </button>
    <button
      class="navbtn"
      :class="{ active: value === 'settings' }"
      @click="$emit('update:value', 'settings')"
      :title="t('nav.settings')"
    >
      <i-hugeicons-settings-02 />
    </button>
  </aside>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';

  defineProps<{ value: 'chat' | 'tools' | 'settings' }>();
</script>

<style scoped>
  .nav {
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--bg-elev);
  }
  .navbtn {
    width: 50px;
    height: 50px;
    border: none;
    border-right: 2px solid transparent;
    background: var(--panel);
    color: var(--text);
    font-size: 18px;
    padding-right: 2px;
  }
  .navbtn.active {
    border-right: 2px solid var(--primary);
  }
  .navbtn:hover {
    filter: brightness(0.85);
  }
</style>
