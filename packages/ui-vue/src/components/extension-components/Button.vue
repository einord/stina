<script lang="ts" setup>
import type { ButtonProps } from '@stina/extension-api'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'

const props = defineProps<ButtonProps>()
const context = tryUseExtensionContext()

const handleClick = async () => {
  if (context && props.onClickAction) {
    try {
      await context.executeAction(props.onClickAction)
    } catch (error) {
      console.error('Failed to execute action:', error)
    }
  }
}
</script>

<template>
  <button @click="handleClick">{{ props.text }}</button>
</template>
