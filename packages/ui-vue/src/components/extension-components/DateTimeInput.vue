<script lang="ts" setup>
import type { DateTimeInputProps } from '@stina/extension-api'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'

const props = defineProps<DateTimeInputProps>()
const context = tryUseExtensionContext()
const scope = useExtensionScope()

async function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (context && props.onChangeAction) {
    try {
      const actionRef = typeof props.onChangeAction === 'string'
        ? { action: props.onChangeAction, params: { value } }
        : { ...props.onChangeAction, params: { ...props.onChangeAction.params, value } }
      await context.executeAction(actionRef, scope.value)
    } catch (error) {
      console.error('Failed to execute datetime input action:', error)
    }
  }
}
</script>

<template>
  <label class="extension-datetime-input">
    <span class="label">{{ props.label }}</span>
    <input
      type="datetime-local"
      :value="props.value"
      @input="handleInput"
    />
  </label>
</template>

<style scoped>
.extension-datetime-input {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  > .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--theme-general-foreground);
  }

  > input {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--theme-general-border);
    border-radius: 0.375rem;
    background: var(--theme-general-background);
    color: var(--theme-general-foreground);

    &:focus {
      outline: none;
      border-color: var(--theme-general-primary);
    }
  }
}
</style>
