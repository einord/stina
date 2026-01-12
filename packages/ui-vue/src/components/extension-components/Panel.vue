<script lang="ts" setup>
import type { PanelProps, ExtensionActionRef } from '@stina/extension-api'
import FormHeader from '../common/FormHeader.vue'
import IconToggleButton from '../buttons/IconToggleButton.vue'
import ExtensionComponent from './ExtensionComponent.vue'

const props = defineProps<PanelProps>()

const emit = defineEmits<{
  action: [action: ExtensionActionRef]
}>()
</script>

<template>
  <section class="extension-panel">
    <FormHeader :title="props.title" :description="props.description" :icon="props.icon">
      <IconToggleButton
        v-for="action in props.actions"
        :key="JSON.stringify(action.action)"
        :icon="action.icon"
        :tooltip="action.tooltip"
        :type="action.type"
        @click="emit('action', action.action)"
      />
    </FormHeader>
    <div v-if="props.content" class="panel-content">
      <ExtensionComponent :extension-component="props.content" />
    </div>
  </section>
</template>
