<script setup lang="ts">
/**
 * Invitation management component for the admin panel.
 * Allows creating new invitations and managing existing ones.
 */
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useApi } from '../../../composables/useApi.js'
import type { Invitation } from '../../../types/auth.js'
import DataGrid, { type DataGridColumn } from '../../common/DataGrid.vue'
import TextInput from '../../inputs/TextInput.vue'
import Select from '../../inputs/Select.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import ConfirmModal from './Administration.ConfirmModal.vue'

const api = useApi()

const invitations = ref<Invitation[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

// Form state
const newUsername = ref('')
const newRole = ref<'user' | 'admin'>('user')
const isCreating = ref(false)
const createError = ref<string | null>(null)

// Delete confirmation state
const showDeleteModal = ref(false)
const invitationToDelete = ref<Invitation | null>(null)
const isDeleting = ref(false)

// Copy feedback
const copiedId = ref<string | null>(null)

const columns: DataGridColumn[] = [
  { key: 'username', label: 'Username' },
  { key: 'role', label: 'Role' },
  { key: 'createdAt', label: 'Created' },
  { key: 'expiresAt', label: 'Expires' },
  { key: 'link', label: 'Link', width: '80px', align: 'center' },
  { key: 'actions', label: 'Actions', width: '80px', align: 'center' },
]

const roleOptions = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
]

const canCreate = computed(() => newUsername.value.trim().length > 0 && !isCreating.value)

/**
 * Get row class based on invitation state
 */
function getRowClass(invitation: Invitation): string | undefined {
  return isExpired(invitation) ? 'expired' : undefined
}

/**
 * Load all invitations from the API
 */
async function loadInvitations() {
  isLoading.value = true
  error.value = null
  try {
    invitations.value = await api.auth.listInvitations()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load invitations'
  } finally {
    isLoading.value = false
  }
}

/**
 * Create a new invitation
 */
async function createInvitation() {
  if (!canCreate.value) return

  isCreating.value = true
  createError.value = null
  try {
    await api.auth.createInvitation(newUsername.value.trim(), newRole.value)
    newUsername.value = ''
    newRole.value = 'user'
    await loadInvitations()
  } catch (err) {
    createError.value = err instanceof Error ? err.message : 'Failed to create invitation'
  } finally {
    isCreating.value = false
  }
}

/**
 * Show delete confirmation modal
 */
function confirmDelete(invitation: Invitation) {
  invitationToDelete.value = invitation
  showDeleteModal.value = true
}

/**
 * Delete the selected invitation
 */
async function deleteInvitation() {
  if (!invitationToDelete.value) return

  isDeleting.value = true
  try {
    await api.auth.deleteInvitation(invitationToDelete.value.id)
    invitations.value = invitations.value.filter((i) => i.id !== invitationToDelete.value?.id)
    invitationToDelete.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete invitation'
  } finally {
    isDeleting.value = false
  }
}

/**
 * Build the invitation URL for copying
 */
function getInvitationUrl(invitation: Invitation): string {
  const baseUrl = window.location.origin
  return `${baseUrl}/register?token=${invitation.token}`
}

/**
 * Copy invitation URL to clipboard
 */
async function copyInvitationUrl(invitation: Invitation) {
  try {
    await navigator.clipboard.writeText(getInvitationUrl(invitation))
    copiedId.value = invitation.id
    setTimeout(() => {
      copiedId.value = null
    }, 2000)
  } catch {
    error.value = 'Failed to copy to clipboard'
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

/**
 * Check if an invitation is expired
 */
function isExpired(invitation: Invitation): boolean {
  const expiresAt =
    typeof invitation.expiresAt === 'string' ? new Date(invitation.expiresAt) : invitation.expiresAt
  return expiresAt < new Date()
}

onMounted(() => {
  loadInvitations()
  window.addEventListener('stina-invitations-changed', loadInvitations)
})

onUnmounted(() => {
  window.removeEventListener('stina-invitations-changed', loadInvitations)
})
</script>

<template>
  <div class="invitations-view">
    <header class="header">
      <h2 class="title">Invitations</h2>
    </header>

    <!-- Create invitation form -->
    <section class="create-form">
      <h3 class="form-title">Create New Invitation</h3>
      <div class="form-fields">
        <TextInput
          v-model="newUsername"
          label="Username"
          placeholder="Enter username for the new user"
          :error="createError ?? undefined"
          :disabled="isCreating"
        />
        <Select
          v-model="newRole"
          label="Role"
          :options="roleOptions"
          :disabled="isCreating"
        />
        <SimpleButton
          type="primary"
          :disabled="!canCreate"
          class="create-btn"
          @click="createInvitation"
        >
          <Icon v-if="isCreating" icon="mdi:loading" class="spin" />
          <Icon v-else icon="mdi:plus" />
          Create Invitation
        </SimpleButton>
      </div>
    </section>

    <div v-if="error" class="error-message">
      <Icon icon="mdi:alert-circle" />
      {{ error }}
    </div>

    <section v-if="!isLoading && invitations.length > 0" class="invitations-list">
      <h3 class="list-title">Active Invitations</h3>
      <DataGrid
        :items="invitations"
        :columns="columns"
        item-key="id"
        :row-class="getRowClass"
      >
        <template #cell-username="{ item }">
          <span class="username-cell">{{ item.username }}</span>
        </template>

        <template #cell-role="{ item }">
          <span class="role-badge" :class="item.role">
            {{ item.role }}
          </span>
        </template>

        <template #cell-createdAt="{ item }">
          {{ formatDate(item.createdAt) }}
        </template>

        <template #cell-expiresAt="{ item }">
          <span :class="{ 'expired-date': isExpired(item) }">
            {{ formatDateTime(item.expiresAt) }}
            <span v-if="isExpired(item)" class="expired-label">Expired</span>
          </span>
        </template>

        <template #cell-link="{ item }">
          <SimpleButton
            type="normal"
            :disabled="isExpired(item)"
            :title="copiedId === item.id ? 'Copied!' : 'Copy invitation link'"
            @click="copyInvitationUrl(item)"
          >
            <Icon v-if="copiedId === item.id" icon="mdi:check" />
            <Icon v-else icon="mdi:content-copy" />
          </SimpleButton>
        </template>

        <template #cell-actions="{ item }">
          <SimpleButton
            type="danger"
            title="Delete invitation"
            @click="confirmDelete(item)"
          >
            <Icon icon="mdi:delete" />
          </SimpleButton>
        </template>
      </DataGrid>
    </section>

    <DataGrid
      v-else
      :items="[]"
      :columns="columns"
      item-key="id"
      :loading="isLoading"
      loading-text="Loading invitations..."
      empty-icon="mdi:email-outline"
    >
      <template #empty>
        <Icon icon="mdi:email-outline" class="empty-icon" />
        <p>No active invitations</p>
        <p class="empty-hint">Create an invitation above to invite new users</p>
      </template>
    </DataGrid>

    <ConfirmModal
      v-model="showDeleteModal"
      title="Delete Invitation"
      :message="`Are you sure you want to delete the invitation for '${invitationToDelete?.username}'?`"
      confirm-label="Delete"
      confirm-variant="danger"
      @confirm="deleteInvitation"
      @cancel="invitationToDelete = null"
    />
  </div>
</template>

<style scoped>
.invitations-view {
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

  > .create-form {
    background: var(--theme-general-background-secondary, var(--theme-components-card-background));
    border: 1px solid var(--theme-general-border-color);
    border-radius: 0.5rem;
    padding: 1.5rem;

    > .form-title {
      margin: 0 0 1rem 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--theme-general-color);
    }

    > .form-fields {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 1rem;
      align-items: flex-end;

      @media (max-width: 768px) {
        grid-template-columns: 1fr;
      }

      > .create-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        white-space: nowrap;
      }
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

  > .invitations-list {
    > .list-title {
      margin: 0 0 1rem 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--theme-general-color);
    }
  }
}

.username-cell {
  font-weight: 500;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 1rem;
  text-transform: capitalize;

  &.admin {
    background: var(--theme-general-color-primary);
    color: var(--theme-general-color-primary-contrast, white);
  }

  &.user {
    background: var(--theme-general-color-muted);
    color: var(--theme-general-color-muted-contrast, white);
  }
}

.expired-date {
  color: var(--theme-general-color-danger, #dc2626);

  > .expired-label {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.125rem 0.375rem;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    background: var(--theme-general-color-danger, #dc2626);
    color: white;
    border-radius: 0.25rem;
  }
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-hint {
  font-size: 0.875rem;
  margin-top: 0.5rem;
  opacity: 0.8;
}

.spin {
  animation: spin 1s linear infinite;
}

:deep(.data-grid) {
  .expired {
    opacity: 0.6;
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
