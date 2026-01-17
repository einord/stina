<script setup lang="ts">
withDefaults(
  defineProps<{
    value?: unknown
    title?: string
    enableActivated?: boolean
  }>(),
  {
    value: undefined,
    title: undefined,
    enableActivated: true,
  }
)

const currentActive = defineModel<unknown>()
</script>

<template>
  <button
    class="nav-button"
    :class="{ active: enableActivated && currentActive === value }"
    :title="title"
    @click="
      () => {
        if (enableActivated) currentActive = value
      }
    "
  >
    <slot></slot>
  </button>
</template>

<style scoped>
.nav-button {
  min-width: 50px;
  width: 100%;
  height: 50px;
  border: none;
  color: var(--text);
  padding-right: 2px;
  font-size: var(--text-base);
  padding: 1rem;
  background-color: transparent;
  position: relative;
  background: var(--theme-main-components-navbar-background);

  &.active {
    background: var(--theme-main-components-navbar-background-active);

    &::after {
      content: '';
      position: absolute;
      display: block;
      top: 3px;
      right: 3px;
      bottom: 3px;
      width: 3px;
      background-color: var(--theme-main-components-navbar-active-line-color);
      border-radius: 3px;
    }
  }
}
</style>
