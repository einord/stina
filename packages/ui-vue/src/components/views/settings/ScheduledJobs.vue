<script setup lang="ts">
/**
 * Scheduled jobs settings view.
 * Lists all scheduled jobs for the current user with options to view details and delete.
 */
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useApi } from '../../../composables/useApi.js'
import type { ScheduledJobSummaryDTO, ScheduledJobDetailDTO } from '@stina/shared'
import DataGrid, { type DataGridColumn } from '../../common/DataGrid.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import ScheduledJobsDetailModal from './ScheduledJobs.DetailModal.vue'
import ScheduledJobsDeleteModal from './ScheduledJobs.DeleteModal.vue'

const api = useApi()

const jobs = ref<ScheduledJobSummaryDTO[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

// Detail modal state
const showDetailModal = ref(false)
const selectedJobDetails = ref<ScheduledJobDetailDTO | null>(null)
const isLoadingDetails = ref(false)

// Delete confirmation state
const showDeleteModal = ref(false)
const jobToDelete = ref<ScheduledJobSummaryDTO | null>(null)
const isDeleting = ref(false)

const columns: DataGridColumn[] = [
  { key: 'jobId', label: 'Jobb-ID' },
  { key: 'extensionId', label: 'Extension' },
  { key: 'scheduleDescription', label: 'Schema' },
  { key: 'nextRunAt', label: 'Nästa körning' },
  { key: 'enabled', label: 'Status', width: '100px' },
  { key: 'actions', label: '', width: '120px', align: 'right' },
]

/**
 * Load all scheduled jobs for the current user
 */
async function loadJobs() {
  isLoading.value = true
  error.value = null
  try {
    jobs.value = await api.scheduledJobs.list()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load scheduled jobs'
  } finally {
    isLoading.value = false
  }
}

/**
 * Show job details modal
 */
async function showDetails(job: ScheduledJobSummaryDTO) {
  isLoadingDetails.value = true
  showDetailModal.value = true
  selectedJobDetails.value = null

  try {
    selectedJobDetails.value = await api.scheduledJobs.get(job.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load job details'
    showDetailModal.value = false
  } finally {
    isLoadingDetails.value = false
  }
}

/**
 * Show delete confirmation modal
 */
function confirmDelete(job: ScheduledJobSummaryDTO) {
  jobToDelete.value = job
  showDeleteModal.value = true
}

/**
 * Delete the selected job
 */
async function deleteJob() {
  if (!jobToDelete.value) return

  isDeleting.value = true
  try {
    await api.scheduledJobs.delete(jobToDelete.value.id)
    jobs.value = jobs.value.filter((j) => j.id !== jobToDelete.value?.id)
    showDeleteModal.value = false
    jobToDelete.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete job'
  } finally {
    isDeleting.value = false
  }
}

/**
 * Format a date for display
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleString()
}

onMounted(() => {
  loadJobs()
})
</script>

<template>
  <div class="scheduled-jobs-view">
    <header class="header">
      <h2 class="title">Schemalagda jobb</h2>
      <SimpleButton type="normal" @click="loadJobs" :disabled="isLoading">
        <Icon icon="mdi:refresh" />
        Uppdatera
      </SimpleButton>
    </header>

    <div v-if="error" class="error-message">
      <Icon icon="mdi:alert-circle" />
      {{ error }}
    </div>

    <DataGrid
      :items="jobs"
      :columns="columns"
      item-key="id"
      :loading="isLoading"
      loading-text="Laddar schemalagda jobb..."
      empty-icon="mdi:calendar-clock"
      empty-text="Inga schemalagda jobb"
    >
      <template #cell-extensionId="{ item }">
        <span class="extension-cell">
          {{ item.extensionId }}
        </span>
      </template>

      <template #cell-nextRunAt="{ item }">
        {{ formatDate(item.nextRunAt) }}
      </template>

      <template #cell-enabled="{ item }">
        <span :class="['status-badge', item.enabled ? 'enabled' : 'disabled']">
          {{ item.enabled ? 'Aktiv' : 'Inaktiv' }}
        </span>
      </template>

      <template #cell-actions="{ item }">
        <div class="actions-cell">
          <SimpleButton type="normal" title="Visa detaljer" @click="showDetails(item)">
            <Icon icon="mdi:eye" />
          </SimpleButton>
          <SimpleButton type="danger" title="Ta bort" @click="confirmDelete(item)">
            <Icon icon="mdi:delete" />
          </SimpleButton>
        </div>
      </template>
    </DataGrid>

    <ScheduledJobsDetailModal
      v-model="showDetailModal"
      :job="selectedJobDetails"
      :loading="isLoadingDetails"
      @delete="selectedJobDetails && confirmDelete(selectedJobDetails)"
    />

    <ScheduledJobsDeleteModal
      v-model="showDeleteModal"
      :job="jobToDelete"
      :is-deleting="isDeleting"
      @confirm="deleteJob"
      @cancel="jobToDelete = null"
    />
  </div>
</template>

<style scoped>
.scheduled-jobs-view {
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
}

.extension-cell {
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--theme-general-color-muted);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 1rem;

  &.enabled {
    background: var(--theme-general-color-success-background, rgba(34, 197, 94, 0.1));
    color: var(--theme-general-color-success, #22c55e);
  }

  &.disabled {
    background: var(--theme-general-color-muted-background, rgba(128, 128, 128, 0.1));
    color: var(--theme-general-color-muted);
  }
}

.actions-cell {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>
