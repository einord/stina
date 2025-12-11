<script setup lang="ts">
  import { t } from '@stina/i18n';
  import dayjs from 'dayjs';
  import localizedFormat from 'dayjs/plugin/localizedFormat';
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
  import IHugeiconsCalendar03 from '~icons/hugeicons/calendar-03';

  import MarkDown from '../MarkDown.vue';
  import PanelGroupItem from '../common/PanelGroup.Item.vue';
  import PanelGroup from '../common/PanelGroup.vue';

  dayjs.extend(localizedFormat);

  type CalendarEvent = import('@stina/calendar').CalendarEvent;

  const TodayIcon = IHugeiconsCalendar03;
  const UpcomingIcon = IHugeiconsCalendar03;

  const events = ref<CalendarEvent[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  let unsubscribe: (() => void) | null = null;
  const collapsedGroups = ref<Set<string>>(new Set());
  const openEvents = ref<Set<string>>(new Set());
  const rangeDays = ref(5);
  let offRangeListener: (() => void) | null = null;

  const now = computed(() => Date.now());
  const startOfToday = computed(() => dayjs().startOf('day').valueOf());

  const todayStart = computed(() => dayjs().startOf('day'));

  function isOnDay(ev: CalendarEvent, targetDay: dayjs.Dayjs) {
    const start = dayjs(ev.startTs);
    const end = ev.allDay ? dayjs(ev.endTs).subtract(1, 'millisecond') : dayjs(ev.endTs);
    return (
      start.isSame(targetDay, 'day') ||
      end.isSame(targetDay, 'day') ||
      (start.isBefore(targetDay, 'day') && end.isAfter(targetDay, 'day'))
    );
  }

  const todayEvents = computed(() => events.value.filter((ev) => isOnDay(ev, todayStart.value)));

  const upcomingEvents = computed(() =>
    events.value.filter((ev) => dayjs(ev.startTs).isAfter(todayStart.value, 'day')),
  );

  async function loadEvents() {
    loading.value = true;
    error.value = null;
    try {
      const days = Number.isFinite(rangeDays.value) ? Math.max(0, rangeDays.value) : 5;
      const end = now.value + days * 24 * 60 * 60 * 1000;
      events.value = await window.stina.calendar.getEvents({ start: startOfToday.value, end });
    } catch (err) {
      error.value = t('calendar.load_error');
    } finally {
      loading.value = false;
    }
  }

  async function hydrateRangeSetting() {
    try {
      const settings = await window.stina.settings.getCalendarSettings?.();
      const days = settings?.panelRangeDays;
      if (typeof days === 'number' && Number.isFinite(days)) {
        rangeDays.value = days;
      }
    } catch {
      /* ignore */
    }
  }

  async function hydrateCollapsedGroups() {
    try {
      const saved = await window.stina.desktop.getCollapsedCalendarGroups?.();
      if (saved && Array.isArray(saved)) {
        collapsedGroups.value = new Set(saved);
      }
    } catch {
      /* ignore */
    }
  }

  async function persistCollapsedGroups(next: Set<string>) {
    try {
      await window.stina.desktop.setCollapsedCalendarGroups?.(Array.from(next));
    } catch {
      /* ignore */
    }
  }

  onMounted(async () => {
    await Promise.all([hydrateRangeSetting(), hydrateCollapsedGroups()]);
    await loadEvents();
    if (window.stina.calendar.onChanged) {
      unsubscribe = window.stina.calendar.onChanged(() => void loadEvents());
    }
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ days?: number }>).detail;
      if (detail && typeof detail.days === 'number' && Number.isFinite(detail.days)) {
        rangeDays.value = detail.days;
      }
    };
    window.addEventListener('stina:calendar-range-changed', handler);
    offRangeListener = () => window.removeEventListener('stina:calendar-range-changed', handler);
  });

  onUnmounted(() => {
    unsubscribe?.();
    offRangeListener?.();
  });

  watch(
    () => rangeDays.value,
    () => {
      void loadEvents();
    },
  );

  function formatRange(ev: CalendarEvent) {
    const start = dayjs(ev.startTs);
    const end = dayjs(ev.endTs);
    const isTodayOnly =
      start.isSame(todayStart.value, 'day') && end.isSame(todayStart.value, 'day');
    if (isTodayOnly && ev.allDay) return t('calendar.all_day_today');
    if (isTodayOnly) return `${start.format('HH:mm')} – ${end.format('HH:mm')}`;
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
    void persistCollapsedGroups(next);
  }

  function toggleEvent(id: string) {
    const next = new Set(openEvents.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    openEvents.value = next;
  }
</script>

<template>
  <div class="calendar-panel">
    <PanelGroup
      v-if="todayEvents.length"
      :title="t('calendar.today')"
      :description="t('calendar.items_count', { count: todayEvents.length })"
      :collapsed="collapsedGroups.has('today')"
      :iconComponent="TodayIcon"
      @toggle="toggleGroup('today')"
    >
      <div class="group-list">
        <PanelGroupItem
          v-for="ev in todayEvents"
          :key="ev.id"
          :title="ev.title"
          :meta="formatRange(ev)"
          :meta-variant="isPast(ev) ? 'danger' : 'default'"
          :collapsed="!openEvents.has(ev.id)"
          @toggle="toggleEvent(ev.id)"
        >
          <p v-if="ev.location" class="meta-line">
            {{ t('calendar.event_location', { location: ev.location }) }}
          </p>
          <p class="meta-line">
            {{ t('calendar.event_time', { time: formatRange(ev) }) }}
          </p>
          <MarkDown v-if="ev.description" class="description" :content="ev.description" />
        </PanelGroupItem>
      </div>
    </PanelGroup>

    <PanelGroup
      v-if="upcomingEvents.length"
      :title="t('calendar.upcoming')"
      :description="t('calendar.items_count', { count: upcomingEvents.length })"
      :collapsed="collapsedGroups.has('upcoming')"
      :iconComponent="UpcomingIcon"
      @toggle="toggleGroup('upcoming')"
    >
      <div class="group-list">
        <PanelGroupItem
          v-for="ev in upcomingEvents"
          :key="ev.id"
          :title="ev.title"
          :meta="formatRange(ev)"
          :meta-variant="isPast(ev) ? 'danger' : 'default'"
          :collapsed="!openEvents.has(ev.id)"
          @toggle="toggleEvent(ev.id)"
        >
          <p v-if="ev.location" class="meta-line">
            {{ t('calendar.event_location', { location: ev.location }) }}
          </p>
          <p class="meta-line">
            {{ t('calendar.event_time', { time: formatRange(ev) }) }}
          </p>
          <MarkDown v-if="ev.description" class="description" :content="ev.description" />
        </PanelGroupItem>
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

    > .panel-empty {
      color: var(--muted);
      font-style: italic;
      padding: 1rem;
    }

    .meta-line {
      margin: 0.5rem 1rem 0.5rem 1rem;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .description {
      margin: 0.5rem 1rem 1rem 1rem;
    }
  }
</style>
