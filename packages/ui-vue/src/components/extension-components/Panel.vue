<script lang="ts" setup>
import type { PanelProps, ExtensionActionRef } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import FormHeader from '../common/FormHeader.vue'
import IconToggleButton from '../buttons/IconToggleButton.vue'
import ExtensionComponent from './ExtensionComponent.vue'
import { computed } from 'vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'

const props = defineProps<PanelProps>()

const rootStyle = computed(() => props.style as StyleValue)
const context = tryUseExtensionContext()
const scope = useExtensionScope()

async function handleActionClick(actionRef: ExtensionActionRef) {
  if (context && actionRef) {
    try {
      await context.executeAction(actionRef, scope.value)
    } catch (error) {
      console.error('Failed to execute panel action:', error)
    }
  }
}
</script>

<template>
  <section class="extension-panel" :style="rootStyle">
    <FormHeader :title="props.title" :description="props.description" :icon="props.icon">
      <IconToggleButton
        v-for="action in props.actions"
        :key="JSON.stringify(action.action)"
        :icon="action.icon"
        :tooltip="action.tooltip"
        :type="action.type"
        @click="handleActionClick(action.action)"
      />
    </FormHeader>
    <div v-if="props.content" class="panel-content">
      <ExtensionComponent :extension-component="props.content" />
    </div>
  </section>
</template>
