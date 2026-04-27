<script lang="ts" setup>
import type { ToggleProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { ref, watch, computed } from 'vue'
import ToggleComponent from '../inputs/Toggle.vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'
import { tryUseHostBinding } from '../../composables/useHostBinding.js'

interface Props extends ToggleProps {
  __bindingPath?: string
}
const props = defineProps<Props>()

const rootStyle = computed(() => props.style as StyleValue)
const context = tryUseExtensionContext()
const scope = useExtensionScope()
const hostBinding = tryUseHostBinding()

const model = ref(props.checked ?? false)

watch(
  () => props.checked,
  (next) => {
    model.value = next ?? false
  }
)

watch(model, async (newValue) => {
  if (newValue === (props.checked ?? false)) return

  if (props.onChangeAction && context) {
    try {
      const actionRef =
        typeof props.onChangeAction === 'string'
          ? { action: props.onChangeAction, params: { checked: newValue } }
          : {
              ...props.onChangeAction,
              params: { ...props.onChangeAction.params, checked: newValue },
            }
      await context.executeAction(actionRef, scope.value)
    } catch (error) {
      console.error('Failed to execute toggle action:', error)
    }
    return
  }

  if (hostBinding && props.__bindingPath) {
    hostBinding(props.__bindingPath, newValue)
  }
})
</script>

<template>
  <ToggleComponent
    v-model="model"
    :label="props.label"
    :description="props.description"
    :disabled="props.disabled"
    :style="rootStyle"
  />
</template>
