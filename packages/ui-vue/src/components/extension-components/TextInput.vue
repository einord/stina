<script lang="ts" setup>
import type { TextInputProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'
import TextInput from '../inputs/TextInput.vue'

const props = defineProps<TextInputProps>()

const rootStyle = computed(() => props.style as StyleValue)
const context = tryUseExtensionContext()
const scope = useExtensionScope()

async function handleInput(value: string) {
  if (context && props.onChangeAction) {
    try {
      // Merge the input value into the action params
      const actionRef =
        typeof props.onChangeAction === 'string'
          ? { action: props.onChangeAction, params: { value } }
          : { ...props.onChangeAction, params: { ...props.onChangeAction.params, value } }
      await context.executeAction(actionRef, scope.value)
    } catch (error) {
      console.error('Failed to execute text input action:', error)
    }
  }
}
</script>

<template>
  <TextInput
    :model-value="props.value"
    :label="props.label"
    :placeholder="props.placeholder"
    :hint="props.placeholder"
    :style="rootStyle"
    @update:model-value="handleInput"
  />
</template>
