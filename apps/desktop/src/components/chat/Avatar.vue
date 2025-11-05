<template>
  <div class="avatar" :title="alt">{{ label }}</div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label?: string; alt?: string }>(), { label: '🙂' });
</script>

<style scoped>
.avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  display: grid; place-items: center;
  background: var(--panel);
  border: 1px solid var(--border);
  font-size: 16px;
}
</style>