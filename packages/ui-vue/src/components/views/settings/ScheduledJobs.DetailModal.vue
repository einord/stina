<script setup lang="ts">
/**
 * Detail modal for viewing scheduled job information.
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import Modal from '../../common/Modal.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import type { ScheduledJobDetailDTO } from '@stina/shared'

const props = defineProps<{
  /** The job to display details for (null while loading) */
  job: ScheduledJobDetailDTO | null
  /** Whether details are currently loading */
  loading?: boolean
}>()

const emit = defineEmits<{
  delete: []
}>()

const open = defineModel<boolean>({ required: true })

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
 * Format payload as pretty JSON
 */
const formattedPayload = computed(() => {
  if (!props.job?.payload) return null
  try {
    return JSON.stringify(props.job.payload, null, 2)
  } catch {
    return null
  }
})

/**
 * Get status label
 */
const statusLabel = computed(() => {
  if (!props.job) return '-'
  return props.job.enabled ? 'Aktiv' : 'Inaktiv'
})

/**
 * Get misfire policy label
 */
const misfirePolicyLabel = computed(() => {
  if (!props.job) return '-'
  return props.job.misfirePolicy === 'run_once' ? 'Kör en gång (vid missat schema)' : 'Hoppa över'
})
</script>

<template>
  <Modal v-model="open" title="Jobbdetaljer" close-label="Stäng">
    <div v-if="loading" class="loading">
      <Icon icon="mdi:loading" class="spin" />
      Laddar jobbdetaljer...
    </div>

    <div v-else-if="job" class="job-details">
      <div class="detail-row">
        <span class="label">Jobb-ID:</span>
        <span class="value monospace">{{ job.jobId }}</span>
      </div>

      <div class="detail-row">
        <span class="label">Extension:</span>
        <span class="value">
          {{ job.extensionName ?? job.extensionId }}
          <span v-if="job.extensionName" class="sub-value">({{ job.extensionId }})</span>
        </span>
      </div>

      <div class="detail-row">
        <span class="label">Schema:</span>
        <span class="value">{{ job.scheduleDescription }}</span>
      </div>

      <div class="detail-row">
        <span class="label">Schemavärde:</span>
        <span class="value monospace">{{ job.scheduleValue }}</span>
      </div>

      <div v-if="job.timezone" class="detail-row">
        <span class="label">Tidszon:</span>
        <span class="value">{{ job.timezone }}</span>
      </div>

      <div class="detail-row">
        <span class="label">Misfire-policy:</span>
        <span class="value">{{ misfirePolicyLabel }}</span>
      </div>

      <div class="detail-row">
        <span class="label">Status:</span>
        <span :class="['status-badge', job.enabled ? 'enabled' : 'disabled']">
          {{ statusLabel }}
        </span>
      </div>

      <div class="detail-row">
        <span class="label">Nästa körning:</span>
        <span class="value">{{ formatDate(job.nextRunAt) }}</span>
      </div>

      <div class="detail-row">
        <span class="label">Senaste körning:</span>
        <span class="value">{{ formatDate(job.lastRunAt) }}</span>
      </div>

      <div class="detail-row">
        <span class="label">Skapat:</span>
        <span class="value">{{ formatDate(job.createdAt) }}</span>
      </div>

      <div v-if="formattedPayload" class="detail-row payload">
        <span class="label">Payload:</span>
        <pre class="payload-content">{{ formattedPayload }}</pre>
      </div>
    </div>

    <template #footer>
      <SimpleButton type="danger" @click="emit('delete')">
        <Icon icon="mdi:delete" />
        Ta bort jobb
      </SimpleButton>
      <SimpleButton type="normal" @click="open = false">
        Stäng
      </SimpleButton>
    </template>
  </Modal>
</template>

<style scoped>
.loading {
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

.job-details {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  > .label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--theme-general-color-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  > .value {
    color: var(--theme-general-color);
  }

  .sub-value {
    color: var(--theme-general-color-muted);
    font-size: 0.85rem;
  }

  .monospace {
    font-family: monospace;
    font-size: 0.9rem;
  }

  &.payload {
    > .payload-content {
      margin: 0;
      padding: 0.75rem;
      background: var(--theme-general-background-secondary);
      border: 1px solid var(--theme-general-border-color);
      border-radius: 0.375rem;
      font-family: monospace;
      font-size: 0.8rem;
      overflow-x: auto;
      color: var(--theme-general-color);
    }
  }
}

.status-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
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

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
