<script setup lang="ts">
/**
 * Scheduled jobs settings view.
 * Lists all scheduled jobs for the current user with options to view details and delete.
 */
import { ref, computed, onMounted } from 'vue'
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

// Retention setting state
const retentionDays = ref<number>(30)
const retentionInput = ref<string>('30')
const isSavingRetention = ref(false)
const retentionError = ref<string | null>(null)

const retentionInfoText = computed(() =>
  retentionDays.value > 0
    ? `Färdiga jobb tas bort automatiskt efter ${retentionDays.value} ${
        retentionDays.value === 1 ? 'dag' : 'dagar'
      }. Aktiva jobb påverkas inte.`
    : 'Färdiga jobb tas inte bort automatiskt — de ligger kvar tills du tar bort dem manuellt.'
)

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
 * Handle delete from detail modal
 */
function handleDetailDelete() {
  if (selectedJobDetails.value) {
    confirmDelete(selectedJobDetails.value)
  }
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

/**
 * Load the user's retention preference for completed scheduled jobs.
 */
async function loadRetention() {
  try {
    const settings = await api.settings.get()
    const value =
      typeof settings.scheduledJobsRetentionDays === 'number' &&
      Number.isFinite(settings.scheduledJobsRetentionDays)
        ? Math.max(0, Math.floor(settings.scheduledJobsRetentionDays))
        : 30
    retentionDays.value = value
    retentionInput.value = String(value)
  } catch (err) {
    retentionError.value =
      err instanceof Error ? err.message : 'Kunde inte läsa rensningsinställning'
  }
}

/**
 * Persist the retention preference. Accepts a non-negative integer; 0 disables auto-cleanup.
 */
async function saveRetention() {
  const parsed = Number.parseInt(retentionInput.value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    retentionError.value = 'Ange ett heltal som är 0 eller större.'
    retentionInput.value = String(retentionDays.value)
    return
  }
  if (parsed === retentionDays.value) {
    retentionInput.value = String(retentionDays.value)
    return
  }

  retentionError.value = null
  isSavingRetention.value = true
  try {
    const updated = await api.settings.update({ scheduledJobsRetentionDays: parsed })
    const value =
      typeof updated.scheduledJobsRetentionDays === 'number'
        ? Math.max(0, Math.floor(updated.scheduledJobsRetentionDays))
        : parsed
    retentionDays.value = value
    retentionInput.value = String(value)
  } catch (err) {
    retentionError.value =
      err instanceof Error ? err.message : 'Kunde inte spara rensningsinställning'
    retentionInput.value = String(retentionDays.value)
  } finally {
    isSavingRetention.value = false
  }
}

onMounted(() => {
  loadJobs()
  loadRetention()
})
</script>

<template>
  <div class="scheduled-jobs-view">
    <header class="header">
      <h2 class="title">Schemalagda jobb</h2>
      <SimpleButton type="normal" :disabled="isLoading" @click="loadJobs">
        <Icon icon="mdi:refresh" />
        Uppdatera
      </SimpleButton>
    </header>

    <section class="retention-panel" aria-labelledby="retention-heading">
      <div class="retention-info">
        <Icon icon="mdi:information-outline" class="retention-icon" />
        <div class="retention-text">
          <h3 id="retention-heading" class="retention-title">Automatisk rensning</h3>
          <p class="retention-description">{{ retentionInfoText }}</p>
        </div>
      </div>
      <div class="retention-controls">
        <label class="retention-label" for="retention-days-input">
          Spara färdiga jobb i
        </label>
        <input
          id="retention-days-input"
          v-model="retentionInput"
          type="number"
          min="0"
          step="1"
          class="retention-input"
          :disabled="isSavingRetention"
          @change="saveRetention"
          @keydown.enter.prevent="saveRetention"
        />
        <span class="retention-suffix">dagar (0 = behåll alltid)</span>
      </div>
      <p v-if="retentionError" class="retention-error">
        <Icon icon="mdi:alert-circle" />
        {{ retentionError }}
      </p>
    </section>

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
      @delete="handleDetailDelete"
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

.retention-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--theme-general-color-info-background, rgba(59, 130, 246, 0.08));
  border: 1px solid var(--theme-general-color-info, rgba(59, 130, 246, 0.4));
  border-radius: 0.5rem;

  > .retention-info {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;

    > .retention-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
      color: var(--theme-general-color-info, #3b82f6);
      margin-top: 0.125rem;
    }

    > .retention-text {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      > .retention-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--theme-general-color);
      }

      > .retention-description {
        margin: 0;
        font-size: 0.875rem;
        color: var(--theme-general-color-muted);
      }
    }
  }

  > .retention-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;

    > .retention-label {
      font-size: 0.875rem;
      color: var(--theme-general-color);
    }

    > .retention-input {
      width: 5rem;
      padding: 0.25rem 0.5rem;
      font-size: 0.875rem;
      background: var(--theme-general-background);
      color: var(--theme-general-color);
      border: 1px solid var(--theme-general-border-color, rgba(128, 128, 128, 0.3));
      border-radius: 0.25rem;
    }

    > .retention-suffix {
      font-size: 0.875rem;
      color: var(--theme-general-color-muted);
    }
  }

  > .retention-error {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    color: var(--theme-general-color-danger, #dc2626);
  }
}
</style>
