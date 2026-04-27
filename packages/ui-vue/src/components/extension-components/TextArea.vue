<script lang="ts" setup>
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'
import { tryUseHostBinding } from '../../composables/useHostBinding.js'
import type { TextAreaComponentProps } from './componentProps'
import TextArea from '../inputs/TextArea.vue'

const props = defineProps<TextAreaComponentProps>()

const rootStyle = computed(() => props.style as StyleValue)
const context = tryUseExtensionContext()
const scope = useExtensionScope()
const hostBinding = tryUseHostBinding()

async function handleInput(value: string) {
  if (props.onChangeAction && context) {
    try {
      const actionRef =
        typeof props.onChangeAction === 'string'
          ? { action: props.onChangeAction, params: { value } }
          : { ...props.onChangeAction, params: { ...props.onChangeAction.params, value } }
      await context.executeAction(actionRef, scope.value)
    } catch (error) {
      console.error('Failed to execute textarea action:', error)
    }
    return
  }

  if (hostBinding && props.__bindingPath) {
    hostBinding(props.__bindingPath, value)
  }
}
</script>

<template>
  <TextArea
    :model-value="props.value"
    :label="props.label"
    :placeholder="props.placeholder"
    :rows="props.rows"
    :style="rootStyle"
    @update:model-value="handleInput"
  />
</template>
