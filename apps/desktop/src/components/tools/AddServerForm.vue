<template>
  <div class="add-server-form" :class="{ expanded: isExpanded }">
    <button v-if="!isExpanded" class="expand-button" @click="isExpanded = true">
      <span class="icon">+</span>
      Add MCP Server
    </button>

    <div v-else class="form-content">
      <div class="form-header">
        <h3 class="form-title">Add New MCP Server</h3>
        <button class="close-button" @click="cancel">✕</button>
      </div>

      <div class="form-fields">
        <div class="form-group">
          <label for="server-name" class="label">Name</label>
          <input
            id="server-name"
            v-model="form.name"
            type="text"
            class="input"
            placeholder="my-server"
            @keyup.enter="save"
          />
        </div>

        <div class="form-group">
          <label for="server-url" class="label">WebSocket URL</label>
          <input
            id="server-url"
            v-model="form.url"
            type="text"
            class="input"
            placeholder="ws://localhost:3001"
            @keyup.enter="save"
          />
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" @click="cancel">Cancel</button>
        <button class="btn btn-primary" @click="save" :disabled="!isValid">Add Server</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, reactive, ref } from 'vue';

  const emit = defineEmits<{
    save: [server: { name: string; url: string }];
  }>();

  const isExpanded = ref(false);
  const form = reactive({
    name: '',
    url: '',
  });

  const isValid = computed(() => {
    return form.name.trim() !== '' && form.url.trim() !== '';
  });

  function save() {
    if (!isValid.value) return;

    emit('save', {
      name: form.name.trim(),
      url: form.url.trim(),
    });

    // Reset form
    form.name = '';
    form.url = '';
    isExpanded.value = false;
  }

  function cancel() {
    form.name = '';
    form.url = '';
    isExpanded.value = false;
  }
</script>

<style scoped>
  .add-server-form {
    margin-bottom: var(--space-4);
  }

  .expand-button {
    width: 100%;
    padding: var(--space-4);
    background: var(--bg-elev);
    border: 2px dashed var(--border);
    border-radius: var(--radius);
    color: var(--text-muted);
    font-size: var(--text-base);
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    transition: all 0.2s;
  }

  .expand-button:hover {
    background: var(--bg);
    border-color: var(--primary);
    color: var(--primary);
  }

  .icon {
    font-size: var(--text-xl);
    font-weight: bold;
  }

  .form-content {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-4);
  }

  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }

  .form-title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text);
  }

  .close-button {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: var(--text-lg);
    cursor: pointer;
    padding: var(--space-1);
    line-height: 1;
    transition: color 0.2s;
  }

  .close-button:hover {
    color: var(--text);
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text);
  }

  .input {
    padding: var(--space-2) var(--space-3);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--text-sm);
    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
    transition: border-color 0.2s;
  }

  .input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .input::placeholder {
    color: var(--text-muted);
    opacity: 0.6;
  }

  .form-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .btn {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary {
    background: var(--bg);
    color: var(--text);
  }

  .btn-secondary:hover {
    background: var(--bg-elev);
  }

  .btn-primary {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
