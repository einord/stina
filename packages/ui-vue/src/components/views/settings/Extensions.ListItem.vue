<script setup lang="ts">
import { computed } from 'vue'
import type { ExtensionListItem, InstalledExtensionInfo } from '@stina/extension-installer'
import Icon from '../../common/Icon.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import IconToggleButton from '../../buttons/IconToggleButton.vue'
import Toggle from '../../inputs/Toggle.vue'

const props = defineProps<{
  extension: ExtensionListItem
  installed: InstalledExtensionInfo | null
  installVersion: string | null
  installVersionVerified: boolean
  installedVerified: boolean
  actionInProgress: boolean
  /** Whether the current user is an admin (can manage extensions) */
  isAdmin: boolean
  /** Whether the installed extension has an invalid manifest */
  manifestInvalid?: boolean
  /** Manifest validation errors */
  manifestErrors?: string[]
}>()

const emit = defineEmits<{
  click: []
  install: []
  uninstall: []
  toggleEnabled: []
}>()

const isInstalled = computed(() => Boolean(props.installed))
const isEnabled = computed(() => props.installed?.enabled ?? false)
const installedVersion = computed(() => props.installed?.version ?? null)
const enabledModel = computed({
  get: () => isEnabled.value,
  set: (value) => {
    if (props.actionInProgress) return
    if (value !== isEnabled.value) emit('toggleEnabled')
  },
})

const isUnverifiedOnly = computed(() => !props.installVersionVerified)
const badgeVersion = computed(() => props.installVersion ?? props.extension.latestVersion ?? '')
const badgeLabel = computed(() => (badgeVersion.value ? `v${badgeVersion.value}` : '?'))

const categoryLabelKey = computed(() => {
  switch (props.extension.categories[0]) {
    case 'ai-provider':
      return 'extensions.category_ai_provider'
    case 'tool':
      return 'extensions.category_tool'
    case 'theme':
      return 'extensions.category_theme'
    case 'utility':
      return 'extensions.category_utility'
    default:
      return 'extensions.category_unknown'
  }
})

function getCategoryIcon(category: string | undefined): string {
  switch (category) {
    case 'ai-provider':
      return 'ai-brain-01'
    case 'tool':
      return 'wrench-01'
    case 'theme':
      return 'paint-brush-01'
    case 'utility':
      return 'setting-04'
    default:
      return 'puzzle'
  }
}

function handleActionClick(event: Event, action: () => void) {
  event.stopPropagation()
  action()
}
</script>

<template>
  <div
    class="extension-item"
    :class="{ installed: isInstalled, disabled: !isEnabled && isInstalled, dimmed: isUnverifiedOnly }"
    @click="emit('click')"
  >
    <div class="summary">
      <div class="icon-wrapper">
        <Icon :name="getCategoryIcon(extension.categories[0])" />
      </div>
      <div class="details">
        <div class="name-row">
          <span class="name">{{ extension.name }}</span>
          <span
            class="status-badge"
            :class="installVersionVerified ? 'verified' : 'unverified'"
          >
            <Icon :name="installVersionVerified ? 'checkmark-circle-02' : 'alert-02'" />
            {{ badgeLabel }}
          </span>
        </div>
        <p class="description">{{ extension.description }}</p>
        <div class="meta">
          <span class="meta-item">{{ $t(categoryLabelKey) }}</span>
          <span class="meta-item">{{ $t('extensions.by_author', { author: extension.author }) }}</span>
          <span v-if="installedVersion" class="meta-item" :class="{ warning: !installedVerified }">
            {{ $t('extensions.installed_version', { version: installedVersion }) }}
            <Icon
              :name="installedVerified ? 'checkmark-circle-02' : 'alert-02'"
              class="status-icon"
            />
          </span>
        </div>
        <!-- Manifest error warning -->
        <div v-if="manifestInvalid" class="manifest-error">
          <Icon name="alert-02" />
          <span>{{ $t('extensions.manifest_invalid') }}</span>
          <span v-if="manifestErrors?.length" class="error-details">
            {{ manifestErrors[0] }}
          </span>
        </div>
      </div>
    </div>

    <div class="actions">
      <template v-if="actionInProgress">
        <Icon name="loading-03" class="spin" />
      </template>
      <template v-else-if="isInstalled">
        <div class="toggle-action" @click.stop>
          <Toggle
            v-model="enabledModel"
            :label="$t('extensions.enabled')"
            :disabled="actionInProgress || !isAdmin"
            :title="!isAdmin ? $t('extensions.admin_only_enable_disable') : undefined"
          />
        </div>
        <IconToggleButton
          icon="delete-02"
          :tooltip="isAdmin ? $t('extensions.uninstall') : $t('extensions.admin_only_uninstall')"
          type="danger"
          :disabled="!isAdmin"
          @click="(event) => isAdmin && handleActionClick(event, () => emit('uninstall'))"
        />
      </template>
      <template v-else>
        <SimpleButton
          type="primary"
          :disabled="!isAdmin"
          :title="!isAdmin ? $t('extensions.admin_only_install') : undefined"
          @click="(event) => isAdmin && handleActionClick(event, () => emit('install'))"
        >
          <Icon name="download-01" />
          {{
            installVersion
              ? $t('extensions.install_version', { version: installVersion })
              : $t('extensions.install')
          }}
        </SimpleButton>
      </template>
    </div>
  </div>
</template>

<style scoped>
.extension-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  cursor: pointer;

  &.disabled {
    opacity: 0.65;
  }

  &.dimmed {
    opacity: 0.6;
  }

  > .summary {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    min-width: 0;

    > .icon-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--border-radius-small, 0.375rem);
      background: var(--theme-general-background-hover);
      color: var(--theme-general-color-primary);
      flex-shrink: 0;
    }

    > .details {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      min-width: 0;

      > .name-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;

        > .name {
          font-weight: 600;
          color: var(--theme-general-color);
        }

        > .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.7rem;
          padding: 0.125rem 0.5rem;
          border-radius: 999px;
          text-transform: uppercase;
          letter-spacing: 0.04em;

          > :deep(svg) {
            font-size: 0.75rem;
          }

          &.verified {
            background: var(--theme-general-color-success-background, rgba(34, 197, 94, 0.15));
            color: var(--theme-general-color-success, #16a34a);
          }

          &.unverified {
            background: var(--theme-general-color-danger-background, rgba(239, 68, 68, 0.15));
            color: var(--theme-general-color-danger, #dc2626);
          }
        }
      }

      > .description {
        margin: 0;
        font-size: 0.85rem;
        color: var(--theme-general-color-muted);
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
      }

      > .meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
        font-size: 0.75rem;
        color: var(--theme-general-color-muted);

        > .meta-item {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          position: relative;

          > .status-icon {
            color: var(--theme-general-color-success);
            font-size: 0.75rem;
          }

          &.warning {
            color: var(--theme-general-color-warning, #b45309);

            > .status-icon {
              color: var(--theme-general-color-warning, #b45309);
            }
          }

          & + .meta-item::before {
            content: '·';
            margin-right: 0.5rem;
            color: var(--theme-general-color-muted);
          }
        }
      }

      > .manifest-error {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        margin-top: 0.25rem;
        padding: 0.375rem 0.625rem;
        background: var(--theme-general-color-danger-background, rgba(239, 68, 68, 0.15));
        color: var(--theme-general-color-danger, #dc2626);
        border-radius: var(--border-radius-small, 0.375rem);
        font-size: 0.75rem;
        font-weight: 500;

        > .error-details {
          font-weight: 400;
          opacity: 0.9;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 300px;
        }
      }
    }
  }

  > .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;

    > .toggle-action {
      display: flex;
      align-items: center;

      > :deep(.toggle-wrapper) {
        align-items: center;
      }

      > :deep(.content) {
        gap: 0.125rem;
      }

      > :deep(.label) {
        font-size: 0.75rem;
      }
    }
  }
}
</style>
