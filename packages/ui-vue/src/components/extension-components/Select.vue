<script lang="ts" setup>
import type { SelectProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'
import { tryUseHostBinding } from '../../composables/useHostBinding.js'
import Select from '../inputs/Select.vue'

interface Props extends SelectProps {
  __bindingPath?: string
}
const props = defineProps<Props>()

const rootStyle = computed(() => props.style as StyleValue)
const context = tryUseExtensionContext()
const scope = useExtensionScope()
const hostBinding = tryUseHostBinding()

async function handleChange(value: string) {
  if (props.onChangeAction && context) {
    try {
      const actionRef =
        typeof props.onChangeAction === 'string'
          ? { action: props.onChangeAction, params: { value } }
          : { ...props.onChangeAction, params: { ...props.onChangeAction.params, value } }
      await context.executeAction(actionRef, scope.value)
    } catch (error) {
      console.error('Failed to execute select action:', error)
    }
    return
  }

  if (hostBinding && props.__bindingPath) {
    hostBinding(props.__bindingPath, value)
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
