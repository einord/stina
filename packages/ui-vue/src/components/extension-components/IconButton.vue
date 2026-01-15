<script lang="ts" setup>
import type { IconButtonProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import IconToggleButton from '../buttons/IconToggleButton.vue'
import { computed } from 'vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'

const props = defineProps<IconButtonProps>()

const rootStyle = computed(() => props.style as StyleValue)
const context = tryUseExtensionContext()
const scope = useExtensionScope()

async function handleClick() {
  if (context && props.onClickAction) {
    try {
      await context.executeAction(props.onClickAction, scope.value)
    } catch (error) {
      console.error('Failed to execute icon button action:', error)
    }
  }
}
</script>

<template>
  <IconToggleButton
    :style="rootStyle"
    :icon="props.icon"
    :tooltip="props.tooltip"
    :active="props.active"
    :disabled="props.disabled"
    :type="props.type"
    @click="handleClick"
  />
</template>
