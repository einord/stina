<script setup lang="ts">
import { computed } from 'vue'
import type { Message, PersistedToolCall } from '@stina/core'

/**
 * Single message rendering per §05's three-actor visual distinction:
 * - user: right-aligned, accent background
 * - stina: left-aligned, plain background
 * - app: center-banner with source label and a trust-boundary marker
 *   around interpolated untrusted strings (mail subject, snippet, etc.)
 */

const props = defineProps<{
  message: Message
}>()

const isUser = computed(() => props.message.author === 'user')
const isStina = computed(() => props.message.author === 'stina')
const isApp = computed(() => props.message.author === 'app')

const userText = computed(() =>
  isUser.value ? (props.message.content as { text: string }).text : ''
)
const stinaText = computed(() =>
  isStina.value ? ((props.message.content as { text?: string }).text ?? '') : ''
)

const stinaToolCalls = computed<PersistedToolCall[]>(() => {
  if (!isStina.value) return []
  const c = props.message.content as { tool_calls?: PersistedToolCall[] }
  return c.tool_calls ?? []
})

function toolStatusIcon(status: PersistedToolCall['status']): string {
  if (status === 'done') return '✓'
  if (status === 'error') return '✕'
  return '🚫'
}

interface AppView {
  iconLabel: string
  primary: string
  secondary?: string
  source?: string
}

const appView = computed<AppView | null>(() => {
  if (!isApp.value) return null
  const m = props.message
  if (m.author !== 'app') return null
  const c = m.content
  switch (c.kind) {
    case 'mail':
      return {
        iconLabel: 'Mail',
        primary: c.subject,
        secondary: `Från ${c.from} — ${c.snippet}`,
        source: m.source.extension_id,
      }
    case 'calendar':
      return {
        iconLabel: 'Kalender',
        primary: c.title,
        secondary: c.location ? `${formatTime(c.starts_at)} · ${c.location}` : formatTime(c.starts_at),
        source: m.source.extension_id,
      }
    case 'scheduled':
      return {
        iconLabel: 'Schemalagt',
        primary: c.description,
        secondary: c.job_id,
        source: m.source.extension_id,
      }
    case 'extension_status':
      return {
        iconLabel: 'Tillägg',
        primary: c.detail,
        secondary: `${c.extension_id} · ${c.status}`,
        source: m.source.extension_id,
      }
    case 'system':
      return {
        iconLabel: 'System',
        primary: c.message,
      }
    default:
      return null
  }
})

function formatTime(unixMs: number): string {
  return new Date(unixMs).toLocaleString('sv-SE', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const timestampLabel = computed(() =>
  new Date(props.message.created_at).toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
  })
)
</script>

<template>
  <article class="im" :class="`im--${message.author}`">
    <!-- USER -->
    <template v-if="isUser">
      <div class="im__bubble im__bubble--user">
        <p class="im__text">{{ userText }}</p>
      </div>
      <span class="im__time im__time--right">{{ timestampLabel }}</span>
    </template>

    <!-- STINA -->
    <template v-else-if="isStina">
      <div class="im__bubble im__bubble--stina">
        <ul v-if="stinaToolCalls.length > 0" class="im__tool-list">
          <li
            v-for="call in stinaToolCalls"
            :key="call.id"
            :class="['im__tool-row', `im__tool-row--${call.status}`, `severity-${call.severity}`]"
          >
            <span class="im__tool-icon" aria-hidden="true">{{ toolStatusIcon(call.status) }}</span>
            <span class="im__tool-label"><code>{{ call.name }}</code></span>
          </li>
        </ul>
        <p v-if="stinaText" class="im__text">{{ stinaText }}</p>
      </div>
      <span class="im__time im__time--left">{{ timestampLabel }}</span>
    </template>

    <!-- APP -->
    <template v-else-if="appView">
      <div class="im__app-banner">
        <header class="im__app-banner-header">
          <span class="im__app-icon">{{ appView.iconLabel }}</span>
          <span v-if="appView.source" class="im__app-source">{{ appView.source }}</span>
          <span class="im__app-time">{{ timestampLabel }}</span>
        </header>
        <!-- Trust-boundary marker per §05: untrusted interpolated strings -->
        <p class="im__app-primary im__untrusted">{{ appView.primary }}</p>
        <p v-if="appView.secondary" class="im__app-secondary im__untrusted">
          {{ appView.secondary }}
        </p>
      </div>
    </template>
  </article>
</template>

<style scoped>
.im {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-family: var(--font-body, system-ui, sans-serif);

  &.im--user {
    align-items: flex-end;
  }

  &.im--stina {
    align-items: flex-start;
  }

  &.im--app {
    align-items: stretch;
  }

  > .im__bubble {
    max-width: min(70ch, 80%);
    padding: 0.625rem 0.875rem;
    border-radius: 8px;
    line-height: 1.45;

    > .im__text {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
  }

  > .im__bubble--user {
    background: var(--color-bubble-user-bg, #e8dcc4);
    color: var(--color-bubble-user-fg, #2a2722);
  }

  > .im__bubble--stina {
    background: var(--color-bubble-stina-bg, transparent);
    color: var(--color-text, #2a2722);
    border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));

    > .im__tool-list {
      list-style: none;
      margin: 0 0 0.5rem;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      /* No bottom margin when no text follows */
      &:last-child {
        margin-bottom: 0;
      }

      > .im__tool-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: var(--color-text-muted, #6b6359);

        > .im__tool-icon {
          display: inline-block;
          width: 1rem;
          text-align: center;
          font-weight: 600;
        }

        > .im__tool-label > code {
          background: rgba(0, 0, 0, 0.04);
          padding: 0.05rem 0.25rem;
          border-radius: 3px;
          font-size: 0.85em;
        }

        &.im__tool-row--done > .im__tool-icon {
          color: var(--color-success, #4a7c4a);
        }

        &.im__tool-row--error > .im__tool-icon {
          color: var(--color-error, #c34a4a);
        }

        &.im__tool-row--blocked {
          opacity: 0.85;

          > .im__tool-icon {
            color: var(--color-accent-rose, #c4736a);
          }
        }

        /* Severity-driven visual weight per §05, mirroring the pattern in
           InboxView.ThreadDetail.vue. No animation states needed — persisted
           messages are static. */
        &.severity-low {
          opacity: 0.7;

          > .im__tool-label {
            color: var(--color-text-muted, #6b6359);
          }
        }

        &.severity-high {
          background: rgba(180, 138, 90, 0.08);
          border-left: 3px solid var(--color-accent, #b48a5a);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;

          > .im__tool-label {
            color: var(--color-text, #2a2722);
            font-weight: 500;
          }
        }

        &.severity-critical {
          background: rgba(196, 115, 106, 0.1);
          border: 1px solid var(--color-accent-rose, #c4736a);
          border-left-width: 3px;
          padding: 0.375rem 0.625rem;
          border-radius: 4px;

          > .im__tool-label {
            color: var(--color-text, #2a2722);
            font-weight: 600;
          }
        }
      }
    }
  }

  > .im__time {
    font-size: 0.7rem;
    color: var(--color-text-muted, #6b6359);
    opacity: 0.7;

    &.im__time--right {
      align-self: flex-end;
    }

    &.im__time--left {
      align-self: flex-start;
    }
  }

  > .im__app-banner {
    align-self: stretch;
    border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    padding: 0.75rem 1rem;
    background: var(--color-surface-elevated, #fdfcf8);
    margin: 0.25rem auto;
    max-width: 90%;

    > .im__app-banner-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted, #6b6359);

      > .im__app-icon {
        font-weight: 600;
      }

      > .im__app-source {
        opacity: 0.7;
      }

      > .im__app-time {
        margin-left: auto;
        text-transform: none;
        letter-spacing: 0;
      }
    }

    > .im__app-primary {
      margin: 0;
      font-weight: 500;
      color: var(--color-text, #2a2722);
    }

    > .im__app-secondary {
      margin: 0.25rem 0 0;
      font-size: 0.875rem;
      color: var(--color-text-muted, #6b6359);
    }
  }

  /*
   * Trust-boundary marker per §05: a subtle dotted border around any
   * interpolated string whose ultimate source is non-Stina untrusted data.
   * Quiet enough to not disrupt reading; visible on inspection.
   */
  .im__untrusted {
    border-bottom: 1px dotted var(--color-border, rgba(0, 0, 0, 0.18));
    padding-bottom: 1px;
  }
}
</style>
