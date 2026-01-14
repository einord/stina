<script lang="ts" setup>
import { computed, watchEffect } from 'vue'
import type { ExtensionComponentData } from '@stina/extension-api'
import { useExtensionScope, resolveComponentProps } from '../../composables/useExtensionScope.js'

const props = defineProps<{
  extensionComponent: ExtensionComponentData
}>()

const scope = useExtensionScope()

const componentProps = computed(() => {
  return resolveComponentProps(props.extensionComponent, scope.value)
})

const sanitizedStyles = computed(() => {
  return componentProps.value.__sanitizedStyle?.styles ?? {}
})

// Log blocked styles (helps developers identify issues)
watchEffect(() => {
  const blocked = componentProps.value.__sanitizedStyle?.blocked
  if (blocked && blocked.length > 0) {
    console.warn(
      `[ExtensionComponent] Blocked unsafe styles for ${props.extensionComponent.component}:`,
      blocked
    )
  }
})
</script>

<template>
  <!-- Wrapper div only rendered when styles are present to avoid layout interference -->
  <div v-if="Object.keys(sanitizedStyles).length > 0" class="extension-component-styled" :style="sanitizedStyles">
    <component :is="`Extension${extensionComponent.component}`" v-bind="componentProps" />
  </div>
  <component :is="`Extension${extensionComponent.component}`" v-else v-bind="componentProps" />
</template>

<style scoped>
/* No base styles needed - the wrapper only exists when custom styles are applied */
</style>
