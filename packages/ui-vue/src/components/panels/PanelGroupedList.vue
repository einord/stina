<script setup lang="ts">
import { provide } from 'vue'
import SimpleButton from '../buttons/SimpleButton.vue'
import PanelGroupedListGroup from './PanelGroupedListGroup.vue'
import PanelGroupedListEditorModal from './PanelGroupedListEditorModal.vue'
import { usePanelGroupedListState } from './panelGroupedListState.js'
import { panelGroupedListKey } from './panelGroupedListContext.js'
import type { PanelViewInfo } from '../../composables/useApi.js'

const props = defineProps<{
  panel: PanelViewInfo
}>()

const state = usePanelGroupedListState(props.panel)
provide(panelGroupedListKey, state)

const view = state.view
const groups = state.groups
const loading = state.loading
const error = state.error
const editorCreateLabel = state.editorCreateLabel
const openCreate = state.openCreate
const getGroupId = state.getGroupId
</script>

<template>
  <div class="grouped-list">
    <div v-if="view.editor" class="toolbar">
      <SimpleButton type="primary" @click="openCreate">
        {{ editorCreateLabel }}
      </SimpleButton>
    </div>
    <div v-if="loading" class="state">Loading items...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="groups.length === 0" class="state">No items available.</div>
    <div v-else class="groups">
      <PanelGroupedListGroup
        v-for="group in groups"
        :key="getGroupId(group)"
        :group="group"
      />
    </div>
    <PanelGroupedListEditorModal />
  </div>
</template>

<style scoped>
.grouped-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  > .toolbar {
    display: flex;
    justify-content: flex-end;
  }

  > .state {
    color: var(--theme-general-muted, #6b7280);
    font-size: 0.85rem;

    &.error {
      color: var(--color-danger, #ef4444);
    }
  }

  > .groups {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
}
</style>
