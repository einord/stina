<script lang="ts" setup>
import { computed } from 'vue'
import type { ExtensionComponentData } from '@stina/extension-api'
import { useExtensionScope, resolveComponentProps } from '../../composables/useExtensionScope.js'

const props = defineProps<{
  extensionComponent: ExtensionComponentData
}>()

const scope = useExtensionScope()

const componentProps = computed(() => {
  return resolveComponentProps(props.extensionComponent, scope.value)
})
</script>

<template>
  <component :is="`Extension${extensionComponent.component}`" v-bind="componentProps" />
</template>
