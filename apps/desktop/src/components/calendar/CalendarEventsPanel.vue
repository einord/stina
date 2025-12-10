<script setup lang="ts">
  import { t } from '@stina/i18n';
  import dayjs from 'dayjs';
  import localizedFormat from 'dayjs/plugin/localizedFormat';
  import { computed, onMounted, onUnmounted, ref } from 'vue';

  import PanelGroup from '../common/PanelGroup.vue';

  dayjs.extend(localizedFormat);

  type CalendarEvent = import('@stina/calendar').CalendarEvent;

  const events = ref<CalendarEvent[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  let unsubscribe: (() => void) | null = null;
  const collapsedGroups = ref<Set<string>>(new Set());

  const now = computed(() => Date.now());
  const startOfToday = computed(() => dayjs().startOf('day').valueOf());

  const todayStart = computed(() => dayjs().startOf('day'));

  const todayEvents = computed(() =>
    events.value.filter((ev) => dayjs(ev.startTs).isSame(todayStart.value, 'day') || dayjs(ev.endTs).isSame(todayStart.value, 'day')),
  );

  const upcomingEvents = computed(() =>
    events.value.filter((ev) => dayjs(ev.startTs).isAfter(todayStart.value, 'day')),
  );

  async function loadEvents() {
    loading.value = true;
    error.value = null;
    try {
      const end = now.value + 5 * 24 * 60 * 60 * 1000;
      events.value = await window.stina.calendar.getEvents({ start: startOfToday.value, end });
    } catch (err) {
      error.value = t('calendar.load_error');
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    void loadEvents();
    if (window.stina.calendar.onChanged) {
      unsubscribe = window.stina.calendar.onChanged(() => void loadEvents());
    }
  });

  onUnmounted(() => {
    unsubscribe?.();
  });

  function formatRange(ev: CalendarEvent) {
    const start = dayjs(ev.startTs);
    const end = dayjs(ev.endTs);
    if (ev.allDay) return start.format('LL');
    return `${start.format('LL')} · ${start.format('HH:mm')} – ${end.format('HH:mm')}`;
  }

  function isPast(ev: CalendarEvent) {
    return ev.endTs < now.value;
  }

  function toggleGroup(name: string) {
    const next = new Set(collapsedGroups.value);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    collapsedGroups.value = next;
  }
</script>

<template>
  <div class="calendar-panel">
    <PanelGroup
      v-if="todayEvents.length"
      :title="t('calendar.today')"
      :collapsed="collapsedGroups.has('today')"
      @toggle="toggleGroup('today')"
    >
      <div class="group-list">
        <div v-for="ev in todayEvents" :key="ev.id" class="event-card">
          <div class="title">{{ ev.title }}</div>
          <div class="meta" :class="{ past: isPast(ev) }">{{ formatRange(ev) }}</div>
        </div>
      </div>
    </PanelGroup>

    <PanelGroup
      v-if="upcomingEvents.length"
      :title="t('calendar.upcoming')"
      :collapsed="collapsedGroups.has('upcoming')"
      @toggle="toggleGroup('upcoming')"
    >
      <div class="group-list">
        <div v-for="ev in upcomingEvents" :key="ev.id" class="event-card">
          <div class="title">{{ ev.title }}</div>
          <div class="meta" :class="{ past: isPast(ev) }">{{ formatRange(ev) }}</div>
        </div>
      </div>
    </PanelGroup>

    <div v-if="loading" class="panel-empty">{{ t('calendar.loading') }}</div>
    <div v-else-if="error" class="panel-empty">{{ error }}</div>
    <div v-else-if="!todayEvents.length && !upcomingEvents.length" class="panel-empty">
      {{ t('calendar.empty_panel') }}
    </div>
  </div>
</template>

<style scoped>
  .calendar-panel {
    padding: 0 1rem 1rem 1rem;
    overflow-y: auto;

    > .panel-group > .content {
      padding: 0 1rem 1rem 1rem;
    }

    .group-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .event-card {
      border: 1px solid var(--border);
      border-radius: 0.65rem;
      padding: 0.6rem 0.75rem;
      background: var(--bg-bg);

      > .title {
        font-weight: 600;
      }
      > .meta {
        color: var(--muted);
        font-size: 0.9rem;

        &.past {
          opacity: 0.6;
        }
      }
    }

    .panel-empty {
      color: var(--muted);
      font-style: italic;
      padding: 1rem;
    }
  }
</style>
