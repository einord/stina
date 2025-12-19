<script setup lang="ts" generic="T">
  import NavButtonBase from './NavButtonBase.vue';

  defineProps<{
    value?: T;
    title?: string;
  }>();

  const currentActive = defineModel<T>();
</script>

<template>
  <NavButtonBase class="nav-button" :value="value" :title="title" v-model="currentActive">
    <slot></slot>
  </NavButtonBase>
</template>

<style scoped>
  .nav-button {
    text-align: center;
  }
</style>
