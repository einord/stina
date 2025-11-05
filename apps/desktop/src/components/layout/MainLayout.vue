<template>
  <div class="layout">
    <SideNav v-model:value="active" />
    <section class="content">
      <slot :active="active" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import SideNav from '../nav/SideNav.vue';

const active = defineModel<'chat'|'todos'|'tools'|'settings'>('value', { default: 'chat' });
</script>

<style scoped>
.layout { display: grid; grid-template-columns: auto 1fr; height: 100%; }
.content { height: 100%; }
</style>