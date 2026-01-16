<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import Icon from './common/Icon.vue'
import { useAuth } from '../composables/useAuth.js'
import IconNavigationButton from './panels/NavigationButton.IconNavigationButton.vue'

const emit = defineEmits<{
  (e: 'logout'): void
}>()

const auth = useAuth()
const isMenuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

const displayName = computed(() => {
  if (!auth.user.value) return ''
  return auth.user.value.displayName || auth.user.value.username
})

const isAdmin = computed(() => auth.user.value?.role === 'admin')

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
}

const closeMenu = () => {
  isMenuOpen.value = false
}

const handleClickOutside = (event: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    closeMenu()
  }
}

const setupClickOutsideListener = () => {
  document.addEventListener('click', handleClickOutside)
}

const removeClickOutsideListener = () => {
  document.removeEventListener('click', handleClickOutside)
}

onMounted(() => {
  setupClickOutsideListener()
})

onUnmounted(() => {
  removeClickOutsideListener()
})

const handleLogout = async () => {
  closeMenu()
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
  />
  <div v-if="auth.user.value" ref="menuRef" class="user-menu">
    <button
      class="user-button"
      type="button"
      :title="displayName"
      :aria-label="`User menu for ${displayName}`"
      :aria-expanded="isMenuOpen"
      @click="toggleMenu"
    >
      <Icon class="user-icon" name="user" />
      <span class="user-name">{{ displayName }}</span>
      <span v-if="isAdmin" class="admin-badge">Admin</span>
      <Icon class="chevron-icon" :name="isMenuOpen ? 'arrow-up-01' : 'arrow-down-01'" />
    </button>

    <Transition name="menu-fade">
      <div v-if="isMenuOpen" class="dropdown-menu">
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
    </Transition>
  </div>
</template>

<style scoped>
.user-menu-button {
  /** TODO: ADD ANCHOR */
}
.user-menu {
  position: relative;
  display: flex;
  align-items: center;
}

.user-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-components-button-color, var(--text));
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;

  &:hover {
    border-color: var(--theme-general-border-color, #ddd);
    background: var(--theme-components-button-background-hover, rgba(0, 0, 0, 0.05));
  }

  > .user-icon {
    font-size: 1rem;
    opacity: 0.8;
  }

  > .user-name {
    font-size: 0.875rem;
    font-weight: var(--font-weight-medium, 500);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > .admin-badge {
    font-size: 0.625rem;
    font-weight: var(--font-weight-semibold, 600);
    text-transform: uppercase;
    letter-spacing: 0.025em;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background: var(--theme-general-color-primary, #007bff);
    color: white;
  }

  > .chevron-icon {
    font-size: 0.75rem;
    opacity: 0.6;
  }
}

.dropdown-menu {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  left: 0;
  min-width: 180px;
  padding: 0.5rem 0;
  background: var(--theme-main-components-main-background, white);
  border: 1px solid var(--theme-general-border-color, #ddd);
  border-radius: 0.5rem;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;

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

.menu-fade-enter-active,
.menu-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(0.25rem);
}
</style>
