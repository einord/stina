<script setup lang="ts">
import ChatViewMessagesInfo from './ChatView.Messages.Info.vue'
import ChatViewMessagesInstruction from './ChatView.Messages.Instruction.vue'
import ChatViewMessagesStina from './ChatView.Messages.Stina.vue'
import ChatViewMessagesThinking from './ChatView.Messages.thinking.vue'
import ChatViewMessagesTools from './ChatView.Messages.Tools.vue'
import ChatViewMessagesUser from './ChatView.Messages.User.vue'
</script>

<template>
  <div class="chat-view-messages">
    <div class="empty"></div>
    <div v-for="i in [1, 2, 3]" :key="i" class="interaction">
      <ChatViewMessagesInfo message="Detta är ett informationsmeddelande" />
      <div class="inside">
        <ChatViewMessagesInstruction
          message="Detta är en instruktion - de visas normalt inte för användaren, men Stina får med dem i chatthistoriken. Om användaren aktiverar debug-läge syns de."
        />
        <ChatViewMessagesUser
          :message="`Hej Stina, detta är meddelande nummer ${i}\n\n# En rubrik\n\n## En underrubrik\n\n- Punkt 1\n- Punkt 2\n\nHälsningar,\nAnvändaren`"
        />
        <ChatViewMessagesTools
          :tool-usages="[
            'Hämtade väder',
            'Hämtade att-göra-poster',
            'Uppdaterade en att-göra-post',
          ]"
        />
        <ChatViewMessagesThinking
          :message="`I'm thinking of what to answer the user for message ${i}...`"
        />
        <ChatViewMessagesStina
          :message="`Hej! Detta är mitt svar på ditt meddelande nummer ${i}.\n\n# En rubrik\n\n## En underrubrik\n\n- Punkt 1\n- Punkt 2\n\nTack för att du hörde av dig!`"
        />
      </div>
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
  font-size: 1rem;

  > .empty {
    height: 1.5rem;
    min-height: 1.5rem;
    width: 100%;
  }

  > .interaction {
    > .inside {
      padding: 0;
      background: var(--theme-main-components-chat-interaction-background);
      color: var(--theme-main-components-chat-interaction-color);
      border-radius: 1rem;
      display: flex;
      flex-direction: column;
    }
  }
}
</style>
