<script lang="ts" setup>
import type { ButtonProps } from '@stina/extension-api'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'

const props = defineProps<ButtonProps>()
const context = tryUseExtensionContext()

const handleClick = () => {
  if (context && props.onClickAction) {
    context.executeAction(props.onClickAction)
  }
}
</script>

<template>
  <button @click="handleClick">{{ props.text }}</button>
</template>
