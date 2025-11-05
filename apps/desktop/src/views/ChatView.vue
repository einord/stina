<template>
  <section class="chat">
    <header>
      <h2>Chat</h2>
      <span class="status">{{ providerName }}</span>
    </header>
    <div class="messages" ref="messagesRef">
      <article
        v-for="message in conversation"
        :key="message.id"
        :class="['message', message.role]"
      >
        <span class="meta">{{ message.role === "user" ? "Du" : "Pro Assist" }}</span>
        <p>{{ message.content }}</p>
      </article>
      <article v-if="streaming" class="message assistant">
        <span class="meta">Pro Assist</span>
        <p>{{ liveChunk }}</p>
      </article>
    </div>
    <form class="composer" @submit.prevent="handleSend">
      <textarea
        v-model="draft"
        placeholder="Skriv ett meddelande..."
        rows="3"
        @keydown.enter.exact.prevent="handleSend"
      ></textarea>
      <button type="submit" :disabled="!draft.trim() || streaming">Skicka</button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { MockProvider } from "@pro-assist/core/ai/mockProvider";
import type { AiMessage } from "@pro-assist/core/ai/types";
import { computed, nextTick, reactive, ref } from "vue";

interface ConversationEntry extends AiMessage {
  id: string;
}

const mockProvider = new MockProvider();
const providerName = computed(() => mockProvider.name);
const conversation = ref<ConversationEntry[]>([]);
const messagesRef = ref<HTMLElement | null>(null);
const draft = ref("");
const streaming = ref(false);
const liveChunk = ref("");

const scrollToBottom = async () => {
  await nextTick();
  const el = messagesRef.value;
  if (el) {
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }
};

const handleSend = async () => {
  if (!draft.value.trim()) return;
  const content = draft.value.trim();
  draft.value = "";
  conversation.value.push({ id: crypto.randomUUID(), role: "user", content });
  await scrollToBottom();
  streaming.value = true;
  liveChunk.value = "";

  const messages: AiMessage[] = conversation.value.map(({ role, content }) => ({ role, content }));
  for await (const chunk of mockProvider.streamChat(messages)) {
    if (chunk.type === "text" && chunk.data) {
      liveChunk.value += chunk.data;
      await scrollToBottom();
    }
  }
  conversation.value.push({ id: crypto.randomUUID(), role: "assistant", content: liveChunk.value });
  streaming.value = false;
  liveChunk.value = "";
  await scrollToBottom();
};
</script>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  border-radius: 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.message {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: rgba(0, 0, 0, 0.04);
  max-width: 80%;
}

.message.user {
  align-self: flex-end;
  background: var(--color-accent);
  color: #fff;
}

.message.assistant {
  align-self: flex-start;
}

.meta {
  display: block;
  font-size: 0.75rem;
  opacity: 0.7;
  margin-bottom: 0.25rem;
}

.composer {
  display: flex;
  gap: 0.75rem;
}

textarea {
  flex: 1;
  resize: none;
  border-radius: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: inherit;
}

button {
  border: none;
  border-radius: 0.75rem;
  padding: 0.75rem 1.5rem;
  background: var(--color-accent);
  color: #fff;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status {
  font-size: 0.875rem;
  opacity: 0.8;
}
</style>
