<script setup lang="ts">
import SimpleButton from '../../buttons/SimpleButton.vue'
import Modal from '../../common/Modal.vue'

const open = defineModel<boolean>({ default: false })

function save() {
  // TODO: Save changes
  open.value = false
}
</script>

<template>
  <Modal v-model="open" class="edit-model-modal" title="Redigera AI-modell" close-label="Stäng">
    <p>Här ska formulär för att redigera modell hamna</p>

    <template #footer>
      <SimpleButton title="Stäng modalen utan att spara" class="close-btn" @click="open = false"
        >Avbryt</SimpleButton
      >
      <SimpleButton
        title="Spara ändringar och stäng modalen"
        class="save-btn"
        type="primary"
        @click="save"
        >Spara</SimpleButton
      >
    </template>
  </Modal>
</template>

<style scoped>
.edit-model-modal {
}
</style>
