<script lang="ts" setup>
import { computed } from 'vue'
import type { ListProps, ExtensionComponentData } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import {
  useExtensionScope,
  resolveValue,
  isIterator,
} from '../../composables/useExtensionScope.js'
import ExtensionComponent from './ExtensionComponent.vue'
import ExtensionScopeProvider from './ExtensionScopeProvider.vue'

const props = defineProps<ListProps>()

const scope = useExtensionScope()
const rootStyle = computed(() => props.style as StyleValue)

interface ListItem {
  key: string | number
  components: ExtensionComponentData[]
  itemScope: Record<string, unknown> | null
}

/** Resolved list items — each item wraps one or more components in a .list-item div. */
const listItems = computed<ListItem[]>(() => {
  const children = props.children

  // Static array: each component becomes its own list item
  if (Array.isArray(children)) {
    return children.map((child, index) => ({
      key: index,
      components: [child],
      itemScope: null,
    }))
  }

  // Iterator: each data-item becomes one list item (all template items rendered inside it)
  if (isIterator(children)) {
    const dataSource = resolveValue(children.each, scope.value)
    const items = Array.isArray(dataSource) ? dataSource : []

    return items.map((item, index) => ({
      key: index,
      components: children.items as ExtensionComponentData[],
      itemScope: { [children.as]: item },
    }))
  }

  return []
})
</script>

<template>
  <div class="extension-list" :style="rootStyle">
    <div v-for="item in listItems" :key="item.key" class="list-item">
      <template v-if="item.itemScope">
        <ExtensionScopeProvider :scope="item.itemScope">
          <ExtensionComponent
            v-for="(comp, ci) in item.components"
            :key="ci"
            :extension-component="comp"
          />
        </ExtensionScopeProvider>
      </template>
      <template v-else>
        <ExtensionComponent
          v-for="(comp, ci) in item.components"
          :key="ci"
          :extension-component="comp"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.extension-list {
  display: flex;
  flex-direction: column;

  > .list-item {
    padding: 0.75rem 1rem;
    border: 1px solid var(--theme-general-border-color);
    margin-top: -1px;
    border-radius: 0;

    &:first-child {
      margin-top: 0;
      border-top-left-radius: var(--border-radius-normal);
      border-top-right-radius: var(--border-radius-normal);
    }

    &:last-child {
      border-bottom-left-radius: var(--border-radius-normal);
      border-bottom-right-radius: var(--border-radius-normal);
    }
  }
}
</style>
