<script lang="ts" setup>
import type { SelectProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'

const props = defineProps<SelectProps>()

const rootStyle = computed(() => props.style as StyleValue)
const context = tryUseExtensionContext()
const scope = useExtensionScope()

async function handleChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (context && props.onChangeAction) {
    try {
      const actionRef = typeof props.onChangeAction === 'string'
        ? { action: props.onChangeAction, params: { value } }
        : { ...props.onChangeAction, params: { ...props.onChangeAction.params, value } }
      await context.executeAction(actionRef, scope.value)
    } catch (error) {
      console.error('Failed to execute select action:', error)
    }
  }
}
</script>

<template>
  <label :style="rootStyle">
    {{ props.label }}
    <select :value="props.selectedValue" @change="handleChange">
      <option v-for="option in props.options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>
