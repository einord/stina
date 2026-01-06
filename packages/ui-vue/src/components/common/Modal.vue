<script setup lang="ts">
/**
 * Reusable modal shell with shared layout, header, body and footer slots.
 * Consumers control visibility and provide translated labels via props.
 */
withDefaults(
  defineProps<{
    /**
     * Title text rendered in the modal header.
     */
    title: string
    /**
     * Aria label for the close button. Should be translated by the caller.
     */
    closeLabel: string
    /**
     * Optional max width for the modal content.
     */
    maxWidth?: string
  }>(),
  {
    maxWidth: '600px',
  }
)

const open = defineModel<boolean>({ required: true })

function closeModal() {
  open.value = false
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="closeModal">
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      :style="{ maxWidth: maxWidth }"
    >
      <div class="header">
        <h2 class="modal-title">{{ title }}</h2>
        <button class="close-btn" :aria-label="closeLabel" @click="closeModal">×</button>
      </div>

      <div class="body">
        <slot />
      </div>

      <div v-if="$slots['footer']" class="footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--theme-components-modal-overlay-background);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;

  > .modal {
    background: var(--theme-components-modal-background);
    border-radius: 1rem;
    width: 90%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    overflow: hidden;

    > .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--theme-general-border-color);

      > .modal-title {
        margin: 0;
        font-size: 1.5rem;
      }

      > .close-btn {
        background: none;
        border: none;
        font-size: 28px;
        line-height: 1;
        cursor: pointer;
        color: var(--muted);
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          color: var(--text);
        }
      }
    }

    > .body {
      padding: 1rem;
      overflow-y: auto;
      flex: 1;
    }

    > .footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1rem;
      border-top: 1px solid var(--theme-general-border-color);
    }
  }
}
</style>
