<template>
  <section class="settings">
    <h2>Inställningar</h2>
    <div class="grid">
      <form @submit.prevent="saveProvider" class="card">
        <header>
          <h3>AI-leverantör</h3>
          <select v-model="provider.name">
            <option value="mock">Mock</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="ollama">Ollama</option>
          </select>
        </header>
        <div v-if="provider.name === 'openai'" class="field">
          <label>API-nyckel</label>
          <input v-model="provider.apiKey" placeholder="sk-..." />
          <label>Bas-URL</label>
          <input v-model="provider.baseURL" placeholder="https://api.openai.com/v1" />
          <label>Modell</label>
          <input v-model="provider.model" placeholder="gpt-4o" />
        </div>
        <div v-else-if="provider.name === 'anthropic'" class="field">
          <label>API-nyckel</label>
          <input v-model="provider.apiKey" placeholder="sk-ant..." />
          <label>Modell</label>
          <input v-model="provider.model" placeholder="claude-3-opus-20240229" />
        </div>
        <div v-else-if="provider.name === 'ollama'" class="field">
          <label>Host</label>
          <input v-model="provider.host" placeholder="http://localhost:11434" />
          <label>Modell</label>
          <input v-model="provider.model" placeholder="llama3" />
        </div>
        <button type="submit">Spara</button>
      </form>
      <form @submit.prevent="saveInstructions" class="card">
        <header>
          <h3>Instruktioner</h3>
        </header>
        <label>Ton</label>
        <input v-model="instructions.tone" placeholder="professional" />
        <label>Påminnelser (komma-separerade)</label>
        <input v-model="reminders" placeholder="Ring mamma, Drick vatten" />
        <label>Rutiner (JSON)</label>
        <textarea v-model="routines" rows="4" />
        <button type="submit">Uppdatera</button>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useToast } from "../composables/useToast";

const toast = useToast();

const provider = reactive({
  name: "mock",
  apiKey: "",
  baseURL: "",
  model: "",
  host: ""
});

const instructions = reactive({
  tone: "professional",
  reminders: [] as string[],
  routines: [] as unknown[]
});

const reminders = ref("");
const routines = ref("[]");

const saveProvider = async () => {
  try {
    if (window.__TAURI__?.invoke) {
      await window.__TAURI__.invoke("proassist_tool", {
        tool: "settings.provider",
        payload: { provider }
      });
    }
    toast.success("Provider sparad.");
  } catch (error) {
    console.error(error);
    toast.error("Kunde inte spara provider.");
  }
};

const saveInstructions = async () => {
  try {
    instructions.reminders = reminders.value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    instructions.routines = JSON.parse(routines.value || "[]");
    if (window.__TAURI__?.invoke) {
      await window.__TAURI__.invoke("proassist_tool", {
        tool: "instructions.update",
        payload: { patch: instructions }
      });
    }
    toast.success("Instruktioner uppdaterade.");
  } catch (error) {
    console.error(error);
    toast.error("Ogiltig rutin-JSON.");
  }
};
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

input,
textarea,
select {
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  padding: 0.65rem;
  font-size: 0.95rem;
  font-family: inherit;
}

button {
  align-self: flex-start;
  border: none;
  border-radius: 0.5rem;
  padding: 0.65rem 1.5rem;
  background: var(--color-accent);
  color: #fff;
  cursor: pointer;
}
</style>
