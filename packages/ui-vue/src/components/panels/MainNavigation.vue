<script setup lang="ts">
import IconNavigationButton from './NavigationButton.IconNavigationButton.vue'
import UserMenu from '../UserMenu.vue'
import UpdateNotification from '../UpdateNotification.vue'
import { useAuth } from '../../composables/useAuth.js'

export type NavigationView = 'chat' | 'tools' | 'settings'

const value = defineModel<NavigationView>({ default: 'chat' })
const auth = useAuth()

const emit = defineEmits<{
  (e: 'logout'): void
}>()

const handleLogout = () => {
  emit('logout')
}
</script>

<template>
  <aside class="main-navigation">
    <IconNavigationButton v-model="value" :value="'chat'" :title="$t('nav.chat')" icon="chat-01" />
    <IconNavigationButton
      v-model="value"
      :value="'tools'"
      :title="$t('nav.tools')"
      icon="wrench-01"
    />
    <IconNavigationButton
      v-model="value"
      :value="'settings'"
      :title="$t('nav.settings')"
      icon="settings-02"
    />
    <div class="nav-spacer" />
    <UpdateNotification />
    <!-- Hide user menu in local mode (single-user) - no need for logout -->
    <UserMenu v-if="!auth.isLocalMode.value" class="user-menu" @logout="handleLogout" />
  </aside>
</template>

<style scoped>
.main-navigation {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.nav-spacer {
  flex-grow: 1;
}
</style>
