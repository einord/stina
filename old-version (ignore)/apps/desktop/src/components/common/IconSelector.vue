<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
    QUICK_COMMAND_ICONS,
    resolveQuickCommandIcon,
    searchHugeicons
} from '../../lib/quickCommandIcons';
import SimpleButton from '../buttons/SimpleButton.vue';
import { t } from '@stina/i18n';
import IconButton from '../ui/IconButton.vue';

const modelValue = defineModel<string>();
const selectedIconComponent = computed(() => resolveQuickCommandIcon(modelValue.value));

const iconSearch = ref<string>();
let searchTimeout: number | null = null;
const iconSearchLoading = ref(false);
const iconSearchResults = ref<string[]>([]);
const iconSearchError = ref<string | null>(null);
const showingSearchResults = computed(() => iconSearch.value?.trim().length ?? 0 > 0);
const searchResultIcons = computed(() => {
    if (showingSearchResults.value) {
        return iconSearchResults.value.map((value) => ({
            value,
            component: resolveQuickCommandIcon(value),
        }));
    }
    return QUICK_COMMAND_ICONS;
});

async function performIconSearch(term: string) {
  const query = term?.trim();
  if (!query) {
    iconSearchResults.value = [];
    iconSearchError.value = null;
    iconSearchLoading.value = false;
    return;
  }

  iconSearchLoading.value = true;
  iconSearchError.value = null;
  try {
    iconSearchResults.value = await searchHugeicons(query, 200);
  } catch (error) {
    iconSearchError.value = t('settings.quick_commands.icon_search_error');
    iconSearchResults.value = [];
  } finally {
    iconSearchLoading.value = false;
  }
}
watch(
  iconSearch,
  (term) => {
    if (searchTimeout) window.clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => performIconSearch(term), 200);
  },
  { immediate: false },
);

</script>

<template>
  <div class="icon-selector">
    <SimpleButton class="icon-selector-button" popovertarget="icon-selector-popover">
      <component :is="selectedIconComponent" aria-hidden="true" />
    </SimpleButton>
    <div id="icon-selector-popover" class="selector" popover>
        <FormInputText
          class="search-input"
          v-model="iconSearch"
          type="search"
          :placeholder="t('settings.quick_commands.icon_search_placeholder')"
        />
        <div class="content">
          <div v-if="showingSearchResults && iconSearchLoading" class="status">
            {{ t('settings.quick_commands.icon_search_loading') }}
          </div>
          <div v-else-if="showingSearchResults && iconSearchError" class="status error">
            {{ iconSearchError }}
          </div>
          <div
            v-else-if="showingSearchResults && !iconSearchResults.length && !iconSearchLoading"
            class="status"
          >
            {{ t('settings.quick_commands.icon_search_empty') }}
          </div>
          <div v-else class="status search-result">
              <IconButton
                  v-for="option in searchResultIcons"
                  :key="option.value"
                  class="icon-option"
                  :class="{ active: option.value === modelValue }"
                  :aria-pressed="option.value === modelValue"
                  :aria-label="option.value"
                  :title="option.value"
                  @click="modelValue = option.value"
                  :icon="option.value"
              />
          </div>
        </div>
    </div>
  </div>
</template>

<style scoped>
  .icon-selector {
    > .icon-selector-button {
      anchor-name: --icon-selector;
    }

    > #icon-selector-popover {
        background-color: var(--popup-bg);
        border: 1px solid var(--popup-border);
        border-radius: var(--border-radius-normal);
        padding: 1rem;
        color: var(--popup-fg);
        box-shadow: var(--popup-shadow);
        width: min(30rem, 75vw);
        gap: 1rem;
        align-content: center;
        position: absolute;
        position-anchor: --icon-selector;
        top: anchor(bottom);
        left: anchor(left);
        
        &:popover-open {
            display: grid;
        }

        > .content {
          height: 15rem;

        > .status {
          height: 100%;
          display: grid;
          place-items: center;
        }

        > .search-result {
          display: grid;
          gap: 0;
          grid-template-columns: repeat(auto-fill, minmax(3rem, 1fr));
          overflow-y: auto;
          height: 100%;
          align-content: start;

          > .icon-option {
            width: 100%;
            height: 3rem;
          }
        }
      }
    }
  }
</style>
