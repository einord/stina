<template>
  <section class="todos">
    <header>
      <h2>Att-göra</h2>
      <button @click="refresh">Uppdatera</button>
    </header>
    <form class="add" @submit.prevent="handleAdd">
      <input v-model="title" type="text" placeholder="Ny uppgift..." required />
      <select v-model="priority">
        <option value="normal">Normal</option>
        <option value="high">Hög</option>
        <option value="low">Låg</option>
      </select>
      <button type="submit">Lägg till</button>
    </form>
    <ul class="list">
      <li v-for="todo in store.todos" :key="todo.id">
        <label>
          <input type="checkbox" :checked="todo.completed" @change="toggle(todo)" />
          <span :class="{ done: todo.completed }">{{ todo.title }}</span>
        </label>
        <small v-if="todo.due">Deadline: {{ formatDue(todo.due) }}</small>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useDataStore } from "../store/data";

const store = useDataStore();
const title = ref("");
const priority = ref<"low" | "normal" | "high">("normal");

const refresh = async () => {
  await store.loadTodos();
};

const handleAdd = async () => {
  await store.addTodo({
    title: title.value,
    priority: priority.value
  });
  title.value = "";
};

const toggle = async (todo: (typeof store.todos)[number]) => {
  await store.toggleTodo(todo.id, !todo.completed);
};

const formatDue = (due: string | null) => {
  if (!due) return "";
  return new Date(due).toLocaleString();
};

onMounted(() => {
  refresh();
});
</script>

<style scoped>
.todos {
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
  grid-template-columns: 1fr 160px auto;
  gap: 0.75rem;
  background: var(--color-surface);
  padding: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
}

input,
select,
button {
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  padding: 0.75rem;
  font-size: 0.95rem;
}

button {
  background: var(--color-accent);
  color: #fff;
  border: none;
  cursor: pointer;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

li {
  background: var(--color-surface);
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border: 1px solid var(--color-border);
}

label {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  font-weight: 500;
}

.done {
  text-decoration: line-through;
  opacity: 0.6;
}

small {
  font-size: 0.75rem;
  opacity: 0.7;
}
</style>
