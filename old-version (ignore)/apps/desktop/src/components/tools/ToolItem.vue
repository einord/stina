<template>
  <div class="tool-item">
    <div class="tool-header">
      <span class="tool-name">{{ tool.name }}</span>
    </div>
    <p class="tool-description">{{ tool.description }}</p>
    <div v-if="showParameters && hasParameters" class="tool-parameters">
      <details>
        <summary class="params-summary">{{ t('tools.parameters') }}</summary>
        <div class="params-list">
          <div
            v-for="[name, schema] in Object.entries(tool.parameters.properties || {})"
            :key="name"
            class="param-item"
          >
            <span class="param-name">
              {{ name }}
              <span v-if="isRequired(name)" class="required" :title="t('tools.required')">*</span>
            </span>
            <span class="param-type">{{ getParamType(schema) }}</span>
            <p v-if="schema.description" class="param-desc">{{ schema.description }}</p>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { BaseToolSpec } from '@stina/core';
  import { t } from '@stina/i18n';
  import { computed } from 'vue';

  const props = defineProps<{
    tool: BaseToolSpec;
    showParameters?: boolean;
  }>();

  const hasParameters = computed(() => {
    return (
      props.tool.parameters?.properties && Object.keys(props.tool.parameters.properties).length > 0
    );
  });

  function isRequired(name: string): boolean {
    return props.tool.parameters?.required?.includes(name) ?? false;
  }

  function getParamType(schema: any): string {
    if (schema.type === 'array') {
      return `${schema.type}${schema.items ? `<${schema.items.type}>` : ''}`;
    }
    return schema.type || 'unknown';
  }
</script>

<style scoped>
  .tool-item {
    padding: 3em;
    border-bottom: 1px solid var(--border-subtle);
  }

  .tool-item:last-child {
    border-bottom: none;
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: 2em;
    margin-bottom: 2em;
  }

  .tool-name {
    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--primary);
  }

  .tool-description {
    margin: 0 0 2em 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .tool-parameters {
    margin-top: 2em;
  }

  .params-summary {
    cursor: pointer;
    font-size: 0.5rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    user-select: none;
  }

  .params-summary:hover {
    color: var(--text);
  }

  .params-list {
    margin-top: 2em;
    padding-left: 3em;
  }

  .param-item {
    margin-bottom: 2em;
    padding: 2em;
    background: var(--empty-bg);
    border-radius: var(--radius-sm);
  }

  .param-name {
    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
    font-size: 0.5rem;
    font-weight: 600;
    color: var(--text);
  }

  .required {
    color: var(--error);
  }

  .param-type {
    margin-left: 2em;
    font-size: 0.5rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .param-desc {
    margin: 1em 0 0 0;
    font-size: 0.5rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
</style>
