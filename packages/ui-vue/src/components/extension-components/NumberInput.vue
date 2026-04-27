<script lang="ts" setup>
import type { NumberInputProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'

const props = defineProps<NumberInputProps>()

const rootStyle = computed(() => props.style as StyleValue)
const context = tryUseExtensionContext()
const scope = useExtensionScope()

const stringValue = computed(() => {
  if (props.value === undefined || props.value === null) return ''
  return String(props.value)
})

async function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  const raw = target.value
  // Pass the raw string to keep behavior consistent with native number inputs
  // (empty string when cleared); the action is responsible for parsing.
  if (context && props.onChangeAction) {
    try {
      const actionRef =
        typeof props.onChangeAction === 'string'
          ? { action: props.onChangeAction, params: { value: raw } }
          : { ...props.onChangeAction, params: { ...props.onChangeAction.params, value: raw } }
      await context.executeAction(actionRef, scope.value)
    } catch (error) {
      console.error('Failed to execute number input action:', error)
    }
  }
}
</script>

<template>
  <div class="number-input-wrapper" :style="rootStyle">
    <label v-if="props.label" class="label">{{ props.label }}</label>
    <input
      type="number"
      :value="stringValue"
      :placeholder="props.placeholder"
      :min="props.min"
      :max="props.max"
      :step="props.step"
      class="input"
      @input="handleInput"
    />
  </div>
</template>

<style scoped>
.number-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;

  > .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--theme-general-color);
  }

  > .input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    font-family: inherit;
    border: 1px solid var(--theme-general-border-color);
    border-radius: var(--border-radius-small, 0.375rem);
    background: var(--theme-components-input-background, transparent);
    color: var(--theme-general-color);
    transition: border-color 0.2s;

    &:focus {
      outline: none;
      border-color: var(--theme-general-color-primary);
    }
  }
}
</style>
