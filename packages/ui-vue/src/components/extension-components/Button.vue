<script lang="ts" setup>
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'
import SimpleButton from '../buttons/SimpleButton.vue'

interface Props {
  text: string
  type?: 'normal' | 'primary' | 'danger' | 'accent'
  title?: string
  disabled?: boolean
  onClickAction?: string | { action: string; params?: Record<string, unknown> }
  style?: Record<string, string>
}

const props = defineProps<Props>()
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
  <SimpleButton
    :type="props.type ?? 'normal'"
    :title="props.title"
    :disabled="props.disabled"
    :style="rootStyle"
    @click="handleClick"
  >
    {{ props.text }}
  </SimpleButton>
</template>
