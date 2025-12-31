<script setup lang="ts">
import { ref } from 'vue'
import EntityList from '../../common/EntityList.vue'
import IconToggleButton from '../../buttons/IconToggleButton.vue'
import AiEditModelModal from './Ai.EditModelModal.vue'

// TODO: This interface is just temporary, use real model interface from core here,
// and show / edit configured models from database instead
interface ModelInfo {
  id: number // Database ID of the model
  name: string // Custom display name of the model the user sets when creating new model
  modelExtension: string // The name of the AI provider extension used
  modelName: string // The name of the model within the AI provider
  contextLength: number // The context length of the model in number of tokens (only for display purposes which helps user choose)
}

const currentActive = ref(1)
const currentEditModel = ref<ModelInfo>()
const showEditModelModal = ref(false)

function setAsActive(id: number) {
  currentActive.value = id
}

function editModel(model: ModelInfo) {
  currentEditModel.value = model
  showEditModelModal.value = true
}
</script>

<template>
  <div class="ai-settings">
    <EntityList
      title="AI-modeller"
      description="Dina AI-modeller som är konfigurerade för användning i Stina. Klicka på en för att välja den som aktiv modell."
      :empty-text="'Inga AI-modeller har konfigurerats ännu.'"
      :child-items="[
        {
          id: 1,
          name: 'Gratis - inte lika smart',
          modelExtension: 'Ollama AI Provider',
          modelName: 'llama3.2',
          contextLength: 4096,
        },
        {
          id: 2,
          name: 'Betald - mycket smartare',
          modelExtension: 'ChatGPT AI Provider',
          modelName: 'gpt-5.2',
          contextLength: 8192,
        },
        {
          id: 3,
          name: 'Betald - alternativ',
          modelExtension: 'Claude AI Provider',
          modelName: 'Sonnet 4.5',
          contextLength: 10240,
        },
      ]"
    >
      <template #default="{ item }">
        <div
          class="ai-model-item"
          :class="{ active: currentActive === item.id }"
          @click="setAsActive(item.id)"
        >
          <h3 class="model-name">{{ item.name }}</h3>
          <p class="model-details">
            {{ item.modelExtension }} · {{ item.modelName }} · {{ item.contextLength }} tokens
          </p>
          <div class="actions">
            <IconToggleButton icon="edit-01" tooltip="Redigera modell" @click="editModel(item)" />
          </div>
        </div>
      </template>
    </EntityList>

    <AiEditModelModal v-model="showEditModelModal" :model="currentEditModel" />
  </div>
</template>

<style scoped>
.ai-settings {
  :deep(.item) {
    cursor: pointer;

    &:has(> .active) {
      border-color: var(--theme-general-border-color-active);
      z-index: 1;
    }

    .ai-model-item {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'name actions'
        'details details';

      > .model-name {
        grid-area: name;
        margin: 0 0 0.25rem 0;
        font-size: 1rem;
        font-weight: 500;
        color: var(--theme-general-color);
      }

      > .model-details {
        grid-area: details;
        margin: 0;
        font-size: 0.875rem;
        color: var(--theme-general-color-muted);
      }

      > .actions {
        grid-area: actions;
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
    }
  }
}
</style>
