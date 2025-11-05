<template>
  <div :class="['app-shell', theme]">
    <CommandPalette @navigate="handleNavigate" />
    <header class="app-header">
      <h1>Pro Assist</h1>
      <nav>
        <RouterLink to="/">Chat</RouterLink>
        <RouterLink to="/todos">Att-göra</RouterLink>
        <RouterLink to="/projects">Projekt</RouterLink>
        <RouterLink to="/schedule">Schema</RouterLink>
        <RouterLink to="/settings">Inställningar</RouterLink>
      </nav>
      <button class="theme-toggle" @click="toggleTheme">
        {{ theme === "light" ? "🌙" : "☀️" }}
      </button>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUiStore } from "./store/ui";
import CommandPalette from "./components/CommandPalette.vue";
import { useRouter } from "vue-router";

const ui = useUiStore();
const router = useRouter();

const theme = computed(() => ui.theme);

const toggleTheme = () => {
  ui.toggleTheme();
};

const handleNavigate = (path: string) => {
  router.push(path);
};
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  color: var(--color-text);
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.app-header nav {
  display: flex;
  gap: 0.75rem;
}

.app-main {
  flex: 1;
  padding: 1rem 1.5rem;
}

.theme-toggle {
  background: transparent;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
}

a {
  text-decoration: none;
  color: inherit;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
}

a.router-link-active {
  background: var(--color-accent);
  color: #fff;
}
</style>
