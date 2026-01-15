<script setup lang="ts">
/**
 * Administration view with tabs for user and invitation management.
 * Requires admin role to access.
 */
import { ref } from 'vue'
import TextNavigationButton from '../panels/NavigationButton.TextNavigationButton.vue'
import Users from './AdminView.Users.vue'
import Invitations from './AdminView.Invitations.vue'

export type AdminTab = 'users' | 'invitations'

const currentTab = ref<AdminTab>('users')
</script>

<template>
  <div class="admin-view">
    <aside class="admin-menu">
      <h2 class="admin-title">Administration</h2>
      <nav class="admin-nav">
        <TextNavigationButton v-model="currentTab" value="users" title="Users" />
        <TextNavigationButton v-model="currentTab" value="invitations" title="Invitations" />
      </nav>
    </aside>
    <div class="content">
      <Users v-if="currentTab === 'users'" />
      <Invitations v-else-if="currentTab === 'invitations'" />
    </div>
  </div>
</template>

<style scoped>
.admin-view {
  display: grid;
  grid-template-columns: auto 1fr;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow-y: hidden;

  > .admin-menu {
    background-color: var(--theme-main-components-navbar-sub-navbar-background);
    border-right: 1px solid var(--theme-general-border-color);
    display: flex;
    flex-direction: column;

    > .admin-title {
      padding: var(--spacing-normal);
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--theme-general-color);
      border-bottom: 1px solid var(--theme-general-border-color);
    }

    > .admin-nav {
      display: flex;
      flex-direction: column;
    }
  }

  > .content {
    padding: var(--spacing-large);
    height: 100%;
    max-height: 100%;
    overflow-y: auto;
  }
}
</style>
