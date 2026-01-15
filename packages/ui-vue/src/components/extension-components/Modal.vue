<script lang="ts" setup>
import type { ModalProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import BaseModal from '../common/Modal.vue'
import ExtensionComponent from './ExtensionComponent.vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'

const props = defineProps<ModalProps>()

const rootStyle = computed(() => props.style as StyleValue)
const context = tryUseExtensionContext()
const scope = useExtensionScope()

const isOpen = computed({
  get: () => !!props.open,
  set: async () => {
    if (props.onCloseAction && context) {
      try {
        await context.executeAction(props.onCloseAction, scope.value)
      } catch (error) {
        console.error('Failed to execute modal close action:', error)
      }
    } else if (!props.onCloseAction) {
      console.warn('[Modal] No onCloseAction defined - modal cannot be closed')
    }
  },
})
</script>

<template>
  <BaseModal
    v-model="isOpen"
    :style="rootStyle"
    :title="props.title"
    :max-width="props.maxWidth"
    close-label="Close"
  >
    <ExtensionComponent v-if="props.body" :extension-component="props.body" />

    <template v-if="props.footer" #footer>
      <ExtensionComponent :extension-component="props.footer" />
    </template>
  </BaseModal>
</template>
