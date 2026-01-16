<script setup lang="ts">
/**
 * Administration settings component with tabs for user and invitation management.
 * Requires admin role to access.
 */
import { ref } from 'vue'
import TextNavigationButton from '../../panels/NavigationButton.TextNavigationButton.vue'
import Users from '../AdminView.Users.vue'
import Invitations from '../AdminView.Invitations.vue'

export type AdminTab = 'users' | 'invitations'

const currentTab = ref<AdminTab>('users')
</script>

<template>
  <div class="administration-view">
    <header class="header">
      <h2 class="title">Administration</h2>
    </header>
    <nav class="admin-tabs">
      <TextNavigationButton v-model="currentTab" value="users" title="Users" />
      <TextNavigationButton v-model="currentTab" value="invitations" title="Invitations" />
    </nav>
    <div class="tab-content">
      <Users v-if="currentTab === 'users'" />
      <Invitations v-else-if="currentTab === 'invitations'" />
    </div>
  </div>
</template>

<style scoped>
.administration-view {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-normal, 1rem);

  > .header {
    > .title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--theme-general-color);
    }
  }

  > .admin-tabs {
    display: flex;
    gap: var(--spacing-small, 0.5rem);
    border-bottom: 1px solid var(--theme-general-border-color);
    padding-bottom: var(--spacing-small, 0.5rem);
  }

  > .tab-content {
    margin-top: var(--spacing-normal, 1rem);
  }
}
</style>
