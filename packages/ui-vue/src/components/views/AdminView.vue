<script setup lang="ts">
/**
 * Administration view requires admin role to access.
 */
import Users from './AdminView.Users.vue'
import Invitations from './AdminView.Invitations.vue'

export type AdminTab = 'users' | 'invitations'
</script>

<template>
  <div class="admin-view">
    <Users />
    <Invitations />
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
