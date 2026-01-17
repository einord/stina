<script setup lang="ts">
/**
 * Administration settings requires admin role to access.
 */
import Users from './Administration.Users.vue'
import Invitations from './Administration.Invitations.vue'

export type AdminTab = 'users' | 'invitations'
</script>

<template>
  <div class="administration-view">
    <Users />
    <Invitations />
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
