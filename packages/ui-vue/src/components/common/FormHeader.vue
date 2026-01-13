<script setup lang="ts">
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    level?: number
    /**
     * Main title displayed in the header.
     */
    title: string
    /**
     * Optional description rendered under the title.
     */
    description?: string | string[]
    /**
     * Optional text-based icon shown to the left of the title.
     */
    icon?: string
  }>(),
  {
    level: 1,
    description: undefined,
    icon: undefined,
  }
)
</script>

<template>
  <header class="form-header">
    <div class="header-main">
      <div class="title-row">
        <icon v-if="icon != null" class="icon" :name="icon" />
        <component :is="`h${props.level}`" class="title">
          {{ props.title }}
        </component>
      </div>
      <div v-if="description" class="description">
        <template v-if="Array.isArray(description)">
          <p v-for="(line, index) in description" :key="index">
            {{ line }}
          </p>
        </template>
        <p v-else>{{ description }}</p>
      </div>
    </div>
    <div v-if="$slots['default']" class="actions">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.form-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  gap: 0.25rem;
  width: 100%;

  > .header-main {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: 0.75rem;
    justify-content: start;

    > .title-row {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;

      > .icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--muted);
        font-size: 1.25rem;
        line-height: 1;
      }

      > .title {
        margin: 0;
        color: var(--text);
        font-size: 1.25rem;
        line-height: 1.4;
      }
    }
    > .description {
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.5;
    }
  }
  > .actions {
    display: inline-flex;
    gap: 0.5rem;
    align-items: start;
    justify-content: flex-end;
  }
}
</style>
