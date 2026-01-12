<script lang="ts" setup>
import { computed } from 'vue'
import type { ExtensionComponentData } from '@stina/extension-api'

const props = defineProps<{
  extensionComponent: ExtensionComponentData
}>()

const componentProps = computed(() => {
  const { ...rest } = props.extensionComponent
  return rest
})
</script>

<template>
  <component :is="`Extension${extensionComponent.component}`" v-bind="componentProps" />
</template>
