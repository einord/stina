<template>
  <div
    class="avatar"
    :class="{ 'has-image': !!imageSrc, 'image-outside': !!imageOutside }"
    :title="alt"
  >
    <div class="image" :class="{ circle: !imageOutside }">
      <img v-if="imageSrc" :src="imageSrc" :alt="alt" />
      <span v-else class="label">{{ label }}</span>
      <span v-if="aborted" class="badge" title="Stopped">
        <svg class="badge-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="M7 17 L17 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </span>
    </div>
    <div class="circle" v-if="imageOutside"></div>
  </div>
</template>

<script setup lang="ts">
  withDefaults(
    defineProps<{
      label?: string;
      imageSrc?: string;
      imageOutside?: boolean;
      alt?: string;
      aborted?: boolean;
    }>(),
    { label: '🙂', alt: 'Avatar', imageOutside: false },
  );
</script>

<style scoped>
  .avatar {
    position: relative;
    display: grid;
    font-size: 16px;
    overflow: hidden;
    place-items: center end;
    width: 32px;
    height: 32px;

    > .image {
      z-index: 1;

      > img {
        width: 100%;
        max-width: 100%;
      }
    }
    &.has-image {
      margin-top: -4px;
    }
    &.image-outside {
      height: 36px;
    }
  }
  .label {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
  }
  .badge {
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
  }
  .badge-icon {
    width: 14px;
    height: 14px;
    color: var(--muted);
  }
  .circle {
    position: absolute;
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: 50%;
    aspect-ratio: 1 / 1;
    width: 100%;
  }
</style>
