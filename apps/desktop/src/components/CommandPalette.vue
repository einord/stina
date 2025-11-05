<template>
  <teleport to="body">
    <div v-if="open" class="overlay" role="dialog" aria-modal="true">
      <div class="palette">
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="Sök kommandon..."
          @keydown.enter.prevent="handleEnter"
        />
        <ul>
          <li
            v-for="command in filteredCommands"
            :key="command.path"
            :class="{ active: command.path === highlighted }"
            @mouseenter="highlighted = command.path"
            @mousedown.prevent="emitNavigate(command.path)"
          >
            <span>{{ command.label }}</span>
            <small>{{ command.shortcut }}</small>
          </li>
        </ul>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useUiStore } from "../store/ui";

const emit = defineEmits<{
  navigate: [path: string];
}>();

const commands = [
  { label: "Chat", path: "/", shortcut: "⌘1" },
  { label: "Att-göra", path: "/todos", shortcut: "⌘2" },
  { label: "Projekt", path: "/projects", shortcut: "⌘3" },
  { label: "Schema", path: "/schedule", shortcut: "⌘4" },
  { label: "Inställningar", path: "/settings", shortcut: "⌘5" }
];

const ui = useUiStore();
const query = ref("");
const highlighted = ref(commands[0].path);
const inputRef = ref<HTMLInputElement | null>(null);

const open = computed(() => ui.commandPaletteOpen);

const filteredCommands = computed(() => {
  if (!query.value) return commands;
  return commands.filter((command) =>
    command.label.toLowerCase().includes(query.value.toLowerCase())
  );
});

const emitNavigate = (path: string) => {
  emit("navigate", path);
  close();
};

const handleEnter = () => {
  const command = filteredCommands.value.find((cmd) => cmd.path === highlighted.value);
  if (command) emitNavigate(command.path);
};

const toggle = (next: boolean) => {
  ui.setCommandPalette(next);
  if (next) {
    query.value = "";
    highlighted.value = commands[0].path;
    nextTick(() => inputRef.value?.focus());
  }
};

const close = () => toggle(false);

const handleKeyDown = (event: KeyboardEvent) => {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  if ((isMac && event.metaKey && event.key === "k") || (!isMac && event.ctrlKey && event.key === "k")) {
    event.preventDefault();
    toggle(!open.value);
  }
  if (!open.value) return;
  if (event.key === "Escape") {
    close();
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    const idx = filteredCommands.value.findIndex((cmd) => cmd.path === highlighted.value);
    const next = filteredCommands.value[idx + 1] ?? filteredCommands.value[0];
    highlighted.value = next.path;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    const idx = filteredCommands.value.findIndex((cmd) => cmd.path === highlighted.value);
    const next =
      filteredCommands.value[idx - 1] ??
      filteredCommands.value[filteredCommands.value.length - 1];
    highlighted.value = next.path;
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: grid;
  place-items: center;
  z-index: 1000;
}

.palette {
  width: min(500px, 90vw);
  background: var(--color-surface);
  border-radius: 0.75rem;
  padding: 1rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

input {
  width: 100%;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: transparent;
  color: inherit;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

li {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
}

li.active,
li:hover {
  background: var(--color-accent-weak);
}

small {
  opacity: 0.7;
}
</style>
