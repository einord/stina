<script setup lang="ts">
import { computed } from 'vue'
import { Icon as IconifyIcon, addCollection } from '@iconify/vue'
import hugeicons from '@iconify-json/hugeicons/icons.json'

addCollection(hugeicons)

const props = defineProps<{
  /** Icon name from Hugeicons, with or without the "hugeicons:" prefix */
  name: string
  title?: string
}>()

const iconName = computed(() => {
  return props.name.includes(':') ? props.name : `hugeicons:${props.name}`
})

const ariaLabel = computed(() => props.title ?? props.name)
</script>

<template>
  <IconifyIcon
    :icon="iconName"
    :aria-label="ariaLabel"
    role="img"
    class="stina-icon"
    :title="title"
  />
</template>

<style scoped>
.stina-icon {
  display: inline-block;
  vertical-align: middle;
}
</style>
