<template>
  <div
    class="main-layout"
    :class="{ 'has-todo-panel': todoPanelVisible }"
    :style="{ '--todo-panel-width': `${todoPanelWidth}px` }"
  >
    <div class="left-panel">
      <SideNav v-model="active" />
    </div>
    <section class="content">
      <slot :active="active" />
    </section>
    <aside v-if="todoPanelVisible" class="right-panel">
      <div class="resize-handle" @mousedown="startResize" @dblclick="resetWidth"></div>
      <slot name="todo-panel" />
    </aside>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted, ref } from 'vue';

  import SideNav from '../nav/SideNav.vue';

  defineProps<{ todoPanelVisible?: boolean }>();
  const active = defineModel<'chat' | 'tools' | 'settings'>('value', { default: 'chat' });

  const emit = defineEmits<{
    'close-todo-panel': [];
  }>();

  const DEFAULT_WIDTH = 320;
  const COLLAPSE_THRESHOLD = 48; // 3rem ≈ 48px (beroende på font-size)

  const todoPanelWidth = ref(DEFAULT_WIDTH);
  const isResizing = ref(false);
  const startX = ref(0);
  const startWidth = ref(0);

  /**
   * Beräknar max-bredd baserat på fönstrets storlek (85% av tillgängligt utrymme).
   */
  function getMaxWidth(): number {
    return Math.floor(window.innerWidth * 0.85);
  }

  /**
   * Startar resize-operation när användaren klickar på resize-handtaget.
   */
  function startResize(e: MouseEvent) {
    isResizing.value = true;
    startX.value = e.clientX;
    startWidth.value = todoPanelWidth.value;

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
  }

  /**
   * Hanterar resize under drag-operation.
   * Ingen min-bredd, men max 85% av fönstret.
   */
  function handleResize(e: MouseEvent) {
    if (!isResizing.value) return;

    const delta = startX.value - e.clientX;
    const newWidth = Math.min(getMaxWidth(), startWidth.value + delta);

    // Tillåt att dra hela vägen ner till 0 (ingen min-bredd)
    todoPanelWidth.value = Math.max(0, newWidth);
  }

  /**
   * Avslutar resize-operation och sparar ny bredd.
   * Om bredden är under tröskelvärdet, stäng panelen istället.
   */
  async function stopResize() {
    if (!isResizing.value) return;

    isResizing.value = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);

    // Om användaren dragit ner under 3rem, stäng panelen
    if (todoPanelWidth.value < COLLAPSE_THRESHOLD) {
      emit('close-todo-panel');
      // Återställ till default så den öppnas med rätt storlek nästa gång
      todoPanelWidth.value = DEFAULT_WIDTH;
      await window.stina.desktop.setTodoPanelWidth(DEFAULT_WIDTH);
    } else {
      // Spara den nya bredden
      await window.stina.desktop.setTodoPanelWidth(todoPanelWidth.value);
    }
  }

  /**
   * Återställer panelen till standard-bredd vid dubbelklick.
   */
  async function resetWidth() {
    todoPanelWidth.value = DEFAULT_WIDTH;
    await window.stina.desktop.setTodoPanelWidth(DEFAULT_WIDTH);
  }

  onMounted(async () => {
    // Återställ sparad bredd
    todoPanelWidth.value = await window.stina.desktop.getTodoPanelWidth();
  });

  onUnmounted(() => {
    // Cleanup om komponenten unmountas under resize
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  });
</script>

<style scoped>
  .main-layout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 1rem;
    grid-template-rows: auto 1rem;
    height: 100%;
    min-height: 0;
    --todo-panel-width: 320px;

    > .left-panel {
      padding-top: 1rem;
      grid-row: span 2;
    }
  }
  .main-layout.has-todo-panel {
    grid-template-columns: auto minmax(0, 1fr) var(--todo-panel-width);
  }
  .content {
    height: 100%;
    min-height: 0;
    display: grid;
    background-color: var(--window-bg-empty);
    border-radius: var(--border-radius-normal);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .right-panel {
    height: 100%;
    min-width: 0;
    overflow: hidden;
    position: relative;
    grid-row: span 2;
  }
  .resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
    z-index: 10;
    transition: background-color 0.2s;
  }
  .resize-handle:hover {
    background-color: var(--primary);
    opacity: 0.3;
  }
  .resize-handle:active {
    background-color: var(--primary);
    opacity: 0.5;
  }
</style>
