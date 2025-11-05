<template>
  <aside class="nav">
    <button class="navbtn" :class="{active: value==='todos'}" @click="$emit('update:value','todos')" title="Todos">🗒️</button>
    <button class="navbtn" :class="{active: value==='tools'}" @click="$emit('update:value','tools')" title="Tools">⛏️</button>
    <button class="navbtn" :class="{active: value==='settings'}" @click="$emit('update:value','settings')" title="Settings">⚙️</button>
  </aside>
</template>

<script setup lang="ts">
const props = defineProps<{ value: 'chat'|'todos'|'tools'|'settings' }>();
</script>

<style scoped>
.nav { display: grid; gap: var(--space-2); padding: var(--space-3); width: 56px; border-right: 1px solid var(--border); background: var(--bg-elev); }
.navbtn { width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--border); background: var(--panel);}
.navbtn.active { outline: 2px solid var(--primary); }
</style>