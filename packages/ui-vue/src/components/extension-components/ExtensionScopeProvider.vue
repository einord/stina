<script lang="ts" setup>
import { computed } from 'vue'
import { provideExtensionScope } from '../../composables/useExtensionScope.js'

const props = defineProps<{
  scope: Record<string, unknown>
}>()

provideExtensionScope(computed(() => props.scope))
</script>

<template>
  <slot />
</template>
