<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue';
  import dayjs from 'dayjs';
  import localizedFormat from 'dayjs/plugin/localizedFormat';

  import { t } from '@stina/i18n';

  import FormHeader from '../common/FormHeader.vue';

  dayjs.extend(localizedFormat);

  type CalendarEvent = import('@stina/calendar').CalendarEvent;

  const events = ref<CalendarEvent[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  let unsubscribe: (() => void) | null = null;

  const todayStart = computed(() => dayjs().startOf('day'));

  const todayEvents = computed(() =>
    events.value.filter((ev) => dayjs(ev.startTs).isSame(todayStart.value, 'day')),
  );

  const upcomingEvents = computed(() =>
    events.value.filter((ev) => dayjs(ev.startTs).isAfter(todayStart.value, 'day')),
  );

 async function loadEvents() {
   loading.value = true;
   error.value = null;
    try {
      const now = Date.now();
      const end = now + 5 * 24 * 60 * 60 * 1000;
      events.value = await window.stina.calendar.getEvents({ start: now, end });
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
</script>

<template>
  <div class="calendar-panel">
    <section class="group" v-if="todayEvents.length">
      <FormHeader class="header" :title="t('calendar.today')" />
      <div class="content">
        <div class="group-list">
          <div v-for="ev in todayEvents" :key="ev.id" class="event-card">
            <div class="title">{{ ev.title }}</div>
            <div class="meta">{{ formatRange(ev) }}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="group" v-if="upcomingEvents.length">
      <FormHeader class="header" :title="t('calendar.upcoming')" />
      <div class="content">
        <div class="group-list">
          <div v-for="ev in upcomingEvents" :key="ev.id" class="event-card">
            <div class="title">{{ ev.title }}</div>
            <div class="meta">{{ formatRange(ev) }}</div>
          </div>
        </div>
      </div>
    </section>

    <div v-if="loading" class="panel-empty">{{ t('calendar.loading') }}</div>
    <div v-else-if="error" class="panel-empty">{{ error }}</div>
    <div v-else-if="!todayEvents.length && !upcomingEvents.length" class="panel-empty">
      {{ t('calendar.empty_panel') }}
    </div>
  </div>
</template>

<style scoped>
  .calendar-panel {
    height: 100%;
    max-height: 100%;
    padding: 0 1rem 1rem 1rem;
    overflow-y: auto;

    > .group {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border);
      border-radius: var(--border-radius-normal);
      background: var(--panel);
      margin-bottom: 0.75rem;
    }

    .header {
      cursor: default;
    }

    .content {
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
      }
    }

    .panel-empty {
      color: var(--muted);
      font-style: italic;
      padding: 1rem;
    }
  }
</style>
