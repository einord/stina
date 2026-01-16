<script setup lang="ts">
/**
 * User management component for the admin panel.
 * Lists all users with role management and deletion capabilities.
 */
import { ref, onMounted, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useApi } from '../../../composables/useApi.js'
import { useAuth } from '../../../composables/useAuth.js'
import type { User } from '../../../types/auth.js'
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
    // Reload to reset the dropdown
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
})
</script>

<template>
  <div class="users-view">
    <header class="header">
      <h2 class="title">Users</h2>
      <SimpleButton type="normal" :disabled="isLoading" @click="loadUsers">
        <Icon icon="mdi:refresh" />
        Refresh
      </SimpleButton>
    </header>

    <div v-if="error" class="error-message">
      <Icon icon="mdi:alert-circle" />
      {{ error }}
    </div>

    <div v-if="isLoading" class="loading">
      <Icon icon="mdi:loading" class="spin" />
      Loading users...
    </div>

    <table v-else-if="users.length > 0" class="users-table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Role</th>
          <th>Last Login</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in users" :key="user.id">
          <td class="username-cell">
            {{ user.username }}
            <span v-if="user.id === currentUserId" class="you-badge">You</span>
          </td>
          <td class="role-cell">
            <Select
              :model-value="user.role"
              :options="roleOptions"
              :disabled="user.id === currentUserId"
              @update:model-value="(value) => updateRole(user, value)"
            />
          </td>
          <td>{{ formatDateTime(user.lastLoginAt) }}</td>
          <td>{{ formatDate(user.createdAt) }}</td>
          <td class="actions-cell">
            <SimpleButton
              type="danger"
              :disabled="user.id === currentUserId"
              :title="user.id === currentUserId ? 'Cannot delete yourself' : 'Delete user'"
              @click="confirmDelete(user)"
            >
              <Icon icon="mdi:delete" />
            </SimpleButton>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="empty-state">
      <Icon icon="mdi:account-group" class="empty-icon" />
      <p>No users found</p>
    </div>

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
    display: flex;
    justify-content: space-between;
    align-items: center;

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

  > .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--theme-general-color-muted);

    > .spin {
      animation: spin 1s linear infinite;
    }
  }

  > .users-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid var(--theme-general-border-color);
    border-radius: 0.5rem;
    overflow: hidden;

    th,
    td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--theme-general-border-color);
    }

    th {
      background: var(--theme-components-table-header-background, var(--theme-general-background-secondary));
      font-weight: 600;
      color: var(--theme-general-color);
      font-size: 0.875rem;
    }

    td {
      color: var(--theme-general-color);
      font-size: 0.875rem;
    }

    tbody tr:last-child td {
      border-bottom: none;
    }

    tbody tr:hover {
      background: var(--theme-components-table-row-hover, var(--theme-general-background-hover));
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

    .role-cell {
      width: 150px;

      :deep(.select-input) {
        width: 120px;
      }
    }

    .actions-cell {
      width: 80px;
      text-align: center;
    }
  }

  > .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    color: var(--theme-general-color-muted);
    text-align: center;

    > .empty-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    > p {
      margin: 0;
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
