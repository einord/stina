<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './common/Icon.vue'
import { useAuth } from '../composables/useAuth.js'
import IconNavigationButton from './panels/NavigationButton.IconNavigationButton.vue'

const emit = defineEmits<{
  (e: 'logout'): void
}>()

const auth = useAuth()
const dropdownRef = ref<HTMLElement | null>(null)

const displayName = computed(() => {
  if (!auth.user.value) return ''
  return auth.user.value.displayName || auth.user.value.username
})

const isAdmin = computed(() => auth.user.value?.role === 'admin')

const handleLogout = async () => {
  dropdownRef.value?.hidePopover()
  await auth.logout()
  emit('logout')
}
</script>

<template>
  <IconNavigationButton
    class="user-menu-button"
    :value="false"
    :title="$t('nav.user')"
    icon="user-circle"
    :enable-activated="false"
    popovertarget="user-dropdown-menu"
  />
  <div v-if="auth.user.value" class="user-menu">
    <div id="user-dropdown-menu" ref="dropdownRef" class="dropdown-menu" popover>
      <div class="menu-header">
        <span class="menu-username">{{ displayName }}</span>
        <span v-if="isAdmin" class="menu-role">Administrator</span>
      </div>
      <div class="menu-divider"></div>
      <button class="menu-item logout-button" type="button" @click="handleLogout">
        <Icon class="menu-icon" name="logout-01" />
        <span>{{ $t('auth.logout') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.user-menu-button {
  margin-top: auto;
  anchor-name: --user-menu-button;
}

.user-menu {
  display: flex;
  align-items: center;

  > .dropdown-menu {
    /* Fallback for browsers without anchor positioning */
    position: fixed;
    inset: unset;
    inset-block-end: 4rem;
    inset-inline-start: 0.5rem;
    margin-bottom: 0rem;
    margin-left: 0.5rem;
    min-width: 180px;
    padding: 0.5rem 0;
    background: var(--theme-main-components-main-background, white);
    border: 1px solid var(--theme-general-border-color, #ddd);
    border-radius: 0.5rem;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
    z-index: 100;

    @supports (anchor-name: --test) {
      position-anchor: --user-menu-button;
      inset-block-end: anchor(top);
      inset-inline-start: anchor(left);
    }

    > .menu-header {
      padding: 0.5rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.125rem;

      > .menu-username {
        font-size: 0.875rem;
        font-weight: var(--font-weight-medium, 500);
        color: var(--theme-general-color, #333);
      }

      > .menu-role {
        font-size: 0.75rem;
        color: var(--theme-general-color-secondary, #666);
      }
    }

    > .menu-divider {
      height: 1px;
      margin: 0.5rem 0;
      background: var(--theme-general-border-color, #ddd);
    }

    > .menu-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: none;
      background: transparent;
      color: var(--theme-general-color, #333);
      font-size: 0.875rem;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s ease;

      &:hover {
        background: var(--theme-components-button-background-hover, rgba(0, 0, 0, 0.05));
      }

      > .menu-icon {
        font-size: 1rem;
        opacity: 0.7;
      }
    }

    > .logout-button:hover {
      color: var(--theme-general-color-danger, #dc3545);

      > .menu-icon {
        opacity: 1;
      }
    }
  }
}
</style>
