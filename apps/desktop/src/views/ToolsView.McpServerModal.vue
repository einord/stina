<script setup lang="ts">
  import BaseModal from '../components/common/BaseModal.vue';
  import AddServerForm from '../components/tools/AddServerForm.vue';
  import { t } from '@stina/i18n';
  import type { MCPServer } from '@stina/settings';

  const props = defineProps<{
    open: boolean;
    initialServer?: MCPServer | null;
  }>();

  const emit = defineEmits<{
    close: [];
    save: [
      server: {
        name: string;
        type: MCPServer['type'];
        url?: string;
        command?: string;
        oauth?: MCPServer['oauth'];
        tokenAuth?: MCPServer['tokenAuth'];
        authMode?: MCPServer['authMode'];
      },
    ];
  }>();

  function handleClose() {
    emit('close');
  }

  function handleSave(server: {
    name: string;
    type: MCPServer['type'];
    url?: string;
    command?: string;
    oauth?: MCPServer['oauth'];
    tokenAuth?: MCPServer['tokenAuth'];
    authMode?: MCPServer['authMode'];
  }) {
    emit('save', server);
  }
</script>

<template>
  <BaseModal
    :open="open"
    :title="initialServer ? t('tools.edit_server_title') : t('tools.add_server.title')"
    :close-label="t('tools.add_server.cancel')"
    max-width="800px"
    @close="handleClose"
  >
    <AddServerForm
      :initial-server="initialServer || undefined"
      :auto-expand="true"
      :expandable="false"
      @save="handleSave"
      @cancel="handleClose"
    />
  </BaseModal>
</template>
