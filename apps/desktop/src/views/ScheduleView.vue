<template>
  <section class="schedule">
    <header>
      <h2>Schema</h2>
      <button @click="refresh">Uppdatera</button>
    </header>
    <form class="add" @submit.prevent="handleAdd">
      <input v-model="title" placeholder="Titel" required />
      <input v-model="message" placeholder="Meddelande" required />
      <input v-model="cron" placeholder="Cron (t.ex. 0 9 * * 1-5)" required />
      <button type="submit">Skapa</button>
    </form>
    <ul class="list">
      <li v-for="schedule in store.schedules" :key="schedule.id">
        <div>
          <h3>{{ schedule.title }}</h3>
          <p>{{ schedule.message }}</p>
          <small>{{ schedule.cron }}</small>
        </div>
        <span class="badge" :class="{ active: schedule.active }">
          {{ schedule.active ? "Aktiv" : "Av" }}
        </span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useDataStore } from "../store/data";

const store = useDataStore();
const title = ref("");
const message = ref("");
const cron = ref("0 9 * * 1-5");

const refresh = async () => {
  await store.loadSchedules();
};

const handleAdd = async () => {
  await store.addSchedule({
    title: title.value,
    message: message.value,
    cron: cron.value
  });
  title.value = "";
  message.value = "";
};

onMounted(() => {
  refresh();
});
</script>

<style scoped>
.schedule {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.add {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
  background: var(--color-surface);
  padding: 1rem;
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
}

input {
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  padding: 0.75rem;
  font-size: 0.95rem;
}

button {
  border-radius: 0.5rem;
  border: none;
  padding: 0.75rem;
  background: var(--color-accent);
  color: #fff;
  cursor: pointer;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.badge {
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.3);
}

.badge.active {
  background: rgba(37, 99, 235, 0.2);
  color: var(--color-accent);
}
</style>
