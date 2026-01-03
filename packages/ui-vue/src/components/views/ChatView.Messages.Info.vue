<script setup lang="ts">
defineProps<{
  message: string
}>()
</script>

<template>
  <div class="info">
    {{ message }}
  </div>
</template>

<style scoped>
.info {
  width: 100%;
  text-align: center;
  padding-bottom: 1rem;
  font-style: italic;
}
</style>
