<script lang="ts" setup>
import { computed } from 'vue'
import type { ModalProps, ExtensionActionRef } from '@stina/extension-api'
import BaseModal from '../common/Modal.vue'
import ExtensionComponent from './ExtensionComponent.vue'

const props = defineProps<ModalProps>()

const emit = defineEmits<{
  action: [action: ExtensionActionRef]
}>()

const isOpen = computed({
  get: () => props.open ?? false,
  set: () => {
    if (props.onCloseAction) {
      emit('action', props.onCloseAction)
    } else {
      console.warn('[Modal] No onCloseAction defined - modal cannot be closed')
    }
  },
})
</script>

<template>
  <BaseModal
    v-model="isOpen"
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
