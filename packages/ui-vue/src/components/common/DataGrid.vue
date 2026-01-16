<script setup lang="ts" generic="T extends Record<string, unknown>">
/**
 * Reusable data grid component for displaying tabular data.
 * Supports custom cell rendering via scoped slots.
 */
import { computed, useSlots } from 'vue'
import { Icon } from '@iconify/vue'

export interface DataGridColumn {
  /** Unique key for the column, used for slot names and value lookup */
  key: string
  /** Header label displayed in the table header */
  label: string
  /** Optional fixed width for the column */
  width?: string
  /** Text alignment for the column */
  align?: 'left' | 'center' | 'right'
}

const props = withDefaults(
  defineProps<{
    /** Array of items to display */
    items: T[]
    /** Column definitions */
    columns: DataGridColumn[]
    /** Key to use for v-for :key binding */
    itemKey: keyof T
    /** Optional function to compute row classes */
    rowClass?: (item: T) => string | Record<string, boolean> | undefined
    /** Icon to show in empty state */
    emptyIcon?: string
    /** Text to show in empty state */
    emptyText?: string
    /** Whether data is currently loading */
    loading?: boolean
    /** Loading text to display */
    loadingText?: string
  }>(),
  {
    emptyIcon: 'mdi:database-off',
    emptyText: 'No data',
    loading: false,
    loadingText: 'Loading...',
  }
)

const slots = useSlots()

/**
 * Check if a custom slot exists for a column
 */
function hasSlot(key: string): boolean {
  return !!slots[`cell-${key}`]
}

/**
 * Get the value from an item for a given column key
 */
function getValue(item: T, key: string): unknown {
  return item[key]
}

/**
 * Compute style for a column (width, text-align)
 */
function getColumnStyle(column: DataGridColumn): Record<string, string> {
  const style: Record<string, string> = {}
  if (column.width) {
    style['width'] = column.width
  }
  if (column.align) {
    style['textAlign'] = column.align
  }
  return style
}

const isEmpty = computed(() => !props.loading && props.items.length === 0)
</script>

<template>
  <div class="data-grid">
    <div v-if="loading" class="loading">
      <Icon icon="mdi:loading" class="spin" />
      {{ loadingText }}
    </div>

    <table v-else-if="items.length > 0" class="table">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :style="getColumnStyle(column)"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in items"
          :key="String(item[itemKey])"
          :class="rowClass?.(item)"
        >
          <td
            v-for="column in columns"
            :key="column.key"
            :style="getColumnStyle(column)"
          >
            <slot
              v-if="hasSlot(column.key)"
              :name="`cell-${column.key}`"
              :item="item"
              :column="column"
              :value="getValue(item, column.key)"
            />
            <template v-else>
              {{ getValue(item, column.key) }}
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else-if="isEmpty" class="empty-state">
      <slot name="empty">
        <Icon :icon="emptyIcon" class="empty-icon" />
        <p>{{ emptyText }}</p>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.data-grid {
  > .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--theme-general-color-muted);

    > .spin {
      animation: spin 1s linear infinite;
    }
  }

  > .table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid var(--theme-general-border-color);
    border-radius: 0.5rem;
    overflow: hidden;

    th,
    td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--theme-general-border-color);
    }

    th {
      background: var(
        --theme-components-table-header-background,
        var(--theme-general-background-secondary)
      );
      font-weight: 600;
      color: var(--theme-general-color);
      font-size: 0.875rem;
    }

    td {
      color: var(--theme-general-color);
      font-size: 0.875rem;
    }

    tbody tr:last-child td {
      border-bottom: none;
    }

    tbody tr:hover {
      background: var(
        --theme-components-table-row-hover,
        var(--theme-general-background-hover)
      );
    }
  }

  > .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    color: var(--theme-general-color-muted);
    text-align: center;

    > .empty-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    > p {
      margin: 0;
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
