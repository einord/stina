<template>
  <section class="projects">
    <header>
      <h2>Projekt</h2>
      <button @click="refresh">Uppdatera</button>
    </header>
    <form class="add" @submit.prevent="handleAdd">
      <input v-model="name" placeholder="Projektets namn" required />
      <input v-model="color" placeholder="Färg (hex)" />
      <textarea v-model="description" placeholder="Beskrivning"></textarea>
      <button type="submit">Skapa</button>
    </form>
    <div class="grid">
      <article v-for="project in store.projects" :key="project.id" class="card">
        <header>
          <span class="color" :style="{ background: project.color ?? '#6366f1' }" />
          <h3>{{ project.name }}</h3>
        </header>
        <p>{{ project.description }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useDataStore } from "../store/data";

const store = useDataStore();
const name = ref("");
const color = ref("");
const description = ref("");

const refresh = async () => {
  await store.loadProjects();
};

const handleAdd = async () => {
  await store.addProject({
    name: name.value,
    color: color.value || null,
    description: description.value || null
  });
  name.value = "";
  color.value = "";
  description.value = "";
};

onMounted(() => {
  refresh();
});
</script>

<style scoped>
.projects {
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

input,
textarea {
  width: 100%;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  padding: 0.75rem;
  font-size: 0.95rem;
  resize: vertical;
}

button {
  border-radius: 0.5rem;
  border: none;
  padding: 0.75rem;
  background: var(--color-accent);
  color: #fff;
  cursor: pointer;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.card {
  background: var(--color-surface);
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.card header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.color {
  width: 16px;
  height: 16px;
  border-radius: 999px;
}
</style>
