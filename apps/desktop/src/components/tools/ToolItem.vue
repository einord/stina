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
    padding: var(--space-3);
    border-bottom: 1px solid var(--border-subtle);
  }

  .tool-item:last-child {
    border-bottom: none;
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .tool-name {
    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--primary);
  }

  .tool-description {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: 1.5;
  }

  .tool-parameters {
    margin-top: var(--space-2);
  }

  .params-summary {
    cursor: pointer;
    font-size: var(--text-xs);
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
    margin-top: var(--space-2);
    padding-left: var(--space-3);
  }

  .param-item {
    margin-bottom: var(--space-2);
    padding: var(--space-2);
    background: var(--bg);
    border-radius: var(--radius-sm);
  }

  .param-name {
    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text);
  }

  .required {
    color: var(--error);
  }

  .param-type {
    margin-left: var(--space-2);
    font-size: var(--text-xs);
    color: var(--text-muted);
    font-style: italic;
  }

  .param-desc {
    margin: var(--space-1) 0 0 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
    line-height: 1.4;
  }
</style>
