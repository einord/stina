<script lang="ts" setup>
import { computed } from 'vue'
import type { ExtensionComponentChildren, ExtensionComponentData } from '@stina/extension-api'
import {
  useExtensionScope,
  resolveValue,
  isIterator,
} from '../../composables/useExtensionScope.js'
import ExtensionComponent from './ExtensionComponent.vue'
import ExtensionScopeProvider from './ExtensionScopeProvider.vue'

const props = defineProps<{
  children: ExtensionComponentChildren
}>()

const scope = useExtensionScope()

interface ResolvedItem {
  key: string | number
  component: ExtensionComponentData
  itemScope: Record<string, unknown> | null
}

/** Resolved list of items to render, either from static array or iterator. */
const resolvedItems = computed<ResolvedItem[]>(() => {
  const children = props.children

  // Static array of components
  if (Array.isArray(children)) {
    return children.map((child, index) => ({
      key: index,
      component: child,
      itemScope: null,
    }))
  }

  // Iterator: { each, as, items }
  if (isIterator(children)) {
    const dataSource = resolveValue(children.each, scope.value)
    const items = Array.isArray(dataSource) ? dataSource : []

    const result: ResolvedItem[] = []

    items.forEach((item, dataIndex) => {
      const itemScope = { [children.as]: item }

      children.items.forEach((templateComponent, templateIndex) => {
        result.push({
          key: `${dataIndex}-${templateIndex}`,
          component: templateComponent,
          itemScope,
        })
      })
    })

    return result
  }

  return []
})
</script>

<template>
  <template v-for="item in resolvedItems" :key="item.key">
    <ExtensionScopeProvider v-if="item.itemScope" :scope="item.itemScope">
      <ExtensionComponent :extension-component="item.component" />
    </ExtensionScopeProvider>
    <ExtensionComponent v-else :extension-component="item.component" />
  </template>
</template>
