<script setup lang="ts">
import TextInput from '../../inputs/TextInput.vue'
import Select from '../../inputs/Select.vue'
import Toggle from '../../inputs/Toggle.vue'

interface CategoryOption {
  value: string
  labelKey: string
}

withDefaults(
  defineProps<{
    categories: CategoryOption[]
    showCategory?: boolean
    showVerified?: boolean
    showInstalled?: boolean
  }>(),
  {
    showCategory: true,
    showVerified: true,
    showInstalled: true,
  }
)

const query = defineModel<string>('query', { default: '' })
const category = defineModel<string>('category', { default: 'all' })
const verifiedOnly = defineModel<boolean>('verifiedOnly', { default: false })
const installedOnly = defineModel<boolean>('installedOnly', { default: false })
</script>

<template>
  <div class="extensions-filters" :class="{ compact: !showCategory }">
    <div class="primary">
      <TextInput v-model="query" :placeholder="$t('extensions.search_placeholder')" />
      <Select
        v-if="showCategory"
        v-model="category"
        :options="categories.map((option) => ({ value: option.value, label: $t(option.labelKey) }))"
      />
    </div>
    <div class="toggles">
      <Toggle
        v-if="showVerified"
        v-model="verifiedOnly"
        :label="$t('extensions.verified_only')"
      />
      <Toggle
        v-if="showInstalled"
        v-model="installedOnly"
        :label="$t('extensions.installed_only')"
      />
    </div>
  </div>
</template>

<style scoped>
.extensions-filters {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: minmax(12rem, 1.5fr) auto;
  align-items: start;

  > .primary {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: minmax(12rem, 1.5fr) minmax(10rem, 1fr);
    align-items: center;

    > :deep(.text-input) {
      max-width: 20rem;
    }

    > :deep(.select-input) {
      max-width: 16rem;
    }
  }

  > .toggles {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;

    > .primary {
      grid-template-columns: 1fr;

      > :deep(.text-input),
      > :deep(.select-input) {
        max-width: 100%;
      }
    }

    > .toggles {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  &.compact {
    > .primary {
      grid-template-columns: minmax(12rem, 1.5fr);
    }
  }
}
</style>
