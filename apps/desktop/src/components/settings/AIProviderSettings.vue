<template>
  <div class="wrap">
    <h3 class="title">{{ t('settings.ai_provider_title') }}</h3>
    <div class="active">
      <label class="label">{{ t('settings.active_provider') }}</label>
      <div class="row">
        <label v-for="p in providers" :key="p" class="radio">
          <input type="radio" name="active" :value="p" v-model="active" />
          <span class="cap">{{ p }}</span>
        </label>
        <button class="opt clear" @click="setNone" v-if="active">{{ t('settings.clear') }}</button>
      </div>
    </div>

    <details open>
      <summary>OpenAI</summary>
      <div class="form">
        <label
          >{{ t('settings.api_key') }}
          <input
            v-model="openaiKey"
            :placeholder="openai.hasKey ? t('settings.key_saved') : 'sk-...'"
            type="password"
        /></label>
        <label
          >{{ t('settings.base_url') }}
          <input v-model="openai.baseUrl" type="text" placeholder="https://api.openai.com/v1"
        /></label>
        <label
          >{{ t('settings.model') }} <input v-model="openai.model" type="text" placeholder="gpt-4o"
        /></label>
        <button class="save" @click="save('openai', openai)">
          {{ t('settings.save_openai') }}
        </button>
        <button
          class="opt clear"
          @click="
            openaiKey = '';
            save('openai', { apiKey: '' });
          "
          v-if="openai.hasKey"
        >
          {{ t('settings.clear_key') }}
        </button>
      </div>
    </details>

    <details>
      <summary>Anthropic</summary>
      <div class="form">
        <label
          >{{ t('settings.api_key') }}
          <input
            v-model="anthropicKey"
            :placeholder="anthropic.hasKey ? '•••• saved' : 'sk-ant-...'"
            type="password"
        /></label>
        <label
          >{{ t('settings.base_url') }}
          <input v-model="anthropic.baseUrl" type="text" placeholder="https://api.anthropic.com"
        /></label>
        <label
          >{{ t('settings.model') }}
          <input v-model="anthropic.model" type="text" placeholder="claude-3-5"
        /></label>
        <button class="save" @click="save('anthropic', anthropic)">
          {{ t('settings.save_anthropic') }}
        </button>
        <button
          class="opt clear"
          @click="
            anthropicKey = '';
            save('anthropic', { apiKey: '' });
          "
          v-if="anthropic.hasKey"
        >
          {{ t('settings.clear_key') }}
        </button>
      </div>
    </details>

    <details>
      <summary>Gemini</summary>
      <div class="form">
        <label
          >{{ t('settings.api_key') }}
          <input
            v-model="geminiKey"
            :placeholder="gemini.hasKey ? '•••• saved' : 'API key'"
            type="password"
        /></label>
        <label
          >{{ t('settings.base_url') }}
          <input
            v-model="gemini.baseUrl"
            type="text"
            placeholder="https://generativelanguage.googleapis.com"
        /></label>
        <label
          >{{ t('settings.model') }}
          <input v-model="gemini.model" type="text" placeholder="gemini-1.5"
        /></label>
        <button class="save" @click="save('gemini', gemini)">
          {{ t('settings.save_gemini') }}
        </button>
        <button
          class="opt clear"
          @click="
            geminiKey = '';
            save('gemini', { apiKey: '' });
          "
          v-if="gemini.hasKey"
        >
          {{ t('settings.clear_key') }}
        </button>
      </div>
    </details>

    <details>
      <summary>Ollama (local)</summary>
      <div class="form">
        <label
          >Host <input v-model="ollama.host" type="text" placeholder="http://localhost:11434"
        /></label>
        <label
          >{{ t('settings.model') }}
          <input v-model="ollama.model" type="text" placeholder="llama3.1:8b"
        /></label>
        <button class="save" @click="save('ollama', ollama)">
          {{ t('settings.save_ollama') }}
        </button>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { OllamaConfig, ProviderConfigs, ProviderName } from '@stina/settings';
  import { onMounted, reactive, ref, watch } from 'vue';

  const providers: ProviderName[] = ['openai', 'anthropic', 'gemini', 'ollama'];

  type ProviderState<T> = Partial<T> & { hasKey?: boolean; apiKey?: string };

  const active = ref<ProviderName | undefined>(undefined);
  const openai = reactive<ProviderState<ProviderConfigs['openai']>>({});
  const anthropic = reactive<ProviderState<ProviderConfigs['anthropic']>>({});
  const gemini = reactive<ProviderState<ProviderConfigs['gemini']>>({});
  const ollama = reactive<Partial<OllamaConfig>>({});
  // secret inputs (one-way set)
  const openaiKey = ref('');
  const anthropicKey = ref('');
  const geminiKey = ref('');

  /**
   * Loads provider settings from the backend and hydrates all local forms.
   */
  async function load() {
    const s = await window.stina.settings.get();
    active.value = s.active;
    Object.assign(openai, s.providers.openai ?? {});
    Object.assign(anthropic, s.providers.anthropic ?? {});
    Object.assign(gemini, s.providers.gemini ?? {});
    Object.assign(ollama, s.providers.ollama ?? {});
  }

  /**
   * Persists edits for a specific provider, handling one-way key inputs.
   */
  async function save<T extends ProviderName>(name: T, cfg: ProviderState<ProviderConfigs[T]>) {
    const { hasKey, ...rest } = cfg;
    const patch: Partial<ProviderConfigs[T]> & { apiKey?: string } = { ...rest };
    if (name === 'openai') {
      if (openaiKey.value !== '') patch.apiKey = openaiKey.value;
    }
    if (name === 'anthropic') {
      if (anthropicKey.value !== '') patch.apiKey = anthropicKey.value;
    }
    if (name === 'gemini') {
      if (geminiKey.value !== '') patch.apiKey = geminiKey.value;
    }
    await window.stina.settings.updateProvider(name, patch);
    openaiKey.value = anthropicKey.value = geminiKey.value = '';
  }

  /**
   * Clears the active provider selection.
   */
  function setNone() {
    active.value = undefined;
    setActive();
  }
  /**
   * Persists the currently selected provider as active.
   */
  async function setActive() {
    await window.stina.settings.setActive(active.value);
  }

  onMounted(load);

  watch(active, () => {
    void setActive();
  });
</script>

<style scoped>
  .wrap {
    display: grid;
    gap: var(--space-4);
  }
  .title {
    margin: 0;
    font-size: var(--text-lg);
  }
  .row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .label {
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .radio {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
    padding-right: var(--space-3);
  }
  .form {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius-2);
  }
  .form label {
    display: grid;
    gap: 4px;
    font-size: var(--text-sm);
  }
  input {
    padding: var(--space-2);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    border-radius: var(--radius-2);
  }
  .save,
  .opt.clear {
    justify-self: start;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: var(--radius-2);
  }
  summary {
    cursor: pointer;
  }
</style>
