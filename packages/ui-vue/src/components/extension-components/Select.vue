<script lang="ts" setup>
import type { SelectProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'
import Select from '../inputs/Select.vue'

const props = defineProps<SelectProps>()

const rootStyle = computed(() => props.style as StyleValue)
const context = tryUseExtensionContext()
const scope = useExtensionScope()

async function handleChange(value: string) {
  if (context && props.onChangeAction) {
    try {
      const actionRef =
        typeof props.onChangeAction === 'string'
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
  <Select
    :options="props.options"
    :label="props.label"
    :model-value="props.selectedValue"
    :style="rootStyle"
    @update:model-value="handleChange"
  />
</template>
