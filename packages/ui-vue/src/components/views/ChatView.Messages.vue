<script setup lang="ts">
import ChatViewMessagesInstruction from './ChatView.Messages.Instruction.vue'
import ChatViewMessagesStina from './ChatView.Messages.Stina.vue'
import ChatViewMessagesUser from './ChatView.Messages.User.vue'
</script>

<template>
  <div class="chat-view-messages">
    <div class="empty"></div>
    <div v-for="i in [1, 2, 3]" :key="i" class="interaction">
      <ChatViewMessagesInstruction message="Detta är en instruktion" />
      <ChatViewMessagesUser
        :message="`Hej Stina, detta är meddelande nummer ${i}\n\n# En rubrik\n\n## En underrubrik\n\n- Punkt 1\n- Punkt 2\n\nHälsningar,\nAnvändaren`"
      />
      <ChatViewMessagesStina
        :message="`Hej! Detta är mitt svar på ditt meddelande nummer ${i}.\n\n# En rubrik\n\n## En underrubrik\n\n- Punkt 1\n- Punkt 2\n\nTack för att du hörde av dig!`"
      />

      <!--
      <InteractionBlockInfoMessage
        v-else-if="!isToolGroup(msg) && msg.role == 'info' && isDebugMode"
        :message="msg"
      ></InteractionBlockInfoMessage>
      <InteractionBlockToolUsage
        v-else-if="isToolGroup(msg)"
        :messages="msg.messages"
      ></InteractionBlockToolUsage>
      <InteractionBlockDebugMessage
        v-if="!isToolGroup(msg) && msg.role == 'debug' && isDebugMode"
        :message="msg"
      ></InteractionBlockDebugMessage>
      -->
    </div>
  </div>
</template>

<style scoped>
.chat-view-messages {
  display: flex;
  flex-direction: column;
  justify-content: end;
  gap: 1em;
  overflow-y: auto;
  min-height: 0;
  overscroll-behavior: contain;
  padding: 1rem;

  > .empty {
    height: 1.5rem;
    min-height: 1.5rem;
    width: 100%;
  }

  > .interaction {
    padding: 0;
    background: var(--theme-main-components-chat-interaction-background);
    color: var(--theme-main-components-chat-interaction-color);
    border-radius: 1rem;
    display: flex;
    flex-direction: column;
  }
}
</style>
