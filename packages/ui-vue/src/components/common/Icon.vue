<script setup lang="ts">
import { computed } from 'vue'
import type { HugeIconName } from '@stina/extension-api'
import { Icon as IconifyIcon, addCollection } from '@iconify/vue'
import hugeicons from '@iconify-json/hugeicons/icons.json'
import { registerStinaIcons } from '../../icons/stina-icons.js'

addCollection(hugeicons)
registerStinaIcons()

const props = defineProps<{
  /** Icon name from Hugeicons, with or without the "hugeicons:" prefix */
  name: HugeIconName
  title?: string
}>()

const iconName = computed(() => {
  return props.name.includes(':') ? props.name : `hugeicons:${props.name}`
})

const ariaLabel = computed(() => props.title ?? props.name)
</script>

<template>
  <IconifyIcon :icon="iconName" :aria-label="ariaLabel" role="img" class="icon stina-icon" :title="title" />
</template>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
}
</style>
