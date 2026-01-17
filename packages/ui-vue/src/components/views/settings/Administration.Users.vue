<script setup lang="ts">
/**
 * User management component for the admin panel.
 * Lists all users with role management and deletion capabilities.
 */
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useApi } from '../../../composables/useApi.js'
import { useAuth } from '../../../composables/useAuth.js'
import type { User } from '../../../types/auth.js'
import DataGrid, { type DataGridColumn } from '../../common/DataGrid.vue'
import Select from '../../inputs/Select.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import ConfirmModal from './Administration.ConfirmModal.vue'

const api = useApi()
const auth = useAuth()

const users = ref<User[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

// Delete confirmation state
const showDeleteModal = ref(false)
const userToDelete = ref<User | null>(null)
const isDeleting = ref(false)

const currentUserId = computed(() => auth.user.value?.id)

const columns: DataGridColumn[] = [
  { key: 'username', label: 'Username' },
  { key: 'role', label: 'Role', width: '150px' },
  { key: 'lastLoginAt', label: 'Last Login' },
  { key: 'createdAt', label: 'Created' },
  { key: 'actions', label: 'Actions', width: '80px', align: 'center' },
]

const roleOptions = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
]

/**
 * Load all users from the API
 */
async function loadUsers() {
  isLoading.value = true
  error.value = null
  try {
    users.value = await api.auth.listUsers()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load users'
  } finally {
    isLoading.value = false
  }
}

/**
 * Update a user's role
 */
async function updateRole(user: User, newRole: string) {
  if (newRole !== 'admin' && newRole !== 'user') return
  if (user.role === newRole) return

  try {
    const updated = await api.auth.updateUserRole(user.id, newRole)
    const index = users.value.findIndex((u) => u.id === user.id)
    if (index !== -1) {
      users.value[index] = updated
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update role'
    await loadUsers()
  }
}

/**
 * Show delete confirmation modal
 */
function confirmDelete(user: User) {
  userToDelete.value = user
  showDeleteModal.value = true
}

/**
 * Delete the selected user
 */
async function deleteUser() {
  if (!userToDelete.value) return

  isDeleting.value = true
  try {
    await api.auth.deleteUser(userToDelete.value.id)
    users.value = users.value.filter((u) => u.id !== userToDelete.value?.id)
    userToDelete.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete user'
  } finally {
    isDeleting.value = false
  }
}

/**
 * Format a date for display
 */
function formatDate(date: Date | string | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a date with time for display
 */
function formatDateTime(date: Date | string | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  loadUsers()
  window.addEventListener('stina-users-changed', loadUsers)
})

onUnmounted(() => {
  window.removeEventListener('stina-users-changed', loadUsers)
})
</script>

<template>
  <div class="users-view">
    <header class="header">
      <h2 class="title">Users</h2>
    </header>

    <div v-if="error" class="error-message">
      <Icon icon="mdi:alert-circle" />
      {{ error }}
    </div>

    <DataGrid
      :items="users"
      :columns="columns"
      item-key="id"
      :loading="isLoading"
      loading-text="Loading users..."
      empty-icon="mdi:account-group"
      empty-text="No users found"
    >
      <template #cell-username="{ item }">
        <span class="username-cell">
          {{ item.username }}
          <span v-if="item.id === currentUserId" class="you-badge">You</span>
        </span>
      </template>

      <template #cell-role="{ item }">
        <Select
          :model-value="item.role"
          :options="roleOptions"
          :disabled="item.id === currentUserId"
          @update:model-value="(value) => updateRole(item, value)"
        />
      </template>

      <template #cell-lastLoginAt="{ item }">
        {{ formatDateTime(item.lastLoginAt) }}
      </template>

      <template #cell-createdAt="{ item }">
        {{ formatDate(item.createdAt) }}
      </template>

      <template #cell-actions="{ item }">
        <SimpleButton
          type="danger"
          :disabled="item.id === currentUserId"
          :title="item.id === currentUserId ? 'Cannot delete yourself' : 'Delete user'"
          @click="confirmDelete(item)"
        >
          <Icon icon="mdi:delete" />
        </SimpleButton>
      </template>
    </DataGrid>

    <ConfirmModal
      v-model="showDeleteModal"
      title="Delete User"
      :message="`Are you sure you want to delete user '${userToDelete?.username}'? This action cannot be undone.`"
      confirm-label="Delete"
      confirm-variant="danger"
      @confirm="deleteUser"
      @cancel="userToDelete = null"
    />
  </div>
</template>

<style scoped>
.users-view {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-normal);

  > .header {
    > .title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--theme-general-color);
    }
  }

  > .error-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--theme-general-color-danger-background, rgba(220, 38, 38, 0.1));
    border: 1px solid var(--theme-general-color-danger, #dc2626);
    border-radius: 0.5rem;
    color: var(--theme-general-color-danger, #dc2626);
  }
}

.username-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;

  > .you-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    background: var(--theme-general-color-primary);
    color: var(--theme-general-color-primary-contrast, white);
    border-radius: 1rem;
  }
}

:deep(.data-grid) {
  .role-cell {
    .select-input {
      width: 120px;
    }
  }
}
</style>
