<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

/**
 * Select dropdown component with optional label and error display.
 * Shows a search input when there are more than 3 options.
 */
export interface SelectOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    /** Available options */
    options: SelectOption[]
    /** Label displayed above the select */
    label?: string
    /** Placeholder text for empty state */
    placeholder?: string
    /** Error message displayed below the select */
    error?: string
    /** Whether the select is disabled */
    disabled?: boolean
  }>(),
  {
    label: undefined,
    placeholder: undefined,
    error: undefined,
    disabled: false,
  }
)

const model = defineModel<string>({ default: '' })

const isOpen = ref(false)
const searchQuery = ref('')
const dropdownRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)

const showSearch = computed(() => props.options.length > 3)

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options
  const query = searchQuery.value.toLowerCase()
  return props.options.filter((option) => option.label.toLowerCase().includes(query))
})

const selectedLabel = computed(() => {
  const selected = props.options.find((option) => option.value === model.value)
  return selected?.label ?? props.placeholder ?? ''
})

function toggleDropdown() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    searchQuery.value = ''
    setTimeout(() => searchInputRef.value?.focus(), 0)
  }
}

function selectOption(option: SelectOption) {
  model.value = option.value
  isOpen.value = false
  searchQuery.value = ''
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
    searchQuery.value = ''
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div
    ref="dropdownRef"
    class="select-input"
    :class="{ disabled, 'has-error': error, open: isOpen }"
  >
    <label v-if="label" class="label">{{ label }}</label>
    <button type="button" class="select-trigger" :disabled="disabled" @click="toggleDropdown">
      <span :class="{ placeholder: !model }">{{ selectedLabel }}</span>
    </button>
    <div v-if="isOpen" class="dropdown">
      <input
        v-if="showSearch"
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Sök..."
        @click.stop
      />
      <ul class="options-list">
        <li
          v-for="option in filteredOptions"
          :key="option.value"
          class="option"
          :class="{ selected: option.value === model }"
          @click="selectOption(option)"
        >
          {{ option.label }}
        </li>
        <li v-if="filteredOptions.length === 0" class="no-results">Inga resultat</li>
      </ul>
    </div>
    <span v-if="error" class="error">{{ error }}</span>
  </div>
</template>

<style scoped>
.select-input {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;
  position: relative;

  &.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  > .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--theme-general-color);
  }

  > .select-trigger {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--theme-general-border-color);
    border-radius: var(--border-radius-small, 0.375rem);
    background: var(--theme-components-input-background, transparent);
    color: var(--theme-general-color);
    cursor: pointer;
    transition: border-color 0.2s;
    text-align: left;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    padding-right: 2.5rem;

    &:focus {
      outline: none;
      border-color: var(--theme-general-color-primary);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    > .placeholder {
      color: var(--theme-general-color-muted, #6b7280);
    }
  }

  &.open > .select-trigger {
    border-color: var(--theme-general-color-primary);
  }

  > .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.25rem;
    background: var(--theme-components-input-background, var(--theme-general-background));
    border: 1px solid var(--theme-general-border-color);
    border-radius: var(--border-radius-small, 0.375rem);
    box-shadow:
      0 4px 6px -1px rgb(0 0 0 / 0.1),
      0 2px 4px -2px rgb(0 0 0 / 0.1);
    z-index: 50;
    overflow: hidden;

    > .search-input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      border: none;
      border-bottom: 1px solid var(--theme-general-border-color);
      background: transparent;
      color: var(--theme-general-color);
      outline: none;

      &::placeholder {
        color: var(--theme-general-color-muted, #6b7280);
      }
    }

    > .options-list {
      list-style: none;
      margin: 0;
      padding: 0.25rem 0;
      max-height: 12rem;
      overflow-y: auto;

      > .option {
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--theme-general-color);
        cursor: pointer;
        transition: background-color 0.1s;

        &:hover {
          background: var(--theme-general-background-hover, rgba(0, 0, 0, 0.05));
        }

        &.selected {
          background: var(--theme-general-color-primary);
          color: var(--theme-general-color-on-primary, #fff);
        }
      }

      > .no-results {
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--theme-general-color-muted, #6b7280);
        text-align: center;
      }
    }
  }

  &.has-error > .select-trigger {
    border-color: var(--theme-general-color-danger, #dc2626);
  }

  > .error {
    font-size: 0.75rem;
    color: var(--theme-general-color-danger, #dc2626);
  }
}
</style>
