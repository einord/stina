<script lang="ts" setup>
import { computed, watchEffect } from 'vue'
import type { ExtensionComponentData } from '@stina/extension-api'
import { useExtensionScope, resolveComponentProps } from '../../composables/useExtensionScope.js'

const props = defineProps<{
  extensionComponent: ExtensionComponentData
}>()

const scope = useExtensionScope()

const resolvedProps = computed(() => {
  return resolveComponentProps(props.extensionComponent, scope.value)
})

const componentProps = computed(() => {
  const { __sanitizedStyle, ...rest } = resolvedProps.value
  const styles = __sanitizedStyle?.styles ?? {}
  // Include style in props so it falls through to root element
  if (Object.keys(styles).length > 0) {
    return { ...rest, style: styles }
  }
  return rest
})

// Log blocked styles (helps developers identify issues)
watchEffect(() => {
  const blocked = resolvedProps.value.__sanitizedStyle?.blocked
  if (blocked && blocked.length > 0) {
    console.warn(
      `[ExtensionComponent] Blocked unsafe styles for ${props.extensionComponent.component}:`,
      blocked
    )
  }
})
</script>

<template>
  <component :is="`Extension${extensionComponent.component}`" v-bind="componentProps" />
</template>
