<script lang="ts" setup>
import { ref, watch } from 'vue'
import type { ToggleProps, ExtensionActionRef } from '@stina/extension-api'
import ToggleComponent from '../inputs/Toggle.vue'

const props = defineProps<ToggleProps>()

const emit = defineEmits<{
  action: [action: ExtensionActionRef, checked: boolean]
}>()

const model = ref(props.checked ?? false)

watch(model, (newValue) => {
  emit('action', props.onChangeAction, newValue)
})
</script>

<template>
  <ToggleComponent v-model="model" :label="props.label" :description="props.description" :disabled="props.disabled" />
</template>
