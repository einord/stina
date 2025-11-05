<template>
  <aside class="nav">
    <button class="navbtn" :class="{active: value==='chat'}" @click="$emit('update:value','chat')" title="Chat">
      <i-hugeicons-chat-01 />
    </button>
    <button class="navbtn" :class="{active: value==='todos'}" @click="$emit('update:value','todos')" title="Todos">
      <i-hugeicons-check-list />
    </button>
    <button class="navbtn" :class="{active: value==='tools'}" @click="$emit('update:value','tools')" title="Tools">
      <i-hugeicons-lasso-tool-01 />
    </button>
    <button class="navbtn" :class="{active: value==='settings'}" @click="$emit('update:value','settings')" title="Settings">
      <i-hugeicons-settings-02 />
    </button>
  </aside>
</template>

<script setup lang="ts">
const props = defineProps<{ value: 'chat'|'todos'|'tools'|'settings' }>();
</script>

<style scoped>
.nav { display: grid; gap: var(--space-2); padding: var(--space-3); width: 56px; border-right: 1px solid var(--border); background: var(--bg-elev); }
.navbtn { width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--border); background: var(--panel); color: var(--text); font-size: 18px; }
.navbtn.active { outline: 2px solid var(--primary); }
.navbtn:hover { filter: brightness(0.95); }
</style>