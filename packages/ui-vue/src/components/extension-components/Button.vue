<script lang="ts" setup>
import type { ButtonProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'

const props = defineProps<ButtonProps>()
const context = tryUseExtensionContext()
const scope = useExtensionScope()

const rootStyle = computed(() => props.style as StyleValue)

const handleClick = async () => {
  if (context && props.onClickAction) {
    try {
      await context.executeAction(props.onClickAction, scope.value)
    } catch (error) {
      console.error('Failed to execute action:', error)
    }
  }
}
</script>

<template>
  <button :style="rootStyle" @click="handleClick">{{ props.text }}</button>
</template>
