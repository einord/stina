<script setup lang="ts">
/**
 * Icon picker with popover for selecting icons from Hugeicons library.
 * Features search functionality and pre-defined favorites.
 */
import { ref, computed, watch } from 'vue'
import Icon from '../common/Icon.vue'

const props = withDefaults(
  defineProps<{
    /** Label displayed above the picker */
    label?: string
  }>(),
  {}
)

const model = defineModel<string>({ default: 'chat-bot' })

const popoverId = `icon-picker-${Math.random().toString(36).slice(2)}`
const searchQuery = ref('')
const isOpen = ref(false)

// Pre-defined favorite icons for quick access
const favoriteIcons = [
  'chat-bot',
  'message-01',
  'edit-01',
  'search-01',
  'code',
  'translate-01',
  'text',
  'bulb',
  'book-open-01',
  'chart-line-data-01',
  'magic-wand-01',
  'ai-brain-01',
  'command',
  'sparkles',
  'pencil-01',
  'document-01',
  'folder-01',
  'image-01',
  'video-01',
  'music-note-01',
  'calendar-01',
  'clock-01',
  'mail-01',
  'link-01',
  'share-01',
  'download-01',
  'upload-01',
  'cloud-01',
  'database-01',
  'server-01',
  'terminal',
  'bug-01',
  'settings-01',
  'filter-01',
  'sort-01',
  'grid-01',
  'list-view',
  'home-01',
  'user-01',
  'users-01',
  'heart-01',
  'star-01',
  'flag-01',
  'bookmark-01',
  'tag-01',
  'pin-01',
  'location-01',
  'globe-01',
  'phone-01',
  'camera-01',
]

// Searchable icons - in a real implementation this would search through all Hugeicons
const searchableIcons = [
  ...favoriteIcons,
  'alert-circle',
  'check-circle',
  'x-circle',
  'info-circle',
  'question-circle',
  'arrow-up',
  'arrow-down',
  'arrow-left',
  'arrow-right',
  'chevron-up',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'plus',
  'minus',
  'x',
  'check',
  'copy-01',
  'clipboard-01',
  'trash-01',
  'archive-01',
  'refresh-01',
  'sync-01',
  'play-01',
  'pause',
  'stop',
  'skip-forward',
  'skip-back',
  'volume-high',
  'volume-low',
  'volume-off',
  'mic-01',
  'headphones-01',
  'speaker-01',
  'wifi',
  'bluetooth',
  'battery-full',
  'battery-low',
  'power',
  'sun-01',
  'moon-01',
  'cloud-sun',
  'rain',
  'snow',
  'wind',
  'fire',
  'leaf-01',
  'tree-01',
  'flower',
  'gift-01',
  'shopping-cart-01',
  'credit-card',
  'wallet-01',
  'bank',
  'chart-bar-01',
  'chart-pie-01',
  'trending-up',
  'trending-down',
  'target-01',
  'award-01',
  'medal-01',
  'trophy-01',
  'rocket-01',
  'plane-01',
  'car-01',
  'truck-01',
  'ship',
  'train-01',
  'bicycle',
  'key-01',
  'lock-01',
  'unlock-01',
  'shield-01',
  'fingerprint',
  'eye',
  'eye-off',
  'bell-01',
  'bell-off',
  'message-circle',
  'message-square',
  'send-01',
  'inbox-01',
  'paperclip',
  'file-01',
  'file-text',
  'file-code',
  'file-image',
  'file-video',
  'file-audio',
  'file-zip',
  'layers-01',
  'layout-01',
  'sidebar-left',
  'sidebar-right',
  'maximize-01',
  'minimize-01',
  'move-01',
  'resize',
]

const filteredIcons = computed(() => {
  if (!searchQuery.value.trim()) {
    return favoriteIcons
  }
  const query = searchQuery.value.toLowerCase()
  return searchableIcons.filter((icon) => icon.toLowerCase().includes(query)).slice(0, 50)
})

function selectIcon(icon: string) {
  model.value = icon
  isOpen.value = false
  searchQuery.value = ''
}

function togglePopover() {
  isOpen.value = !isOpen.value
  if (!isOpen.value) {
    searchQuery.value = ''
  }
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.icon-picker')) {
    isOpen.value = false
    searchQuery.value = ''
  }
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('click', handleClickOutside)
  } else {
    document.removeEventListener('click', handleClickOutside)
  }
})
</script>

<template>
  <div class="icon-picker">
    <label v-if="label" class="label">{{ label }}</label>
    <button type="button" class="trigger" @click.stop="togglePopover">
      <Icon :name="model" />
      <Icon name="chevron-down" class="chevron" />
    </button>

    <div v-if="isOpen" class="popover">
      <div class="search">
        <Icon name="search-01" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="$t('common.search') || 'Search icons...'"
          class="search-input"
          @click.stop
        />
      </div>
      <div class="icon-grid">
        <button
          v-for="icon in filteredIcons"
          :key="icon"
          type="button"
          class="icon-option"
          :class="{ selected: model === icon }"
          :title="icon"
          @click.stop="selectIcon(icon)"
        >
          <Icon :name="icon" />
        </button>
      </div>
      <div v-if="filteredIcons.length === 0" class="no-results">
        No icons found
      </div>
    </div>
  </div>
</template>

<style scoped>
.icon-picker {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  gap: 0.375rem;

  > .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--theme-general-color);
  }

  > .trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--theme-general-border-color);
    border-radius: var(--border-radius-small, 0.375rem);
    background: var(--theme-components-input-background, transparent);
    color: var(--theme-general-color);
    cursor: pointer;
    transition: border-color 0.2s;

    &:hover {
      border-color: var(--theme-general-color-primary);
    }

    > .chevron {
      width: 1rem;
      height: 1rem;
      opacity: 0.5;
    }
  }

  > .popover {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 100;
    margin-top: 0.25rem;
    padding: 0.75rem;
    width: min(24rem, 80vw);
    max-height: 20rem;
    background: var(--theme-components-modal-background, var(--theme-general-background));
    border: 1px solid var(--theme-general-border-color);
    border-radius: var(--border-radius-small, 0.5rem);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    > .search {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--theme-general-border-color);
      border-radius: var(--border-radius-small, 0.375rem);
      background: var(--theme-components-input-background, transparent);

      > .search-icon {
        width: 1rem;
        height: 1rem;
        opacity: 0.5;
        flex-shrink: 0;
      }

      > .search-input {
        flex: 1;
        border: none;
        background: transparent;
        color: var(--theme-general-color);
        font-size: 0.875rem;
        outline: none;

        &::placeholder {
          color: var(--theme-general-color-muted);
        }
      }
    }

    > .icon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(2.5rem, 1fr));
      gap: 0.25rem;
      overflow-y: auto;
      max-height: 12rem;

      > .icon-option {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        padding: 0;
        border: 1px solid transparent;
        border-radius: var(--border-radius-small, 0.25rem);
        background: transparent;
        color: var(--theme-general-color);
        cursor: pointer;
        transition: all 0.15s;

        &:hover {
          background: var(--theme-general-color-primary-subtle, rgba(var(--theme-general-color-primary-rgb), 0.1));
          border-color: var(--theme-general-color-primary);
        }

        &.selected {
          background: var(--theme-general-color-primary);
          color: white;
        }
      }
    }

    > .no-results {
      padding: 1rem;
      text-align: center;
      color: var(--theme-general-color-muted);
      font-size: 0.875rem;
    }
  }
}
</style>
