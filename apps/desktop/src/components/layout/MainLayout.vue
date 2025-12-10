<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue';

  import SideNav from '../nav/SideNav.vue';

  const props = defineProps<{ rightPanelVisible?: boolean }>();
  const active = defineModel<'chat' | 'tools' | 'settings'>('value', { default: 'chat' });

  const emit = defineEmits<{
    'close-right-panel': [];
  }>();

  const DEFAULT_WIDTH = 320;
  const COLLAPSE_THRESHOLD = 48; // 3rem ≈ 48px (beroende på font-size)

  const rightPanelWidth = ref(DEFAULT_WIDTH);
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
    startWidth.value = rightPanelWidth.value;

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
    rightPanelWidth.value = Math.max(0, newWidth);
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
    if (rightPanelWidth.value < COLLAPSE_THRESHOLD) {
      emit('close-right-panel');
      // Återställ till default så den öppnas med rätt storlek nästa gång
      rightPanelWidth.value = DEFAULT_WIDTH;
      await window.stina.desktop.setTodoPanelWidth(DEFAULT_WIDTH);
    } else {
      // Spara den nya bredden
      await window.stina.desktop.setTodoPanelWidth(rightPanelWidth.value);
    }
  }

  /**
   * Återställer panelen till standard-bredd vid dubbelklick.
   */
  async function resetWidth() {
    rightPanelWidth.value = DEFAULT_WIDTH;
    await window.stina.desktop.setTodoPanelWidth(DEFAULT_WIDTH);
  }

  onMounted(async () => {
    // Återställ sparad bredd
    rightPanelWidth.value = await window.stina.desktop.getTodoPanelWidth();
  });

  onUnmounted(() => {
    // Cleanup om komponenten unmountas under resize
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  });

  const gridTemplatecolumnsStyle = computed(() => {
    return `auto minmax(0, 1fr) ${props.rightPanelVisible ? `${rightPanelWidth.value}px` : '0px'}`;
  });
</script>

<template>
  <div class="main-layout" :style="{ '--todo-panel-width': `${rightPanelWidth}px` }">
    <div class="left-panel">
      <SideNav v-model="active" />
    </div>
    <section class="content">
      <slot :active="active" />
    </section>
    <aside v-if="rightPanelVisible" class="right-panel">
      <div class="resize-handle" @mousedown="startResize" @dblclick="resetWidth"></div>
      <slot name="right-panel" />
    </aside>
  </div>
</template>

<style scoped>
  .main-layout {
    display: grid;
    grid-template-columns: v-bind(gridTemplatecolumnsStyle);
    grid-template-rows: auto 1rem;
    height: 100%;
    min-height: 0;

    > .left-panel {
      padding-top: 1rem;
      grid-row: span 2;
    }
    > .content {
      height: 100%;
      min-height: 0;
      display: grid;
      background-color: var(--window-bg-empty);
      border-radius: var(--border-radius-normal);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    > .right-panel {
      height: 100%;
      overflow: hidden auto;
      position: relative;
      grid-row: span 2;

      > .resize-handle {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 6px;
        cursor: ew-resize;
        z-index: 10;
        transition: background-color 0.2s;

        &:hover {
          background-color: var(--primary);
          opacity: 0.3;
        }

        &:active {
          background-color: var(--primary);
          opacity: 0.5;
        }
      }
    }
  }
</style>
