<script lang="ts" setup>
import { ref, watch } from 'vue'
import type { ToggleProps } from '@stina/extension-api'
import ToggleComponent from '../inputs/Toggle.vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'

const props = defineProps<ToggleProps>()
const context = tryUseExtensionContext()
const scope = useExtensionScope()

const model = ref(props.checked ?? false)

watch(model, async (newValue) => {
  if (context && props.onChangeAction) {
    try {
      const actionRef = typeof props.onChangeAction === 'string'
        ? { action: props.onChangeAction, params: { checked: newValue } }
        : { ...props.onChangeAction, params: { ...props.onChangeAction.params, checked: newValue } }
      await context.executeAction(actionRef, scope.value)
    } catch (error) {
      console.error('Failed to execute toggle action:', error)
    }
  }
})
</script>

<template>
  <ToggleComponent v-model="model" :label="props.label" :description="props.description" :disabled="props.disabled" />
</template>
