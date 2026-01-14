<script lang="ts" setup>
import type { TextInputProps } from '@stina/extension-api'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'

const props = defineProps<TextInputProps>()
const context = tryUseExtensionContext()
const scope = useExtensionScope()

async function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (context && props.onChangeAction) {
    try {
      // Merge the input value into the action params
      const actionRef = typeof props.onChangeAction === 'string'
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
  <label>
    {{ props.label }}
    <input
      type="text"
      :placeholder="props.placeholder"
      :value="props.value"
      @input="handleInput"
    />
  </label>
</template>
